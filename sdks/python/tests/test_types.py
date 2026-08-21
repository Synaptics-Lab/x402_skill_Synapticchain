"""
Unit tests for the types module.

Tests cover:
- FunctionSelector creation and computation
- Value types and factory methods
- TransactionBuilder fluent API
- Transaction construction and validation
- Payload types (Transfer, Deploy, Call)

Requirements: 3.1-3.10
"""

import pytest
import time
from synapticchain.types import (
    FunctionSelector,
    Value,
    ValueType,
    TransferPayload,
    DeployPayload,
    CallPayload,
    UnsignedTransaction,
    Transaction,
    TransactionBuilder,
)
from synapticchain.address import Address
from synapticchain.crypto import Keypair, hash_sha3_256
from synapticchain.errors import TransactionError


class TestFunctionSelector:
    """Tests for FunctionSelector class."""

    def test_create_from_4_bytes(self) -> None:
        """FunctionSelector should be created from 4 bytes."""
        data = bytes([0x12, 0x34, 0x56, 0x78])
        selector = FunctionSelector(data)
        assert selector.to_bytes() == data

    def test_reject_wrong_length(self) -> None:
        """FunctionSelector should reject data not exactly 4 bytes."""
        with pytest.raises(ValueError):
            FunctionSelector(bytes(3))
        with pytest.raises(ValueError):
            FunctionSelector(bytes(5))
        with pytest.raises(ValueError):
            FunctionSelector(bytes(0))

    def test_from_name_produces_4_bytes(self) -> None:
        """from_name() should produce a 4-byte selector."""
        selector = FunctionSelector.from_name("transfer")
        assert len(selector.to_bytes()) == 4

    def test_from_name_is_deterministic(self) -> None:
        """from_name() should produce the same selector for the same name."""
        sel1 = FunctionSelector.from_name("transfer")
        sel2 = FunctionSelector.from_name("transfer")
        assert sel1 == sel2
        assert sel1.to_bytes() == sel2.to_bytes()

    def test_from_name_different_names_different_selectors(self) -> None:
        """Different function names should produce different selectors."""
        sel1 = FunctionSelector.from_name("transfer")
        sel2 = FunctionSelector.from_name("balanceOf")
        assert sel1 != sel2

    def test_from_name_matches_sha3_256_first_4_bytes(self) -> None:
        """from_name() should return first 4 bytes of SHA3-256(name)."""
        name = "transfer"
        expected = hash_sha3_256(name.encode("utf-8"))[:4]
        selector = FunctionSelector.from_name(name)
        assert selector.to_bytes() == expected

    def test_to_hex(self) -> None:
        """to_hex() should return hex string without prefix."""
        data = bytes([0xAB, 0xCD, 0xEF, 0x12])
        selector = FunctionSelector(data)
        assert selector.to_hex() == "abcdef12"

    def test_equality(self) -> None:
        """FunctionSelectors with same bytes should be equal."""
        data = bytes([0x12, 0x34, 0x56, 0x78])
        sel1 = FunctionSelector(data)
        sel2 = FunctionSelector(data)
        assert sel1 == sel2

    def test_inequality(self) -> None:
        """FunctionSelectors with different bytes should not be equal."""
        sel1 = FunctionSelector(bytes([0x12, 0x34, 0x56, 0x78]))
        sel2 = FunctionSelector(bytes([0x12, 0x34, 0x56, 0x79]))
        assert sel1 != sel2

    def test_hash(self) -> None:
        """FunctionSelector should be hashable."""
        selector = FunctionSelector.from_name("transfer")
        hash(selector)  # Should not raise

    def test_repr(self) -> None:
        """repr() should contain hex representation."""
        selector = FunctionSelector.from_name("transfer")
        repr_str = repr(selector)
        assert "FunctionSelector" in repr_str
        assert selector.to_hex() in repr_str


