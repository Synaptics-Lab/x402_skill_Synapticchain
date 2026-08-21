"""
Property-based tests for the address module.

Uses hypothesis for property-based testing with minimum 100 iterations per property.

Tests Properties 5-10 from the design document.
"""

from hypothesis import given, settings, strategies as st
import pytest

from synapticchain.address import Address
from synapticchain.crypto import hash_sha3_256, derive_contract_address
from synapticchain.errors import AddressError

# Minimum iterations per property as specified in design document
NUM_RUNS = 100

# Constants
ADDRESS_BYTE_LENGTH = 20  # Address is 20 bytes
ADDRESS_STRING_LENGTH = 42  # Bech32m encoded address is 42 characters


# ============================================================================
# Custom Strategies
# ============================================================================

# Strategy for valid 20-byte address data
address_bytes_strategy = st.binary(min_size=ADDRESS_BYTE_LENGTH, max_size=ADDRESS_BYTE_LENGTH)

# Strategy for valid 32-byte public keys
public_key_strategy = st.binary(min_size=32, max_size=32)

# Strategy for nonce values (u64 range)
nonce_strategy = st.integers(min_value=0, max_value=2**64 - 1)

# Strategy for invalid address lengths (not 20 bytes)
invalid_address_length_strategy = st.one_of(
    st.binary(min_size=0, max_size=19),
    st.binary(min_size=21, max_size=100),
)

# Strategy for wrong prefixes
wrong_prefix_strategy = st.sampled_from(["btc", "eth", "abc", "xyz", "bc", "tb"])

# Strategy for invalid Bech32m strings
invalid_bech32_strategy = st.one_of(
    st.just(""),  # Empty string
    st.text(min_size=1, max_size=50).filter(lambda s: "1" not in s),  # No separator
    st.just("syn1"),  # Too short
    st.just("syn1abc"),  # Too short
)


# ============================================================================
# Property Tests
# ============================================================================


class TestProperty5AddressDerivationDeterminism:
    """
    Feature: synapticchain-sdks, Property 5: Address Derivation Determinism
    **Validates: Requirements 2.1**
    """

    @settings(max_examples=NUM_RUNS)
    @given(public_key_strategy)
    def test_address_derivation_is_deterministic(self, public_key: bytes) -> None:
        """
        For any valid 32-byte public key, deriving the address SHALL always produce
        the same 20-byte address equal to SHA3-256(public_key)[12:32].
        """
        from synapticchain.crypto import derive_address

        # Derive address multiple times
        address1 = derive_address(public_key)
        address2 = derive_address(public_key)
        address3 = derive_address(public_key)

        # All derivations should produce the same result
        assert address1 == address2
        assert address2 == address3

        # Address should be 20 bytes
        assert len(address1.to_bytes()) == ADDRESS_BYTE_LENGTH

        # Verify it equals SHA3-256(public_key)[12:32]
        hash_bytes = hash_sha3_256(public_key)
        expected_address = hash_bytes[12:32]
        assert address1.to_bytes() == expected_address

    @settings(max_examples=NUM_RUNS)
    @given(public_key_strategy)
    def test_address_derivation_matches_manual_computation(self, public_key: bytes) -> None:
        """Address derivation should match manual computation."""
        from synapticchain.crypto import derive_address

        # Compute expected address manually
        hash_bytes = hash_sha3_256(public_key)
        expected_address = hash_bytes[12:32]

        # Derive using the function
        derived_address = derive_address(public_key)

        # Should match exactly
        assert len(derived_address.to_bytes()) == 20
        assert derived_address.to_bytes() == expected_address


class TestProperty6AddressBech32mEncodingFormat:
    """
    Feature: synapticchain-sdks, Property 6: Address Bech32m Encoding Format
    **Validates: Requirements 2.2, 2.3**
    """

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy)
    def test_bech32m_encoding_format(self, address_bytes: bytes) -> None:
        """
        For any valid 20-byte address, encoding to Bech32m SHALL produce a string
        starting with "syn1" and having exactly 42 characters.
        """
        address = Address(address_bytes)
        encoded = address.to_bech32()

        # Should start with "syn1"
        assert encoded.startswith("syn1")

        # Should have exactly 42 characters
        assert len(encoded) == ADDRESS_STRING_LENGTH

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy)
    def test_bech32m_encoding_uses_lowercase(self, address_bytes: bytes) -> None:
        """Bech32m encoding should use lowercase characters."""
        address = Address(address_bytes)
        encoded = address.to_bech32()

        # Should be all lowercase (Bech32m uses lowercase)
        assert encoded == encoded.lower()

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy)
    def test_bech32m_encoding_is_consistent(self, address_bytes: bytes) -> None:
        """Bech32m encoding should be consistent for the same address."""
        address = Address(address_bytes)

        # Encode multiple times
        encoded1 = address.to_bech32()
        encoded2 = address.to_bech32()
        encoded3 = address.to_bech32()

        # All encodings should be identical
        assert encoded1 == encoded2
        assert encoded2 == encoded3


