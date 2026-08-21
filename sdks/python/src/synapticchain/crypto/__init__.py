"""
Cryptographic operations for SynapticChain SDK.

This module provides Ed25519 keypair generation, signing, verification,
and SHA3-256 hashing using the pynacl library.

Example:
    >>> from synapticchain.crypto import Keypair, verify, hash_sha3_256
    >>> keypair = Keypair.generate()
    >>> message = b"Hello, SynapticChain!"
    >>> signature = keypair.sign(message)
    >>> assert verify(message, signature, keypair.public_key)
"""

from __future__ import annotations

import hashlib
import os
from typing import TYPE_CHECKING

from nacl.signing import SigningKey, VerifyKey
from nacl.exceptions import BadSignatureError

from synapticchain.errors import CryptoError

if TYPE_CHECKING:
    from synapticchain.address import Address


class Keypair:
    """Ed25519 keypair for signing transactions.

    A keypair consists of a 32-byte private key and a 32-byte public key.
    The public key is derived deterministically from the private key.

    Attributes:
        public_key: The 32-byte Ed25519 public key
        private_key: The 32-byte Ed25519 private key (seed)
    """

    def __init__(self, signing_key: SigningKey) -> None:
        """Initialize a Keypair from a SigningKey.

        Args:
            signing_key: The nacl SigningKey instance

        Note:
            Use Keypair.generate() or Keypair.from_private_key() instead
            of calling this constructor directly.
        """
        self._signing_key = signing_key
        self._verify_key = signing_key.verify_key

    @classmethod
    def generate(cls) -> Keypair:
        """Generate a new random keypair.

        Uses the operating system's cryptographically secure random number
        generator to create a new Ed25519 keypair.

        Returns:
            A new randomly generated Keypair

        Example:
            >>> keypair = Keypair.generate()
            >>> len(keypair.public_key)
            32
        """
        signing_key = SigningKey.generate()
        return cls(signing_key)

    @classmethod
    def from_private_key(cls, private_key: bytes) -> Keypair:
        """Create a keypair from a private key.

        Args:
            private_key: The 32-byte Ed25519 private key (seed)

        Returns:
            A Keypair with the given private key

        Raises:
            CryptoError: If the private key is not exactly 32 bytes

        Example:
            >>> private_key = bytes.fromhex("0" * 64)
            >>> keypair = Keypair.from_private_key(private_key)
        """
        if len(private_key) != 32:
            raise CryptoError(
                code=CryptoError.INVALID_KEY_LENGTH,
                message=f"Private key must be 32 bytes, got {len(private_key)}",
                details={"expected": 32, "actual": len(private_key)},
            )
        signing_key = SigningKey(private_key)
        return cls(signing_key)

    @classmethod
    def from_hex(cls, hex_string: str) -> Keypair:
        """Create a keypair from a hex-encoded private key.

        Args:
            hex_string: The hex-encoded 32-byte private key

        Returns:
            A Keypair with the given private key

        Raises:
            CryptoError: If the hex string is invalid or wrong length

        Example:
            >>> keypair = Keypair.from_hex("0" * 64)
        """
        try:
            private_key = bytes.fromhex(hex_string)
        except ValueError as e:
            raise CryptoError(
                code=CryptoError.INVALID_KEY_LENGTH,
                message=f"Invalid hex string: {e}",
            ) from e
        return cls.from_private_key(private_key)

    @property
    def public_key(self) -> bytes:
        """Get the 32-byte public key."""
        return bytes(self._verify_key)

    @property
    def private_key(self) -> bytes:
        """Get the 32-byte private key (seed)."""
        return bytes(self._signing_key)

    def public_key_hex(self) -> str:
        """Get the public key as a hex string."""
        return self.public_key.hex()

    def private_key_hex(self) -> str:
        """Get the private key as a hex string."""
        return self.private_key.hex()

    def address(self) -> Address:
        """Derive the address from this keypair's public key.

        Returns:
            The Address derived from the public key

        Example:
            >>> keypair = Keypair.generate()
            >>> address = keypair.address()
            >>> address.to_bech32().startswith("syn1")
            True
        """
        return derive_address(self.public_key)

    def sign(self, message: bytes) -> bytes:
        """Sign a message with this keypair's private key.

        Args:
            message: The message bytes to sign

        Returns:
            The 64-byte Ed25519 signature

        Example:
            >>> keypair = Keypair.generate()
            >>> signature = keypair.sign(b"Hello")
            >>> len(signature)
            64
        """
        signed = self._signing_key.sign(message)
        return bytes(signed.signature)

    def __repr__(self) -> str:
        return f"Keypair(public_key={self.public_key_hex()[:16]}...)"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Keypair):
            return NotImplemented
        return self.public_key == other.public_key and self.private_key == other.private_key