class TestValue:
    """Tests for Value class."""

    def test_bool_value(self) -> None:
        """Value.bool() should create a boolean value."""
        val = Value.bool(True)
        assert val.type == ValueType.BOOL
        assert val.value is True

        val = Value.bool(False)
        assert val.type == ValueType.BOOL
        assert val.value is False

    def test_u8_value(self) -> None:
        """Value.u8() should create a u8 value."""
        val = Value.u8(255)
        assert val.type == ValueType.U8
        assert val.value == 255

    def test_u16_value(self) -> None:
        """Value.u16() should create a u16 value."""
        val = Value.u16(65535)
        assert val.type == ValueType.U16
        assert val.value == 65535

    def test_u32_value(self) -> None:
        """Value.u32() should create a u32 value."""
        val = Value.u32(4294967295)
        assert val.type == ValueType.U32
        assert val.value == 4294967295

    def test_u64_value(self) -> None:
        """Value.u64() should create a u64 value."""
        val = Value.u64(18446744073709551615)
        assert val.type == ValueType.U64
        assert val.value == 18446744073709551615

    def test_u128_value(self) -> None:
        """Value.u128() should create a u128 value."""
        val = Value.u128(2**128 - 1)
        assert val.type == ValueType.U128
        assert val.value == 2**128 - 1

    def test_u256_value(self) -> None:
        """Value.u256() should create a u256 value."""
        val = Value.u256(2**256 - 1)
        assert val.type == ValueType.U256
        assert val.value == 2**256 - 1

    def test_i8_value(self) -> None:
        """Value.i8() should create an i8 value."""
        val = Value.i8(-128)
        assert val.type == ValueType.I8
        assert val.value == -128

        val = Value.i8(127)
        assert val.type == ValueType.I8
        assert val.value == 127

    def test_i16_value(self) -> None:
        """Value.i16() should create an i16 value."""
        val = Value.i16(-32768)
        assert val.type == ValueType.I16
        assert val.value == -32768

    def test_i32_value(self) -> None:
        """Value.i32() should create an i32 value."""
        val = Value.i32(-2147483648)
        assert val.type == ValueType.I32
        assert val.value == -2147483648

    def test_i64_value(self) -> None:
        """Value.i64() should create an i64 value."""
        val = Value.i64(-9223372036854775808)
        assert val.type == ValueType.I64
        assert val.value == -9223372036854775808

    def test_i128_value(self) -> None:
        """Value.i128() should create an i128 value."""
        val = Value.i128(-(2**127))
        assert val.type == ValueType.I128
        assert val.value == -(2**127)

    def test_address_value(self) -> None:
        """Value.address() should create an address value."""
        addr = Address.zero()
        val = Value.address(addr)
        assert val.type == ValueType.ADDRESS
        assert val.value == addr

    def test_bytes_value(self) -> None:
        """Value.bytes_val() should create a bytes value."""
        data = b"hello"
        val = Value.bytes_val(data)
        assert val.type == ValueType.BYTES
        assert val.value == data

    def test_string_value(self) -> None:
        """Value.string() should create a string value."""
        val = Value.string("hello")
        assert val.type == ValueType.STRING
        assert val.value == "hello"

    def test_array_value(self) -> None:
        """Value.array() should create an array value."""
        items = [Value.u8(1), Value.u8(2), Value.u8(3)]
        val = Value.array(items)
        assert val.type == ValueType.ARRAY
        assert val.value == items

    def test_option_some_value(self) -> None:
        """Value.option() should create an option with a value."""
        inner = Value.u8(42)
        val = Value.option(inner)
        assert val.type == ValueType.OPTION
        assert val.value == inner

    def test_option_none_value(self) -> None:
        """Value.option() should create an option with None."""
        val = Value.option(None)
        assert val.type == ValueType.OPTION
        assert val.value is None

    def test_unit_value(self) -> None:
        """Value.unit() should create a unit value."""
        val = Value.unit()
        assert val.type == ValueType.UNIT
        assert val.value is None


