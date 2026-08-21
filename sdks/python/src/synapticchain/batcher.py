"""
Transaction batching client for SynapticChain.

This module makes the amortized submission path the default for Python dApps.
Instead of sending one transaction per RPC round-trip, `BatchedRpcClient`
queues signed transactions and flushes them via `syn_sendTransactionBatch`.
It also manages per-account lanes and nonces automatically when used through
`BatchingWallet`.

Example:
    >>> from synapticchain import BatchedRpcClient, BatchingWallet
    >>> batcher = BatchedRpcClient(["http://alpha:8545", "http://bravo:8545"])
    >>> wallet = BatchingWallet(genesis_keypair, batcher)
    >>> for _ in range(1000):
    ...     wallet.transfer(recipient, amount)
    >>> batcher.flush()  # or wait for auto-flush
"""

from __future__ import annotations

import queue
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Dict, List, Optional

from synapticchain.rpc import RpcClient, RpcOptions

if TYPE_CHECKING:
    from synapticchain.address import Address
    from synapticchain.crypto import Keypair
    from synapticchain.types import Transaction


@dataclass
class BatcherOptions:
    """Configuration for the batched RPC client."""

    batch_size: int = 100
    flush_interval_ms: float = 50.0
    max_queue: int = 10000
    max_lanes: int = 16
    timeout: float = 30.0
    retries: int = 2


@dataclass
class _QueuedItem:
    tx: Transaction
    future: "FutureResult"
    submitted_at: float = field(default_factory=time.time)


class FutureResult:
    """Future for a batched transaction result."""

    def __init__(self):
        self._event = threading.Event()
        self._result: Optional[dict] = None

    def set(self, result: dict) -> None:
        self._result = result
        self._event.set()

    def wait(self, timeout: Optional[float] = None) -> dict:
        if not self._event.wait(timeout):
            raise TimeoutError("transaction batch timeout")
        return self._result or {"success": False, "error": "no result"}

    @property
    def ready(self) -> bool:
        return self._event.is_set()


class BatchedRpcClient:
    """RPC client that automatically batches signed transactions.

    Drop-in replacement for :class:`RpcClient` for transaction submission.
    Read calls (`get_balance`, `get_nonce`, etc.) are forwarded immediately.
    Write calls (`send_transaction`) are queued and flushed in batches.

    Args:
        nodes: List of validator RPC URLs.  Requests are round-robined.
        options: Batcher behavior configuration.
    """

    def __init__(self, nodes: List[str], options: Optional[BatcherOptions] = None):
        self._nodes = list(nodes)
        if not self._nodes:
            raise ValueError("at least one node URL is required")
        self._options = options or BatcherOptions()
        self._clients = [
            RpcClient(url, options=RpcOptions(timeout=self._options.timeout, retries=self._options.retries))
            for url in self._nodes
        ]
        self._queue: queue.Queue[_QueuedItem] = queue.Queue(maxsize=self._options.max_queue)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._batches_sent = 0
        self._thread.start()

    # ── Public read API (pass-through) ───────────────────────────────────────

    def get_balance(self, address: Address) -> int:
        return self._clients[0].get_balance(address)

    def get_nonce(self, address: Address, pending: bool = True, nonce_key: int = 0) -> int:
        return self._clients[0].get_nonce(address, pending=pending)

    def get_status(self) -> dict:
        return self._clients[0].get_status()

    # ── Write API (batched) ──────────────────────────────────────────────────

    def send_transaction(self, tx: Transaction) -> FutureResult:
        """Queue a signed transaction for batched submission.

        Returns a :class:`FutureResult` that resolves when the batch containing
        this transaction is acknowledged by a validator.
        """
        future = FutureResult()
        item = _QueuedItem(tx=tx, future=future)
        self._queue.put(item, timeout=5.0)
        return future

    def flush(self, timeout: float = 10.0) -> None:
        """Flush any queued transactions immediately and wait for completion."""
        deadline = time.time() + timeout
        while not self._queue.empty() and time.time() < deadline:
            time.sleep(0.005)
        if not self._queue.empty():
            raise TimeoutError("flush timed out with items still queued")

    def close(self) -> None:
        """Stop the background flusher after draining the queue."""
        self._stop.set()
        self.flush(timeout=2.0)
        self._thread.join(timeout=3.0)
        for client in self._clients:
            client.close()

    # ── Internal flush loop ──────────────────────────────────────────────────

    def _flush_loop(self):
        interval = self._options.flush_interval_ms / 1000.0
        while not self._stop.is_set():
            batch: List[_QueuedItem] = []
            deadline = time.time() + interval

            while len(batch) < self._options.batch_size:
                wait = deadline - time.time()
                try:
                    item = self._queue.get(timeout=max(0.0, wait))
                    batch.append(item)
                except queue.Empty:
                    break

            if batch:
                self._send_batch(batch)
            else:
                time.sleep(min(interval, 0.05))

    def _send_batch(self, batch: List[_QueuedItem]):
        client = self._clients[self._batches_sent % len(self._clients)]
        self._batches_sent += 1

        from synapticchain.serialization import borsh_serialize

        tx_hexes = [borsh_serialize(item.tx).hex() for item in batch]
        try:
            results = client._call("syn_sendTransactionBatch", [tx_hexes])
            if not isinstance(results, list):
                results = []

            for item, result in zip(batch, results):
                if isinstance(result, dict):
                    item.future.set(result)
                else:
                    item.future.set({"success": False, "error": "invalid result shape"})

        except Exception as e:
            for item in batch:
                item.future.set({"success": False, "error": str(e)})


class BatchingWallet:
    """High-level wallet that auto-batches transfers across parallel lanes.

    This wallet manages per-lane nonces internally and submits through a
    :class:`BatchedRpcClient`.  It is the recommended integration path for
    high-throughput Python services.

    Example:
        >>> batcher = BatchedRpcClient(["http://alpha:8545"])
        >>> wallet = BatchingWallet(keypair, batcher)
        >>> wallet.transfer(recipient, amount)
        >>> batcher.flush()
    """

    def __init__(self, keypair: Keypair, batcher: BatchedRpcClient):
        self._keypair = keypair
        self._batcher = batcher
        self._lane = 0
        self._max_lanes = batcher._options.max_lanes
        self._nonces: Dict[int, int] = {}
        self._lock = threading.Lock()

    def address(self) -> Address:
        return self._keypair.address()

    def transfer(self, to: Address, amount: int) -> FutureResult:
        """Queue a transfer.  Lane is auto-rotated for parallelism."""
        with self._lock:
            lane = self._lane
            self._lane = (self._lane + 1) % self._max_lanes
            nonce = self._nonces.get(lane)
            if nonce is None:
                # First time using this lane; fetch current nonce from node.
                # In a hot loop this is a one-time cost per lane.
                nonce = self._batcher.get_nonce(self.address(), pending=True)
                # Heuristic: if multiple lanes are used, spread nonces.
                nonce = nonce + lane * 1000
            self._nonces[lane] = nonce + 1

        from synapticchain.types import TransactionBuilder

        tx = (
            TransactionBuilder()
            .from_address(self.address())
            .nonce(nonce)
            .nonce_key(lane)
            .gas_limit(21000)
            .gas_price(1)
            .chain_id(1)
            .transfer(to, amount)
            .sign(self._keypair)
        )
        return self._batcher.send_transaction(tx)


__all__ = [
    "BatcherOptions",
    "FutureResult",
    "BatchedRpcClient",
    "BatchingWallet",
]
