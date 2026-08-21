/**
 * Unit tests for Address class
 */

import { describe, it, expect } from 'vitest';
import { Address, ADDRESS_BYTE_LENGTH, ADDRESS_STRING_LENGTH } from './index.js';
import { AddressError, AddressErrorCode } from '../errors/index.js';

describe('Address', () => {
  describe('constructor', () => {
    it('should create an address from valid 20-byte array', () => {
      const bytes = new Uint8Array(20).fill(0);
      const address = new Address(bytes);
      expect(address.toBytes()).toEqual(bytes);
    });

    it('should throw AddressError for invalid length', () => {
      const bytes = new Uint8Array(19);
      expect(() => new Address(bytes)).toThrow(AddressError);
      expect(() => new Address(bytes)).toThrow(/must be 20 bytes/);
    });

    it('should make a copy of input bytes', () => {
      const bytes = new Uint8Array(20).fill(1);
      const address = new Address(bytes);
      bytes[0] = 255;
      expect(address.toBytes()[0]).toBe(1);
    });
  });

  describe('fromBech32', () => {
    it('should decode a valid Bech32m address', () => {
      // Zero address encoded as Bech32m
      const zeroAddress = Address.zero();
      const encoded = zeroAddress.toBech32();
      const decoded = Address.fromBech32(encoded);
      expect(decoded.equals(zeroAddress)).toBe(true);
    });

    it('should decode a non-zero Bech32m address', () => {
      const bytes = new Uint8Array(20);
      bytes[19] = 1;
      const address = new Address(bytes);
      const encoded = address.toBech32();
      const decoded = Address.fromBech32(encoded);
      expect(decoded.equals(address)).toBe(true);
    });

    it('should throw AddressError for invalid prefix', () => {
      // Create a valid bech32m string with wrong prefix
      // We'll manually construct one or use a known invalid prefix
      expect(() => Address.fromBech32('btc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0e6spl')).toThrow(AddressError);
    });

    it('should throw AddressError for invalid checksum', () => {
      const validAddress = Address.zero().toBech32();
      // Corrupt the last character (checksum)
      const corrupted = validAddress.slice(0, -1) + (validAddress.slice(-1) === 'a' ? 'b' : 'a');
      expect(() => Address.fromBech32(corrupted)).toThrow(AddressError);
    });

    it('should throw AddressError for invalid Bech32m encoding', () => {
      expect(() => Address.fromBech32('invalid')).toThrow(AddressError);
      expect(() => Address.fromBech32('')).toThrow(AddressError);
    });
  });

  describe('fromHex', () => {
    it('should decode a valid hex string', () => {
      const hex = '0000000000000000000000000000000000000000';
      const address = Address.fromHex(hex);
      expect(address.isZero()).toBe(true);
    });

    it('should decode a hex string with 0x prefix', () => {
      const hex = '0x0000000000000000000000000000000000000000';
      const address = Address.fromHex(hex);
      expect(address.isZero()).toBe(true);
    });

    it('should decode a hex string with 0X prefix', () => {
      const hex = '0X0000000000000000000000000000000000000000';
      const address = Address.fromHex(hex);
      expect(address.isZero()).toBe(true);
    });

    it('should decode a non-zero hex string', () => {
      const hex = '0000000000000000000000000000000000000001';
      const address = Address.fromHex(hex);
      expect(address.isZero()).toBe(false);
      const bytes = address.toBytes();
      expect(bytes[19]).toBe(1);
    });

    it('should handle uppercase hex', () => {
      const hex = 'ABCDEF0000000000000000000000000000000000';
      const address = Address.fromHex(hex);
      expect(address.toHex()).toBe(hex.toLowerCase());
    });

    it('should throw AddressError for invalid hex characters', () => {
      const hex = 'gggggggggggggggggggggggggggggggggggggggg';
      expect(() => Address.fromHex(hex)).toThrow(AddressError);
    });

    it('should throw AddressError for wrong length', () => {
      const hex = '00000000000000000000000000000000000000'; // 38 chars
      expect(() => Address.fromHex(hex)).toThrow(AddressError);
    });
  });

  describe('fromBytes', () => {
    it('should create an address from valid bytes', () => {
      const bytes = new Uint8Array(20).fill(42);
      const address = Address.fromBytes(bytes);
      expect(address.toBytes()).toEqual(bytes);
    });

    it('should throw AddressError for invalid length', () => {
      const bytes = new Uint8Array(21);
      expect(() => Address.fromBytes(bytes)).toThrow(AddressError);
    });
  });

  describe('zero', () => {
    it('should create a zero address', () => {
      const address = Address.zero();
      expect(address.isZero()).toBe(true);
      expect(address.toBytes()).toEqual(new Uint8Array(20));
    });
  });

  describe('toBech32', () => {
    it('should encode to Bech32m with syn prefix', () => {
      const address = Address.zero();
      const encoded = address.toBech32();
      expect(encoded.startsWith('syn1')).toBe(true);
    });

    it('should produce 42-character string', () => {
      const address = Address.zero();
      const encoded = address.toBech32();
      expect(encoded.length).toBe(ADDRESS_STRING_LENGTH);
    });

    it('should produce consistent encoding', () => {
      const bytes = new Uint8Array(20);
      bytes[0] = 0xab;
      bytes[19] = 0xcd;
      const address = new Address(bytes);
      const encoded1 = address.toBech32();
      const encoded2 = address.toBech32();
      expect(encoded1).toBe(encoded2);
    });
  });

  describe('toHex', () => {
    it('should encode to lowercase hex without prefix', () => {
      const bytes = new Uint8Array(20);
      bytes[0] = 0xAB;
      bytes[19] = 0xCD;
      const address = new Address(bytes);
      const hex = address.toHex();
      expect(hex).toBe('ab000000000000000000000000000000000000cd');
      expect(hex.startsWith('0x')).toBe(false);
    });

    it('should produce 40-character string', () => {
      const address = Address.zero();
      const hex = address.toHex();
      expect(hex.length).toBe(ADDRESS_BYTE_LENGTH * 2);
    });
  });

  describe('toBytes', () => {
    it('should return a copy of the bytes', () => {
      const bytes = new Uint8Array(20).fill(1);
      const address = new Address(bytes);
      const returned = address.toBytes();
      returned[0] = 255;
      expect(address.toBytes()[0]).toBe(1);
    });
  });

  describe('isZero', () => {
    it('should return true for zero address', () => {
      const address = Address.zero();
      expect(address.isZero()).toBe(true);
    });

    it('should return false for non-zero address', () => {
      const bytes = new Uint8Array(20);
      bytes[0] = 1;
      const address = new Address(bytes);
      expect(address.isZero()).toBe(false);
    });

    it('should return false if any byte is non-zero', () => {
      const bytes = new Uint8Array(20);
      bytes[19] = 1;
      const address = new Address(bytes);
      expect(address.isZero()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal addresses', () => {
      const bytes = new Uint8Array(20).fill(42);
      const addr1 = new Address(bytes);
      const addr2 = new Address(bytes);
      expect(addr1.equals(addr2)).toBe(true);
    });

    it('should return false for different addresses', () => {
      const bytes1 = new Uint8Array(20).fill(1);
      const bytes2 = new Uint8Array(20).fill(2);
      const addr1 = new Address(bytes1);
      const addr2 = new Address(bytes2);
      expect(addr1.equals(addr2)).toBe(false);
    });

    it('should return true for same address instance', () => {
      const address = Address.zero();
      expect(address.equals(address)).toBe(true);
    });

    it('should detect single byte difference', () => {
      const bytes1 = new Uint8Array(20);
      const bytes2 = new Uint8Array(20);
      bytes2[10] = 1;
      const addr1 = new Address(bytes1);
      const addr2 = new Address(bytes2);
      expect(addr1.equals(addr2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return Bech32m encoding', () => {
      const address = Address.zero();
      expect(address.toString()).toBe(address.toBech32());
    });
  });

  describe('round-trip encoding', () => {
    it('should round-trip through Bech32m', () => {
      const bytes = new Uint8Array(20);
      for (let i = 0; i < 20; i++) {
        bytes[i] = i * 13;
      }
      const original = new Address(bytes);
      const encoded = original.toBech32();
      const decoded = Address.fromBech32(encoded);
      expect(decoded.equals(original)).toBe(true);
    });

    it('should round-trip through hex', () => {
      const bytes = new Uint8Array(20);
      for (let i = 0; i < 20; i++) {
        bytes[i] = i * 13;
      }
      const original = new Address(bytes);
      const hex = original.toHex();
      const decoded = Address.fromHex(hex);
      expect(decoded.equals(original)).toBe(true);
    });
  });

  describe('PREFIX constant', () => {
    it('should be "syn"', () => {
      expect(Address.PREFIX).toBe('syn');
    });
  });

  describe('ADDRESS_BYTE_LENGTH constant', () => {
    it('should be 20', () => {
      expect(ADDRESS_BYTE_LENGTH).toBe(20);
    });
  });

  describe('ADDRESS_STRING_LENGTH constant', () => {
    it('should be 42', () => {
      expect(ADDRESS_STRING_LENGTH).toBe(42);
    });
  });
});