class TestTransferPayload:
    """Tests for TransferPayload."""

    def test_create_transfer_payload(self) -> None:
        """TransferPayload should store to and amount."""
        to = Address.zero()
        amount = 1000000000000000000
        payload = TransferPayload(to=to, amount=amount)
        assert payload.to == to
        assert payload.amount == amount


class TestDeployPayload:
    """Tests for DeployPayload."""

    def test_create_deploy_payload(self) -> None:
        """DeployPayload should store code and constructor_args."""
        code = b"\x00\x01\x02\x03"
        args = [Value.string("MyToken")]
        payload = DeployPayload(code=code, constructor_args=args)
        assert payload.code == code
        assert payload.constructor_args == args

    def test_deploy_payload_default_args(self) -> None:
        """DeployPayload should default constructor_args to empty list."""
        code = b"\x00\x01\x02\x03"
        payload = DeployPayload(code=code)
        assert payload.constructor_args == []


class TestCallPayload:
    """Tests for CallPayload."""

    def test_create_call_payload(self) -> None:
        """CallPayload should store contract, function, and args."""
        contract = Address.zero()
        function = FunctionSelector.from_name("transfer")
        args = [Value.address(Address.zero()), Value.u256(1000)]
        payload = CallPayload(contract=contract, function=function, args=args)
        assert payload.contract == contract
        assert payload.function == function
        assert payload.args == args

    def test_call_payload_default_args(self) -> None:
        """CallPayload should default args to empty list."""
        contract = Address.zero()
        function = FunctionSelector.from_name("transfer")
        payload = CallPayload(contract=contract, function=function)
        assert payload.args == []


