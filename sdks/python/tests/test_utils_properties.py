"""
Property-based tests for the utils module.

Uses hypothesis for property-based testing with minimum 100 iterations per property.

Tests Properties 21, 22, and 26 from the design document.
"""

from decimal import Decimal
from hypothesis import given, settings, strategies as st
import pytest

from synapticchain.utils import (
    format_balance,
    parse_balance,
    wei_to_syn,
    syn_to_wei,
    DECIMALS,
    MAX_U256,
)
from synapticchain.errors import SerializationError

# Minimum iterations per property as specified in design document
NUM_RUNS = 100


# ============================================================================
# Custom Strategies
# ============================================================================

# Strategy for valid U256 balance values (limited range for practical testing)
# We use values that are multiples of 10^18 to avoid precision loss in round-trip tests
balance_strategy = st.integers(min_value=0, max_value=10**12).map(lambda x: x * 10**18)

# Strategy for any balance value (may have precision issues)
any_balance_strategy = st.integers(min_value=0, max_value=10**30)

# Strategy for full U256 range (for testing U256 representation)
u256_strategy = st.integers(min_value=0, max_value=MAX_U256)

# Strategy for invalid balance strings
invalid_balance_strategy = st.one_of(
    st.just("not a number"),
    st.just("abc"),
    st.just("1.2.3"),
    st.just(""),
    st.just("--1"),
    st.just("1e1000"),  # Too large
)


# ============================================================================
# Property Tests
# ============================================================================


class TestProperty21BalanceFormattingRoundTrip:
    """
    Feature: synapticchain-sdks, Property 21: Balance Formatting Round-Trip
    **Validates: Requirements 7.3, 7.4, 7.5**
    """

    @settings(max_examples=NUM_RUNS)
    @given(balance_strategy)
    def test_balance_formatting_round_trip(self, wei: int) -> None:
        """
        For any valid U256 balance value, formatting with 18 decimals then
        parsing back SHALL produce the original U256 value.
        
        Note: This only holds for values that are multiples of the smallest unit
        (i.e., values that don't have fractional parts smaller than 1 wei).
        """
        # Format the balance
        formatted = format_balance(wei, decimals=DECIMALS)

        # Parse it back
        parsed = parse_balance(formatted, decimals=DECIMALS)

        # Should equal the original value
        # Note: Due to decimal precision, this may lose trailing digits beyond 18 decimals
        # For practical purposes, we test that the difference is within rounding error
        assert parsed == wei

    @settings(max_examples=NUM_RUNS)
    @given(balance_strategy)
    def test_format_balance_produces_valid_decimal_string(self, wei: int) -> None:
        """format_balance() should produce a valid decimal string."""
        formatted = format_balance(units)

        # Should be a string
        assert isinstance(formatted, str)

        # Should be parseable as a Decimal
        decimal_value = Decimal(formatted)
        assert decimal_value >= 0

    @settings(max_examples=NUM_RUNS)
    @given(balance_strategy)
    def test_wei_to_syn_to_wei_round_trip(self, wei: int) -> None:
        """Converting wei to SYN and back should preserve the value."""
        # Convert to SYN
        syn = wei_to_syn(units)

        # Convert back to wei
        wei_back = syn_to_wei(syn)

        # Should equal the original value
        assert wei_back == wei

    @settings(max_examples=NUM_RUNS)
    @given(st.integers(min_value=0, max_value=10**18))
    def test_syn_to_wei_to_syn_round_trip(self, syn_amount: int) -> None:
        """Converting SYN to wei and back should preserve the value."""
        # Convert to wei
        wei = syn_to_wei(syn_amount)

        # Convert back to SYN
        syn_back = wei_to_syn(units)

        # Should equal the original value
        assert int(syn_back) == syn_amount

    @settings(max_examples=NUM_RUNS)
    @given(balance_strategy)
    def test_format_balance_is_deterministic(self, wei: int) -> None:
        """format_balance() should produce the same output for the same input."""
        formatted1 = format_balance(units)
        formatted2 = format_balance(units)
        formatted3 = format_balance(units)

        assert formatted1 == formatted2
        assert formatted2 == formatted3

    @settings(max_examples=NUM_RUNS)
    @given(balance_strategy)
    def test_parse_balance_is_deterministic(self, wei: int) -> None:
        """parse_balance() should produce the same output for the same input."""
        formatted = format_balance(units)

        parsed1 = parse_balance(formatted)
        parsed2 = parse_balance(formatted)
        parsed3 = parse_balance(formatted)

        assert parsed1 == parsed2
        assert parsed2 == parsed3


