"""
Property-based tests for the serialization module.

Uses hypothesis for property-based testing with minimum 100 iterations per property.

Tests Properties 15, 16, 18, 19, and 20 from the design document.
"""

from hypothesis import given, settings, strategies as st
import pytest

from synapticchain.address import Address
from synapticchain.crypto import Keypair
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
    TransferPayload,
    DeployPayload,
    CallPayload,
    FunctionSelector,
    Value,
    ValueType,
)
from synapticchain.errors import SerializationError

# Minimum iterations per property as specified in design document
NUM_RUNS = 100


# ============================================================================
# Custom Strategies
# ============================================================================

# Strategy for valid 20-byte address data
address_bytes_strategy = st.binary(min_size=20, max_size=20)
address_strategy = address_bytes_strategy.map(lambda b: Address(b))

# Strategy for nonce, gas, timestamp (u64 range)
u64_strategy = st.integers(min_value=0, max_value=2**64 - 1)

# Strategy for amounts (U256 range, but limited for practical testing)
amount_strategy = st.integers(min_value=0, max_value=2**256 - 1)

# Strategy for signature (64 bytes)
signature_strategy = st.binary(min_size=64, max_size=64)

# Strategy for transaction ID (32 bytes)
tx_id_strategy = st.binary(min_size=32, max_size=32)

# Strategy for parents
parents_strategy = st.lists(tx_id_strategy, min_size=0, max_size=5)

# Strategy for bytecode
bytecode_strategy = st.binary(min_size=0, max_size=512)

# Strategy for function selector (4 bytes)
function_selector_strategy = st.binary(min_size=4, max_size=4).map(
    lambda b: FunctionSelector(b)
)


# Strategy for simple Value types (non-recursive)
@st.composite
def simple_value_strategy(draw):
    """Generate simple (non-recursive) Value instances."""
    value_type = draw(
        st.sampled_from(
            [
                ValueType.BOOL,
                ValueType.U8,
                ValueType.U16,
                ValueType.U32,
                ValueType.U64,
                ValueType.U128,
                ValueType.U256,
                ValueType.I8,
                ValueType.I16,
                ValueType.I32,
                ValueType.I64,
                ValueType.I128,
                ValueType.ADDRESS,
                ValueType.BYTES,
                ValueType.STRING,
                ValueType.UNIT,
            ]
        )
    )

    if value_type == ValueType.BOOL:
        return Value.bool(draw(st.booleans()))
    elif value_type == ValueType.U8:
        return Value.u8(draw(st.integers(min_value=0, max_value=255)))
    elif value_type == ValueType.U16:
        return Value.u16(draw(st.integers(min_value=0, max_value=65535)))
    elif value_type == ValueType.U32:
        return Value.u32(draw(st.integers(min_value=0, max_value=2**32 - 1)))
    elif value_type == ValueType.U64:
        return Value.u64(draw(u64_strategy))
    elif value_type == ValueType.U128:
        return Value.u128(draw(st.integers(min_value=0, max_value=2**128 - 1)))
    elif value_type == ValueType.U256:
        return Value.u256(draw(st.integers(min_value=0, max_value=2**256 - 1)))
    elif value_type == ValueType.I8:
        return Value.i8(draw(st.integers(min_value=-128, max_value=127)))
    elif value_type == ValueType.I16:
        return Value.i16(draw(st.integers(min_value=-32768, max_value=32767)))
    elif value_type == ValueType.I32:
        return Value.i32(draw(st.integers(min_value=-(2**31), max_value=2**31 - 1)))
    elif value_type == ValueType.I64:
        return Value.i64(draw(st.integers(min_value=-(2**63), max_value=2**63 - 1)))
    elif value_type == ValueType.I128:
        return Value.i128(draw(st.integers(min_value=-(2**127), max_value=2**127 - 1)))
    elif value_type == ValueType.ADDRESS:
        return Value.address(draw(address_strategy))
    elif value_type == ValueType.BYTES:
        return Value.bytes_val(draw(st.binary(min_size=0, max_size=128)))
    elif value_type == ValueType.STRING:
        return Value.string(draw(st.text(min_size=0, max_size=64)))
    elif value_type == ValueType.UNIT:
        return Value.unit()


# Strategy for list of simple values
values_list_strategy = st.lists(simple_value_strategy(), min_size=0, max_size=3)


# Strategy for transfer payload
@st.composite
def transfer_payload_strategy(draw):
    """Generate TransferPayload instances."""
    return TransferPayload(
        to=draw(address_strategy),
        amount=draw(amount_strategy),
    )


# Strategy for deploy payload
@st.composite
def deploy_payload_strategy(draw):
    """Generate DeployPayload instances."""
    return DeployPayload(
        code=draw(bytecode_strategy),
        constructor_args=draw(values_list_strategy),
    )


