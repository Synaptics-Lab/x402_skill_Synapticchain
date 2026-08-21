"""
Unit tests for the address module.

Tests cover:
- Address creation from bytes, hex, and Bech32m
- Bech32m encoding and decoding
- Address comparison and equality
- Error handling for invalid inputs
"""

import pytest
from synapticchain.address import Address
from synapticchain.errors import AddressError


class TestAddressConstructor:
    """Tests for Address constructor."""

    def test_create_from_valid_20_bytes(self) -> None:
        """Address should be created from valid 20-byte array."""
        data = bytes(20)
        address = Address(data)
        assert address.to_bytes() == data

    def test_create_from_non_zero_bytes(self) -> None:
        """Address should be created from non-zero bytes."""
        data = bytes([i for i in range(20)])
        address = Address(data)
        assert address.to_bytes() == data

    def test_reject_too_short(self) -> None:
        """Address should reject data shorter than 20 bytes."""
        with pytest.raises(AddressError) as exc_info:
            Address(bytes(19))
        assert exc_info.value.code == AddressError.INVALID_LENGTH

    def test_reject_too_long(self) -> None:
        """Address should reject data longer than 20 bytes."""
        with pytest.raises(AddressError) as exc_info:
            Address(bytes(21))
        assert exc_info.value.code == AddressError.INVALID_LENGTH

    def test_reject_empty(self) -> None:
        """Address should reject empty data."""
        with pytest.raises(AddressError) as exc_info:
            Address(bytes(0))
        assert exc_info.value.code == AddressError.INVALID_LENGTH

    def test_makes_copy_of_input(self) -> None:
        """Address should make a copy of input bytes."""
        data = bytearray(20)
        data[0] = 1
        address = Address(bytes(data))
        data[0] = 255
        assert address.to_bytes()[0] == 1


class TestAddressFromBech32:
    """Tests for Address.from_bech32()."""

    def test_decode_zero_address(self) -> None:
        """from_bech32() should decode zero address."""
        zero = Address.zero()
        encoded = zero.to_bech32()
        decoded = Address.from_bech32(encoded)
        assert decoded == zero

    def test_decode_non_zero_address(self) -> None:
        """from_bech32() should decode non-zero address."""
        data = bytes([i for i in range(20)])
        original = Address(data)
        encoded = original.to_bech32()
        decoded = Address.from_bech32(encoded)
        assert decoded == original

    def test_reject_invalid_prefix(self) -> None:
        """from_bech32() should reject addresses with wrong prefix."""
        # Create a valid-looking address with wrong prefix
        with pytest.raises(AddressError) as exc_info:
            Address.from_bech32("btc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0e6spl")
        # Could be INVALID_PREFIX or INVALID_BECH32 depending on implementation
        assert exc_info.value.code in [AddressError.INVALID_PREFIX, AddressError.INVALID_BECH32]

    def test_reject_invalid_checksum(self) -> None:
        """from_bech32() should reject addresses with invalid checksum."""
        valid = Address.zero().to_bech32()
        # Corrupt the last character (checksum)
        corrupted = valid[:-1] + ("b" if valid[-1] == "a" else "a")
        with pytest.raises(AddressError) as exc_info:
            Address.from_bech32(corrupted)
        assert exc_info.value.code == AddressError.INVALID_CHECKSUM

    def test_reject_invalid_encoding(self) -> None:
        """from_bech32() should reject invalid Bech32m encoding."""
        with pytest.raises(AddressError) as exc_info:
            Address.from_bech32("invalid")
        assert exc_info.value.code == AddressError.INVALID_BECH32

    def test_reject_empty_string(self) -> None:
        """from_bech32() should reject empty string."""
        with pytest.raises(AddressError) as exc_info:
            Address.from_bech32("")
        assert exc_info.value.code == AddressError.INVALID_BECH32

    def test_case_insensitive(self) -> None:
        """from_bech32() should handle uppercase input."""
        zero = Address.zero()
        encoded = zero.to_bech32()
        # Bech32m should be case-insensitive
        decoded = Address.from_bech32(encoded.upper())
        assert decoded == zero


