"""
Property-based tests for the crypto module.

Uses hypothesis for property-based testing with minimum 100 iterations per property.

Tests Properties 1-4, 14, and 17 from the design document.
"""

from hypothesis import given, settings, strategies as st
import pytest

from synapticchain.crypto import (
    Keypair,
    verify,
    hash_sha3_256,
    derive_address,
    derive_contract_address,
)
from synapticchain.address import Address
from synapticchain.errors import CryptoError

# Minimum iterations per property as specified in design document
NUM_RUNS = 100


# ============================================================================
# Custom Strategies
# ============================================================================

# Strategy for valid 32-byte private keys
private_key_strategy = st.binary(min_size=32, max_size=32)

# Strategy for valid 32-byte public keys
public_key_strategy = st.binary(min_size=32, max_size=32)

# Strategy for messages to sign
message_strategy = st.binary(min_size=0, max_size=1024)

# Strategy for invalid key lengths (not 32 bytes)
invalid_key_length_strategy = st.one_of(
    st.binary(min_size=0, max_size=31),
    st.binary(min_size=33, max_size=100),
)


# ============================================================================
# Property Tests
# ============================================================================


class TestProperty1KeypairGenerationUniqueness:
    """
    Feature: synapticchain-sdks, Property 1: Keypair Generation Uniqueness
    **Validates: Requirements 1.1**
    """

    @settings(max_examples=NUM_RUNS)
    @given(st.none())
    def test_generated_keypairs_are_unique(self, _: None) -> None:
        """
        For any two independently generated keypairs, the public keys SHALL be
        distinct (with overwhelming probability).
        """
        keypair1 = Keypair.generate()
        keypair2 = Keypair.generate()

        # Public keys should be distinct
        # Note: With 32-byte keys, collision probability is negligible (2^-256)
        assert keypair1.public_key != keypair2.public_key

        # Private keys should also be distinct
        assert keypair1.private_key != keypair2.private_key

    @settings(max_examples=NUM_RUNS)
    @given(st.none())
    def test_generated_keypairs_have_valid_lengths(self, _: None) -> None:
        """Generated keypairs should have valid key lengths."""
        keypair = Keypair.generate()

        assert len(keypair.public_key) == 32
        assert len(keypair.private_key) == 32


class TestProperty2PublicKeyDerivationDeterminism:
    """
    Feature: synapticchain-sdks, Property 2: Public Key Derivation Determinism
    **Validates: Requirements 1.2**
    """

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy)
    def test_public_key_derivation_is_deterministic(self, private_key: bytes) -> None:
        """
        For any valid 32-byte private key, deriving the public key multiple times
        SHALL always produce the same 32-byte public key.
        """
        # Derive public key multiple times from the same private key
        keypair1 = Keypair.from_private_key(private_key)
        keypair2 = Keypair.from_private_key(private_key)
        keypair3 = Keypair.from_private_key(private_key)

        # All derivations should produce the same public key
        assert keypair1.public_key == keypair2.public_key
        assert keypair2.public_key == keypair3.public_key

        # Public key should be 32 bytes
        assert len(keypair1.public_key) == 32

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy)
    def test_deriving_from_hex_is_deterministic(self, private_key: bytes) -> None:
        """Deriving public key from hex-encoded private key should be deterministic."""
        hex_key = private_key.hex()

        # Derive from bytes and from hex
        keypair_from_bytes = Keypair.from_private_key(private_key)
        keypair_from_hex = Keypair.from_hex(hex_key)

        # Both should produce the same public key
        assert keypair_from_bytes.public_key == keypair_from_hex.public_key


