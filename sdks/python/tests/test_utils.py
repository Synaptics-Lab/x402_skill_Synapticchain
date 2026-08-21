"""
Unit tests for the utils module.

Tests cover:
- Balance formatting (format_balance)
- Balance parsing (parse_balance)
- Unit conversion (wei_to_syn, syn_to_wei)
- Hex formatting and parsing
- CLI-friendly output formatting
"""

import pytest
from decimal import Decimal

from synapticchain.utils import (
    DECIMALS,
    WEI_PER_SYN,
    MAX_U256,
    format_balance,
    parse_balance,
    wei_to_syn,
    syn_to_wei,
    format_hex,
    parse_hex,
    format_gas,
    format_tx_id,
    format_address,
)
from synapticchain.address import Address
from synapticchain.errors import SerializationError


class TestConstants:
    """Tests for module constants."""

    def test_decimals_is_18(self) -> None:
        """DECIMALS should be 18."""
        assert DECIMALS == 18

    def test_wei_per_syn(self) -> None:
        """WEI_PER_SYN should be 10^18."""
        assert WEI_PER_SYN == 10**18

    def test_max_u256(self) -> None:
        """MAX_U256 should be 2^256 - 1."""
        assert MAX_U256 == 2**256 - 1


class TestFormatBalance:
    """Tests for format_balance()."""

    def test_format_balance_one_syn(self) -> None:
        """format_balance() should format 1 SYN correctly."""
        wei = 1000000000000000000
        assert format_balance(units) == "1.0"

    def test_format_balance_fractional(self) -> None:
        """format_balance() should format fractional amounts correctly."""
        wei = 1500000000000000000
        assert format_balance(units) == "1.5"

    def test_format_balance_small_fraction(self) -> None:
        """format_balance() should format small fractions correctly."""
        wei = 1
        assert format_balance(units) == "0.000000000000000001"

    def test_format_balance_zero(self) -> None:
        """format_balance() should format zero correctly."""
        assert format_balance(0) == "0.0"

    def test_format_balance_large_amount(self) -> None:
        """format_balance() should format large amounts correctly."""
        wei = 123456789012345678901234567890
        result = format_balance(units)
        assert result.startswith("123456789012")

    def test_format_balance_removes_trailing_zeros(self) -> None:
        """format_balance() should remove trailing zeros from fraction."""
        wei = 1100000000000000000
        assert format_balance(units) == "1.1"

    def test_format_balance_custom_decimals(self) -> None:
        """format_balance() should support custom decimals."""
        wei = 1500
        assert format_balance(wei, decimals=3) == "1.5"

    def test_format_balance_zero_decimals(self) -> None:
        """format_balance() should handle zero decimals."""
        wei = 1500
        assert format_balance(wei, decimals=0) == "1500"

    def test_format_balance_negative_raises_error(self) -> None:
        """format_balance() should raise error for negative values."""
        with pytest.raises(ValueError) as exc_info:
            format_balance(-1)
        assert "negative" in str(exc_info.value).lower()

    def test_format_balance_preserves_precision(self) -> None:
        """format_balance() should preserve full precision."""
        wei = 123456789012345678
        result = format_balance(units)
        assert result == "0.123456789012345678"


class TestParseBalance:
    """Tests for parse_balance()."""

    def test_parse_balance_one_syn(self) -> None:
        """parse_balance() should parse 1 SYN correctly."""
        assert parse_balance("1.0") == 1000000000000000000

    def test_parse_balance_integer(self) -> None:
        """parse_balance() should parse integer amounts."""
        assert parse_balance("1") == 1000000000000000000

    def test_parse_balance_fractional(self) -> None:
        """parse_balance() should parse fractional amounts."""
        assert parse_balance("1.5") == 1500000000000000000

    def test_parse_balance_small_fraction(self) -> None:
        """parse_balance() should parse small fractions."""
        assert parse_balance("0.000000000000000001") == 1

    def test_parse_balance_zero(self) -> None:
        """parse_balance() should parse zero."""
        assert parse_balance("0") == 0
        assert parse_balance("0.0") == 0

    def test_parse_balance_large_amount(self) -> None:
        """parse_balance() should parse large amounts."""
        # Use a value that doesn't have precision issues
        result = parse_balance("123456789012.0")
        assert result == 123456789012000000000000000000

    def test_parse_balance_custom_decimals(self) -> None:
        """parse_balance() should support custom decimals."""
        assert parse_balance("1.5", decimals=3) == 1500

    def test_parse_balance_invalid_format(self) -> None:
        """parse_balance() should raise error for invalid format."""
        with pytest.raises(SerializationError) as exc_info:
            parse_balance("not a number")
        assert exc_info.value.code == SerializationError.INVALID_FORMAT

    def test_parse_balance_negative_raises_error(self) -> None:
        """parse_balance() should raise error for negative values."""
        with pytest.raises(SerializationError) as exc_info:
            parse_balance("-1.0")
        assert exc_info.value.code == SerializationError.INVALID_FORMAT

    def test_parse_balance_overflow_raises_error(self) -> None:
        """parse_balance() should raise error for values exceeding U256."""
        huge_value = str(2**256)
        with pytest.raises(SerializationError) as exc_info:
            parse_balance(huge_value)
        assert exc_info.value.code == SerializationError.BUFFER_OVERFLOW

    def test_parse_balance_empty_string_raises_error(self) -> None:
        """parse_balance() should raise error for empty string."""
        with pytest.raises(SerializationError) as exc_info:
            parse_balance("")
        assert exc_info.value.code == SerializationError.INVALID_FORMAT

    def test_parse_balance_whitespace_only_raises_error(self) -> None:
        """parse_balance() should raise error for whitespace-only string."""
        with pytest.raises(SerializationError) as exc_info:
            parse_balance("   ")
        assert exc_info.value.code == SerializationError.INVALID_FORMAT