# Strategy for call payload
@st.composite
def call_payload_strategy(draw):
    """Generate CallPayload instances."""
    return CallPayload(
        contract=draw(address_strategy),
        function=draw(function_selector_strategy),
        args=draw(values_list_strategy),
    )


# Strategy for any payload
payload_strategy = st.one_of(
    transfer_payload_strategy(),
    deploy_payload_strategy(),
    call_payload_strategy(),
)


# Strategy for Transaction
@st.composite
def transaction_strategy(draw):
    """Generate Transaction instances."""
    return Transaction(
        nonce=draw(u64_strategy),
        from_address=draw(address_strategy),
        signature=draw(signature_strategy),
        payload=draw(payload_strategy),
        gas_limit=draw(u64_strategy),
        gas_price=draw(u64_strategy),
        parents=draw(parents_strategy),
        timestamp=draw(u64_strategy),
        tx_id=draw(tx_id_strategy),
    )


# ============================================================================
# Helper Functions
# ============================================================================


def transactions_equal(tx1: Transaction, tx2: Transaction) -> bool:
    """Deep equality check for Transaction objects."""
    # Check scalar fields
    if tx1.nonce != tx2.nonce:
        return False
    if tx1.gas_limit != tx2.gas_limit:
        return False
    if tx1.gas_price != tx2.gas_price:
        return False
    if tx1.timestamp != tx2.timestamp:
        return False

    # Check from address
    if tx1.from_address != tx2.from_address:
        return False

    # Check signature
    if tx1.signature != tx2.signature:
        return False

    # Check parents
    if len(tx1.parents) != len(tx2.parents):
        return False
    for p1, p2 in zip(tx1.parents, tx2.parents):
        if p1 != p2:
            return False

    # Check payload
    if not payloads_equal(tx1.payload, tx2.payload):
        return False

    return True


def payloads_equal(p1, p2) -> bool:
    """Check if two payloads are equal."""
    if type(p1) != type(p2):
        return False

    if isinstance(p1, TransferPayload):
        return p1.to == p2.to and p1.amount == p2.amount
    elif isinstance(p1, DeployPayload):
        if p1.code != p2.code:
            return False
        if len(p1.constructor_args) != len(p2.constructor_args):
            return False
        for v1, v2 in zip(p1.constructor_args, p2.constructor_args):
            if not values_equal(v1, v2):
                return False
        return True
    elif isinstance(p1, CallPayload):
        if p1.contract != p2.contract:
            return False
        if p1.function != p2.function:
            return False
        if len(p1.args) != len(p2.args):
            return False
        for v1, v2 in zip(p1.args, p2.args):
            if not values_equal(v1, v2):
                return False
        return True
    return False


def values_equal(v1: Value, v2: Value) -> bool:
    """Check if two Values are equal."""
    if v1.type != v2.type:
        return False

    if v1.type == ValueType.ADDRESS:
        return v1.value == v2.value
    elif v1.type == ValueType.BYTES:
        return v1.value == v2.value
    elif v1.type == ValueType.ARRAY:
        if len(v1.value) != len(v2.value):
            return False
        for item1, item2 in zip(v1.value, v2.value):
            if not values_equal(item1, item2):
                return False
        return True
    elif v1.type == ValueType.OPTION:
        if v1.value is None and v2.value is None:
            return True
        if v1.value is None or v2.value is None:
            return False
        return values_equal(v1.value, v2.value)
    elif v1.type == ValueType.UNIT:
        return True
    else:
        return v1.value == v2.value


# ============================================================================
# Property Tests
# ============================================================================


class TestProperty18TransactionBorshSerializationRoundTrip:
    """
    Feature: synapticchain-sdks, Property 18: Transaction Borsh Serialization Round-Trip
    **Validates: Requirements 5.1, 5.3, 5.5**
    """

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_borsh_round_trip(self, tx: Transaction) -> None:
        """
        For any valid Transaction object, serializing to Borsh format then
        deserializing back SHALL produce an equivalent Transaction object.
        """
        # Serialize to Borsh
        bytes_data = borsh_serialize(tx)

        # Deserialize back
        deserialized = borsh_deserialize(bytes_data)

        # Verify equivalence
        assert transactions_equal(tx, deserialized)

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_borsh_serialization_is_deterministic(self, tx: Transaction) -> None:
        """Borsh serialization produces deterministic output."""
        # Serialize multiple times
        bytes1 = borsh_serialize(tx)
        bytes2 = borsh_serialize(tx)
        bytes3 = borsh_serialize(tx)

        # All serializations should produce identical bytes
        assert bytes1 == bytes2
        assert bytes2 == bytes3


