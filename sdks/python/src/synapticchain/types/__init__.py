"""
Core types for SynapticChain SDK.

This module defines the core transaction types, payloads, and value types
used throughout the SDK.

Example:
    >>> from synapticchain.types import TransactionBuilder, Value
    >>> builder = TransactionBuilder()
    >>> value = Value.u64(1000)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Optional, Union

from synapticchain.crypto import hash_sha3_256
from synapticchain.errors import TransactionError

if TYPE_CHECKING:
    from synapticchain.address import Address
    from synapticchain.crypto import Keypair


# Type aliases
TxId = bytes  # 32-byte transaction ID (SHA3-256 hash)
Signature = bytes  # 64-byte Ed25519 signature
Gas = int  # Gas amount


class PayloadType(Enum):
    """Transaction payload types."""

    TRANSFER = 0
    DEPLOY = 1
    CALL = 2


@dataclass
class FunctionSelector:
    """A 4-byte function selector for contract calls.

    The selector is computed as the first 4 bytes of SHA3-256(function_name).

    Attributes:
        data: The 4-byte selector
    """

    data: bytes

    def __init__(self, data: bytes) -> None:
        """Initialize a FunctionSelector from raw bytes.

        Args:
            data: The 4-byte selector

        Raises:
            ValueError: If data is not exactly 4 bytes
        """
        if len(data) != 4:
            raise ValueError(f"Function selector must be 4 bytes, got {len(data)}")
        self.data = bytes(data)

    @classmethod
    def from_name(cls, name: str) -> FunctionSelector:
        """Compute a function selector from a function name.

        Args:
            name: The function name

        Returns:
            The computed FunctionSelector

        Example:
            >>> selector = FunctionSelector.from_name("transfer")
            >>> len(selector.data)
            4
        """
        hash_bytes = hash_sha3_256(name.encode("utf-8"))
        return cls(hash_bytes[:4])

    def to_bytes(self) -> bytes:
        """Get the raw 4-byte selector."""
        return self.data

    def to_hex(self) -> str:
        """Get the selector as a hex string."""
        return self.data.hex()

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, FunctionSelector):
            return NotImplemented
        return self.data == other.data

    def __hash__(self) -> int:
        return hash(self.data)

    def __repr__(self) -> str:
        return f"FunctionSelector({self.to_hex()})"


@dataclass
class TransferPayload:
    """Payload for a transfer transaction.

    Attributes:
        to: The recipient address
        amount: The amount to transfer (in units, as U256)
    """

    to: Address
    amount: int  # U256 represented as Python int


@dataclass
class DeployPayload:
    """Payload for a contract deployment transaction.

    Attributes:
        code: The contract bytecode
        constructor_args: Arguments for the constructor
    """

    code: bytes
    constructor_args: list[Value] = field(default_factory=list)


@dataclass
class CallPayload:
    """Payload for a contract call transaction.

    Attributes:
        contract: The contract address
        function: The function selector
        args: Arguments for the function call
        value: SYN value attached (32 bytes, big-endian U256)
    """

    contract: Address
    function: FunctionSelector
    args: list[Value] = field(default_factory=list)
    value: bytes = field(default_factory=lambda: bytes(32))


# Union type for all payloads
Payload = Union[TransferPayload, DeployPayload, CallPayload]


class ValueType(Enum):
    """Value type variants for contract interaction."""

    BOOL = "bool"
    U8 = "u8"
    U16 = "u16"
    U32 = "u32"
    U64 = "u64"
    U128 = "u128"
    U256 = "u256"
    I8 = "i8"
    I16 = "i16"
    I32 = "i32"
    I64 = "i64"
    I128 = "i128"
    ADDRESS = "address"
    BYTES = "bytes"
    STRING = "string"
    ARRAY = "array"
    OPTION = "option"
    UNIT = "unit"


@dataclass
class Value:
    """A typed value for contract interaction.

    Supports all SynapticChain value types: Bool, U8-U256, I8-I128,
    Address, Bytes, String, Array, Option, Unit.

    Attributes:
        type: The value type
        value: The actual value
    """

    type: ValueType
    value: Any

    @classmethod
    def bool(cls, v: bool) -> Value:
        """Create a boolean value."""
        return cls(ValueType.BOOL, v)

    @classmethod
    def u8(cls, v: int) -> Value:
        """Create a u8 value."""
        return cls(ValueType.U8, v)

    @classmethod
    def u16(cls, v: int) -> Value:
        """Create a u16 value."""
        return cls(ValueType.U16, v)

    @classmethod
    def u32(cls, v: int) -> Value:
        """Create a u32 value."""
        return cls(ValueType.U32, v)

    @classmethod
    def u64(cls, v: int) -> Value:
        """Create a u64 value."""
        return cls(ValueType.U64, v)

    @classmethod
    def u128(cls, v: int) -> Value:
        """Create a u128 value."""
        return cls(ValueType.U128, v)

    @classmethod
    def u256(cls, v: int) -> Value:
        """Create a u256 value."""
        return cls(ValueType.U256, v)

    @classmethod
    def i8(cls, v: int) -> Value:
        """Create an i8 value."""
        return cls(ValueType.I8, v)

    @classmethod
    def i16(cls, v: int) -> Value:
        """Create an i16 value."""
        return cls(ValueType.I16, v)

    @classmethod
    def i32(cls, v: int) -> Value:
        """Create an i32 value."""
        return cls(ValueType.I32, v)

    @classmethod
    def i64(cls, v: int) -> Value:
        """Create an i64 value."""
        return cls(ValueType.I64, v)

    @classmethod
    def i128(cls, v: int) -> Value:
        """Create an i128 value."""
        return cls(ValueType.I128, v)

    @classmethod
    def address(cls, v: Address) -> Value:
        """Create an address value."""
        return cls(ValueType.ADDRESS, v)

    @classmethod
    def bytes_val(cls, v: bytes) -> Value:
        """Create a bytes value."""
        return cls(ValueType.BYTES, v)

    @classmethod
    def string(cls, v: str) -> Value:
        """Create a string value."""
        return cls(ValueType.STRING, v)

    @classmethod
    def array(cls, v: list[Value]) -> Value:
        """Create an array value."""
        return cls(ValueType.ARRAY, v)

    @classmethod
    def option(cls, v: Optional[Value]) -> Value:
        """Create an option value."""
        return cls(ValueType.OPTION, v)

    @classmethod
    def unit(cls) -> Value:
        """Create a unit value."""
        return cls(ValueType.UNIT, None)


@dataclass
class UnsignedTransaction:
    """An unsigned transaction ready for signing.

    Attributes:
        nonce: Transaction nonce
        nonce_key: Nonce key for lane parallelism (S=0)
        from_address: Sender address
        payload: Transaction payload
        gas_limit: Maximum gas to use
        gas_price: Price per gas unit
        parents: Parent transaction IDs (for DAG)
        timestamp: Transaction timestamp
        chain_id: Chain ID for replay protection (0=legacy, 1=mainnet, 321=testnet)
    """

    nonce: int
    from_address: Address
    payload: Payload
    gas_limit: int
    gas_price: int
    nonce_key: int = 0
    parents: list[TxId] = field(default_factory=list)
    timestamp: int = 0
    chain_id: int = 0


@dataclass
class Transaction:
    """A signed transaction.

    Attributes:
        nonce: Transaction nonce
        nonce_key: Nonce key for lane parallelism (S=0)
        from_address: Sender address
        public_key: Sender's Ed25519 public key (32 bytes)
        signature: Ed25519 signature
        payload: Transaction payload
        gas_limit: Maximum gas to use
        gas_price: Price per gas unit
        parents: Parent transaction IDs (for DAG)
        timestamp: Transaction timestamp
        tx_id: Computed transaction ID
        chain_id: Chain ID for replay protection (0=legacy, 1=mainnet, 321=testnet)
    """

    nonce: int
    from_address: Address
    public_key: bytes  # 32-byte Ed25519 public key
    signature: Signature
    payload: Payload
    gas_limit: int
    gas_price: int
    nonce_key: int = 0
    parents: list[TxId] = field(default_factory=list)
    timestamp: int = 0
    tx_id: TxId = field(default_factory=lambda: bytes(32))
    chain_id: int = 0


class TransactionBuilder:
    """Fluent builder for constructing transactions.

    Example:
        >>> from synapticchain import TransactionBuilder, Keypair, Address
        >>> keypair = Keypair.generate()
        >>> tx = (
        ...     TransactionBuilder()
        ...     .from_address(keypair.address())
        ...     .nonce(0)
        ...     .gas_limit(21000)
        ...     .gas_price(1000000000)
        ...     .transfer(Address.zero(), 1000)
        ...     .sign(keypair)
        ... )
    """

    def __init__(self) -> None:
        """Initialize an empty TransactionBuilder."""
        self._nonce: Optional[int] = None
        self._nonce_key: Optional[int] = None
        self._from_address: Optional[Address] = None
        self._payload: Optional[Payload] = None
        self._gas_limit: Optional[int] = None
        self._gas_price: Optional[int] = None
        self._parents: list[TxId] = []
        self._timestamp: Optional[int] = None
        self._chain_id: Optional[int] = None

    @classmethod
    def create_transfer(
        cls,
        keypair: Keypair,
        to: Address,
        amount: int,
        nonce: int,
        gas_limit: int = 21000,
        gas_price: int = 1000000000,
    ) -> Transaction:
        """Convenience method to create and sign a transfer transaction.

        Args:
            keypair: The keypair to sign with
            to: Recipient address
            amount: Amount to transfer (in units)
            nonce: Transaction nonce
            gas_limit: Maximum gas to use (default: 21000)
            gas_price: Price per gas unit (default: 1 Gwei)

        Returns:
            The signed Transaction

        Example:
            >>> from synapticchain import TransactionBuilder, Keypair, Address
            >>> keypair = Keypair.generate()
            >>> to = Address.from_bech32("syn1...")
            >>> tx = TransactionBuilder.create_transfer(
            ...     keypair=keypair,
            ...     to=to,
            ...     amount=1000000000000000000,  # 1 SYN
            ...     nonce=0
            ... )
        """
        return (
            cls()
            .from_address(keypair.address())
            .nonce(nonce)
            .gas_limit(gas_limit)
            .gas_price(gas_price)
            .transfer(to, amount)
            .sign(keypair)
        )
        self._gas_price: Optional[int] = None
        self._parents: list[TxId] = []
        self._timestamp: Optional[int] = None

    def from_address(self, address: Address) -> TransactionBuilder:
        """Set the sender address.

        Args:
            address: The sender's address

        Returns:
            self for method chaining
        """
        self._from_address = address
        return self

    def nonce(self, nonce: int) -> TransactionBuilder:
        """Set the transaction nonce.

        Args:
            nonce: The nonce value

        Returns:
            self for method chaining
        """
        self._nonce = nonce
        return self

    def nonce_key(self, nonce_key: int) -> TransactionBuilder:
        """Set the nonce key for lane parallelism (S=0).

        Args:
            nonce_key: The nonce key value

        Returns:
            self for method chaining
        """
        self._nonce_key = nonce_key
        return self

    def gas_limit(self, limit: int) -> TransactionBuilder:
        """Set the gas limit.

        Args:
            limit: Maximum gas to use

        Returns:
            self for method chaining
        """
        self._gas_limit = limit
        return self

    def gas_price(self, price: int) -> TransactionBuilder:
        """Set the gas price.

        Args:
            price: Price per gas unit

        Returns:
            self for method chaining
        """
        self._gas_price = price
        return self

    def timestamp(self, ts: int) -> TransactionBuilder:
        """Set the transaction timestamp.

        Args:
            ts: Unix timestamp in milliseconds

        Returns:
            self for method chaining
        """
        self._timestamp = ts
        return self

    def parents(self, parents: list[TxId]) -> TransactionBuilder:
        """Set parent transaction IDs for DAG structure.

        Args:
            parents: List of parent transaction IDs

        Returns:
            self for method chaining
        """
        self._parents = parents
        return self

    def chain_id(self, chain_id: int) -> 'TransactionBuilder':
        """Set the chain ID for replay protection.

        Args:
            chain_id: The chain ID (0=legacy, 1=mainnet, 321=testnet)

        Returns:
            self for method chaining
        """
        self._chain_id = chain_id
        return self

    def transfer(self, to: Address, amount: int) -> TransactionBuilder:
        """Set payload to a transfer.

        Args:
            to: Recipient address
            amount: Amount to transfer (in units)

        Returns:
            self for method chaining
        """
        self._payload = TransferPayload(to=to, amount=amount)
        return self

    def deploy(
        self, code: bytes, constructor_args: Optional[list[Value]] = None
    ) -> TransactionBuilder:
        """Set payload to a contract deployment.

        Args:
            code: Contract bytecode
            constructor_args: Optional constructor arguments

        Returns:
            self for method chaining
        """
        self._payload = DeployPayload(
            code=code, constructor_args=constructor_args or []
        )
        return self

    def call(
        self,
        contract: Address,
        function_name: str,
        args: Optional[list[Value]] = None,
    ) -> TransactionBuilder:
        """Set payload to a contract call.

        Args:
            contract: Contract address
            function_name: Name of the function to call
            args: Optional function arguments

        Returns:
            self for method chaining
        """
        self._payload = CallPayload(
            contract=contract,
            function=FunctionSelector.from_name(function_name),
            args=args or [],
        )
        return self

    def build(self) -> UnsignedTransaction:
        """Build an unsigned transaction.

        Returns:
            The constructed UnsignedTransaction

        Raises:
            TransactionError: If required fields are missing
            
        Example:
            >>> builder = TransactionBuilder()
            >>> builder.from_address(my_address)
            >>> builder.nonce(0)
            >>> builder.gas_limit(21000)
            >>> builder.gas_price(1000000000)
            >>> builder.transfer(to_address, amount)
            >>> unsigned_tx = builder.build()
        """
        missing_fields = []
        missing_methods = []
        
        if self._from_address is None:
            missing_fields.append("from_address")
            missing_methods.append(".from_address(address)")
        if self._payload is None:
            missing_fields.append("payload")
            missing_methods.append(".transfer(to, amount) or .deploy(code) or .call(contract, function, args)")
        if self._gas_limit is None:
            missing_fields.append("gas_limit")
            missing_methods.append(".gas_limit(21000)")
        if self._gas_price is None:
            missing_fields.append("gas_price")
            missing_methods.append(".gas_price(1000000000)")

        if missing_fields:
            methods_str = "\n  - ".join(missing_methods)
            raise TransactionError(
                code=TransactionError.MISSING_FIELD,
                message=(
                    f"Missing required fields: {', '.join(missing_fields)}. "
                    f"Call these methods before .build():\n  - {methods_str}"
                ),
                details={"missing_fields": missing_fields},
            )

        # Use current time if timestamp not set
        import time

        timestamp = self._timestamp if self._timestamp is not None else int(time.time() * 1000)

        return UnsignedTransaction(
            nonce=self._nonce or 0,
            nonce_key=self._nonce_key or 0,
            from_address=self._from_address,  # type: ignore
            payload=self._payload,  # type: ignore
            gas_limit=self._gas_limit,  # type: ignore
            gas_price=self._gas_price,  # type: ignore
            parents=self._parents,
            timestamp=timestamp,
            chain_id=self._chain_id if self._chain_id is not None else 0,
        )

    def sign(self, keypair: Keypair) -> Transaction:
        """Build and sign the transaction.

        Args:
            keypair: The keypair to sign with

        Returns:
            The signed Transaction

        Raises:
            TransactionError: If required fields are missing
        """
        # Import here to avoid circular imports
        from synapticchain.serialization import compute_signing_bytes, compute_tx_id

        unsigned = self.build()

        # The Rust node includes public_key in signing_bytes (C-4 fix), so the
        # signature must be computed over a transaction that already contains the
        # sender's public key. Build a preliminary signed transaction with a
        # dummy signature, compute signing bytes from it, then replace the sig.
        prelim = Transaction(
            nonce=unsigned.nonce,
            nonce_key=unsigned.nonce_key,
            from_address=unsigned.from_address,
            public_key=keypair.public_key,
            signature=Signature(bytes(64)),
            payload=unsigned.payload,
            gas_limit=unsigned.gas_limit,
            gas_price=unsigned.gas_price,
            parents=unsigned.parents,
            timestamp=unsigned.timestamp,
            chain_id=unsigned.chain_id,
        )
        signing_bytes = compute_signing_bytes(prelim)
        signature = keypair.sign(signing_bytes)

        # Compute transaction ID from the same bytes used for signing
        tx_id = compute_tx_id(prelim)

        return Transaction(
            nonce=unsigned.nonce,
            nonce_key=unsigned.nonce_key,
            from_address=unsigned.from_address,
            public_key=keypair.public_key,
            signature=signature,
            payload=unsigned.payload,
            gas_limit=unsigned.gas_limit,
            gas_price=unsigned.gas_price,
            parents=unsigned.parents,
            timestamp=unsigned.timestamp,
            tx_id=tx_id,
            chain_id=unsigned.chain_id,
        )


__all__ = [
    "TxId",
    "Signature",
    "Gas",
    "PayloadType",
    "FunctionSelector",
    "TransferPayload",
    "DeployPayload",
    "CallPayload",
    "Payload",
    "ValueType",
    "Value",
    "UnsignedTransaction",
    "Transaction",
    "TransactionBuilder",
]