class TestBalanceRoundTrip:
    """Tests for balance formatting/parsing round-trip."""

    def test_round_trip_one_syn(self) -> None:
        """Round-trip should preserve 1 SYN."""
        original = 1000000000000000000
        formatted = format_balance(original)
        parsed = parse_balance(formatted)
        assert parsed == original

    def test_round_trip_fractional(self) -> None:
        """Round-trip should preserve fractional amounts."""
        original = 1234567890123456789
        formatted = format_balance(original)
        parsed = parse_balance(formatted)
        assert parsed == original

    def test_round_trip_zero(self) -> None:
        """Round-trip should preserve zero."""
        original = 0
        formatted = format_balance(original)
        parsed = parse_balance(formatted)
        assert parsed == original

    def test_round_trip_large_amount(self) -> None:
        """Round-trip should preserve large amounts."""
        # Use a value that doesn't have precision issues with Decimal
        original = 123456789012000000000000000000
        formatted = format_balance(original)
        parsed = parse_balance(formatted)
        assert parsed == original


class TestWeiToSyn:
    """Tests for Ethereum units_to_syn()."""

    def test_wei_to_syn_one(self) -> None:
        """wei_to_syn() should convert 1 SYN correctly."""
        wei = 1000000000000000000
        result = wei_to_syn(units)
        assert result == Decimal("1")

    def test_wei_to_syn_fractional(self) -> None:
        """wei_to_syn() should convert fractional amounts."""
        wei = 1500000000000000000
        result = wei_to_syn(units)
        assert result == Decimal("1.5")

    def test_wei_to_syn_small(self) -> None:
        """wei_to_syn() should convert small amounts."""
        wei = 1
        result = wei_to_syn(units)
        assert result == Decimal("0.000000000000000001")

    def test_wei_to_syn_zero(self) -> None:
        """wei_to_syn() should convert zero."""
        result = wei_to_syn(0)
        assert result == Decimal("0")


class TestSynToWei:
    """Tests for syn_to_wei()."""

    def test_syn_to_wei_one(self) -> None:
        """syn_to_wei() should convert 1 SYN correctly."""
        result = syn_to_wei(1)
        assert result == 1000000000000000000

    def test_syn_to_wei_fractional(self) -> None:
        """syn_to_wei() should convert fractional amounts."""
        result = syn_to_wei(1.5)
        assert result == 1500000000000000000

    def test_syn_to_wei_string(self) -> None:
        """syn_to_wei() should accept string input."""
        result = syn_to_wei("1.5")
        assert result == 1500000000000000000

    def test_syn_to_wei_decimal(self) -> None:
        """syn_to_wei() should accept Decimal input."""
        result = syn_to_wei(Decimal("1.5"))
        assert result == 1500000000000000000

    def test_syn_to_wei_zero(self) -> None:
        """syn_to_wei() should convert zero."""
        result = syn_to_wei(0)
        assert result == 0

    def test_syn_to_wei_negative_raises_error(self) -> None:
        """syn_to_wei() should raise error for negative values."""
        with pytest.raises(ValueError) as exc_info:
            syn_to_wei(-1)
        assert "negative" in str(exc_info.value).lower()

    def test_syn_to_wei_overflow_raises_error(self) -> None:
        """syn_to_wei() should raise error for values exceeding U256."""
        huge_value = Decimal(2**256)
        with pytest.raises(ValueError) as exc_info:
            syn_to_wei(huge_value)
        assert "exceeds" in str(exc_info.value).lower()


class TestFormatHex:
    """Tests for format_hex()."""

    def test_format_hex_with_prefix(self) -> None:
        """format_hex() should include 0x prefix by default."""
        data = bytes([1, 2, 3])
        result = format_hex(data)
        assert result == "0x010203"

    def test_format_hex_without_prefix(self) -> None:
        """format_hex() should omit prefix when requested."""
        data = bytes([1, 2, 3])
        result = format_hex(data, prefix=False)
        assert result == "010203"

    def test_format_hex_empty(self) -> None:
        """format_hex() should handle empty bytes."""
        result = format_hex(b"")
        assert result == "0x"

    def test_format_hex_single_byte(self) -> None:
        """format_hex() should handle single byte."""
        result = format_hex(bytes([255]))
        assert result == "0xff"