class TestAddressFromHex:
    """Tests for Address.from_hex()."""

    def test_decode_zero_address(self) -> None:
        """from_hex() should decode zero address."""
        address = Address.from_hex("0" * 40)
        assert address.is_zero()

    def test_decode_with_0x_prefix(self) -> None:
        """from_hex() should handle 0x prefix."""
        address = Address.from_hex("0x" + "0" * 40)
        assert address.is_zero()

    def test_decode_with_0X_prefix(self) -> None:
        """from_hex() should handle 0X prefix."""
        address = Address.from_hex("0X" + "0" * 40)
        assert address.is_zero()

    def test_decode_non_zero(self) -> None:
        """from_hex() should decode non-zero address."""
        hex_str = "0102030405060708090a0b0c0d0e0f1011121314"
        address = Address.from_hex(hex_str)
        assert address.to_hex() == hex_str

    def test_decode_uppercase(self) -> None:
        """from_hex() should handle uppercase hex."""
        hex_str = "ABCDEF0000000000000000000000000000000000"
        address = Address.from_hex(hex_str)
        assert address.to_hex() == hex_str.lower()

    def test_reject_invalid_characters(self) -> None:
        """from_hex() should reject invalid hex characters."""
        with pytest.raises(AddressError) as exc_info:
            Address.from_hex("g" * 40)
        assert exc_info.value.code == AddressError.INVALID_BECH32

    def test_reject_too_short(self) -> None:
        """from_hex() should reject hex strings that are too short."""
        with pytest.raises(AddressError) as exc_info:
            Address.from_hex("0" * 38)
        assert exc_info.value.code == AddressError.INVALID_LENGTH

    def test_reject_too_long(self) -> None:
        """from_hex() should reject hex strings that are too long."""
        with pytest.raises(AddressError) as exc_info:
            Address.from_hex("0" * 42)
        assert exc_info.value.code == AddressError.INVALID_LENGTH


class TestAddressZero:
    """Tests for Address.zero()."""

    def test_creates_zero_address(self) -> None:
        """zero() should create an address with all zero bytes."""
        address = Address.zero()
        assert address.to_bytes() == bytes(20)

    def test_is_zero_returns_true(self) -> None:
        """zero() address should return True for is_zero()."""
        address = Address.zero()
        assert address.is_zero() is True


class TestAddressToBech32:
    """Tests for Address.to_bech32()."""

    def test_starts_with_syn1(self) -> None:
        """to_bech32() should produce string starting with 'syn1'."""
        address = Address.zero()
        encoded = address.to_bech32()
        assert encoded.startswith("syn1")

    def test_produces_42_characters(self) -> None:
        """to_bech32() should produce 42-character string."""
        address = Address.zero()
        encoded = address.to_bech32()
        assert len(encoded) == 42

    def test_is_deterministic(self) -> None:
        """to_bech32() should produce consistent encoding."""
        data = bytes([i for i in range(20)])
        address = Address(data)
        encoded1 = address.to_bech32()
        encoded2 = address.to_bech32()
        assert encoded1 == encoded2

    def test_lowercase_output(self) -> None:
        """to_bech32() should produce lowercase output."""
        address = Address.zero()
        encoded = address.to_bech32()
        assert encoded == encoded.lower()


class TestAddressToHex:
    """Tests for Address.to_hex()."""

    def test_produces_40_characters(self) -> None:
        """to_hex() should produce 40-character string."""
        address = Address.zero()
        hex_str = address.to_hex()
        assert len(hex_str) == 40

    def test_no_prefix(self) -> None:
        """to_hex() should not include 0x prefix."""
        address = Address.zero()
        hex_str = address.to_hex()
        assert not hex_str.startswith("0x")

    def test_lowercase_output(self) -> None:
        """to_hex() should produce lowercase output."""
        data = bytes([0xAB, 0xCD] + [0] * 18)
        address = Address(data)
        hex_str = address.to_hex()
        assert hex_str == hex_str.lower()

    def test_correct_encoding(self) -> None:
        """to_hex() should correctly encode bytes."""
        data = bytes([0xAB, 0xCD] + [0] * 17 + [0xEF])
        address = Address(data)
        hex_str = address.to_hex()
        assert hex_str == "abcd" + "00" * 17 + "ef"


class TestAddressToBytes:
    """Tests for Address.to_bytes()."""

    def test_returns_20_bytes(self) -> None:
        """to_bytes() should return 20 bytes."""
        address = Address.zero()
        data = address.to_bytes()
        assert len(data) == 20

    def test_returns_correct_data(self) -> None:
        """to_bytes() should return the correct data."""
        original = bytes([i for i in range(20)])
        address = Address(original)
        assert address.to_bytes() == original


