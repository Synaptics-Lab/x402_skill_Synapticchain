"""
Unit tests for the serialization module.

Tests cover:
- Borsh serialization and deserialization
- JSON serialization and deserialization
- Signing bytes computation
- Transaction ID computation
- Round-trip serialization

Requirements: 5.1-5.7
"""

import pytest
import json
from synapticchain.serialization import (
    borsh_serialize,
    borsh_deserialize,
    json_serialize,
    json_deserialize,
    compute_signing_bytes,
    compute_tx_id,
)
from synapticchain.types import (
    Transaction,
    TransactionBuilder,
    TransferPayload,
    DeployPayload,
    CallPayload,
    FunctionSelector,
    Value,
)
from synapticchain.address import Address
from synapticchain.crypto import Keypair, hash_sha3_256
from synapticchain.errors import SerializationError


class TestBorshSerialize:
    """Tests for borsh_serialize()."""

    def test_serialize_transfer_transaction(self) -> None:
        """borsh_serialize() should serialize a transfer transaction."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .sign(keypair)
        )

        data = borsh_serialize(tx)
        assert isinstance(data, bytes)
        assert len(data) > 0

    def test_serialize_deploy_transaction(self) -> None:
        """borsh_serialize() should serialize a deploy transaction."""
        keypair = Keypair.generate()
        code = b"\x00\x01\x02\x03"
        args = [Value.string("MyToken"), Value.u256(1000000)]

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(1)
            .gas_limit(1000000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .deploy(code, args)
            .sign(keypair)
        )

        data = borsh_serialize(tx)
        assert isinstance(data, bytes)
        assert len(data) > 0

    def test_serialize_call_transaction(self) -> None:
        """borsh_serialize() should serialize a call transaction."""
        keypair = Keypair.generate()
        contract = Address.zero()
        args = [Value.address(Address.zero()), Value.u256(1000)]

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(2)
            .gas_limit(100000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .call(contract, "transfer", args)
            .sign(keypair)
        )

        data = borsh_serialize(tx)
        assert isinstance(data, bytes)
        assert len(data) > 0

    def test_serialize_with_parents(self) -> None:
        """borsh_serialize() should serialize transactions with parents."""
        keypair = Keypair.generate()
        parent1 = bytes(32)
        parent2 = bytes([1] + [0] * 31)

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .parents([parent1, parent2])
            .transfer(Address.zero(), 1000)
            .sign(keypair)
        )

        data = borsh_serialize(tx)
        assert isinstance(data, bytes)


class TestBorshDeserialize:
    """Tests for borsh_deserialize()."""

    def test_deserialize_transfer_transaction(self) -> None:
        """borsh_deserialize() should deserialize a transfer transaction."""
        keypair = Keypair.generate()
        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(42)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .sign(keypair)
        )

        data = borsh_serialize(original)
        restored = borsh_deserialize(data)

        assert restored.nonce == original.nonce
        assert restored.from_address == original.from_address
        assert restored.signature == original.signature
        assert restored.gas_limit == original.gas_limit
        assert restored.gas_price == original.gas_price
        assert restored.timestamp == original.timestamp
        assert isinstance(restored.payload, TransferPayload)
        assert restored.payload.to == original.payload.to
        assert restored.payload.amount == original.payload.amount

    def test_deserialize_deploy_transaction(self) -> None:
        """borsh_deserialize() should deserialize a deploy transaction."""
        keypair = Keypair.generate()
        code = b"\x00\x01\x02\x03"
        args = [Value.string("MyToken"), Value.u256(1000000)]

        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(1)
            .gas_limit(1000000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .deploy(code, args)
            .sign(keypair)
        )

        data = borsh_serialize(original)
        restored = borsh_deserialize(data)

        assert isinstance(restored.payload, DeployPayload)
        assert restored.payload.code == code
        assert len(restored.payload.constructor_args) == 2

    def test_deserialize_call_transaction(self) -> None:
        """borsh_deserialize() should deserialize a call transaction."""
        keypair = Keypair.generate()
        contract = Address.zero()
        args = [Value.address(Address.zero()), Value.u256(1000)]

        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(2)
            .gas_limit(100000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .call(contract, "transfer", args)
            .sign(keypair)
        )

        data = borsh_serialize(original)
        restored = borsh_deserialize(data)

        assert isinstance(restored.payload, CallPayload)
        assert restored.payload.contract == contract
        assert restored.payload.function == FunctionSelector.from_name("transfer")

    def test_deserialize_invalid_data(self) -> None:
        """borsh_deserialize() should reject invalid data."""
        with pytest.raises(SerializationError) as exc_info:
            borsh_deserialize(b"invalid data")
        assert exc_info.value.code == SerializationError.INVALID_FORMAT

    def test_deserialize_empty_data(self) -> None:
        """borsh_deserialize() should reject empty data."""
        with pytest.raises(SerializationError) as exc_info:
            borsh_deserialize(b"")
        assert exc_info.value.code == SerializationError.INVALID_FORMAT

    def test_deserialize_truncated_data(self) -> None:
        """borsh_deserialize() should reject truncated data."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .transfer(Address.zero(), 1000)
            .sign(keypair)
        )

        data = borsh_serialize(tx)
        truncated = data[: len(data) // 2]

        with pytest.raises(SerializationError) as exc_info:
            borsh_deserialize(truncated)
        assert exc_info.value.code == SerializationError.INVALID_FORMAT


class TestBorshRoundTrip:
    """Tests for Borsh serialization round-trip."""

    def test_transfer_round_trip(self) -> None:
        """Transfer transaction should round-trip through Borsh."""
        keypair = Keypair.generate()
        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(42)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000000000000000000)
            .sign(keypair)
        )

        data = borsh_serialize(original)
        restored = borsh_deserialize(data)

        assert restored.nonce == original.nonce
        assert restored.from_address == original.from_address
        assert restored.signature == original.signature
        assert restored.gas_limit == original.gas_limit
        assert restored.gas_price == original.gas_price
        assert restored.timestamp == original.timestamp
        assert restored.parents == original.parents

    def test_deploy_round_trip(self) -> None:
        """Deploy transaction should round-trip through Borsh."""
        keypair = Keypair.generate()
        code = bytes([i % 256 for i in range(100)])
        args = [
            Value.string("MyToken"),
            Value.u256(1000000),
            Value.bool(True),
            Value.array([Value.u8(1), Value.u8(2), Value.u8(3)]),
        ]

        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(1)
            .gas_limit(1000000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .deploy(code, args)
            .sign(keypair)
        )

        data = borsh_serialize(original)
        restored = borsh_deserialize(data)

        assert isinstance(restored.payload, DeployPayload)
        assert restored.payload.code == code
        assert len(restored.payload.constructor_args) == len(args)

    def test_call_round_trip(self) -> None:
        """Call transaction should round-trip through Borsh."""
        keypair = Keypair.generate()
        contract = Address(bytes([i for i in range(20)]))
        args = [
            Value.address(Address.zero()),
            Value.u256(1000),
            Value.option(Value.string("memo")),
        ]

        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(2)
            .gas_limit(100000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .call(contract, "transfer", args)
            .sign(keypair)
        )

        data = borsh_serialize(original)
        restored = borsh_deserialize(data)

        assert isinstance(restored.payload, CallPayload)
        assert restored.payload.contract == contract

    def test_with_parents_round_trip(self) -> None:
        """Transaction with parents should round-trip through Borsh."""
        keypair = Keypair.generate()
        parent1 = bytes([i for i in range(32)])
        parent2 = bytes([255 - i for i in range(32)])

        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .parents([parent1, parent2])
            .transfer(Address.zero(), 1000)
            .sign(keypair)
        )

        data = borsh_serialize(original)
        restored = borsh_deserialize(data)

        assert len(restored.parents) == 2
        assert restored.parents[0] == parent1
        assert restored.parents[1] == parent2