class TestProperty3KeyExportImportRoundTrip:
    """
    Feature: synapticchain-sdks, Property 3: Key Export/Import Round-Trip
    **Validates: Requirements 1.3, 1.4, 1.5, 1.6**
    """

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy)
    def test_export_import_bytes_round_trip(self, private_key: bytes) -> None:
        """
        For any valid keypair, exporting the private key as bytes and importing it
        back SHALL produce a keypair with the same public key.
        """
        # Create original keypair
        original = Keypair.from_private_key(private_key)

        # Export private key as bytes
        exported_bytes = original.private_key

        # Import back
        restored = Keypair.from_private_key(exported_bytes)

        # Should have the same public key
        assert restored.public_key == original.public_key

        # Should have the same private key
        assert restored.private_key == original.private_key

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy)
    def test_export_import_hex_round_trip(self, private_key: bytes) -> None:
        """
        For any valid keypair, exporting the private key as hex and importing it
        back SHALL produce a keypair with the same public key.
        """
        # Create original keypair
        original = Keypair.from_private_key(private_key)

        # Export private key as hex
        exported_hex = original.private_key_hex()

        # Import back
        restored = Keypair.from_hex(exported_hex)

        # Should have the same public key
        assert restored.public_key == original.public_key

        # Should have the same private key
        assert restored.private_key == original.private_key

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy)
    def test_exported_public_key_matches_original(self, private_key: bytes) -> None:
        """For any valid keypair, the exported public key should match the original."""
        keypair = Keypair.from_private_key(private_key)

        # Export public key as bytes and hex
        exported_bytes = keypair.public_key
        exported_hex = keypair.public_key_hex()

        # Should match the getters
        assert bytes.fromhex(exported_hex) == keypair.public_key

        # Bytes should be 32 bytes
        assert len(exported_bytes) == 32

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy, message_strategy)
    def test_round_tripped_keypair_has_same_signing_capability(
        self, private_key: bytes, message: bytes
    ) -> None:
        """
        For any valid keypair, round-tripped keypair SHALL have the same signing
        capability.
        """
        # Create original keypair
        original = Keypair.from_private_key(private_key)

        # Export and import via bytes
        restored_from_bytes = Keypair.from_private_key(original.private_key)

        # Export and import via hex
        restored_from_hex = Keypair.from_hex(original.private_key_hex())

        # Sign with original
        original_signature = original.sign(message)

        # Sign with restored keypairs
        signature_from_bytes = restored_from_bytes.sign(message)
        signature_from_hex = restored_from_hex.sign(message)

        # All signatures should be identical (Ed25519 is deterministic)
        assert signature_from_bytes == original_signature
        assert signature_from_hex == original_signature

        # All signatures should verify with the original public key
        assert verify(message, original_signature, original.public_key)
        assert verify(message, signature_from_bytes, restored_from_bytes.public_key)
        assert verify(message, signature_from_hex, restored_from_hex.public_key)

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy)
    def test_hex_encoding_round_trip_preserves_bytes(self, private_key: bytes) -> None:
        """Hex encoding round-trip should preserve private key bytes."""
        # Convert to hex and back
        hex_key = private_key.hex()
        decoded = bytes.fromhex(hex_key)

        # Should be identical
        assert decoded == private_key


class TestProperty4InvalidKeyRejection:
    """
    Feature: synapticchain-sdks, Property 4: Invalid Key Rejection
    **Validates: Requirements 1.7**
    """

    @settings(max_examples=NUM_RUNS)
    @given(invalid_key_length_strategy)
    def test_invalid_private_key_length_rejected(self, invalid_key: bytes) -> None:
        """
        For any byte array that is not exactly 32 bytes, importing it as a private
        key SHALL return an error.
        """
        # Verify the key is not 32 bytes (sanity check)
        assert len(invalid_key) != 32

        # Importing should raise CryptoError
        with pytest.raises(CryptoError) as exc_info:
            Keypair.from_private_key(invalid_key)

        assert exc_info.value.code == CryptoError.INVALID_KEY_LENGTH

    @settings(max_examples=NUM_RUNS)
    @given(invalid_key_length_strategy)
    def test_invalid_public_key_length_rejected_in_derive_address(
        self, invalid_key: bytes
    ) -> None:
        """
        For any byte array that is not exactly 32 bytes, using it as a public key
        in derive_address SHALL return an error.
        """
        # Verify the key is not 32 bytes (sanity check)
        assert len(invalid_key) != 32

        # derive_address should raise CryptoError
        with pytest.raises(CryptoError) as exc_info:
            derive_address(invalid_key)

        assert exc_info.value.code == CryptoError.INVALID_KEY_LENGTH


class TestProperty14SignatureRoundTrip:
    """
    Feature: synapticchain-sdks, Property 14: Signature Round-Trip
    **Validates: Requirements 4.1, 4.3, 4.4, 4.7**
    """

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy, message_strategy)
    def test_signature_round_trip(self, private_key: bytes, message: bytes) -> None:
        """
        For any valid keypair and message, signing the message and verifying the
        signature with the public key SHALL return true.
        """
        keypair = Keypair.from_private_key(private_key)

        # Sign the message
        signature = keypair.sign(message)

        # Signature should be 64 bytes
        assert len(signature) == 64

        # Signature should verify
        assert verify(message, signature, keypair.public_key)

    @settings(max_examples=NUM_RUNS)
    @given(st.none(), message_strategy)
    def test_generated_keypair_signature_round_trip(self, _: None, message: bytes) -> None:
        """Any generated keypair should be able to sign and verify messages."""
        keypair = Keypair.generate()

        # Sign the message
        signature = keypair.sign(message)

        # Signature should be 64 bytes
        assert len(signature) == 64

        # Signature should verify
        assert verify(message, signature, keypair.public_key)


