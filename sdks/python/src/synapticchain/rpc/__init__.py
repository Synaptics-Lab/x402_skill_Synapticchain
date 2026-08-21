"""
RPC client for SynapticChain SDK.

This module provides sync and async JSON-RPC clients for communicating
with SynapticChain nodes.

Example:
    >>> from synapticchain.rpc import RpcClient, AsyncRpcClient
    >>> client = RpcClient("https://rpc.synaptyx.xyz")
    >>> balance = client.get_balance(address)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Optional

import httpx
import threading
import time

from synapticchain.errors import RpcError

if TYPE_CHECKING:
    from synapticchain.address import Address
    from synapticchain.types import Transaction, TxId, Value


@dataclass
class RpcOptions:
    """Options for RPC client configuration.

    Attributes:
        timeout: Request timeout in seconds
        retries: Number of retry attempts
        headers: Additional HTTP headers
    """

    timeout: float = 30.0
    retries: int = 3
    headers: Optional[dict[str, str]] = None


@dataclass
class Checkpoint:
    """Blockchain checkpoint information.

    Attributes:
        height: Checkpoint height
        state_root: State root hash
    """

    height: int
    state_root: bytes


@dataclass
class NodeStatus:
    """Node synchronization status.

    Attributes:
        synced: Whether the node is fully synced
        peer_count: Number of connected peers
        checkpoint_height: Current checkpoint height
        tps: Transactions per second
        neuron_count: Number of neurons in the network
        shard_count: Number of shards
        confirmed_tx_count: Number of confirmed transactions
    """

    synced: bool
    peer_count: int
    checkpoint_height: int
    tps: float
    neuron_count: int
    shard_count: int
    confirmed_tx_count: int


@dataclass
class TransactionInfo:
    """Transaction information from the node.

    Attributes:
        tx_id: Transaction ID
        status: Transaction status
        block_height: Block height (if confirmed)
        gas_used: Gas used by the transaction
    """

    tx_id: bytes
    status: str
    block_height: Optional[int]
    gas_used: Optional[int]


@dataclass
class CallResult:
    """Result of a read-only contract call.

    Attributes:
        value: The return value (None if function returns Unit)
        gas_used: Gas used by the call
        logs: Event logs emitted during the call
    """

    value: Optional[Any]
    gas_used: int
    logs: list[str]


class RpcClient:
    """Synchronous JSON-RPC client for SynapticChain nodes.

    Supports single-node and multi-node (load-balanced) operation.
    For production, use multiple nodes to distribute load and maintain parallelism.

    Example:
        >>> # Single node (development)
        >>> client = RpcClient("https://rpc.synaptyx.xyz")
        >>> 
        >>> # Multi-node load balancing (production - maintains parallelism)
        >>> client = RpcClient(nodes=[
        ...     "https://rpc.synaptyx.xyz",
        ...     "http://localhost:8546",
        ...     "http://localhost:8547",
        ... ])
    """

    def __init__(
        self, 
        url: Optional[str] = None, 
        options: Optional[RpcOptions] = None,
        nodes: Optional[list[str]] = None
    ) -> None:
        """Initialize the RPC client.

        Args:
            url: Single node RPC URL (for development)
            options: Optional configuration options
            nodes: List of node URLs for load balancing (for production)
                  Distributes requests across nodes to maintain parallelism.
                  
        Note:
            Use 'nodes' parameter for production to avoid sequential bottleneck.
            If both 'url' and 'nodes' provided, 'nodes' takes precedence.
        """
        if nodes:
            self._nodes = nodes
            self._url = nodes[0]  # Default to first node
            self._load_balanced = True
        elif url:
            self._url = url
            self._nodes = [url]
            self._load_balanced = False
        else:
            raise ValueError("Must provide either 'url' or 'nodes'")
            
        self._options = options or RpcOptions()
        self._request_id = 0
        self._client = httpx.Client(
            timeout=self._options.timeout,
            headers=self._options.headers,
        )
    
    def _get_url(self) -> str:
        """Get URL for next request (load balanced if multiple nodes)."""
        if self._load_balanced:
            import random
            return random.choice(self._nodes)
        return self._url

    def _next_id(self) -> int:
        """Get the next request ID."""
        self._request_id += 1
        return self._request_id

    def _call(self, method: str, params: list[Any]) -> Any:
        """Make a JSON-RPC call.

        Args:
            method: The RPC method name
            params: The method parameters

        Returns:
            The result from the RPC call

        Raises:
            RpcError: If the call fails
        """
        request = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": self._next_id(),
        }

        last_error: Optional[Exception] = None
        for attempt in range(self._options.retries):
            try:
                # Use load-balanced URL if available
                url = self._get_url()
                response = self._client.post(url, json=request)
                response.raise_for_status()
                data = response.json()

                if "error" in data and data["error"] is not None:
                    error = data["error"]
                    raise RpcError(
                        code=RpcError.INVALID_RESPONSE,
                        message=error.get("message", "Unknown RPC error"),
                        rpc_code=error.get("code"),
                        rpc_message=error.get("message"),
                    )

                return data.get("result")

            except httpx.ConnectError as e:
                last_error = RpcError(
                    code=RpcError.CONNECTION_FAILED,
                    message=f"Failed to connect to node: {e}",
                )
            except httpx.TimeoutException as e:
                last_error = RpcError(
                    code=RpcError.TIMEOUT,
                    message=f"Request timed out: {e}",
                )
            except httpx.HTTPStatusError as e:
                last_error = RpcError(
                    code=RpcError.INVALID_RESPONSE,
                    message=f"HTTP error: {e}",
                )
            except RpcError:
                raise
            except Exception as e:
                last_error = RpcError(
                    code=RpcError.INVALID_RESPONSE,
                    message=f"Unexpected error: {e}",
                )

        if last_error:
            raise last_error

        raise RpcError(
            code=RpcError.CONNECTION_FAILED,
            message="All retry attempts failed",
        )

    def get_balance(self, address: Address) -> int:
        """Get the balance of an address.

        Args:
            address: The address to query

        Returns:
            The balance in units (as int)
        """
        result = self._call("syn_getBalance", [address.to_bech32()])
        
        # Handle byte array format (legacy)
        if isinstance(result, list):
            bytes_data = bytes(result)
            if len(bytes_data) == 0:
                return 0
            # RPC returns big-endian bytes - convert directly
            return int.from_bytes(bytes_data, byteorder='big')
        
        # Handle string format (current)
        if isinstance(result, str):
            # Check if it's hex (starts with 0x) or decimal
            if result.startswith('0x') or result.startswith('0X'):
                return int(result, 16)
            else:
                # Decimal string format
                return int(result)
        
        # Handle direct int
        return int(result)

    def get_nonce(self, address: Address, pending: bool = True, nonce_key: Optional[int] = None) -> int:
        """Get the transaction nonce for an address.

        Args:
            address: The address to query
            pending: If True, include pending transactions in mempool
            nonce_key: Optional lane to query (nodes that don't support
                per-lane queries return the lane-0 view)

        Returns:
            The current nonce (as int)
        """
        params: list[Any] = [address.to_bech32(), "pending" if pending else "latest"]
        if nonce_key is not None:
            params.append(nonce_key)
        result = self._call("syn_getNonce", params)
        return int(result)

    def send_transaction(self, tx: Transaction) -> str:
        """Submit a signed transaction.

        Args:
            tx: The signed transaction

        Returns:
            The transaction ID as hex string
        """
        from synapticchain.serialization import borsh_serialize

        tx_bytes = borsh_serialize(tx)
        result = self._call("syn_sendTransaction", [tx_bytes.hex()])
        return result  # Return hex string directly

    def send_transaction_batch(self, transactions: list[Transaction]) -> list[str]:
        """Submit a batch of signed transactions in a single RPC call.

        Args:
            transactions: List of signed transactions (max 1000)

        Returns:
            List of transaction IDs as hex strings
        """
        from synapticchain.serialization import borsh_serialize

        tx_hexes = [borsh_serialize(tx).hex() for tx in transactions]
        result = self._call("syn_sendTransactionBatch", [tx_hexes])
        if result is None:
            return []
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            return result.get("results", []) or []
        return []

    def get_transaction(self, tx_id: bytes) -> Optional[TransactionInfo]:
        """Get transaction information.

        Args:
            tx_id: The transaction ID

        Returns:
            Transaction info or None if not found
        """
        result = self._call("syn_getTransaction", [tx_id.hex()])
        if result is None:
            return None

        # Node wraps the transaction in { context: { slot }, value: { ...tx } }.
        # Older nodes may return the tx directly.
        tx = result.get("value") if isinstance(result, dict) else result
        if not isinstance(tx, dict):
            return None

        return TransactionInfo(
            tx_id=bytes.fromhex(tx.get("hash") or tx.get("txId") or tx_id.hex()),
            status=tx.get("status"),
            block_height=tx.get("checkpoint_height") or tx.get("blockHeight") or tx.get("block_number"),
            gas_used=tx.get("gas_used") or tx.get("gasUsed"),
        )

    def call(
        self, contract: Address, function_name: str, args: list[Value], from_address: Optional[Address] = None, gas_limit: int = 500000
    ) -> CallResult:
        """Make a read-only contract call via syn_callContractV2.

        Args:
            contract: The contract address
            function_name: The function to call
            args: The function arguments
            from_address: Optional caller address (defaults to the zero address)
            gas_limit: Maximum gas for the call

        Returns:
            CallResult with the return value, gas used, and logs
        """
        from synapticchain.serialization import _dict_to_value, _value_to_dict

        caller = from_address.to_bech32() if from_address else "syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql7a7sh"
        args_dicts = [_value_to_dict(arg) for arg in args]
        result = self._call(
            "syn_callContractV2",
            {
                "address": contract.to_bech32(),
                "function": function_name,
                "args": args_dicts,
                "from": caller,
                "gas_limit": gas_limit,
            },
        )

        # syn_callContractV2 returns {"result": ..., "gas_used": ..., "logs": [...]}
        if not isinstance(result, dict):
            raise RpcError(
                code=RpcError.INVALID_RESPONSE,
                message=f"Unexpected call response format: {result}",
            )

        raw_value = result.get("result")
        value = _dict_to_value(raw_value) if raw_value is not None else None
        return CallResult(
            value=value,
            gas_used=result.get("gas_used", 0),
            logs=result.get("logs", []),
        )

    def get_code(self, address: Address) -> Optional[bytes]:
        """Get the raw bytecode at a contract address.

        Args:
            address: The contract address

        Returns:
            The contract bytecode as bytes, or None if not a contract
        """
        result = self._call("syn_getCode", [address.to_bech32()])
        if result is None:
            return None
        if isinstance(result, str):
            return bytes.fromhex(result)
        return None

    def get_checkpoint(self) -> Checkpoint:
        """Get the current checkpoint information.

        Returns:
            The checkpoint info
        """
        result = self._call("syn_getCheckpoint", [])
        return Checkpoint(
            height=result["height"],
            state_root=bytes.fromhex(result["stateRoot"]),
        )

    def get_status(self) -> NodeStatus:
        """Get the node status.

        Returns:
            The node status
        """
        result = self._call("syn_getStatus", [])
        return NodeStatus(
            synced=result["synced"],
            peer_count=result["peer_count"],
            checkpoint_height=result["checkpoint_height"],
            tps=result["tps"],
            neuron_count=result["neuron_count"],
            shard_count=result["shard_count"],
            confirmed_tx_count=result["confirmed_tx_count"],
        )

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self) -> RpcClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class CachedRpcClient(RpcClient):
    """Synchronous JSON-RPC client with client-side TTL caching.

    Wraps :class:`RpcClient` to cache frequently-accessed read-only
    endpoints. Cache entries are automatically invalidated when
    transactions are submitted.

    Example:
        >>> client = CachedRpcClient("https://rpc.synaptyx.xyz")
        >>> balance = client.get_balance(address)  # RPC call
        >>> balance = client.get_balance(address)  # Cache hit
    """

    def __init__(self, endpoint, cache_ttl=3.0):
        super().__init__(endpoint)
        self._cache_ttl = cache_ttl
        self._status_ttl = 1.0
        self._balance_cache = {}
        self._nonce_cache = {}
        self._status_cache = {}
        self._lock = threading.Lock()

    @staticmethod
    def _addr_key(address):
        """Convert an address to its cache key string."""
        if hasattr(address, "to_bech32"):
            return address.to_bech32()
        return str(address)

    def _get_cached(self, cache, key, ttl):
        """Return cached value if fresh, otherwise None."""
        with self._lock:
            entry = cache.get(key)
            if entry is None:
                return None
            value, timestamp = entry
            if time.time() - timestamp <= ttl:
                return value
            del cache[key]
            return None

    def _set_cached(self, cache, key, value):
        """Store a value in the cache with the current timestamp."""
        with self._lock:
            cache[key] = (value, time.time())

    def _invalidate_address(self, address):
        """Remove an address from balance and nonce caches."""
        key = self._addr_key(address)
        with self._lock:
            self._balance_cache.pop(key, None)
            self._nonce_cache.pop((key, True), None)
            self._nonce_cache.pop((key, False), None)

    def get_balance(self, address):
        """Get the balance of an address (cached)."""
        key = self._addr_key(address)
        cached = self._get_cached(self._balance_cache, key, self._cache_ttl)
        if cached is not None:
            return cached
        result = super().get_balance(address)
        self._set_cached(self._balance_cache, key, result)
        return result

    def get_nonce(self, address, pending=False, nonce_key=None):
        """Get the transaction nonce for an address (cached)."""
        key = (self._addr_key(address), pending, nonce_key)
        cached = self._get_cached(self._nonce_cache, key, self._cache_ttl)
        if cached is not None:
            return cached
        result = super().get_nonce(address, pending, nonce_key)
        self._set_cached(self._nonce_cache, key, result)
        return result

    def get_status(self):
        """Get the node status (cached)."""
        key = "__status__"
        cached = self._get_cached(self._status_cache, key, self._status_ttl)
        if cached is not None:
            return cached
        result = super().get_status()
        self._set_cached(self._status_cache, key, result)
        return result

    def _extract_recipient(self, tx):
        """Extract recipient address from a transaction payload."""
        from synapticchain.types import TransferPayload, CallPayload

        if isinstance(tx.payload, TransferPayload):
            return tx.payload.to
        elif isinstance(tx.payload, CallPayload):
            return tx.payload.contract
        return None

    def send_transaction(self, transaction):
        """Submit a signed transaction and invalidate relevant caches."""
        sender = transaction.from_address
        recipient = self._extract_recipient(transaction)

        self._invalidate_address(sender)
        if recipient is not None:
            self._invalidate_address(recipient)

        return super().send_transaction(transaction)

    def send_transaction_batch(self, transactions):
        """Submit a batch of signed transactions and invalidate caches."""
        for tx in transactions:
            sender = tx.from_address
            recipient = self._extract_recipient(tx)
            self._invalidate_address(sender)
            if recipient is not None:
                self._invalidate_address(recipient)

        return super().send_transaction_batch(transactions)

    def clear_cache(self):
        """Manually clear all caches."""
        with self._lock:
            self._balance_cache.clear()
            self._nonce_cache.clear()
            self._status_cache.clear()


class AsyncRpcClient:
    """Asynchronous JSON-RPC client for SynapticChain nodes.

    Example:
        >>> async with AsyncRpcClient("https://rpc.synaptyx.xyz") as client:
        ...     balance = await client.get_balance(address)
    """

    def __init__(self, url: str, options: Optional[RpcOptions] = None) -> None:
        """Initialize the async RPC client.

        Args:
            url: The node RPC URL
            options: Optional configuration options
        """
        self._url = url
        self._options = options or RpcOptions()
        self._request_id = 0
        self._client = httpx.AsyncClient(
            timeout=self._options.timeout,
            headers=self._options.headers,
        )

    def _next_id(self) -> int:
        """Get the next request ID."""
        self._request_id += 1
        return self._request_id

    async def _call(self, method: str, params: list[Any]) -> Any:
        """Make a JSON-RPC call.

        Args:
            method: The RPC method name
            params: The method parameters

        Returns:
            The result from the RPC call

        Raises:
            RpcError: If the call fails
        """
        request = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": self._next_id(),
        }

        last_error: Optional[Exception] = None
        for attempt in range(self._options.retries):
            try:
                response = await self._client.post(self._url, json=request)
                response.raise_for_status()
                data = response.json()

                if "error" in data and data["error"] is not None:
                    error = data["error"]
                    raise RpcError(
                        code=RpcError.INVALID_RESPONSE,
                        message=error.get("message", "Unknown RPC error"),
                        rpc_code=error.get("code"),
                        rpc_message=error.get("message"),
                    )

                return data.get("result")

            except httpx.ConnectError as e:
                last_error = RpcError(
                    code=RpcError.CONNECTION_FAILED,
                    message=f"Failed to connect to node: {e}",
                )
            except httpx.TimeoutException as e:
                last_error = RpcError(
                    code=RpcError.TIMEOUT,
                    message=f"Request timed out: {e}",
                )
            except httpx.HTTPStatusError as e:
                last_error = RpcError(
                    code=RpcError.INVALID_RESPONSE,
                    message=f"HTTP error: {e}",
                )
            except RpcError:
                raise
            except Exception as e:
                last_error = RpcError(
                    code=RpcError.INVALID_RESPONSE,
                    message=f"Unexpected error: {e}",
                )

        if last_error:
            raise last_error

        raise RpcError(
            code=RpcError.CONNECTION_FAILED,
            message="All retry attempts failed",
        )

    async def get_balance(self, address: Address) -> int:
        """Get the balance of an address.

        Args:
            address: The address to query

        Returns:
            The balance in units (as int)
        """
        result = await self._call("syn_getBalance", [address.to_bech32()])
        
        # Handle byte array format (legacy)
        if isinstance(result, list):
            bytes_data = bytes(result)
            if len(bytes_data) == 0:
                return 0
            return int.from_bytes(bytes_data, byteorder='big')
        
        # Handle string format (current)
        if isinstance(result, str):
            # Check if it's hex (starts with 0x) or decimal
            if result.startswith('0x') or result.startswith('0X'):
                return int(result, 16)
            else:
                # Decimal string format
                return int(result)
        
        # Handle direct int
        return int(result)

    async def get_nonce(self, address: Address, pending: bool = True, nonce_key: Optional[int] = None) -> int:
        """Get the transaction nonce for an address.

        Args:
            address: The address to query
            pending: If True, include pending transactions in mempool
            nonce_key: Optional lane to query (nodes that don't support
                per-lane queries return the lane-0 view)

        Returns:
            The current nonce (as int)
        """
        params: list[Any] = [address.to_bech32(), "pending" if pending else "latest"]
        if nonce_key is not None:
            params.append(nonce_key)
        result = await self._call("syn_getNonce", params)
        return int(result)

    async def send_transaction(self, tx: Transaction) -> str:
        """Submit a signed transaction.

        Args:
            tx: The signed transaction

        Returns:
            The transaction ID as hex string
        """
        from synapticchain.serialization import borsh_serialize

        tx_bytes = borsh_serialize(tx)
        result = await self._call("syn_sendTransaction", [tx_bytes.hex()])
        return result  # Return hex string directly

    async def get_transaction(self, tx_id: bytes) -> Optional[TransactionInfo]:
        """Get transaction information.

        Args:
            tx_id: The transaction ID

        Returns:
            Transaction info or None if not found
        """
        result = await self._call("syn_getTransaction", [tx_id.hex()])
        if result is None:
            return None

        # Node wraps the transaction in { context: { slot }, value: { ...tx } }.
        # Older nodes may return the tx directly.
        tx = result.get("value") if isinstance(result, dict) else result
        if not isinstance(tx, dict):
            return None

        return TransactionInfo(
            tx_id=bytes.fromhex(tx.get("hash") or tx.get("txId") or tx_id.hex()),
            status=tx.get("status"),
            block_height=tx.get("checkpoint_height") or tx.get("blockHeight") or tx.get("block_number"),
            gas_used=tx.get("gas_used") or tx.get("gasUsed"),
        )

    async def call(
        self, contract: Address, function_name: str, args: list[Value], from_address: Optional[Address] = None, gas_limit: int = 500000
    ) -> CallResult:
        """Make a read-only contract call via syn_callContractV2.

        Args:
            contract: The contract address
            function_name: The function to call
            args: The function arguments
            from_address: Optional caller address (defaults to the zero address)
            gas_limit: Maximum gas for the call

        Returns:
            CallResult with the return value, gas used, and logs
        """
        from synapticchain.serialization import _dict_to_value, _value_to_dict

        caller = from_address.to_bech32() if from_address else "syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql7a7sh"
        args_dicts = [_value_to_dict(arg) for arg in args]
        result = await self._call(
            "syn_callContractV2",
            {
                "address": contract.to_bech32(),
                "function": function_name,
                "args": args_dicts,
                "from": caller,
                "gas_limit": gas_limit,
            },
        )

        if not isinstance(result, dict):
            raise RpcError(
                code=RpcError.INVALID_RESPONSE,
                message=f"Unexpected call response format: {result}",
            )

        raw_value = result.get("result")
        value = _dict_to_value(raw_value) if raw_value is not None else None
        return CallResult(
            value=value,
            gas_used=result.get("gas_used", 0),
            logs=result.get("logs", []),
        )

    async def get_code(self, address: Address) -> Optional[bytes]:
        """Get the raw bytecode at a contract address.

        Args:
            address: The contract address

        Returns:
            The contract bytecode as bytes, or None if not a contract
        """
        result = await self._call("syn_getCode", [address.to_bech32()])
        if result is None:
            return None
        if isinstance(result, str):
            return bytes.fromhex(result)
        return None

    async def get_checkpoint(self) -> Checkpoint:
        """Get the current checkpoint information.

        Returns:
            The checkpoint info
        """
        result = await self._call("syn_getCheckpoint", [])
        return Checkpoint(
            height=result["height"],
            state_root=bytes.fromhex(result["stateRoot"]),
        )

    async def get_status(self) -> NodeStatus:
        """Get the node status.

        Returns:
            The node status
        """
        result = await self._call("syn_getStatus", [])
        return NodeStatus(
            synced=result["synced"],
            peer_count=result["peer_count"],
            checkpoint_height=result["checkpoint_height"],
            tps=result["tps"],
            neuron_count=result["neuron_count"],
            shard_count=result["shard_count"],
            confirmed_tx_count=result["confirmed_tx_count"],
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    async def __aenter__(self) -> AsyncRpcClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


__all__ = [
    "RpcOptions",
    "Checkpoint",
    "NodeStatus",
    "TransactionInfo",
    "CallResult",
    "RpcClient",
    "CachedRpcClient",
    "AsyncRpcClient",
]