class TestJsonSerialize:
    """Tests for json_serialize()."""

    def test_serialize_transfer_transaction(self) -> None:
        """json_serialize() should serialize a transfer transaction."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .sign(keypair)
        )

        json_str = json_serialize(tx)
        assert isinstance(json_str, str)

        # Should be valid JSON
        data = json.loads(json_str)
        assert "nonce" in data
        assert "from" in data
        assert "signature" in data
        assert "payload" in data
        assert "gas_limit" in data  # Rust uses snake_case
        assert "gas_price" in data
        assert "timestamp" in data

    def test_serialize_uses_bech32_for_addresses(self) -> None:
        """json_serialize() should use Bech32m for addresses."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .transfer(Address.zero(), 1000)
            .sign(keypair)
        )

        json_str = json_serialize(tx)
        data = json.loads(json_str)

        assert data["from"].startswith("syn1")
        # Rust uses externally tagged enum format: {"Transfer": {...}}
        assert "Transfer" in data["payload"]
        assert data["payload"]["Transfer"]["to"].startswith("syn1")

    def test_serialize_uses_hex_for_signature(self) -> None:
        """json_serialize() should use hex for signature."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .transfer(Address.zero(), 1000)
            .sign(keypair)
        )

        json_str = json_serialize(tx)
        data = json.loads(json_str)

        # Signature should be 128 hex characters (64 bytes)
        assert len(data["signature"]) == 128
        # Should be valid hex
        bytes.fromhex(data["signature"])


class TestJsonDeserialize:
    """Tests for json_deserialize()."""

    def test_deserialize_transfer_transaction(self) -> None:
        """json_deserialize() should deserialize a transfer transaction."""
        keypair = Keypair.generate()
        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(42)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .sign(keypair)
        )

        json_str = json_serialize(original)
        restored = json_deserialize(json_str)

        assert restored.nonce == original.nonce
        assert restored.from_address == original.from_address
        assert restored.signature == original.signature
        assert restored.gas_limit == original.gas_limit
        assert restored.gas_price == original.gas_price
        assert restored.timestamp == original.timestamp

    def test_deserialize_invalid_json(self) -> None:
        """json_deserialize() should reject invalid JSON."""
        with pytest.raises(SerializationError) as exc_info:
            json_deserialize("not valid json")
        assert exc_info.value.code == SerializationError.INVALID_FORMAT

    def test_deserialize_empty_string(self) -> None:
        """json_deserialize() should reject empty string."""
        with pytest.raises(SerializationError) as exc_info:
            json_deserialize("")
        assert exc_info.value.code == SerializationError.INVALID_FORMAT


class TestJsonRoundTrip:
    """Tests for JSON serialization round-trip."""

    def test_transfer_round_trip(self) -> None:
        """Transfer transaction should round-trip through JSON."""
        keypair = Keypair.generate()
        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(42)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000000000000000000)
            .sign(keypair)
        )

        json_str = json_serialize(original)
        restored = json_deserialize(json_str)

        assert restored.nonce == original.nonce
        assert restored.from_address == original.from_address
        assert restored.signature == original.signature
        assert restored.gas_limit == original.gas_limit
        assert restored.gas_price == original.gas_price
        assert restored.timestamp == original.timestamp

    def test_deploy_round_trip(self) -> None:
        """Deploy transaction should round-trip through JSON."""
        keypair = Keypair.generate()
        code = bytes([i % 256 for i in range(100)])
        args = [Value.string("MyToken"), Value.u256(1000000)]

        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(1)
            .gas_limit(1000000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .deploy(code, args)
            .sign(keypair)
        )

        json_str = json_serialize(original)
        restored = json_deserialize(json_str)

        assert isinstance(restored.payload, DeployPayload)
        assert restored.payload.code == code

    def test_call_round_trip(self) -> None:
        """Call transaction should round-trip through JSON."""
        keypair = Keypair.generate()
        contract = Address(bytes([i for i in range(20)]))
        args = [Value.address(Address.zero()), Value.u256(1000)]

        original = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(2)
            .gas_limit(100000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .call(contract, "transfer", args)
            .sign(keypair)
        )

        json_str = json_serialize(original)
        restored = json_deserialize(json_str)

        assert isinstance(restored.payload, CallPayload)
        assert restored.payload.contract == contract


class TestComputeSigningBytes:
    """Tests for compute_signing_bytes()."""

    def test_signing_bytes_format(self) -> None:
        """compute_signing_bytes() should follow the correct format."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(42)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        signing_bytes = compute_signing_bytes(tx)
        assert isinstance(signing_bytes, bytes)
        assert len(signing_bytes) > 0

    def test_signing_bytes_deterministic(self) -> None:
        """compute_signing_bytes() should be deterministic."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(42)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        bytes1 = compute_signing_bytes(tx)
        bytes2 = compute_signing_bytes(tx)
        assert bytes1 == bytes2

    def test_signing_bytes_different_for_different_tx(self) -> None:
        """compute_signing_bytes() should differ for different transactions."""
        keypair = Keypair.generate()

        tx1 = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        tx2 = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(1)  # Different nonce
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        bytes1 = compute_signing_bytes(tx1)
        bytes2 = compute_signing_bytes(tx2)
        assert bytes1 != bytes2


class TestComputeTxId:
    """Tests for compute_tx_id()."""

    def test_tx_id_is_32_bytes(self) -> None:
        """compute_tx_id() should return 32 bytes."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        tx_id = compute_tx_id(tx)
        assert len(tx_id) == 32

    def test_tx_id_is_sha3_256_of_signing_bytes(self) -> None:
        """compute_tx_id() should be SHA3-256 of signing bytes."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        signing_bytes = compute_signing_bytes(tx)
        expected_id = hash_sha3_256(signing_bytes)
        actual_id = compute_tx_id(tx)

        assert actual_id == expected_id

    def test_tx_id_deterministic(self) -> None:
        """compute_tx_id() should be deterministic."""
        keypair = Keypair.generate()
        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        id1 = compute_tx_id(tx)
        id2 = compute_tx_id(tx)
        assert id1 == id2

    def test_tx_id_different_for_different_tx(self) -> None:
        """compute_tx_id() should differ for different transactions."""
        keypair = Keypair.generate()

        tx1 = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        tx2 = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(1)  # Different nonce
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        id1 = compute_tx_id(tx1)
        id2 = compute_tx_id(tx2)
        assert id1 != id2


class TestValueSerialization:
    """Tests for Value serialization in transactions."""

    def test_all_value_types_serialize(self) -> None:
        """All Value types should serialize correctly."""
        keypair = Keypair.generate()
        contract = Address.zero()

        # Create args with all value types
        args = [
            Value.bool(True),
            Value.u8(255),
            Value.u16(65535),
            Value.u32(4294967295),
            Value.u64(18446744073709551615),
            Value.u128(2**128 - 1),
            Value.u256(2**256 - 1),
            Value.i8(-128),
            Value.i16(-32768),
            Value.i32(-2147483648),
            Value.i64(-9223372036854775808),
            Value.i128(-(2**127)),
            Value.address(Address.zero()),
            Value.bytes_val(b"hello"),
            Value.string("world"),
            Value.array([Value.u8(1), Value.u8(2)]),
            Value.option(Value.u8(42)),
            Value.option(None),
            Value.unit(),
        ]

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(100000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .call(contract, "testAllTypes", args)
            .sign(keypair)
        )

        # Should serialize without error
        data = borsh_serialize(tx)
        assert len(data) > 0

        # Should round-trip
        restored = borsh_deserialize(data)
        assert isinstance(restored.payload, CallPayload)
        assert len(restored.payload.args) == len(args)

    def test_nested_array_serialization(self) -> None:
        """Nested arrays should serialize correctly."""
        keypair = Keypair.generate()
        contract = Address.zero()

        nested = Value.array([
            Value.array([Value.u8(1), Value.u8(2)]),
            Value.array([Value.u8(3), Value.u8(4)]),
        ])

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(100000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .call(contract, "testNested", [nested])
            .sign(keypair)
        )

        data = borsh_serialize(tx)
        restored = borsh_deserialize(data)

        assert isinstance(restored.payload, CallPayload)
        assert len(restored.payload.args) == 1

    def test_nested_option_serialization(self) -> None:
        """Nested options should serialize correctly."""
        keypair = Keypair.generate()
        contract = Address.zero()

        nested = Value.option(Value.option(Value.u8(42)))

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(100000)
            .gas_price(1000000000)
            .timestamp(1234567890000)
            .call(contract, "testNestedOption", [nested])
            .sign(keypair)
        )

        data = borsh_serialize(tx)
        restored = borsh_deserialize(data)

        assert isinstance(restored.payload, CallPayload)
        assert len(restored.payload.args) == 1