class TestTransactionBuilder:
    """Tests for TransactionBuilder class."""

    def test_build_transfer_transaction(self) -> None:
        """TransactionBuilder should build a transfer transaction."""
        keypair = Keypair.generate()
        to = Address.zero()
        amount = 1000

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .transfer(to, amount)
            .build()
        )

        assert isinstance(tx, UnsignedTransaction)
        assert tx.from_address == keypair.address()
        assert tx.nonce == 0
        assert tx.gas_limit == 21000
        assert tx.gas_price == 1000000000
        assert isinstance(tx.payload, TransferPayload)
        assert tx.payload.to == to
        assert tx.payload.amount == amount

    def test_build_deploy_transaction(self) -> None:
        """TransactionBuilder should build a deploy transaction."""
        keypair = Keypair.generate()
        code = b"\x00\x01\x02\x03"
        args = [Value.string("MyToken")]

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(1)
            .gas_limit(1000000)
            .gas_price(1000000000)
            .deploy(code, args)
            .build()
        )

        assert isinstance(tx.payload, DeployPayload)
        assert tx.payload.code == code
        assert tx.payload.constructor_args == args

    def test_build_call_transaction(self) -> None:
        """TransactionBuilder should build a call transaction."""
        keypair = Keypair.generate()
        contract = Address.zero()
        args = [Value.address(Address.zero()), Value.u256(1000)]

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(2)
            .gas_limit(100000)
            .gas_price(1000000000)
            .call(contract, "transfer", args)
            .build()
        )

        assert isinstance(tx.payload, CallPayload)
        assert tx.payload.contract == contract
        assert tx.payload.function == FunctionSelector.from_name("transfer")
        assert tx.payload.args == args

    def test_build_with_parents(self) -> None:
        """TransactionBuilder should set parent transaction IDs."""
        keypair = Keypair.generate()
        parent1 = bytes(32)
        parent2 = bytes([1] + [0] * 31)

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .parents([parent1, parent2])
            .transfer(Address.zero(), 1000)
            .build()
        )

        assert tx.parents == [parent1, parent2]

    def test_build_with_timestamp(self) -> None:
        """TransactionBuilder should set custom timestamp."""
        keypair = Keypair.generate()
        custom_ts = 1234567890000

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .timestamp(custom_ts)
            .transfer(Address.zero(), 1000)
            .build()
        )

        assert tx.timestamp == custom_ts

    def test_build_auto_timestamp(self) -> None:
        """TransactionBuilder should auto-set timestamp if not provided."""
        keypair = Keypair.generate()
        before = int(time.time() * 1000)

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(21000)
            .gas_price(1000000000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        after = int(time.time() * 1000)
        assert before <= tx.timestamp <= after

    def test_build_missing_from_address(self) -> None:
        """TransactionBuilder should reject missing from_address."""
        with pytest.raises(TransactionError) as exc_info:
            (
                TransactionBuilder()
                .nonce(0)
                .gas_limit(21000)
                .gas_price(1000000000)
                .transfer(Address.zero(), 1000)
                .build()
            )
        assert exc_info.value.code == TransactionError.MISSING_FIELD
        assert "from_address" in str(exc_info.value)

    def test_build_missing_payload(self) -> None:
        """TransactionBuilder should reject missing payload."""
        keypair = Keypair.generate()
        with pytest.raises(TransactionError) as exc_info:
            (
                TransactionBuilder()
                .from_address(keypair.address())
                .nonce(0)
                .gas_limit(21000)
                .gas_price(1000000000)
                .build()
            )
        assert exc_info.value.code == TransactionError.MISSING_FIELD
        assert "payload" in str(exc_info.value)

    def test_build_missing_gas_limit(self) -> None:
        """TransactionBuilder should reject missing gas_limit."""
        keypair = Keypair.generate()
        with pytest.raises(TransactionError) as exc_info:
            (
                TransactionBuilder()
                .from_address(keypair.address())
                .nonce(0)
                .gas_price(1000000000)
                .transfer(Address.zero(), 1000)
                .build()
            )
        assert exc_info.value.code == TransactionError.MISSING_FIELD
        assert "gas_limit" in str(exc_info.value)

    def test_build_missing_gas_price(self) -> None:
        """TransactionBuilder should reject missing gas_price."""
        keypair = Keypair.generate()
        with pytest.raises(TransactionError) as exc_info:
            (
                TransactionBuilder()
                .from_address(keypair.address())
                .nonce(0)
                .gas_limit(21000)
                .transfer(Address.zero(), 1000)
                .build()
            )
        assert exc_info.value.code == TransactionError.MISSING_FIELD
        assert "gas_price" in str(exc_info.value)

    def test_build_missing_multiple_fields(self) -> None:
        """TransactionBuilder should report all missing fields."""
        with pytest.raises(TransactionError) as exc_info:
            TransactionBuilder().build()
        assert exc_info.value.code == TransactionError.MISSING_FIELD
        # Should mention multiple missing fields
        error_msg = str(exc_info.value)
        assert "from_address" in error_msg
        assert "payload" in error_msg
        assert "gas_limit" in error_msg
        assert "gas_price" in error_msg

    def test_sign_produces_signed_transaction(self) -> None:
        """TransactionBuilder.sign() should produce a signed Transaction."""
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

        assert isinstance(tx, Transaction)
        assert len(tx.signature) == 64
        assert len(tx.tx_id) == 32

    def test_sign_preserves_fields(self) -> None:
        """TransactionBuilder.sign() should preserve all fields."""
        keypair = Keypair.generate()
        to = Address.zero()
        amount = 1000
        nonce = 42
        gas_limit = 21000
        gas_price = 1000000000
        timestamp = 1234567890000
        parents = [bytes(32)]

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(nonce)
            .gas_limit(gas_limit)
            .gas_price(gas_price)
            .timestamp(timestamp)
            .parents(parents)
            .transfer(to, amount)
            .sign(keypair)
        )

        assert tx.from_address == keypair.address()
        assert tx.nonce == nonce
        assert tx.gas_limit == gas_limit
        assert tx.gas_price == gas_price
        assert tx.timestamp == timestamp
        assert tx.parents == parents
        assert isinstance(tx.payload, TransferPayload)
        assert tx.payload.to == to
        assert tx.payload.amount == amount

    def test_default_nonce_is_zero(self) -> None:
        """TransactionBuilder should default nonce to 0."""
        keypair = Keypair.generate()

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .gas_limit(21000)
            .gas_price(1000000000)
            .transfer(Address.zero(), 1000)
            .build()
        )

        assert tx.nonce == 0

    def test_fluent_api_returns_self(self) -> None:
        """All builder methods should return self for chaining."""
        builder = TransactionBuilder()
        keypair = Keypair.generate()

        assert builder.from_address(keypair.address()) is builder
        assert builder.nonce(0) is builder
        assert builder.gas_limit(21000) is builder
        assert builder.gas_price(1000000000) is builder
        assert builder.timestamp(1234567890000) is builder
        assert builder.parents([]) is builder
        assert builder.transfer(Address.zero(), 1000) is builder

    def test_deploy_without_args(self) -> None:
        """TransactionBuilder.deploy() should work without constructor args."""
        keypair = Keypair.generate()
        code = b"\x00\x01\x02\x03"

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(1000000)
            .gas_price(1000000000)
            .deploy(code)
            .build()
        )

        assert isinstance(tx.payload, DeployPayload)
        assert tx.payload.code == code
        assert tx.payload.constructor_args == []

    def test_call_without_args(self) -> None:
        """TransactionBuilder.call() should work without function args."""
        keypair = Keypair.generate()
        contract = Address.zero()

        tx = (
            TransactionBuilder()
            .from_address(keypair.address())
            .nonce(0)
            .gas_limit(100000)
            .gas_price(1000000000)
            .call(contract, "getBalance")
            .build()
        )

        assert isinstance(tx.payload, CallPayload)
        assert tx.payload.contract == contract
        assert tx.payload.args == []