class TestAddressIsZero:
    """Tests for Address.is_zero()."""

    def test_true_for_zero_address(self) -> None:
        """is_zero() should return True for zero address."""
        address = Address.zero()
        assert address.is_zero() is True

    def test_false_for_non_zero_first_byte(self) -> None:
        """is_zero() should return False if first byte is non-zero."""
        data = bytes([1] + [0] * 19)
        address = Address(data)
        assert address.is_zero() is False

    def test_false_for_non_zero_last_byte(self) -> None:
        """is_zero() should return False if last byte is non-zero."""
        data = bytes([0] * 19 + [1])
        address = Address(data)
        assert address.is_zero() is False

    def test_false_for_non_zero_middle_byte(self) -> None:
        """is_zero() should return False if any middle byte is non-zero."""
        data = bytes([0] * 10 + [1] + [0] * 9)
        address = Address(data)
        assert address.is_zero() is False


class TestAddressEquality:
    """Tests for Address equality."""

    def test_equal_addresses(self) -> None:
        """Addresses with same bytes should be equal."""
        data = bytes([i for i in range(20)])
        addr1 = Address(data)
        addr2 = Address(data)
        assert addr1 == addr2

    def test_unequal_addresses(self) -> None:
        """Addresses with different bytes should not be equal."""
        addr1 = Address(bytes([1] + [0] * 19))
        addr2 = Address(bytes([2] + [0] * 19))
        assert addr1 != addr2

    def test_same_instance(self) -> None:
        """Address should be equal to itself."""
        address = Address.zero()
        assert address == address

    def test_not_equal_to_other_types(self) -> None:
        """Address should not be equal to other types."""
        address = Address.zero()
        assert address != "not an address"
        assert address != 42
        assert address != None
        assert address != bytes(20)


class TestAddressHash:
    """Tests for Address hashing."""

    def test_hashable(self) -> None:
        """Address should be hashable."""
        address = Address.zero()
        hash(address)  # Should not raise

    def test_equal_addresses_same_hash(self) -> None:
        """Equal addresses should have the same hash."""
        data = bytes([i for i in range(20)])
        addr1 = Address(data)
        addr2 = Address(data)
        assert hash(addr1) == hash(addr2)

    def test_usable_in_set(self) -> None:
        """Address should be usable in sets."""
        addr1 = Address.zero()
        addr2 = Address.zero()
        addr3 = Address(bytes([1] + [0] * 19))
        
        s = {addr1, addr2, addr3}
        assert len(s) == 2  # addr1 and addr2 are equal

    def test_usable_as_dict_key(self) -> None:
        """Address should be usable as dictionary key."""
        addr1 = Address.zero()
        addr2 = Address.zero()
        
        d = {addr1: "value1"}
        d[addr2] = "value2"
        
        assert len(d) == 1
        assert d[addr1] == "value2"


class TestAddressRepr:
    """Tests for Address string representation."""

    def test_repr_contains_bech32(self) -> None:
        """repr() should contain Bech32m encoding."""
        address = Address.zero()
        repr_str = repr(address)
        assert "Address" in repr_str
        assert address.to_bech32() in repr_str

    def test_str_returns_bech32(self) -> None:
        """str() should return Bech32m encoding."""
        address = Address.zero()
        assert str(address) == address.to_bech32()


class TestAddressRoundTrip:
    """Tests for round-trip encoding/decoding."""

    def test_bech32_round_trip(self) -> None:
        """Address should round-trip through Bech32m encoding."""
        data = bytes([i * 13 % 256 for i in range(20)])
        original = Address(data)
        encoded = original.to_bech32()
        decoded = Address.from_bech32(encoded)
        assert decoded == original

    def test_hex_round_trip(self) -> None:
        """Address should round-trip through hex encoding."""
        data = bytes([i * 13 % 256 for i in range(20)])
        original = Address(data)
        hex_str = original.to_hex()
        decoded = Address.from_hex(hex_str)
        assert decoded == original

    def test_bytes_round_trip(self) -> None:
        """Address should round-trip through bytes."""
        data = bytes([i * 13 % 256 for i in range(20)])
        original = Address(data)
        bytes_data = original.to_bytes()
        decoded = Address(bytes_data)
        assert decoded == original


class TestAddressConstants:
    """Tests for Address constants."""

    def test_prefix_is_syn(self) -> None:
        """PREFIX should be 'syn'."""
        assert Address.PREFIX == "syn"

    def test_length_is_20(self) -> None:
        """LENGTH should be 20."""
        assert Address.LENGTH == 20

    def test_bech32_length_is_42(self) -> None:
        """BECH32_LENGTH should be 42."""
        assert Address.BECH32_LENGTH == 42
