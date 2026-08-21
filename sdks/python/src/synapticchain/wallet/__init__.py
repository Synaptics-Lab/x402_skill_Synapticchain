"""
Wallet abstraction for SynapticChain SDK.

This module provides a high-level Wallet class for managing keypairs
and signing transactions.

Example:
    >>> from synapticchain.wallet import Wallet
    >>> from synapticchain.rpc import RpcClient
    >>> client = RpcClient("https://rpc.synaptyx.xyz")
    >>> wallet = Wallet.generate(client)
    >>> balance = wallet.get_balance()
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from synapticchain.address import Address
from synapticchain.crypto import Keypair, derive_contract_address

if TYPE_CHECKING:
    from synapticchain.rpc import RpcClient
    from synapticchain.types import Transaction, TxId, UnsignedTransaction, Value


# ADR-062: total number of parallel lanes available per account.
LANE_COUNT = 256


@dataclass
class TxOptions:
    """Options for transaction building.

    Attributes:
        gas_limit: Maximum gas to use
        gas_price: Price per gas unit
        nonce: Transaction nonce (auto-fetched if not provided)
        nonce_key: Nonce key for lane parallelism (S=0)
    """

    gas_limit: Optional[int] = None
    gas_price: Optional[int] = None
    nonce: Optional[int] = None
    nonce_key: Optional[int] = None


@dataclass
class DeployResult:
    """Result of a contract deployment.

    Attributes:
        tx_id: The deployment transaction ID
        contract_address: The predicted contract address
    """

    tx_id: bytes
    contract_address: Address


class Wallet:
    """High-level wallet for managing keypairs and transactions.

    A Wallet combines a Keypair with an RpcClient to provide convenient
    methods for querying balances, building transactions, and signing.

    Example:
        >>> wallet = Wallet.generate(rpc_client)
        >>> print(f"Address: {wallet.address()}")
        >>> balance = wallet.get_balance()
    """

    def __init__(self, keypair: Keypair, rpc_client: Optional[RpcClient] = None) -> None:
        """Initialize a Wallet.

        Args:
            keypair: The keypair for signing
            rpc_client: Optional RPC client for network operations
        """
        self._keypair = keypair
        self._rpc_client = rpc_client
        # Per-lane nonce cache: nonce_key -> next nonce for that lane. Each
        # lane has its own watermark + 256-nonce window on chain, so a shared
        # counter across lanes allocates nonces diagonally (lane l only ever
        # gets nonces == l mod N), permanently stalls every lane watermark,
        # and bricks the wallet after ~256 sends (the 2026-07-14 burst
        # freeze). Lane 0 mirrors the historical single shared counter.
        self._nonces: dict[int, int] = {}
        self._nonce_lock = None  # Lazy-initialized asyncio.Lock
        # Single round-robin counter covering ALL 256 lanes. Splitting lanes by
        # transaction type (contract/transfer/reserved) underutilized the
        # 256-lane window and left lanes 250-255 idle. Thread-safe because
        # wallets may be driven by concurrent burst workers.
        self._lane_counter = 0
        self._lane_counter_lock = threading.Lock()

    def _get_next_lane(self, _lane_type: Optional[str] = None) -> int:
        """Get the next lane in a global round-robin across all 256 lanes.

        The previous partition scheme (contracts 0-99, transfers 100-199,
        reserved 200-249) left 6 lanes unused and created head-of-line blocking
        when one category dominated load. Under ADR-641 the executor serializes
        only on per-(account, lane) conflicts, so any lane can carry any
        payload type.

        Args:
            _lane_type: legacy argument, ignored. Kept for backward compatibility
                        with callers that passed a type string.

        Returns:
            A lane ID in [0, 255].
        """
        with self._lane_counter_lock:
            lane = self._lane_counter % LANE_COUNT
            self._lane_counter += 1
            return lane

    @property
    def _nonce(self) -> Optional[int]:
        """Lane-0 view of the per-lane nonce cache (backward compatible).

        External callers reset the cached nonce with `wallet._nonce = None`
        (see the nonce-management skill); keep that working for lane 0.
        """
        return self._nonces.get(0)

    @_nonce.setter
    def _nonce(self, value: Optional[int]) -> None:
        if value is None:
            self._nonces.pop(0, None)
        else:
            self._nonces[0] = value

    @classmethod
    def generate(cls, rpc_client: Optional[RpcClient] = None) -> Wallet:
        """Generate a new wallet with a random keypair.

        Args:
            rpc_client: Optional RPC client for network operations

        Returns:
            A new Wallet with a random keypair
        """
        keypair = Keypair.generate()
        return cls(keypair, rpc_client)

    @classmethod
    def from_private_key(
        cls, private_key: bytes, rpc_client: Optional[RpcClient] = None
    ) -> Wallet:
        """Create a wallet from a private key.

        Args:
            private_key: The 32-byte private key
            rpc_client: Optional RPC client for network operations

        Returns:
            A Wallet with the given private key
        """
        keypair = Keypair.from_private_key(private_key)
        return cls(keypair, rpc_client)

    @classmethod
    def from_hex(cls, hex_string: str, rpc_client: Optional[RpcClient] = None) -> Wallet:
        """Create a wallet from a hex-encoded private key.

        Args:
            hex_string: The hex-encoded private key
            rpc_client: Optional RPC client for network operations

        Returns:
            A Wallet with the given private key
        """
        keypair = Keypair.from_hex(hex_string)
        return cls(keypair, rpc_client)


    def address(self) -> Address:
        """Get the wallet's address.

        Returns:
            The wallet's address
        """
        return self._keypair.address()

    def public_key(self) -> bytes:
        """Get the wallet's public key.

        Returns:
            The 32-byte public key
        """
        return self._keypair.public_key

    def get_balance(self) -> int:
        """Get the wallet's balance.

        Returns:
            The balance in units

        Raises:
            RuntimeError: If no RPC client is configured
        """
        if self._rpc_client is None:
            raise RuntimeError("No RPC client configured")
        return self._rpc_client.get_balance(self.address())

    def get_nonce(self, nonce_key: Optional[int] = None) -> int:
        """Get the next nonce for one of this wallet's lanes (sync version).

        Nonces are cached per lane (nonce_key): the first query for a lane
        fetches from the network, subsequent ones return the locally
        incremented counter. Lane 0 (the default) behaves exactly like the
        historical single shared counter.

        Args:
            nonce_key: Lane to query (default 0)

        Returns:
            The next nonce to use on that lane

        Raises:
            RuntimeError: If using async RPC client (use get_nonce_async instead)
        """
        lane = nonce_key if isinstance(nonce_key, int) else 0
        if lane in self._nonces:
            return self._nonces[lane]

        # Query the network for the current nonce
        if self._rpc_client is not None:
            # Check if it's an async client
            import inspect
            if inspect.iscoroutinefunction(self._rpc_client.get_nonce):
                raise RuntimeError(
                    "Cannot use sync get_nonce() with AsyncRpcClient. "
                    "Use await wallet.get_nonce_async() instead, or use transfer_async(), deploy_async(), call_async()"
                )
            if lane == 0:
                self._nonces[lane] = self._rpc_client.get_nonce(self.address())
            else:
                # Per-lane query. Older/custom clients may not accept the
                # lane argument; fall back to the lane-agnostic query
                # (correct for fresh lanes).
                try:
                    self._nonces[lane] = self._rpc_client.get_nonce(self.address(), True, lane)
                except TypeError:
                    self._nonces[lane] = self._rpc_client.get_nonce(self.address())
            return self._nonces[lane]

        # Default to 0 for new accounts without RPC
        self._nonces[lane] = 0
        return 0

    def reset_nonce_cache(self, nonce_key: Optional[int] = None) -> None:
        """Clear cached nonce for a lane (or all lanes if None) to force refetching from chain."""
        if nonce_key is None:
            self._nonces.clear()
        else:
            self._nonces.pop(nonce_key, None)

    async def get_nonce_async(self, nonce_key: Optional[int] = None) -> int:
        """Get the next nonce for one of this wallet's lanes (async version).

        This method queries the network for the current nonce of the lane if
        an RPC client is configured, otherwise uses a locally cached value.
        Lane 0 (the default) behaves exactly like the historical single
        shared counter.

        Args:
            nonce_key: Lane to query (default 0)

        Returns:
            The next nonce to use on that lane
        """
        lane = nonce_key if isinstance(nonce_key, int) else 0
        if lane in self._nonces:
            return self._nonces[lane]

        # Query the network for the current nonce
        if self._rpc_client is not None:
            import inspect
            if inspect.iscoroutinefunction(self._rpc_client.get_nonce):
                if lane == 0:
                    self._nonces[lane] = await self._rpc_client.get_nonce(self.address())
                else:
                    try:
                        self._nonces[lane] = await self._rpc_client.get_nonce(self.address(), True, lane)
                    except TypeError:
                        self._nonces[lane] = await self._rpc_client.get_nonce(self.address())
            else:
                if lane == 0:
                    self._nonces[lane] = self._rpc_client.get_nonce(self.address())
                else:
                    try:
                        self._nonces[lane] = self._rpc_client.get_nonce(self.address(), True, lane)
                    except TypeError:
                        self._nonces[lane] = self._rpc_client.get_nonce(self.address())
            return self._nonces[lane]

        # Default to 0 for new accounts without RPC
        self._nonces[lane] = 0
        return 0

    def _increment_nonce(self, nonce_key: int = 0) -> None:
        """Increment the cached nonce of a lane after a successful send."""
        lane = nonce_key if isinstance(nonce_key, int) else 0
        if lane in self._nonces:
            self._nonces[lane] += 1

    def _get_nonce_lock(self):
        """Get or create the nonce lock (lazy initialization)."""
        if self._nonce_lock is None:
            import asyncio
            self._nonce_lock = asyncio.Lock()
        return self._nonce_lock

    def transfer(
        self,
        to: Address,
        amount: int,
        nonce_key: Optional[int] = None,
        options: Optional[TxOptions] = None,
    ) -> str:
        """Transfer tokens to an address.

        Args:
            to: Recipient address
            amount: Amount to transfer (in units)
            nonce_key: Nonce key for lane parallelism (S=0)
            options: Optional transaction options

        Returns:
            The transaction ID

        Raises:
            RuntimeError: If no RPC client is configured
        """
        if self._rpc_client is None:
            raise RuntimeError("No RPC client configured")

        from synapticchain.types import TransactionBuilder

        options = options or TxOptions()
        
        # S=0 Architecture: Route to Transfers partition (100-199) if unspecified.
        # If caller passed explicit options.nonce without a nonce_key, default to lane 0 for script compatibility.
        if nonce_key is not None:
            nonce_key_val = nonce_key
        elif options.nonce_key is not None:
            nonce_key_val = options.nonce_key
        elif options.nonce is not None:
            nonce_key_val = 0
        else:
            nonce_key_val = self._get_next_lane("transfer")
            
        nonce = options.nonce if options.nonce is not None else self.get_nonce(nonce_key_val)

        tx = (
            TransactionBuilder()
            .from_address(self.address())
            .nonce(nonce)
            .nonce_key(nonce_key_val)
            .gas_limit(options.gas_limit or 21000)
            .gas_price(options.gas_price or 100)
            .chain_id(1)
            .transfer(to, amount)
            .sign(self._keypair)
        )

        tx_id = self._rpc_client.send_transaction(tx)
        self._increment_nonce(nonce_key_val)
        return tx_id

    def deploy(
        self,
        code: bytes,
        constructor_args: Optional[list[Value]] = None,
        options: Optional[TxOptions] = None,
    ) -> DeployResult:
        """Deploy a contract.

        Args:
            code: Contract bytecode
            constructor_args: Optional constructor arguments
            options: Optional transaction options

        Returns:
            The deployment result with tx_id and contract_address

        Raises:
            RuntimeError: If no RPC client is configured
        """
        if self._rpc_client is None:
            raise RuntimeError("No RPC client configured")

        from synapticchain.types import TransactionBuilder

        options = options or TxOptions()
        
        # S=0 Architecture: Route to Contracts partition (0-99) if unspecified.
        # If caller passed explicit options.nonce without a nonce_key, default to lane 0 for script compatibility.
        if options.nonce_key is not None:
            nonce_key_val = options.nonce_key
        elif options.nonce is not None:
            nonce_key_val = 0
        else:
            nonce_key_val = self._get_next_lane("contract")
            
        nonce = options.nonce if options.nonce is not None else self.get_nonce(nonce_key_val)

        tx = (
            TransactionBuilder()
            .from_address(self.address())
            .nonce(nonce)
            .nonce_key(nonce_key_val)
            .gas_limit(options.gas_limit or 1000000)
            .gas_price(options.gas_price or 100)
            .chain_id(1)
            .deploy(code, constructor_args)
            .sign(self._keypair)
        )

        tx_id = self._rpc_client.send_transaction(tx)
        contract_address = derive_contract_address(self.address(), nonce)
        self._increment_nonce(nonce_key_val)

        return DeployResult(tx_id=tx_id, contract_address=contract_address)

    def call(
        self,
        contract: Address,
        function_name: str,
        args: Optional[list[Value]] = None,
        nonce_key: Optional[int] = None,
        options: Optional[TxOptions] = None,
    ) -> bytes:
        """Call a contract function.

        Args:
            contract: Contract address
            function_name: Function to call
            args: Optional function arguments
            nonce_key: Optional nonce lane (overrides options.nonce_key)
            options: Optional transaction options

        Returns:
            The transaction ID

        Raises:
            RuntimeError: If no RPC client is configured
        """
        if self._rpc_client is None:
            raise RuntimeError("No RPC client configured")

        from synapticchain.types import TransactionBuilder

        options = options or TxOptions()
        
        # S=0 Architecture: Route to Contracts partition (0-99) if unspecified.
        # If caller passed explicit options.nonce without a nonce_key, default to lane 0 for script compatibility.
        if nonce_key is not None:
            nonce_key_val = nonce_key
        elif options.nonce_key is not None:
            nonce_key_val = options.nonce_key
        elif options.nonce is not None:
            nonce_key_val = 0
        else:
            nonce_key_val = self._get_next_lane("contract")
            
        nonce = options.nonce if options.nonce is not None else self.get_nonce(nonce_key_val)

        tx = (
            TransactionBuilder()
            .from_address(self.address())
            .nonce(nonce)
            .nonce_key(nonce_key_val)
            .gas_limit(options.gas_limit or 100000)
            .gas_price(options.gas_price or 100)
            .chain_id(1)
            .call(contract, function_name, args)
            .sign(self._keypair)
        )

        tx_id = self._rpc_client.send_transaction(tx)
        self._increment_nonce(nonce_key_val)
        return tx_id

    def sign_transaction(self, tx: UnsignedTransaction) -> Transaction:
        """Sign an unsigned transaction.

        Args:
            tx: The unsigned transaction

        Returns:
            The signed transaction
        """
        from synapticchain.serialization import compute_signing_bytes, compute_tx_id
        from synapticchain.types import Transaction

        signing_bytes = compute_signing_bytes(tx)
        signature = self._keypair.sign(signing_bytes)
        tx_id = compute_tx_id(tx)

        return Transaction(
            nonce=tx.nonce,
            nonce_key=tx.nonce_key,
            from_address=tx.from_address,
            public_key=self._keypair.public_key,  # CRITICAL: Include public key for signature verification
            signature=signature,
            payload=tx.payload,
            gas_limit=tx.gas_limit,
            gas_price=tx.gas_price,
            parents=tx.parents,
            timestamp=tx.timestamp,
            tx_id=tx_id,
            chain_id=getattr(tx, 'chain_id', 0),
        )

    def sign_message(self, message: bytes) -> bytes:
        """Sign an arbitrary message.

        Args:
            message: The message to sign

        Returns:
            The 64-byte signature
        """
        return self._keypair.sign(message)

    # Async versions for use with AsyncRpcClient
    async def transfer_async(
        self,
        to: Address,
        amount: int,
        options: Optional[TxOptions] = None,
    ) -> str:
        """Transfer tokens to an address (async version).

        Args:
            to: Recipient address
            amount: Amount to transfer (in units)
            options: Optional transaction options

        Returns:
            The transaction ID

        Raises:
            RuntimeError: If no RPC client is configured
        """
        if self._rpc_client is None:
            raise RuntimeError("No RPC client configured")

        from synapticchain.types import TransactionBuilder

        options = options or TxOptions()
        
        # S=0 Architecture: Route to Transfers partition (100-199) if unspecified.
        # If caller passed explicit options.nonce without a nonce_key, default to lane 0 for script compatibility.
        if options.nonce_key is not None:
            nonce_key_val = options.nonce_key
        elif options.nonce is not None:
            nonce_key_val = 0
        else:
            nonce_key_val = self._get_next_lane("transfer")

        # Use lock to prevent race conditions when getting/incrementing nonce
        async with self._get_nonce_lock():
            nonce = options.nonce if options.nonce is not None else await self.get_nonce_async(nonce_key_val)

            tx = (
                TransactionBuilder()
                .from_address(self.address())
                .nonce(nonce)
                .nonce_key(nonce_key_val)
                .gas_limit(options.gas_limit or 21000)
                .gas_price(options.gas_price or 100)
                .transfer(to, amount)
                .sign(self._keypair)
            )

            import inspect
            if inspect.iscoroutinefunction(self._rpc_client.send_transaction):
                tx_id = await self._rpc_client.send_transaction(tx)
            else:
                tx_id = self._rpc_client.send_transaction(tx)

            self._increment_nonce(nonce_key_val)
            return tx_id

    async def deploy_async(
        self,
        code: bytes,
        constructor_args: Optional[list[Value]] = None,
        options: Optional[TxOptions] = None,
    ) -> DeployResult:
        """Deploy a contract (async version).

        Args:
            code: Contract bytecode
            constructor_args: Optional constructor arguments
            options: Optional transaction options

        Returns:
            The deployment result with tx_id and contract_address

        Raises:
            RuntimeError: If no RPC client is configured
        """
        if self._rpc_client is None:
            raise RuntimeError("No RPC client configured")

        from synapticchain.types import TransactionBuilder

        options = options or TxOptions()
        
        # S=0 Architecture: Route to Contracts partition (0-99) if unspecified.
        # If caller passed explicit options.nonce without a nonce_key, default to lane 0 for script compatibility.
        if options.nonce_key is not None:
            nonce_key_val = options.nonce_key
        elif options.nonce is not None:
            nonce_key_val = 0
        else:
            nonce_key_val = self._get_next_lane("contract")

        # Use lock to prevent race conditions
        async with self._get_nonce_lock():
            nonce = options.nonce if options.nonce is not None else await self.get_nonce_async(nonce_key_val)

            tx = (
                TransactionBuilder()
                .from_address(self.address())
                .nonce(nonce)
                .nonce_key(nonce_key_val)
                .gas_limit(options.gas_limit or 1000000)
                .gas_price(options.gas_price or 100)
                .deploy(code, constructor_args)
                .sign(self._keypair)
            )

            import inspect
            if inspect.iscoroutinefunction(self._rpc_client.send_transaction):
                tx_id = await self._rpc_client.send_transaction(tx)
            else:
                tx_id = self._rpc_client.send_transaction(tx)
            
            contract_address = derive_contract_address(self.address(), nonce)
            self._increment_nonce(nonce_key_val)

            return DeployResult(tx_id=tx_id, contract_address=contract_address)

    async def call_async(
        self,
        contract: Address,
        function_name: str,
        args: Optional[list[Value]] = None,
        options: Optional[TxOptions] = None,
    ) -> bytes:
        """Call a contract function (async version).

        Args:
            contract: Contract address
            function_name: Function to call
            args: Optional function arguments
            options: Optional transaction options

        Returns:
            The transaction ID

        Raises:
            RuntimeError: If no RPC client is configured
        """
        if self._rpc_client is None:
            raise RuntimeError("No RPC client configured")

        from synapticchain.types import TransactionBuilder

        options = options or TxOptions()
        
        # S=0 Architecture: Route to Contracts partition (0-99) if unspecified.
        # If caller passed explicit options.nonce without a nonce_key, default to lane 0 for script compatibility.
        if options.nonce_key is not None:
            nonce_key_val = options.nonce_key
        elif options.nonce is not None:
            nonce_key_val = 0
        else:
            nonce_key_val = self._get_next_lane("contract")

        # Use lock to prevent race conditions
        async with self._get_nonce_lock():
            nonce = options.nonce if options.nonce is not None else await self.get_nonce_async(nonce_key_val)

            tx = (
                TransactionBuilder()
                .from_address(self.address())
                .nonce(nonce)
                .nonce_key(nonce_key_val)
                .gas_limit(options.gas_limit or 100000)
                .gas_price(options.gas_price or 100)
                .call(contract, function_name, args)
                .sign(self._keypair)
            )

            import inspect
            if inspect.iscoroutinefunction(self._rpc_client.send_transaction):
                tx_id = await self._rpc_client.send_transaction(tx)
            else:
                tx_id = self._rpc_client.send_transaction(tx)

            self._increment_nonce(nonce_key_val)
            return tx_id

    def __repr__(self) -> str:
        return f"Wallet(address={self.address()})"


__all__ = [
    "TxOptions",
    "DeployResult",
    "Wallet",
]
