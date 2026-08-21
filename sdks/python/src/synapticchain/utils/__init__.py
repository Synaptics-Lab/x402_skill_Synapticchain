"""
Utility functions for SynapticChain SDK.

This module provides balance formatting, unit conversion, and other
utility functions.

Example:
    >>> from synapticchain.utils import format_balance, parse_balance
    >>> formatted = format_balance(1000000000000000000)  # "1.0"
    >>> wei = parse_balance("1.5")  # 1500000000000000000
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from typing import TYPE_CHECKING

from synapticchain.errors import SerializationError

if TYPE_CHECKING:
    from synapticchain.address import Address

# SYNAPSE token has 18 decimals
DECIMALS = 18
WEI_PER_SYN = 10**DECIMALS

# Maximum U256 value
MAX_U256 = 2**256 - 1


def format_balance(wei: int, decimals: int = DECIMALS) -> str:
    """Format a balance in units to a human-readable string.

    Args:
        wei: The balance in units (smallest unit)
        decimals: Number of decimal places (default: 18)

    Returns:
        The formatted balance string

    Example:
        >>> format_balance(1000000000000000000)
        '1.0'
        >>> format_balance(1500000000000000000)
        '1.5'
        >>> format_balance(123456789012345678901)
        '123.456789012345678901'
    """
    if wei < 0:
        raise ValueError("Balance cannot be negative")

    # Handle zero decimals case
    if decimals == 0:
        return str(units)

    divisor = 10**decimals
    whole = wei // divisor
    fraction = wei % divisor

    if fraction == 0:
        return f"{whole}.0"

    # Format fraction with leading zeros
    fraction_str = str(fraction).zfill(decimals)
    # Remove trailing zeros
    fraction_str = fraction_str.rstrip("0")

    return f"{whole}.{fraction_str}"


def parse_balance(value: str, decimals: int = DECIMALS) -> int:
    """Parse a balance string to wei.

    Args:
        value: The balance string (e.g., "1.5", "100", "0.001")
        decimals: Number of decimal places (default: 18)

    Returns:
        The balance in units

    Raises:
        SerializationError: If the value is not a valid number

    Example:
        >>> parse_balance("1.0")
        1000000000000000000
        >>> parse_balance("1.5")
        1500000000000000000
        >>> parse_balance("0.000000000000000001")
        1
    """
    try:
        # Use Decimal for precise parsing
        d = Decimal(value)

        if d < 0:
            raise SerializationError(
                code=SerializationError.INVALID_FORMAT,
                message="Balance cannot be negative",
                details={"value": value},
            )

        # Multiply by 10^decimals and convert to int
        multiplier = Decimal(10**decimals)
        wei = int(d * multiplier)

        if wei > MAX_U256:
            raise SerializationError(
                code=SerializationError.BUFFER_OVERFLOW,
                message="Balance exceeds maximum U256 value",
                details={"value": value, "max": str(MAX_U256)},
            )

        return wei

    except InvalidOperation as e:
        raise SerializationError(
            code=SerializationError.INVALID_FORMAT,
            message=f"Invalid balance format: {value}",
            details={"value": value},
        ) from e


def wei_to_syn(wei: int) -> Decimal:
    """Convert wei to SYN.

    Args:
        wei: The amount in units

    Returns:
        The amount in SYN as a Decimal

    Example:
        >>> wei_to_syn(1000000000000000000)
        Decimal('1')
        >>> wei_to_syn(1500000000000000000)
        Decimal('1.5')
    """
    return Decimal(wei) / Decimal(WEI_PER_SYN)


def syn_to_wei(syn: Decimal | float | int | str) -> int:
    """Convert SYN to wei.

    Args:
        syn: The amount in SYN

    Returns:
        The amount in units

    Example:
        >>> syn_to_wei(1)
        1000000000000000000
        >>> syn_to_wei(1.5)
        1500000000000000000
        >>> syn_to_wei("0.5")
        500000000000000000
    """
    if isinstance(syn, (int, float)):
        syn = Decimal(str(syn))
    elif isinstance(syn, str):
        syn = Decimal(syn)

    wei = int(syn * Decimal(WEI_PER_SYN))

    if wei < 0:
        raise ValueError("Amount cannot be negative")
    if wei > MAX_U256:
        raise ValueError("Amount exceeds maximum U256 value")

    return wei


def format_hex(data: bytes, prefix: bool = True) -> str:
    """Format bytes as a hex string.

    Args:
        data: The bytes to format
        prefix: Whether to include "0x" prefix

    Returns:
        The hex string

    Example:
        >>> format_hex(bytes([1, 2, 3]))
        '0x010203'
        >>> format_hex(bytes([1, 2, 3]), prefix=False)
        '010203'
    """
    hex_str = data.hex()
    return f"0x{hex_str}" if prefix else hex_str


def parse_hex(value: str) -> bytes:
    """Parse a hex string to bytes.

    Args:
        value: The hex string (with or without "0x" prefix)

    Returns:
        The parsed bytes

    Example:
        >>> parse_hex("0x010203")
        b'\\x01\\x02\\x03'
        >>> parse_hex("010203")
        b'\\x01\\x02\\x03'
    """
    if value.startswith("0x") or value.startswith("0X"):
        value = value[2:]
    return bytes.fromhex(value)


def format_gas(gas: int) -> str:
    """Format gas amount for display.

    Args:
        gas: The gas amount

    Returns:
        Formatted string with units

    Example:
        >>> format_gas(21000)
        '21,000'
        >>> format_gas(1000000)
        '1,000,000'
    """
    return f"{gas:,}"


def format_tx_id(tx_id: bytes) -> str:
    """Format a transaction ID for display.

    Args:
        tx_id: The 32-byte transaction ID

    Returns:
        The hex-encoded transaction ID with 0x prefix

    Example:
        >>> format_tx_id(bytes(32))
        '0x0000...0000'
    """
    hex_str = tx_id.hex()
    if len(hex_str) > 16:
        return f"0x{hex_str[:8]}...{hex_str[-8:]}"
    return f"0x{hex_str}"


def format_address(address: "Address") -> str:
    """Format an address for CLI display.

    Args:
        address: The address to format

    Returns:
        The Bech32m-encoded address
    """
    return address.to_bech32()


__all__ = [
    "DECIMALS",
    "WEI_PER_SYN",
    "MAX_U256",
    "format_balance",
    "parse_balance",
    "wei_to_syn",
    "syn_to_wei",
    "format_hex",
    "parse_hex",
    "format_gas",
    "format_tx_id",
    "format_address",
]