class TestProperty7AddressEncodingRoundTrip:
    """
    Feature: synapticchain-sdks, Property 7: Address Encoding Round-Trip
    **Validates: Requirements 2.4**
    """

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy)
    def test_bech32m_round_trip(self, address_bytes: bytes) -> None:
        """
        For any valid 20-byte address, encoding to Bech32m then decoding back
        SHALL produce the original 20-byte address.
        """
        # Create address from bytes
        original = Address(address_bytes)

        # Encode to Bech32m
        encoded = original.to_bech32()

        # Decode back
        decoded = Address.from_bech32(encoded)

        # Should produce the original bytes
        decoded_bytes = decoded.to_bytes()
        assert len(decoded_bytes) == len(address_bytes)
        assert decoded_bytes == address_bytes

        # equals() should return true
        assert decoded == original

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy)
    def test_hex_round_trip(self, address_bytes: bytes) -> None:
        """Round-trip through hex encoding should preserve address."""
        original = Address(address_bytes)

        # Encode to hex
        hex_str = original.to_hex()

        # Decode back
        decoded = Address.from_hex(hex_str)

        # Should produce the original bytes
        assert decoded == original

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy)
    def test_hex_with_prefix_round_trip(self, address_bytes: bytes) -> None:
        """Round-trip through hex with 0x prefix should preserve address."""
        original = Address(address_bytes)

        # Encode to hex with prefix
        hex_str = "0x" + original.to_hex()

        # Decode back
        decoded = Address.from_hex(hex_str)

        # Should produce the original bytes
        assert decoded == original


class TestProperty8InvalidAddressRejection:
    """
    Feature: synapticchain-sdks, Property 8: Invalid Address Rejection
    **Validates: Requirements 2.5, 2.6**
    """

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy, st.integers(min_value=36, max_value=41))
    def test_corrupted_checksum_rejected(
        self, address_bytes: bytes, corrupt_index: int
    ) -> None:
        """
        For any Bech32m string with a corrupted checksum, decoding SHALL return
        a validation error.
        """
        address = Address(address_bytes)
        encoded = address.to_bech32()

        # Corrupt a character in the checksum portion (last 6 characters)
        chars = list(encoded)
        bech32_chars = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
        current_char = chars[corrupt_index]
        current_index = bech32_chars.index(current_char)
        new_index = (current_index + 1) % len(bech32_chars)
        chars[corrupt_index] = bech32_chars[new_index]
        corrupted = "".join(chars)

        # Decoding should raise AddressError
        with pytest.raises(AddressError):
            Address.from_bech32(corrupted)

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy, wrong_prefix_strategy)
    def test_wrong_prefix_rejected(self, address_bytes: bytes, wrong_prefix: str) -> None:
        """
        For any Bech32m string with wrong prefix (not "syn"), decoding SHALL
        return a validation error.
        """
        address = Address(address_bytes)
        encoded = address.to_bech32()

        # Replace "syn" prefix with wrong prefix
        wrong_prefix_encoded = wrong_prefix + encoded[3:]

        # Decoding should raise AddressError
        with pytest.raises(AddressError):
            Address.from_bech32(wrong_prefix_encoded)

    @settings(max_examples=NUM_RUNS)
    @given(invalid_bech32_strategy)
    def test_invalid_bech32_rejected(self, invalid_string: str) -> None:
        """
        For any string that is not valid Bech32m, decoding SHALL return a
        validation error.
        """
        # Decoding should raise AddressError
        with pytest.raises(AddressError):
            Address.from_bech32(invalid_string)

    @settings(max_examples=NUM_RUNS)
    @given(invalid_address_length_strategy)
    def test_invalid_length_rejected(self, invalid_bytes: bytes) -> None:
        """
        For any byte array that is not exactly 20 bytes, creating an Address
        SHALL return an error.
        """
        # Verify the bytes are not 20 bytes (sanity check)
        assert len(invalid_bytes) != ADDRESS_BYTE_LENGTH

        # Creating an Address should raise AddressError
        with pytest.raises(AddressError):
            Address(invalid_bytes)


