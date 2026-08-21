"""
Unit tests for the crypto module.

Tests cover:
- Keypair generation and management
- Ed25519 signing and verification
- SHA3-256 hashing
- Address derivation
- Contract address derivation
"""

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


class TestKeypairGeneration:
    """Tests for Keypair.generate()."""

    def test_generate_creates_valid_keypair(self) -> None:
        """Keypair.generate() should create a valid keypair."""
        keypair = Keypair.generate()
        assert keypair is not None
        assert len(keypair.public_key) == 32
        assert len(keypair.private_key) == 32

    def test_generate_creates_unique_keypairs(self) -> None:
        """Each call to generate() should create a unique keypair."""
        keypair1 = Keypair.generate()
        keypair2 = Keypair.generate()
        assert keypair1.public_key != keypair2.public_key
        assert keypair1.private_key != keypair2.private_key

    def test_public_key_derived_from_private_key(self) -> None:
        """Public key should be deterministically derived from private key."""
        private_key = bytes.fromhex("0" * 64)
        keypair1 = Keypair.from_private_key(private_key)
        keypair2 = Keypair.from_private_key(private_key)
        assert keypair1.public_key == keypair2.public_key


class TestKeypairFromPrivateKey:
    """Tests for Keypair.from_private_key()."""

    def test_from_private_key_valid(self) -> None:
        """from_private_key() should accept valid 32-byte private key."""
        private_key = bytes(32)  # All zeros
        keypair = Keypair.from_private_key(private_key)
        assert len(keypair.public_key) == 32
        assert keypair.private_key == private_key

    def test_from_private_key_too_short(self) -> None:
        """from_private_key() should reject keys shorter than 32 bytes."""
        with pytest.raises(CryptoError) as exc_info:
            Keypair.from_private_key(bytes(31))
        assert exc_info.value.code == CryptoError.INVALID_KEY_LENGTH

    def test_from_private_key_too_long(self) -> None:
        """from_private_key() should reject keys longer than 32 bytes."""
        with pytest.raises(CryptoError) as exc_info:
            Keypair.from_private_key(bytes(33))
        assert exc_info.value.code == CryptoError.INVALID_KEY_LENGTH

    def test_from_private_key_empty(self) -> None:
        """from_private_key() should reject empty keys."""
        with pytest.raises(CryptoError) as exc_info:
            Keypair.from_private_key(bytes(0))
        assert exc_info.value.code == CryptoError.INVALID_KEY_LENGTH


class TestKeypairFromHex:
    """Tests for Keypair.from_hex()."""

    def test_from_hex_valid(self) -> None:
        """from_hex() should accept valid 64-character hex string."""
        hex_key = "0" * 64
        keypair = Keypair.from_hex(hex_key)
        assert len(keypair.public_key) == 32
        assert keypair.private_key == bytes.fromhex(hex_key)

    def test_from_hex_invalid_characters(self) -> None:
        """from_hex() should reject invalid hex characters."""
        with pytest.raises(CryptoError):
            Keypair.from_hex("g" * 64)

    def test_from_hex_wrong_length(self) -> None:
        """from_hex() should reject wrong length hex strings."""
        with pytest.raises(CryptoError):
            Keypair.from_hex("0" * 62)


class TestKeypairExport:
    """Tests for keypair export methods."""

    def test_public_key_hex(self) -> None:
        """public_key_hex() should return 64-character hex string."""
        keypair = Keypair.generate()
        hex_str = keypair.public_key_hex()
        assert len(hex_str) == 64
        assert bytes.fromhex(hex_str) == keypair.public_key

    def test_private_key_hex(self) -> None:
        """private_key_hex() should return 64-character hex string."""
        keypair = Keypair.generate()
        hex_str = keypair.private_key_hex()
        assert len(hex_str) == 64
        assert bytes.fromhex(hex_str) == keypair.private_key


class TestKeypairAddress:
    """Tests for Keypair.address()."""

    def test_address_returns_valid_address(self) -> None:
        """address() should return a valid Address."""
        keypair = Keypair.generate()
        address = keypair.address()
        assert isinstance(address, Address)
        assert len(address.to_bytes()) == 20

    def test_address_is_deterministic(self) -> None:
        """address() should return the same address for the same keypair."""
        private_key = bytes.fromhex("0" * 64)
        keypair = Keypair.from_private_key(private_key)
        address1 = keypair.address()
        address2 = keypair.address()
        assert address1 == address2