class TestProperty17InvalidSignatureReturnsFalse:
    """
    Feature: synapticchain-sdks, Property 17: Invalid Signature Returns False
    **Validates: Requirements 4.6**
    """

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy, message_strategy, st.binary(min_size=64, max_size=64))
    def test_invalid_signature_returns_false(
        self, private_key: bytes, message: bytes, wrong_signature: bytes
    ) -> None:
        """
        For any message, signature, and public key where the signature was not
        created by signing that message with the corresponding private key,
        verification SHALL return false (not throw an exception).
        """
        keypair = Keypair.from_private_key(private_key)

        # Create a valid signature for comparison
        valid_signature = keypair.sign(message)

        # If by chance the random signature matches, skip this test
        if wrong_signature == valid_signature:
            return

        # Verification should return False, not throw
        result = verify(message, wrong_signature, keypair.public_key)
        assert result is False

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy, message_strategy, message_strategy)
    def test_signature_for_different_message_returns_false(
        self, private_key: bytes, message1: bytes, message2: bytes
    ) -> None:
        """Signature for one message should not verify for a different message."""
        # Skip if messages are the same
        if message1 == message2:
            return

        keypair = Keypair.from_private_key(private_key)

        # Sign message1
        signature = keypair.sign(message1)

        # Verification with message2 should return False
        result = verify(message2, signature, keypair.public_key)
        assert result is False

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy, private_key_strategy, message_strategy)
    def test_signature_with_wrong_public_key_returns_false(
        self, private_key1: bytes, private_key2: bytes, message: bytes
    ) -> None:
        """Signature should not verify with a different public key."""
        # Skip if private keys are the same
        if private_key1 == private_key2:
            return

        keypair1 = Keypair.from_private_key(private_key1)
        keypair2 = Keypair.from_private_key(private_key2)

        # Sign with keypair1
        signature = keypair1.sign(message)

        # Verification with keypair2's public key should return False
        result = verify(message, signature, keypair2.public_key)
        assert result is False

    @settings(max_examples=NUM_RUNS)
    @given(private_key_strategy, message_strategy, st.integers(min_value=0, max_value=63))
    def test_corrupted_signature_returns_false(
        self, private_key: bytes, message: bytes, corrupt_index: int
    ) -> None:
        """Corrupted signature should return False."""
        keypair = Keypair.from_private_key(private_key)

        # Sign the message
        signature = keypair.sign(message)

        # Corrupt one byte
        corrupted = bytearray(signature)
        corrupted[corrupt_index] ^= 0xFF
        corrupted_signature = bytes(corrupted)

        # Verification should return False
        result = verify(message, corrupted_signature, keypair.public_key)
        assert result is False


class TestAdditionalCryptoProperties:
    """Additional property tests for crypto operations."""

    @settings(max_examples=NUM_RUNS)
    @given(st.binary(min_size=0, max_size=1024))
    def test_hash_produces_32_bytes(self, data: bytes) -> None:
        """hash_sha3_256() should always produce a 32-byte hash."""
        hash_result = hash_sha3_256(data)
        assert len(hash_result) == 32

    @settings(max_examples=NUM_RUNS)
    @given(st.binary(min_size=0, max_size=1024))
    def test_hash_is_deterministic(self, data: bytes) -> None:
        """hash_sha3_256() should produce the same hash for the same data."""
        hash1 = hash_sha3_256(data)
        hash2 = hash_sha3_256(data)
        hash3 = hash_sha3_256(data)

        assert hash1 == hash2
        assert hash2 == hash3

    @settings(max_examples=NUM_RUNS)
    @given(public_key_strategy)
    def test_derive_address_produces_20_bytes(self, public_key: bytes) -> None:
        """derive_address() should always produce a 20-byte address."""
        address = derive_address(public_key)
        assert len(address.to_bytes()) == 20

    @settings(max_examples=NUM_RUNS)
    @given(public_key_strategy)
    def test_derive_address_is_deterministic(self, public_key: bytes) -> None:
        """derive_address() should produce the same address for the same public key."""
        address1 = derive_address(public_key)
        address2 = derive_address(public_key)
        address3 = derive_address(public_key)

        assert address1 == address2
        assert address2 == address3

    @settings(max_examples=NUM_RUNS)
    @given(public_key_strategy)
    def test_derive_address_is_last_20_bytes_of_hash(self, public_key: bytes) -> None:
        """derive_address() should return last 20 bytes of SHA3-256(public_key)."""
        hash_bytes = hash_sha3_256(public_key)
        expected = hash_bytes[12:32]  # Last 20 bytes

        address = derive_address(public_key)
        assert address.to_bytes() == expected
