/**
 * Property-based tests for Address class
 *
 * Uses fast-check for property-based testing with minimum 100 iterations per property.
 *
 * Tests Properties 5-10 from the design document.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Address, ADDRESS_BYTE_LENGTH, ADDRESS_STRING_LENGTH } from './index.js';
import {
  deriveAddressBytes,
  deriveContractAddress,
  hash,
  PUBLIC_KEY_LENGTH,
} from '../crypto/index.js';
import { AddressError } from '../errors/index.js';

// Minimum iterations per property as specified in design document
const NUM_RUNS = 100;

describe('Address Property Tests', () => {
  // Feature: synapticchain-sdks, Property 5: Address Derivation Determinism
  // **Validates: Requirements 2.1**
  describe('Property 5: Address Derivation Determinism', () => {
    it('for any valid 32-byte public key, deriving the address SHALL always produce the same 20-byte address equal to SHA3-256(public_key)[12:32]', () => {
      // Generator for valid 32-byte public keys
      const publicKeyArb = fc.uint8Array({ minLength: PUBLIC_KEY_LENGTH, maxLength: PUBLIC_KEY_LENGTH });

      fc.assert(
        fc.property(publicKeyArb, (publicKey) => {
          // Derive address multiple times
          const address1 = deriveAddressBytes(publicKey);
          const address2 = deriveAddressBytes(publicKey);
          const address3 = deriveAddressBytes(publicKey);

          // All derivations should produce the same result
          expect(address1).toEqual(address2);
          expect(address2).toEqual(address3);

          // Address should be 20 bytes
          expect(address1.length).toBe(ADDRESS_BYTE_LENGTH);

          // Verify it equals SHA3-256(public_key)[12:32]
          const hashBytes = hash(publicKey);
          const expectedAddress = hashBytes.slice(12, 32);
          expect(address1).toEqual(expectedAddress);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('address derivation should be deterministic across different calls', () => {
      const publicKeyArb = fc.uint8Array({ minLength: PUBLIC_KEY_LENGTH, maxLength: PUBLIC_KEY_LENGTH });

      fc.assert(
        fc.property(publicKeyArb, (publicKey) => {
          // Compute expected address manually
          const hashBytes = hash(publicKey);
          const expectedAddress = hashBytes.slice(12, 32);

          // Derive using the function
          const derivedAddress = deriveAddressBytes(publicKey);

          // Should match exactly
          expect(derivedAddress.length).toBe(20);
          for (let i = 0; i < 20; i++) {
            expect(derivedAddress[i]).toBe(expectedAddress[i]);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 6: Address Bech32m Encoding Format
  // **Validates: Requirements 2.2, 2.3**
  describe('Property 6: Address Bech32m Encoding Format', () => {
    it('for any valid 20-byte address, encoding to Bech32m SHALL produce a string starting with "syn1" and having exactly 42 characters', () => {
      // Generator for valid 20-byte addresses
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytesArb, (addressBytes) => {
          const address = new Address(addressBytes);
          const encoded = address.toBech32();

          // Should start with "syn1"
          expect(encoded.startsWith('syn1')).toBe(true);

          // Should have exactly 42 characters
          expect(encoded.length).toBe(ADDRESS_STRING_LENGTH);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('Bech32m encoding should use lowercase characters', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytesArb, (addressBytes) => {
          const address = new Address(addressBytes);
          const encoded = address.toBech32();

          // Should be all lowercase (Bech32m uses lowercase)
          expect(encoded).toBe(encoded.toLowerCase());
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('Bech32m encoding should be consistent for the same address', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytesArb, (addressBytes) => {
          const address = new Address(addressBytes);

          // Encode multiple times
          const encoded1 = address.toBech32();
          const encoded2 = address.toBech32();
          const encoded3 = address.toBech32();

          // All encodings should be identical
          expect(encoded1).toBe(encoded2);
          expect(encoded2).toBe(encoded3);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 7: Address Encoding Round-Trip
  // **Validates: Requirements 2.4**
  describe('Property 7: Address Encoding Round-Trip', () => {
    it('for any valid 20-byte address, encoding to Bech32m then decoding back SHALL produce the original 20-byte address', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytesArb, (addressBytes) => {
          // Create address from bytes
          const original = new Address(addressBytes);

          // Encode to Bech32m
          const encoded = original.toBech32();

          // Decode back
          const decoded = Address.fromBech32(encoded);

          // Should produce the original bytes
          const decodedBytes = decoded.toBytes();
          expect(decodedBytes.length).toBe(addressBytes.length);
          for (let i = 0; i < addressBytes.length; i++) {
            expect(decodedBytes[i]).toBe(addressBytes[i]);
          }

          // equals() should return true
          expect(decoded.equals(original)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('round-trip through hex encoding should preserve address', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytesArb, (addressBytes) => {
          const original = new Address(addressBytes);

          // Encode to hex
          const hex = original.toHex();

          // Decode back
          const decoded = Address.fromHex(hex);

          // Should produce the original bytes
          expect(decoded.equals(original)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('round-trip through hex with 0x prefix should preserve address', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytesArb, (addressBytes) => {
          const original = new Address(addressBytes);

          // Encode to hex with prefix
          const hex = '0x' + original.toHex();

          // Decode back
          const decoded = Address.fromHex(hex);

          // Should produce the original bytes
          expect(decoded.equals(original)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 8: Invalid Address Rejection
  // **Validates: Requirements 2.5, 2.6**
  describe('Property 8: Invalid Address Rejection', () => {
    it('for any Bech32m string with a corrupted checksum, decoding SHALL return a validation error', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      // Index to corrupt (last 6 characters are checksum in Bech32m)
      const corruptIndexArb = fc.integer({ min: 36, max: 41 });

      fc.assert(
        fc.property(addressBytesArb, corruptIndexArb, (addressBytes, corruptIndex) => {
          const address = new Address(addressBytes);
          const encoded = address.toBech32();

          // Corrupt a character in the checksum portion
          const chars = encoded.split('');
          // Change the character to a different valid Bech32 character
          const bech32Chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
          const currentChar = chars[corruptIndex];
          const currentIndex = bech32Chars.indexOf(currentChar);
          const newIndex = (currentIndex + 1) % bech32Chars.length;
          chars[corruptIndex] = bech32Chars[newIndex];
          const corrupted = chars.join('');

          // Decoding should throw AddressError
          expect(() => Address.fromBech32(corrupted)).toThrow(AddressError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any Bech32m string with wrong prefix (not "syn"), decoding SHALL return a validation error', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      // Generate different prefixes
      const wrongPrefixArb = fc.constantFrom('btc', 'eth', 'abc', 'xyz', 'bc', 'tb');

      fc.assert(
        fc.property(addressBytesArb, wrongPrefixArb, (addressBytes, wrongPrefix) => {
          const address = new Address(addressBytes);
          const encoded = address.toBech32();

          // Replace "syn" prefix with wrong prefix
          // Note: This will create an invalid Bech32m string because the checksum
          // is computed over the prefix as well
          const wrongPrefixEncoded = wrongPrefix + encoded.slice(3);

          // Decoding should throw AddressError (either for wrong prefix or invalid checksum)
          expect(() => Address.fromBech32(wrongPrefixEncoded)).toThrow(AddressError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any string that is not valid Bech32m, decoding SHALL return a validation error', () => {
      // Generator for invalid Bech32m strings
      const invalidBech32Arb = fc.oneof(
        // Empty string
        fc.constant(''),
        // Random strings without separator
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('1')),
        // Strings with invalid characters (uppercase O, I, etc.)
        fc.constant('syn1OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO'),
        fc.constant('syn1IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII'),
        // Too short
        fc.constant('syn1'),
        fc.constant('syn1abc'),
        // Contains invalid characters
        fc.constant('syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq!@#$')
      );

      fc.assert(
        fc.property(invalidBech32Arb, (invalidString) => {
          // Decoding should throw AddressError
          expect(() => Address.fromBech32(invalidString)).toThrow(AddressError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any byte array that is not exactly 20 bytes, creating an Address SHALL return an error', () => {
      // Generator for byte arrays that are NOT 20 bytes
      const invalidLengthArb = fc.oneof(
        // Empty array
        fc.constant(new Uint8Array(0)),
        // Short arrays (1-19 bytes)
        fc.integer({ min: 1, max: 19 }).chain((len) =>
          fc.uint8Array({ minLength: len, maxLength: len })
        ),
        // Long arrays (21-100 bytes)
        fc.integer({ min: 21, max: 100 }).chain((len) =>
          fc.uint8Array({ minLength: len, maxLength: len })
        )
      );

      fc.assert(
        fc.property(invalidLengthArb, (invalidBytes) => {
          // Verify the bytes are not 20 bytes (sanity check)
          expect(invalidBytes.length).not.toBe(ADDRESS_BYTE_LENGTH);

          // Creating an Address should throw AddressError
          expect(() => new Address(invalidBytes)).toThrow(AddressError);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 9: Contract Address Derivation Determinism
  // **Validates: Requirements 2.7**
  describe('Property 9: Contract Address Derivation Determinism', () => {
    it('for any valid deployer address and nonce, deriving the contract address SHALL always produce the same address equal to SHA3-256(deployer || nonce_le_bytes)[12:32]', () => {
      const deployerBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      // Use bigint for nonce (u64 range)
      const nonceArb = fc.bigInt({ min: 0n, max: BigInt('18446744073709551615') }); // u64 max

      fc.assert(
        fc.property(deployerBytesArb, nonceArb, (deployerBytes, nonce) => {
          // Derive contract address multiple times
          const contractAddr1 = deriveContractAddress(deployerBytes, nonce);
          const contractAddr2 = deriveContractAddress(deployerBytes, nonce);
          const contractAddr3 = deriveContractAddress(deployerBytes, nonce);

          // All derivations should produce the same result
          expect(contractAddr1).toEqual(contractAddr2);
          expect(contractAddr2).toEqual(contractAddr3);

          // Contract address should be 20 bytes
          expect(contractAddr1.length).toBe(ADDRESS_BYTE_LENGTH);

          // Verify it equals SHA3-256(deployer || nonce_le_bytes)[12:32]
          // Convert nonce to 8-byte little-endian
          const nonceBytes = new Uint8Array(8);
          let n = nonce;
          for (let i = 0; i < 8; i++) {
            nonceBytes[i] = Number(n & 0xffn);
            n >>= 8n;
          }

          // Concatenate deployer and nonce
          const data = new Uint8Array(ADDRESS_BYTE_LENGTH + 8);
          data.set(deployerBytes, 0);
          data.set(nonceBytes, ADDRESS_BYTE_LENGTH);

          // Hash and take last 20 bytes
          const hashBytes = hash(data);
          const expectedAddress = hashBytes.slice(12, 32);

          expect(contractAddr1).toEqual(expectedAddress);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('different nonces should produce different contract addresses (with overwhelming probability)', () => {
      const deployerBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const nonce1Arb = fc.bigInt({ min: 0n, max: BigInt('1000000') });
      const nonce2Arb = fc.bigInt({ min: 0n, max: BigInt('1000000') });

      fc.assert(
        fc.property(deployerBytesArb, nonce1Arb, nonce2Arb, (deployerBytes, nonce1, nonce2) => {
          // Skip if nonces are the same
          if (nonce1 === nonce2) {
            return;
          }

          const contractAddr1 = deriveContractAddress(deployerBytes, nonce1);
          const contractAddr2 = deriveContractAddress(deployerBytes, nonce2);

          // Addresses should be different
          const addr1Hex = Array.from(contractAddr1).map(b => b.toString(16).padStart(2, '0')).join('');
          const addr2Hex = Array.from(contractAddr2).map(b => b.toString(16).padStart(2, '0')).join('');
          expect(addr1Hex).not.toBe(addr2Hex);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('different deployers should produce different contract addresses (with overwhelming probability)', () => {
      const deployer1Arb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const deployer2Arb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const nonceArb = fc.bigInt({ min: 0n, max: BigInt('1000000') });

      fc.assert(
        fc.property(deployer1Arb, deployer2Arb, nonceArb, (deployer1, deployer2, nonce) => {
          // Skip if deployers are the same
          const d1Hex = Array.from(deployer1).map(b => b.toString(16).padStart(2, '0')).join('');
          const d2Hex = Array.from(deployer2).map(b => b.toString(16).padStart(2, '0')).join('');
          if (d1Hex === d2Hex) {
            return;
          }

          const contractAddr1 = deriveContractAddress(deployer1, nonce);
          const contractAddr2 = deriveContractAddress(deployer2, nonce);

          // Addresses should be different
          const addr1Hex = Array.from(contractAddr1).map(b => b.toString(16).padStart(2, '0')).join('');
          const addr2Hex = Array.from(contractAddr2).map(b => b.toString(16).padStart(2, '0')).join('');
          expect(addr1Hex).not.toBe(addr2Hex);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 10: Address Equality
  // **Validates: Requirements 2.8**
  describe('Property 10: Address Equality', () => {
    it('for any two addresses, they SHALL compare equal if and only if their 20-byte representations are identical', () => {
      const addressBytes1Arb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const addressBytes2Arb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytes1Arb, addressBytes2Arb, (bytes1, bytes2) => {
          const addr1 = new Address(bytes1);
          const addr2 = new Address(bytes2);

          // Check if bytes are identical
          let bytesAreIdentical = true;
          for (let i = 0; i < ADDRESS_BYTE_LENGTH; i++) {
            if (bytes1[i] !== bytes2[i]) {
              bytesAreIdentical = false;
              break;
            }
          }

          // equals() should return true if and only if bytes are identical
          expect(addr1.equals(addr2)).toBe(bytesAreIdentical);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('address equality should be reflexive (a.equals(a) is always true)', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytesArb, (bytes) => {
          const address = new Address(bytes);

          // An address should always equal itself
          expect(address.equals(address)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('address equality should be symmetric (a.equals(b) === b.equals(a))', () => {
      const addressBytes1Arb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const addressBytes2Arb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytes1Arb, addressBytes2Arb, (bytes1, bytes2) => {
          const addr1 = new Address(bytes1);
          const addr2 = new Address(bytes2);

          // Equality should be symmetric
          expect(addr1.equals(addr2)).toBe(addr2.equals(addr1));
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('address equality should be transitive (if a.equals(b) and b.equals(c), then a.equals(c))', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytesArb, (bytes) => {
          // Create three addresses from the same bytes
          const addr1 = new Address(bytes);
          const addr2 = new Address(new Uint8Array(bytes));
          const addr3 = new Address(new Uint8Array(bytes));

          // If a.equals(b) and b.equals(c), then a.equals(c)
          if (addr1.equals(addr2) && addr2.equals(addr3)) {
            expect(addr1.equals(addr3)).toBe(true);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('addresses created from the same bytes should be equal', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

      fc.assert(
        fc.property(addressBytesArb, (bytes) => {
          // Create two addresses from the same bytes
          const addr1 = new Address(bytes);
          const addr2 = new Address(new Uint8Array(bytes));

          // They should be equal
          expect(addr1.equals(addr2)).toBe(true);

          // Their Bech32m encodings should be identical
          expect(addr1.toBech32()).toBe(addr2.toBech32());

          // Their hex encodings should be identical
          expect(addr1.toHex()).toBe(addr2.toHex());
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('addresses with any single byte difference should not be equal', () => {
      const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const byteIndexArb = fc.integer({ min: 0, max: ADDRESS_BYTE_LENGTH - 1 });
      const differenceArb = fc.integer({ min: 1, max: 255 }); // Non-zero to ensure difference

      fc.assert(
        fc.property(addressBytesArb, byteIndexArb, differenceArb, (bytes, byteIndex, difference) => {
          const addr1 = new Address(bytes);

          // Create modified bytes
          const modifiedBytes = new Uint8Array(bytes);
          modifiedBytes[byteIndex] = (modifiedBytes[byteIndex] + difference) % 256;

          const addr2 = new Address(modifiedBytes);

          // They should not be equal
          expect(addr1.equals(addr2)).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