def verify(message: bytes, signature: bytes, public_key: bytes) -> bool:
    """Verify an Ed25519 signature.

    Args:
        message: The original message that was signed
        signature: The 64-byte signature to verify
        public_key: The 32-byte public key of the signer

    Returns:
        True if the signature is valid, False otherwise

    Note:
        This function returns False for invalid signatures instead of
        raising an exception, as per the SDK requirements.

    Example:
        >>> keypair = Keypair.generate()
        >>> message = b"Hello"
        >>> signature = keypair.sign(message)
        >>> verify(message, signature, keypair.public_key)
        True
        >>> verify(b"Wrong", signature, keypair.public_key)
        False
    """
    if len(public_key) != 32:
        return False
    if len(signature) != 64:
        return False

    try:
        verify_key = VerifyKey(public_key)
        verify_key.verify(message, signature)
        return True
    except (BadSignatureError, Exception):
        return False


def hash_sha3_256(data: bytes) -> bytes:
    """Compute the SHA3-256 hash of data.

    Args:
        data: The data to hash

    Returns:
        The 32-byte SHA3-256 hash

    Example:
        >>> hash_sha3_256(b"Hello")
        b'3...'  # 32 bytes
    """
    return hashlib.sha3_256(data).digest()


def derive_address(public_key: bytes) -> Address:
    """Derive an address from a public key.

    The address is the last 20 bytes of SHA3-256(public_key).

    Args:
        public_key: The 32-byte Ed25519 public key

    Returns:
        The derived Address

    Raises:
        CryptoError: If the public key is not 32 bytes

    Example:
        >>> keypair = Keypair.generate()
        >>> address = derive_address(keypair.public_key)
        >>> len(address.to_bytes())
        20
    """
    # Import here to avoid circular imports
    from synapticchain.address import Address

    if len(public_key) != 32:
        raise CryptoError(
            code=CryptoError.INVALID_KEY_LENGTH,
            message=f"Public key must be 32 bytes, got {len(public_key)}",
            details={"expected": 32, "actual": len(public_key)},
        )

    # Address is last 20 bytes of SHA3-256(public_key)
    hash_bytes = hash_sha3_256(public_key)
    address_bytes = hash_bytes[12:32]  # Last 20 bytes
    return Address(address_bytes)


def derive_contract_address(deployer: Address, nonce: int) -> Address:
    """Derive a contract address from deployer address and nonce.

    The contract address is SHA3-256(deployer || nonce_le_bytes)[12:32].

    Args:
        deployer: The address of the contract deployer
        nonce: The nonce used for deployment

    Returns:
        The derived contract Address

    Example:
        >>> from synapticchain.address import Address
        >>> deployer = Address.zero()
        >>> contract_addr = derive_contract_address(deployer, 0)
        >>> len(contract_addr.to_bytes())
        20
    """
    # Import here to avoid circular imports
    from synapticchain.address import Address

    # Concatenate deployer address (20 bytes) with nonce as little-endian u64 (8 bytes)
    nonce_bytes = nonce.to_bytes(8, byteorder="little")
    data = deployer.to_bytes() + nonce_bytes

    # Contract address is last 20 bytes of SHA3-256(data)
    hash_bytes = hash_sha3_256(data)
    address_bytes = hash_bytes[12:32]  # Last 20 bytes
    return Address(address_bytes)


__all__ = [
    "Keypair",
    "verify",
    "hash_sha3_256",
    "derive_address",
    "derive_contract_address",
]
