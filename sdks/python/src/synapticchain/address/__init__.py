"""
Address handling for SynapticChain SDK.

This module provides the Address class for Bech32m encoding/decoding
with the "syn" prefix.

Example:
    >>> from synapticchain.address import Address
    >>> address = Address.from_bech32("syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql7a7sh")
    >>> address.to_hex()
    '0000000000000000000000000000000000000000'
"""

from __future__ import annotations

from typing import List, Optional

from synapticchain.errors import AddressError


# Bech32m constants and functions (BIP-350)
# The difference from Bech32 is the checksum constant: 0x2bc830a3 instead of 1
BECH32M_CONST = 0x2BC830A3
CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _bech32m_polymod(values: List[int]) -> int:
    """Internal function that computes the Bech32m checksum."""
    generator = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for value in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ value
        for i in range(5):
            chk ^= generator[i] if ((top >> i) & 1) else 0
    return chk


def _bech32m_hrp_expand(hrp: str) -> List[int]:
    """Expand the HRP into values for checksum computation."""
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def _bech32m_verify_checksum(hrp: str, data: List[int]) -> bool:
    """Verify a Bech32m checksum given HRP and converted data characters."""
    return _bech32m_polymod(_bech32m_hrp_expand(hrp) + data) == BECH32M_CONST


def _bech32m_create_checksum(hrp: str, data: List[int]) -> List[int]:
    """Compute the Bech32m checksum values given HRP and data."""
    values = _bech32m_hrp_expand(hrp) + data
    polymod = _bech32m_polymod(values + [0, 0, 0, 0, 0, 0]) ^ BECH32M_CONST
    return [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]


def _bech32m_encode(hrp: str, data: List[int]) -> str:
    """Compute a Bech32m string given HRP and data values."""
    combined = data + _bech32m_create_checksum(hrp, data)
    return hrp + "1" + "".join([CHARSET[d] for d in combined])


def _bech32m_decode(bech: str) -> tuple[Optional[str], Optional[List[int]]]:
    """Validate a Bech32m string, and determine HRP and data."""
    # Check for mixed case
    if bech.lower() != bech and bech.upper() != bech:
        return (None, None)
    
    # Check for invalid characters
    if any(ord(x) < 33 or ord(x) > 126 for x in bech):
        return (None, None)
    
    bech = bech.lower()
    pos = bech.rfind("1")
    
    # Validate separator position
    if pos < 1 or pos + 7 > len(bech):
        return (None, None)
    
    # Validate data characters
    if not all(x in CHARSET for x in bech[pos + 1:]):
        return (None, None)
    
    hrp = bech[:pos]
    data = [CHARSET.find(x) for x in bech[pos + 1:]]
    
    if not _bech32m_verify_checksum(hrp, data):
        return (None, None)
    
    return (hrp, data[:-6])


def _convertbits(
    data: bytes, frombits: int, tobits: int, pad: bool = True
) -> Optional[List[int]]:
    """General power-of-2 base conversion."""
    acc = 0
    bits = 0
    ret: List[int] = []
    maxv = (1 << tobits) - 1
    max_acc = (1 << (frombits + tobits - 1)) - 1
    
    for value in data:
        if value < 0 or (value >> frombits):
            return None
        acc = ((acc << frombits) | value) & max_acc
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
        return None
    
    return ret