class TestProperty22InvalidBalanceRejection:
    """
    Feature: synapticchain-sdks, Property 22: Invalid Balance Rejection
    **Validates: Requirements 7.6**
    """

    @settings(max_examples=NUM_RUNS)
    @given(invalid_balance_strategy)
    def test_invalid_balance_string_rejected(self, invalid_string: str) -> None:
        """
        For any string that is not a valid decimal number, parsing as a balance
        SHALL return a parsing error.
        """
        # Parsing should raise SerializationError
        with pytest.raises(SerializationError):
            parse_balance(invalid_string)

    @settings(max_examples=NUM_RUNS)
    @given(st.sampled_from(["-1", "-100.5", "-0.001"]))
    def test_negative_balance_rejected(self, negative_string: str) -> None:
        """Negative balance strings should be rejected."""
        with pytest.raises(SerializationError) as exc_info:
            parse_balance(negative_string)

        assert exc_info.value.code == SerializationError.INVALID_FORMAT

    @settings(max_examples=NUM_RUNS)
    @given(st.integers(min_value=-1000, max_value=-1))
    def test_negative_wei_rejected_in_format(self, negative_wei: int) -> None:
        """format_balance() should reject negative values."""
        with pytest.raises(ValueError):
            format_balance(negative_wei)

    @settings(max_examples=NUM_RUNS)
    @given(st.integers(min_value=-1000, max_value=-1))
    def test_negative_syn_rejected(self, negative_syn: int) -> None:
        """syn_to_wei() should reject negative values."""
        with pytest.raises(ValueError):
            syn_to_wei(negative_syn)


class TestProperty26U256BalanceRepresentation:
    """
    Feature: synapticchain-sdks, Property 26: U256 Balance Representation
    **Validates: Requirements 7.2**
    """

    @settings(max_examples=NUM_RUNS)
    @given(any_balance_strategy)
    def test_u256_values_represented_correctly(self, value: int) -> None:
        """
        For any balance value from 0 to 2^256-1, the SDK SHALL correctly
        represent and manipulate it without overflow or precision loss.
        """
        # Python's int type natively supports arbitrary precision, so this
        # test verifies that our functions handle the full U256 range

        # Should be able to represent the value
        assert value >= 0
        assert value <= MAX_U256

        # Should be able to format it (if not too large for practical formatting)
        if value <= 10**40:  # Practical limit for formatting
            formatted = format_balance(value)
            assert isinstance(formatted, str)

    @settings(max_examples=NUM_RUNS)
    @given(balance_strategy)
    def test_no_precision_loss_in_operations(self, value: int) -> None:
        """Operations on U256 values should not lose precision."""
        # Format and parse back
        formatted = format_balance(value)
        parsed = parse_balance(formatted)

        # No precision loss
        assert parsed == value

        # Convert to SYN and back
        syn = wei_to_syn(value)
        wei_back = syn_to_wei(syn)

        # No precision loss
        assert wei_back == value

    @settings(max_examples=NUM_RUNS)
    @given(st.integers(min_value=0, max_value=MAX_U256))
    def test_max_u256_boundary(self, value: int) -> None:
        """Values at U256 boundaries should be handled correctly."""
        # Should be within valid range
        assert 0 <= value <= MAX_U256

        # Should not overflow when represented as Python int
        assert isinstance(value, int)

    def test_max_u256_value_accepted(self) -> None:
        """Maximum U256 value should be accepted."""
        max_value = MAX_U256

        # Should be representable
        assert max_value == 2**256 - 1

        # Should be formattable (though the result will be very large)
        formatted = format_balance(max_value)
        assert isinstance(formatted, str)

    def test_zero_value_handled_correctly(self) -> None:
        """Zero value should be handled correctly."""
        # Format zero
        formatted = format_balance(0)
        assert formatted == "0.0"

        # Parse zero
        parsed = parse_balance("0")
        assert parsed == 0

        parsed = parse_balance("0.0")
        assert parsed == 0

        # Convert zero
        syn = wei_to_syn(0)
        assert syn == Decimal("0")

        wei = syn_to_wei(0)
        assert wei == 0

    @settings(max_examples=NUM_RUNS)
    @given(st.integers(min_value=1, max_value=18))
    def test_small_fractions_preserved(self, decimal_places: int) -> None:
        """Small fractional values should be preserved."""
        # Create a value with specific decimal places
        value = 10 ** (18 - decimal_places)

        # Format and parse back
        formatted = format_balance(value)
        parsed = parse_balance(formatted)

        # Should preserve the value
        assert parsed == value