class TestKeypairSigning:
    """Tests for Keypair.sign()."""

    def test_sign_produces_64_byte_signature(self) -> None:
        """sign() should produce a 64-byte signature."""
        keypair = Keypair.generate()
        message = b"Hello, SynapticChain!"
        signature = keypair.sign(message)
        assert len(signature) == 64

    def test_sign_empty_message(self) -> None:
        """sign() should handle empty messages."""
        keypair = Keypair.generate()
        signature = keypair.sign(b"")
        assert len(signature) == 64

    def test_sign_is_deterministic(self) -> None:
        """sign() should produce the same signature for the same message."""
        keypair = Keypair.generate()
        message = b"Test message"
        sig1 = keypair.sign(message)
        sig2 = keypair.sign(message)
        assert sig1 == sig2

    def test_different_messages_different_signatures(self) -> None:
        """Different messages should produce different signatures."""
        keypair = Keypair.generate()
        sig1 = keypair.sign(b"Message 1")
        sig2 = keypair.sign(b"Message 2")
        assert sig1 != sig2


class TestVerify:
    """Tests for verify()."""

    def test_verify_valid_signature(self) -> None:
        """verify() should return True for valid signatures."""
        keypair = Keypair.generate()
        message = b"Hello, SynapticChain!"
        signature = keypair.sign(message)
        assert verify(message, signature, keypair.public_key) is True

    def test_verify_wrong_message(self) -> None:
        """verify() should return False for wrong message."""
        keypair = Keypair.generate()
        message = b"Original message"
        signature = keypair.sign(message)
        assert verify(b"Wrong message", signature, keypair.public_key) is False

    def test_verify_wrong_public_key(self) -> None:
        """verify() should return False for wrong public key."""
        keypair1 = Keypair.generate()
        keypair2 = Keypair.generate()
        message = b"Test message"
        signature = keypair1.sign(message)
        assert verify(message, signature, keypair2.public_key) is False

    def test_verify_corrupted_signature(self) -> None:
        """verify() should return False for corrupted signature."""
        keypair = Keypair.generate()
        message = b"Test message"
        signature = keypair.sign(message)
        corrupted = bytes([signature[0] ^ 0xFF]) + signature[1:]
        assert verify(message, corrupted, keypair.public_key) is False

    def test_verify_invalid_public_key_length(self) -> None:
        """verify() should return False for invalid public key length."""
        keypair = Keypair.generate()
        message = b"Test message"
        signature = keypair.sign(message)
        assert verify(message, signature, bytes(31)) is False
        assert verify(message, signature, bytes(33)) is False

    def test_verify_invalid_signature_length(self) -> None:
        """verify() should return False for invalid signature length."""
        keypair = Keypair.generate()
        message = b"Test message"
        assert verify(message, bytes(63), keypair.public_key) is False
        assert verify(message, bytes(65), keypair.public_key) is False


class TestHashSha3256:
    """Tests for hash_sha3_256()."""

    def test_hash_produces_32_bytes(self) -> None:
        """hash_sha3_256() should produce a 32-byte hash."""
        data = b"Hello, World!"
        hash_result = hash_sha3_256(data)
        assert len(hash_result) == 32

    def test_hash_empty_data(self) -> None:
        """hash_sha3_256() should handle empty data."""
        hash_result = hash_sha3_256(b"")
        assert len(hash_result) == 32

    def test_hash_is_deterministic(self) -> None:
        """hash_sha3_256() should produce the same hash for the same data."""
        data = b"Test data"
        hash1 = hash_sha3_256(data)
        hash2 = hash_sha3_256(data)
        assert hash1 == hash2

    def test_different_data_different_hash(self) -> None:
        """Different data should produce different hashes."""
        hash1 = hash_sha3_256(b"Data 1")
        hash2 = hash_sha3_256(b"Data 2")
        assert hash1 != hash2

    def test_hash_known_value(self) -> None:
        """hash_sha3_256() should match known SHA3-256 values."""
        # SHA3-256 of empty string
        import hashlib
        expected = hashlib.sha3_256(b"").digest()
        assert hash_sha3_256(b"") == expected