class TestProperty19TransactionJSONSerializationRoundTrip:
    """
    Feature: synapticchain-sdks, Property 19: Transaction JSON Serialization Round-Trip
    **Validates: Requirements 5.2, 5.4, 5.6**
    """

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_json_round_trip(self, tx: Transaction) -> None:
        """
        For any valid Transaction object, serializing to JSON format then
        deserializing back SHALL produce an equivalent Transaction object.
        """
        # Serialize to JSON
        json_str = json_serialize(tx)

        # Deserialize back
        deserialized = json_deserialize(json_str)

        # Verify equivalence
        assert transactions_equal(tx, deserialized)

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_json_serialization_produces_valid_json(self, tx: Transaction) -> None:
        """JSON serialization produces valid JSON string."""
        import json

        json_str = json_serialize(tx)

        # Should be a valid JSON string
        assert isinstance(json_str, str)

        # Should parse without error
        parsed = json.loads(json_str)

        # Parsed JSON should have expected structure
        assert "nonce" in parsed
        assert "from" in parsed
        assert "signature" in parsed
        assert "payload" in parsed
        assert "gas_limit" in parsed  # Rust uses snake_case
        assert "gas_price" in parsed  # Rust uses snake_case
        assert "parents" in parsed
        assert "timestamp" in parsed

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_json_uses_bech32m_for_addresses(self, tx: Transaction) -> None:
        """JSON serialization uses Bech32m for addresses."""
        import json

        json_str = json_serialize(tx)
        parsed = json.loads(json_str)

        # From address should be Bech32m encoded
        assert parsed["from"].startswith("syn1")
        assert len(parsed["from"]) == 42

        # Payload addresses should also be Bech32m encoded
        # Rust uses externally tagged enum format: {"Transfer": {...}}
        if "Transfer" in parsed["payload"]:
            assert parsed["payload"]["Transfer"]["to"].startswith("syn1")
        elif "Call" in parsed["payload"]:
            assert parsed["payload"]["Call"]["contract"].startswith("syn1")


class TestProperty20InvalidSerializationRejection:
    """
    Feature: synapticchain-sdks, Property 20: Invalid Serialization Rejection
    **Validates: Requirements 5.7**
    """

    @settings(max_examples=NUM_RUNS)
    @given(st.one_of(st.binary(min_size=0, max_size=50), st.binary(min_size=51, max_size=200)))
    def test_invalid_borsh_data_rejected(self, invalid_bytes: bytes) -> None:
        """
        For any byte array that is not valid Borsh-encoded transaction data,
        deserialization SHALL return a descriptive error.
        """
        # Deserialization should raise SerializationError
        with pytest.raises(SerializationError):
            borsh_deserialize(invalid_bytes)

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy(), st.integers(min_value=1, max_value=50))
    def test_truncated_borsh_data_rejected(self, tx: Transaction, truncate_amount: int) -> None:
        """Truncated Borsh data SHALL be rejected."""
        bytes_data = borsh_serialize(tx)

        # Only truncate if we have enough bytes
        if len(bytes_data) <= truncate_amount:
            return

        truncated = bytes_data[: len(bytes_data) - truncate_amount]

        with pytest.raises(SerializationError):
            borsh_deserialize(truncated)

    @settings(max_examples=NUM_RUNS)
    @given(
        st.one_of(
            st.just("not valid json"),
            st.just("{invalid}"),
            st.just('{"unclosed": '),
        )
    )
    def test_invalid_json_syntax_rejected(self, invalid_json: str) -> None:
        """Invalid JSON syntax SHALL be rejected with SerializationError."""
        with pytest.raises(SerializationError):
            json_deserialize(invalid_json)

    @settings(max_examples=NUM_RUNS)
    @given(st.one_of(st.just("null"), st.just("[]"), st.just("123"), st.just('"string"'), st.just("{}")))
    def test_json_with_wrong_structure_rejected(self, wrong_structure: str) -> None:
        """Valid JSON with wrong structure SHALL be rejected."""
        with pytest.raises(Exception):  # Could be SerializationError or KeyError
            json_deserialize(wrong_structure)