class Address:
    """A 20-byte SynapticChain address with Bech32m encoding.

    Addresses are derived from public keys and encoded using Bech32m
    with the "syn" prefix, resulting in addresses like "syn1...".

    Attributes:
        PREFIX: The Bech32m prefix for SynapticChain addresses ("syn")
        LENGTH: The length of the address in bytes (20)
        BECH32_LENGTH: The length of the Bech32m-encoded address (42)
    """

    PREFIX: str = "syn"
    LENGTH: int = 20
    BECH32_LENGTH: int = 42

    def __init__(self, data: bytes) -> None:
        """Initialize an Address from raw bytes.

        Args:
            data: The 20-byte address data

        Raises:
            AddressError: If data is not exactly 20 bytes

        Example:
            >>> address = Address(bytes(20))
            >>> address.is_zero()
            True
        """
        if len(data) != self.LENGTH:
            raise AddressError(
                code=AddressError.INVALID_LENGTH,
                message=f"Address must be {self.LENGTH} bytes, got {len(data)}",
                details={"expected": self.LENGTH, "actual": len(data)},
            )
        self._data = bytes(data)

    @classmethod
    def from_bech32(cls, encoded: str) -> Address:
        """Decode an address from Bech32m format.

        Args:
            encoded: The Bech32m-encoded address string (e.g., "syn1...")

        Returns:
            The decoded Address

        Raises:
            AddressError: If the string is not valid Bech32m or has wrong prefix

        Example:
            >>> address = Address.from_bech32("syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql7a7sh")
            >>> address.is_zero()
            True
        """
        try:
            hrp, data = _bech32m_decode(encoded)
        except Exception as e:
            raise AddressError(
                code=AddressError.INVALID_BECH32,
                message=f"Invalid Bech32m encoding: {e}",
                details={"input": encoded},
            ) from e

        if hrp is None or data is None:
            # Try to determine if it's a checksum or prefix error
            # by checking if the prefix looks valid
            if encoded.lower().startswith(cls.PREFIX + "1"):
                raise AddressError(
                    code=AddressError.INVALID_CHECKSUM,
                    message="Invalid Bech32m checksum",
                    details={"input": encoded},
                )
            else:
                raise AddressError(
                    code=AddressError.INVALID_BECH32,
                    message="Invalid Bech32m encoding",
                    details={"input": encoded},
                )

        if hrp != cls.PREFIX:
            raise AddressError(
                code=AddressError.INVALID_PREFIX,
                message=f"Invalid address prefix: expected '{cls.PREFIX}', got '{hrp}'",
                details={"expected": cls.PREFIX, "actual": hrp},
            )

        # Convert from 5-bit groups to 8-bit bytes
        address_bytes = _convertbits(bytes(data), 5, 8, False)
        if address_bytes is None:
            raise AddressError(
                code=AddressError.INVALID_BECH32,
                message="Failed to convert Bech32m data",
                details={"input": encoded},
            )

        if len(address_bytes) != cls.LENGTH:
            raise AddressError(
                code=AddressError.INVALID_LENGTH,
                message=f"Decoded address has wrong length: expected {cls.LENGTH}, got {len(address_bytes)}",
                details={"expected": cls.LENGTH, "actual": len(address_bytes)},
            )

        return cls(bytes(address_bytes))

    @classmethod
    def from_hex(cls, hex_str: str) -> Address:
        """Decode an address from a hex string.

        Args:
            hex_str: The hex-encoded address (40 characters, with or without 0x prefix)

        Returns:
            The decoded Address

        Raises:
            AddressError: If the hex string is invalid or wrong length

        Example:
            >>> address = Address.from_hex("0" * 40)
            >>> address.is_zero()
            True
        """
        # Remove 0x prefix if present
        if hex_str.startswith("0x") or hex_str.startswith("0X"):
            hex_str = hex_str[2:]

        try:
            data = bytes.fromhex(hex_str)
        except ValueError as e:
            raise AddressError(
                code=AddressError.INVALID_BECH32,
                message=f"Invalid hex string: {e}",
                details={"input": hex_str},
            ) from e

        return cls(data)

    @classmethod
    def zero(cls) -> Address:
        """Create a zero address (all bytes are 0).

        Returns:
            An Address with all zero bytes

        Example:
            >>> Address.zero().to_hex()
            '0000000000000000000000000000000000000000'
        """
        return cls(bytes(cls.LENGTH))

    def to_bech32(self) -> str:
        """Encode the address as Bech32m.

        Returns:
            The Bech32m-encoded address string (42 characters)

        Example:
            >>> Address.zero().to_bech32()
            'syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql7a7sh'
        """
        # Convert from 8-bit bytes to 5-bit groups
        data_5bit = _convertbits(self._data, 8, 5, True)
        if data_5bit is None:
            raise AddressError(
                code=AddressError.INVALID_BECH32,
                message="Failed to convert address to Bech32m",
            )
        encoded = _bech32m_encode(self.PREFIX, data_5bit)
        return encoded

    def to_hex(self) -> str:
        """Get the address as a hex string (without 0x prefix).

        Returns:
            The 40-character hex string

        Example:
            >>> Address.zero().to_hex()
            '0000000000000000000000000000000000000000'
        """
        return self._data.hex()

    def to_bytes(self) -> bytes:
        """Get the raw 20-byte address data.

        Returns:
            The 20-byte address

        Example:
            >>> len(Address.zero().to_bytes())
            20
        """
        return self._data

    def is_zero(self) -> bool:
        """Check if this is a zero address.

        Returns:
            True if all bytes are zero, False otherwise

        Example:
            >>> Address.zero().is_zero()
            True
        """
        return self._data == bytes(self.LENGTH)

    def __eq__(self, other: object) -> bool:
        """Check equality with another address.

        Args:
            other: The other object to compare

        Returns:
            True if both addresses have the same bytes
        """
        if not isinstance(other, Address):
            return NotImplemented
        return self._data == other._data

    def __hash__(self) -> int:
        """Get the hash of this address for use in sets/dicts."""
        return hash(self._data)

    def __repr__(self) -> str:
        return f"Address({self.to_bech32()})"

    def __str__(self) -> str:
        return self.to_bech32()


__all__ = ["Address"]