class TestProperty9ContractAddressDerivationDeterminism:
    """
    Feature: synapticchain-sdks, Property 9: Contract Address Derivation Determinism
    **Validates: Requirements 2.7**
    """

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy, nonce_strategy)
    def test_contract_address_derivation_is_deterministic(
        self, deployer_bytes: bytes, nonce: int
    ) -> None:
        """
        For any valid deployer address and nonce, deriving the contract address
        SHALL always produce the same address equal to
        SHA3-256(deployer || nonce_le_bytes)[12:32].
        """
        deployer = Address(deployer_bytes)

        # Derive contract address multiple times
        contract_addr1 = derive_contract_address(deployer, nonce)
        contract_addr2 = derive_contract_address(deployer, nonce)
        contract_addr3 = derive_contract_address(deployer, nonce)

        # All derivations should produce the same result
        assert contract_addr1 == contract_addr2
        assert contract_addr2 == contract_addr3

        # Contract address should be 20 bytes
        assert len(contract_addr1.to_bytes()) == ADDRESS_BYTE_LENGTH

        # Verify it equals SHA3-256(deployer || nonce_le_bytes)[12:32]
        nonce_bytes = nonce.to_bytes(8, byteorder="little")
        data = deployer_bytes + nonce_bytes
        hash_bytes = hash_sha3_256(data)
        expected_address = hash_bytes[12:32]

        assert contract_addr1.to_bytes() == expected_address

    @settings(max_examples=NUM_RUNS)
    @given(
        address_bytes_strategy,
        st.integers(min_value=0, max_value=1000000),
        st.integers(min_value=0, max_value=1000000),
    )
    def test_different_nonces_produce_different_addresses(
        self, deployer_bytes: bytes, nonce1: int, nonce2: int
    ) -> None:
        """Different nonces should produce different contract addresses."""
        # Skip if nonces are the same
        if nonce1 == nonce2:
            return

        deployer = Address(deployer_bytes)

        contract_addr1 = derive_contract_address(deployer, nonce1)
        contract_addr2 = derive_contract_address(deployer, nonce2)

        # Addresses should be different
        assert contract_addr1 != contract_addr2

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy, address_bytes_strategy, nonce_strategy)
    def test_different_deployers_produce_different_addresses(
        self, deployer1_bytes: bytes, deployer2_bytes: bytes, nonce: int
    ) -> None:
        """Different deployers should produce different contract addresses."""
        # Skip if deployers are the same
        if deployer1_bytes == deployer2_bytes:
            return

        deployer1 = Address(deployer1_bytes)
        deployer2 = Address(deployer2_bytes)

        contract_addr1 = derive_contract_address(deployer1, nonce)
        contract_addr2 = derive_contract_address(deployer2, nonce)

        # Addresses should be different
        assert contract_addr1 != contract_addr2


class TestProperty10AddressEquality:
    """
    Feature: synapticchain-sdks, Property 10: Address Equality
    **Validates: Requirements 2.8**
    """

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy, address_bytes_strategy)
    def test_address_equality_iff_bytes_identical(
        self, bytes1: bytes, bytes2: bytes
    ) -> None:
        """
        For any two addresses, they SHALL compare equal if and only if their
        20-byte representations are identical.
        """
        addr1 = Address(bytes1)
        addr2 = Address(bytes2)

        # Check if bytes are identical
        bytes_are_identical = bytes1 == bytes2

        # equals() should return true if and only if bytes are identical
        assert (addr1 == addr2) == bytes_are_identical

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy)
    def test_address_equality_is_reflexive(self, address_bytes: bytes) -> None:
        """Address equality should be reflexive (a == a is always true)."""
        address = Address(address_bytes)

        # An address should always equal itself
        assert address == address

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy, address_bytes_strategy)
    def test_address_equality_is_symmetric(self, bytes1: bytes, bytes2: bytes) -> None:
        """Address equality should be symmetric (a == b implies b == a)."""
        addr1 = Address(bytes1)
        addr2 = Address(bytes2)

        # Equality should be symmetric
        assert (addr1 == addr2) == (addr2 == addr1)

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy)
    def test_address_equality_is_transitive(self, address_bytes: bytes) -> None:
        """
        Address equality should be transitive (if a == b and b == c, then a == c).
        """
        # Create three addresses from the same bytes
        addr1 = Address(address_bytes)
        addr2 = Address(bytes(address_bytes))
        addr3 = Address(bytes(address_bytes))

        # If a == b and b == c, then a == c
        if addr1 == addr2 and addr2 == addr3:
            assert addr1 == addr3

    @settings(max_examples=NUM_RUNS)
    @given(address_bytes_strategy)
    def test_addresses_from_same_bytes_are_equal(self, address_bytes: bytes) -> None:
        """Addresses created from the same bytes should be equal."""
        # Create two addresses from the same bytes
        addr1 = Address(address_bytes)
        addr2 = Address(bytes(address_bytes))

        # They should be equal
        assert addr1 == addr2

        # Their Bech32m encodings should be identical
        assert addr1.to_bech32() == addr2.to_bech32()

        # Their hex encodings should be identical
        assert addr1.to_hex() == addr2.to_hex()

    @settings(max_examples=NUM_RUNS)
    @given(
        address_bytes_strategy,
        st.integers(min_value=0, max_value=ADDRESS_BYTE_LENGTH - 1),
        st.integers(min_value=1, max_value=255),
    )
    def test_addresses_with_single_byte_difference_not_equal(
        self, address_bytes: bytes, byte_index: int, difference: int
    ) -> None:
        """Addresses with any single byte difference should not be equal."""
        addr1 = Address(address_bytes)

        # Create modified bytes
        modified_bytes = bytearray(address_bytes)
        modified_bytes[byte_index] = (modified_bytes[byte_index] + difference) % 256
        addr2 = Address(bytes(modified_bytes))

        # They should not be equal
        assert addr1 != addr2