class TestDeriveAddress:
    """Tests for derive_address()."""

    def test_derive_address_produces_20_bytes(self) -> None:
        """derive_address() should produce a 20-byte address."""
        keypair = Keypair.generate()
        address = derive_address(keypair.public_key)
        assert len(address.to_bytes()) == 20

    def test_derive_address_is_deterministic(self) -> None:
        """derive_address() should produce the same address for the same public key."""
        keypair = Keypair.generate()
        address1 = derive_address(keypair.public_key)
        address2 = derive_address(keypair.public_key)
        assert address1 == address2

    def test_derive_address_matches_keypair_address(self) -> None:
        """derive_address() should match Keypair.address()."""
        keypair = Keypair.generate()
        derived = derive_address(keypair.public_key)
        from_keypair = keypair.address()
        assert derived == from_keypair

    def test_derive_address_invalid_public_key_length(self) -> None:
        """derive_address() should reject invalid public key length."""
        with pytest.raises(CryptoError) as exc_info:
            derive_address(bytes(31))
        assert exc_info.value.code == CryptoError.INVALID_KEY_LENGTH

        with pytest.raises(CryptoError) as exc_info:
            derive_address(bytes(33))
        assert exc_info.value.code == CryptoError.INVALID_KEY_LENGTH

    def test_derive_address_is_last_20_bytes_of_hash(self) -> None:
        """derive_address() should return last 20 bytes of SHA3-256(public_key)."""
        keypair = Keypair.generate()
        hash_bytes = hash_sha3_256(keypair.public_key)
        expected = hash_bytes[12:32]  # Last 20 bytes
        address = derive_address(keypair.public_key)
        assert address.to_bytes() == expected


class TestDeriveContractAddress:
    """Tests for derive_contract_address()."""

    def test_derive_contract_address_produces_20_bytes(self) -> None:
        """derive_contract_address() should produce a 20-byte address."""
        deployer = Address.zero()
        contract_addr = derive_contract_address(deployer, 0)
        assert len(contract_addr.to_bytes()) == 20

    def test_derive_contract_address_is_deterministic(self) -> None:
        """derive_contract_address() should produce the same address for same inputs."""
        deployer = Address.zero()
        addr1 = derive_contract_address(deployer, 42)
        addr2 = derive_contract_address(deployer, 42)
        assert addr1 == addr2

    def test_derive_contract_address_different_nonce(self) -> None:
        """Different nonces should produce different contract addresses."""
        deployer = Address.zero()
        addr1 = derive_contract_address(deployer, 0)
        addr2 = derive_contract_address(deployer, 1)
        assert addr1 != addr2

    def test_derive_contract_address_different_deployer(self) -> None:
        """Different deployers should produce different contract addresses."""
        deployer1 = Address.zero()
        deployer2 = Address(bytes([1] + [0] * 19))
        addr1 = derive_contract_address(deployer1, 0)
        addr2 = derive_contract_address(deployer2, 0)
        assert addr1 != addr2

    def test_derive_contract_address_formula(self) -> None:
        """derive_contract_address() should follow SHA3-256(deployer || nonce_le)[12:32]."""
        deployer = Address.zero()
        nonce = 42
        
        # Compute expected address
        nonce_bytes = nonce.to_bytes(8, byteorder="little")
        data = deployer.to_bytes() + nonce_bytes
        hash_bytes = hash_sha3_256(data)
        expected = hash_bytes[12:32]
        
        contract_addr = derive_contract_address(deployer, nonce)
        assert contract_addr.to_bytes() == expected


class TestKeypairEquality:
    """Tests for Keypair equality."""

    def test_keypair_equality_same_keys(self) -> None:
        """Keypairs with same keys should be equal."""
        private_key = bytes.fromhex("0" * 64)
        keypair1 = Keypair.from_private_key(private_key)
        keypair2 = Keypair.from_private_key(private_key)
        assert keypair1 == keypair2

    def test_keypair_equality_different_keys(self) -> None:
        """Keypairs with different keys should not be equal."""
        keypair1 = Keypair.generate()
        keypair2 = Keypair.generate()
        assert keypair1 != keypair2

    def test_keypair_not_equal_to_other_types(self) -> None:
        """Keypair should not be equal to other types."""
        keypair = Keypair.generate()
        assert keypair != "not a keypair"
        assert keypair != 42
        assert keypair != None


class TestKeypairRepr:
    """Tests for Keypair string representation."""

    def test_repr_contains_public_key_prefix(self) -> None:
        """repr() should contain truncated public key."""
        keypair = Keypair.generate()
        repr_str = repr(keypair)
        assert "Keypair" in repr_str
        assert keypair.public_key_hex()[:16] in repr_str