class TestProperty15SigningBytesFormat:
    """
    Feature: synapticchain-sdks, Property 15: Signing Bytes Format
    **Validates: Requirements 4.2**
    """

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_signing_bytes_exclude_signature(self, tx: Transaction) -> None:
        """Signing bytes should NOT include the signature field.
        
        CRITICAL: Signing bytes format differs from Borsh serialization:
        - Borsh: includes signature (64 bytes) + parents length prefix (4 bytes)
        - Signing bytes: no signature, no parents length prefix
        
        So the difference is 64 bytes (signature) + 4 bytes (parents length) = 68 bytes
        """
        # Get signing bytes
        signing_bytes = compute_signing_bytes(tx)

        # Get full Borsh serialization (which includes signature)
        full_bytes = borsh_serialize(tx)

        # Signing bytes should be shorter than full serialization
        # Difference should be 64 bytes (signature) + 4 bytes (parents length prefix)
        assert len(full_bytes) - len(signing_bytes) == 68

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy(), signature_strategy)
    def test_changing_signature_produces_identical_signing_bytes(
        self, tx: Transaction, new_signature: bytes
    ) -> None:
        """Changing only the signature should produce identical signing bytes."""
        # Create a copy with different signature
        tx_with_different_sig = Transaction(
            nonce=tx.nonce,
            from_address=tx.from_address,
            signature=new_signature,
            payload=tx.payload,
            gas_limit=tx.gas_limit,
            gas_price=tx.gas_price,
            parents=tx.parents,
            timestamp=tx.timestamp,
            tx_id=tx.tx_id,
        )

        # Get signing bytes for both transactions
        signing_bytes1 = compute_signing_bytes(tx)
        signing_bytes2 = compute_signing_bytes(tx_with_different_sig)

        # Signing bytes should be identical regardless of signature
        assert signing_bytes1 == signing_bytes2

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_signing_bytes_is_deterministic(self, tx: Transaction) -> None:
        """Signing bytes should be deterministic for the same transaction."""
        # Compute signing bytes multiple times
        signing_bytes1 = compute_signing_bytes(tx)
        signing_bytes2 = compute_signing_bytes(tx)
        signing_bytes3 = compute_signing_bytes(tx)

        # All should be identical
        assert signing_bytes1 == signing_bytes2
        assert signing_bytes2 == signing_bytes3


class TestProperty16TransactionIDComputationDeterminism:
    """
    Feature: synapticchain-sdks, Property 16: Transaction ID Computation Determinism
    **Validates: Requirements 4.5**
    """

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_tx_id_computation_is_deterministic(self, tx: Transaction) -> None:
        """
        For any valid transaction, computeTxId() should always produce the
        same 32-byte result.
        """
        # Compute transaction ID multiple times
        tx_id1 = compute_tx_id(tx)
        tx_id2 = compute_tx_id(tx)
        tx_id3 = compute_tx_id(tx)

        # All should be identical
        assert tx_id1 == tx_id2
        assert tx_id2 == tx_id3

        # Should always be 32 bytes
        assert len(tx_id1) == 32
        assert len(tx_id2) == 32
        assert len(tx_id3) == 32

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_tx_id_is_32_bytes(self, tx: Transaction) -> None:
        """Transaction ID should be exactly 32 bytes (SHA3-256 output)."""
        tx_id = compute_tx_id(tx)
        assert len(tx_id) == 32
        assert isinstance(tx_id, bytes)

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy(), signature_strategy)
    def test_tx_id_independent_of_signature(
        self, tx: Transaction, new_signature: bytes
    ) -> None:
        """Transaction ID should be independent of signature."""
        # Create a copy with different signature
        tx_with_different_sig = Transaction(
            nonce=tx.nonce,
            from_address=tx.from_address,
            signature=new_signature,
            payload=tx.payload,
            gas_limit=tx.gas_limit,
            gas_price=tx.gas_price,
            parents=tx.parents,
            timestamp=tx.timestamp,
            tx_id=tx.tx_id,
        )

        # Transaction IDs should be identical (signature is not part of signing bytes)
        tx_id1 = compute_tx_id(tx)
        tx_id2 = compute_tx_id(tx_with_different_sig)

        assert tx_id1 == tx_id2

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy())
    def test_tx_id_is_sha3_256_of_signing_bytes(self, tx: Transaction) -> None:
        """Transaction ID should be SHA3-256 of signing bytes."""
        from synapticchain.crypto import hash_sha3_256

        signing_bytes = compute_signing_bytes(tx)
        expected_tx_id = hash_sha3_256(signing_bytes)
        actual_tx_id = compute_tx_id(tx)

        assert actual_tx_id == expected_tx_id

    @settings(max_examples=NUM_RUNS)
    @given(transaction_strategy(), u64_strategy)
    def test_changing_nonce_changes_tx_id(self, tx: Transaction, different_nonce: int) -> None:
        """Changing nonce should change the transaction ID."""
        # Skip if nonces are the same
        if tx.nonce == different_nonce:
            return

        tx_with_different_nonce = Transaction(
            nonce=different_nonce,
            from_address=tx.from_address,
            signature=tx.signature,
            payload=tx.payload,
            gas_limit=tx.gas_limit,
            gas_price=tx.gas_price,
            parents=tx.parents,
            timestamp=tx.timestamp,
            tx_id=tx.tx_id,
        )

        tx_id1 = compute_tx_id(tx)
        tx_id2 = compute_tx_id(tx_with_different_nonce)

        assert tx_id1 != tx_id2