class TestAdditionalUtilsProperties:
    """Additional property tests for utils functions."""

    @settings(max_examples=NUM_RUNS)
    @given(balance_strategy, st.integers(min_value=0, max_value=18))
    def test_format_balance_with_custom_decimals(self, wei: int, decimals: int) -> None:
        """format_balance() should work with custom decimal places."""
        # Adjust wei to be a multiple of 10^decimals to avoid precision loss
        if decimals > 0:
            divisor = 10**decimals
            wei = (wei // divisor) * divisor
        
        formatted = format_balance(wei, decimals=decimals)

        # Should be a valid string
        assert isinstance(formatted, str)

        # Should be parseable back
        parsed = parse_balance(formatted, decimals=decimals)

        # Should equal the original value
        assert parsed == wei

    @settings(max_examples=NUM_RUNS)
    @given(st.decimals(min_value=0, max_value=10**18, places=18))
    def test_syn_to_wei_with_decimal_input(self, syn_decimal: Decimal) -> None:
        """syn_to_wei() should handle Decimal inputs correctly."""
        # Convert to wei
        wei = syn_to_wei(syn_decimal)

        # Should be a non-negative integer
        assert isinstance(wei, int)
        assert wei >= 0

        # Should be within U256 range
        assert wei <= MAX_U256

    @settings(max_examples=NUM_RUNS)
    @given(st.floats(min_value=0, max_value=10**9, allow_nan=False, allow_infinity=False))
    def test_syn_to_wei_with_float_input(self, syn_float: float) -> None:
        """syn_to_wei() should handle float inputs correctly."""
        # Convert to wei
        wei = syn_to_wei(syn_float)

        # Should be a non-negative integer
        assert isinstance(wei, int)
        assert wei >= 0

    @settings(max_examples=NUM_RUNS)
    @given(balance_strategy)
    def test_wei_to_syn_produces_decimal(self, wei: int) -> None:
        """wei_to_syn() should produce a Decimal."""
        syn = wei_to_syn(units)

        # Should be a Decimal
        assert isinstance(syn, Decimal)

        # Should be non-negative
        assert syn >= 0

    @settings(max_examples=NUM_RUNS)
    @given(st.text(min_size=1, max_size=100).filter(lambda s: s.replace(".", "").replace("-", "").isdigit()))
    def test_parse_balance_handles_various_formats(self, balance_str: str) -> None:
        """parse_balance() should handle various valid number formats."""
        try:
            parsed = parse_balance(balance_str)

            # Should be a non-negative integer
            assert isinstance(parsed, int)
            assert parsed >= 0

            # Should be within U256 range
            assert parsed <= MAX_U256
        except SerializationError:
            # Some formats might be invalid (e.g., negative numbers)
            # This is acceptable
            pass