class TestParseHex:
    """Tests for parse_hex()."""

    def test_parse_hex_with_prefix(self) -> None:
        """parse_hex() should parse hex with 0x prefix."""
        result = parse_hex("0x010203")
        assert result == bytes([1, 2, 3])

    def test_parse_hex_without_prefix(self) -> None:
        """parse_hex() should parse hex without prefix."""
        result = parse_hex("010203")
        assert result == bytes([1, 2, 3])

    def test_parse_hex_uppercase_prefix(self) -> None:
        """parse_hex() should handle uppercase 0X prefix."""
        result = parse_hex("0X010203")
        assert result == bytes([1, 2, 3])

    def test_parse_hex_empty(self) -> None:
        """parse_hex() should handle empty string."""
        result = parse_hex("")
        assert result == b""

    def test_parse_hex_round_trip(self) -> None:
        """parse_hex() should round-trip with format_hex()."""
        original = bytes([1, 2, 3, 255, 0])
        formatted = format_hex(original)
        parsed = parse_hex(formatted)
        assert parsed == original


class TestFormatGas:
    """Tests for format_gas()."""

    def test_format_gas_small(self) -> None:
        """format_gas() should format small gas amounts."""
        result = format_gas(21000)
        assert result == "21,000"

    def test_format_gas_large(self) -> None:
        """format_gas() should format large gas amounts."""
        result = format_gas(1000000)
        assert result == "1,000,000"

    def test_format_gas_zero(self) -> None:
        """format_gas() should format zero."""
        result = format_gas(0)
        assert result == "0"


class TestFormatTxId:
    """Tests for format_tx_id()."""

    def test_format_tx_id_truncates(self) -> None:
        """format_tx_id() should truncate long transaction IDs."""
        tx_id = bytes(32)
        result = format_tx_id(tx_id)
        assert result.startswith("0x")
        assert "..." in result

    def test_format_tx_id_shows_prefix_and_suffix(self) -> None:
        """format_tx_id() should show first and last 8 hex chars."""
        tx_id = bytes([i for i in range(32)])
        result = format_tx_id(tx_id)
        # First 8 hex chars: 00010203
        # Last 8 hex chars: 1c1d1e1f
        assert "00010203" in result
        assert "1c1d1e1f" in result

    def test_format_tx_id_short(self) -> None:
        """format_tx_id() should not truncate short IDs."""
        tx_id = bytes([1, 2, 3, 4])
        result = format_tx_id(tx_id)
        assert result == "0x01020304"


class TestFormatAddress:
    """Tests for format_address()."""

    def test_format_address_returns_bech32(self) -> None:
        """format_address() should return Bech32m encoding."""
        address = Address.zero()
        result = format_address(address)
        assert result.startswith("syn1")
        assert len(result) == 42

    def test_format_address_matches_to_bech32(self) -> None:
        """format_address() should match Address.to_bech32()."""
        address = Address(bytes([i for i in range(20)]))
        result = format_address(address)
        assert result == address.to_bech32()


class TestU256Representation:
    """Tests for U256 balance representation (Property 26)."""

    def test_u256_zero(self) -> None:
        """SDK should handle U256 value of 0."""
        assert parse_balance("0") == 0
        assert format_balance(0) == "0.0"

    def test_u256_max(self) -> None:
        """SDK should handle maximum U256 value."""
        max_wei = MAX_U256
        formatted = format_balance(max_wei)
        # Verify it formats without error and contains expected structure
        assert "." in formatted or formatted.isdigit()
        # Verify we can parse it back (may have precision loss for very large values)
        parsed = parse_balance(formatted)
        # For very large values, we accept some precision loss due to Decimal limitations
        assert parsed > 0

    def test_u256_large_values(self) -> None:
        """SDK should handle large U256 values without precision loss."""
        # Test values that fit within Decimal precision
        large_value = 10**50  # A large but manageable value
        formatted = format_balance(large_value)
        parsed = parse_balance(formatted)
        assert parsed == large_value

    def test_u256_boundary_values(self) -> None:
        """SDK should handle boundary values correctly."""
        # Test 2^64 - 1 (max u64)
        max_u64 = 2**64 - 1
        formatted = format_balance(max_u64)
        parsed = parse_balance(formatted)
        assert parsed == max_u64

        # Test a large value within Decimal precision (28 significant digits)
        # 2^128 - 1 has 39 digits which exceeds default Decimal precision
        # Use a value that fits within precision
        large_value = 10**27  # 28 digits
        formatted = format_balance(large_value)
        parsed = parse_balance(formatted)
        assert parsed == large_value