class TestTransaction:
    """Tests for Transaction dataclass."""

    def test_transaction_fields(self) -> None:
        """Transaction should have all required fields."""
        keypair = Keypair.generate()
        payload = TransferPayload(to=Address.zero(), amount=1000)
        signature = bytes(64)
        tx_id = bytes(32)

        tx = Transaction(
            nonce=0,
            from_address=keypair.address(),
            signature=signature,
            payload=payload,
            gas_limit=21000,
            gas_price=1000000000,
            parents=[],
            timestamp=1234567890000,
            tx_id=tx_id,
        )

        assert tx.nonce == 0
        assert tx.from_address == keypair.address()
        assert tx.signature == signature
        assert tx.payload == payload
        assert tx.gas_limit == 21000
        assert tx.gas_price == 1000000000
        assert tx.parents == []
        assert tx.timestamp == 1234567890000
        assert tx.tx_id == tx_id


class TestUnsignedTransaction:
    """Tests for UnsignedTransaction dataclass."""

    def test_unsigned_transaction_fields(self) -> None:
        """UnsignedTransaction should have all required fields except signature."""
        keypair = Keypair.generate()
        payload = TransferPayload(to=Address.zero(), amount=1000)

        tx = UnsignedTransaction(
            nonce=0,
            from_address=keypair.address(),
            payload=payload,
            gas_limit=21000,
            gas_price=1000000000,
            parents=[],
            timestamp=1234567890000,
        )

        assert tx.nonce == 0
        assert tx.from_address == keypair.address()
        assert tx.payload == payload
        assert tx.gas_limit == 21000
        assert tx.gas_price == 1000000000
        assert tx.parents == []
        assert tx.timestamp == 1234567890000
        # UnsignedTransaction should not have signature
        assert not hasattr(tx, "signature") or tx.__class__.__name__ == "UnsignedTransaction"
