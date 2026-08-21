/**
 * Property-based tests for ContractHelper class
 *
 * Uses fast-check for property-based testing with minimum 100 iterations per property.
 *
 * Tests Properties 23-24 from the design document.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ContractHelper, encodeValue, decodeValue, ByteReader } from './index.js';
import { Address, ADDRESS_BYTE_LENGTH } from '../address/index.js';
import { deriveContractAddress } from '../crypto/index.js';
import { Value } from '../types/index.js';

// Minimum iterations per property as specified in design document
const NUM_RUNS = 100;

// ============================================================================
// Value Generators
// ============================================================================

/**
 * Generator for valid Address instances.
 */
const addressArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH })
  .map(bytes => new Address(bytes));

/**
 * Generator for bool Value.
 */
const boolValueArb: fc.Arbitrary<Value> = fc.boolean().map(value => ({ type: 'bool', value }));

/**
 * Generator for u8 Value.
 */
const u8ValueArb: fc.Arbitrary<Value> = fc.integer({ min: 0, max: 255 }).map(value => ({ type: 'u8', value }));

/**
 * Generator for u16 Value.
 */
const u16ValueArb: fc.Arbitrary<Value> = fc.integer({ min: 0, max: 65535 }).map(value => ({ type: 'u16', value }));

/**
 * Generator for u32 Value.
 */
const u32ValueArb: fc.Arbitrary<Value> = fc.integer({ min: 0, max: 4294967295 }).map(value => ({ type: 'u32', value }));

/**
 * Generator for u64 Value.
 */
const u64ValueArb: fc.Arbitrary<Value> = fc.bigInt({ min: 0n, max: 18446744073709551615n })
  .map(value => ({ type: 'u64', value }));

/**
 * Generator for u128 Value.
 */
const u128ValueArb: fc.Arbitrary<Value> = fc.bigInt({ min: 0n, max: (1n << 128n) - 1n })
  .map(value => ({ type: 'u128', value }));

/**
 * Generator for u256 Value.
 */
const u256ValueArb: fc.Arbitrary<Value> = fc.bigInt({ min: 0n, max: (1n << 256n) - 1n })
  .map(value => ({ type: 'u256', value }));

/**
 * Generator for i8 Value.
 */
const i8ValueArb: fc.Arbitrary<Value> = fc.integer({ min: -128, max: 127 }).map(value => ({ type: 'i8', value }));

/**
 * Generator for i16 Value.
 */
const i16ValueArb: fc.Arbitrary<Value> = fc.integer({ min: -32768, max: 32767 }).map(value => ({ type: 'i16', value }));

/**
 * Generator for i32 Value.
 */
const i32ValueArb: fc.Arbitrary<Value> = fc.integer({ min: -2147483648, max: 2147483647 })
  .map(value => ({ type: 'i32', value }));

/**
 * Generator for i64 Value.
 */
const i64ValueArb: fc.Arbitrary<Value> = fc.bigInt({ min: -9223372036854775808n, max: 9223372036854775807n })
  .map(value => ({ type: 'i64', value }));

/**
 * Generator for i128 Value.
 */
const i128ValueArb: fc.Arbitrary<Value> = fc.bigInt({ min: -(1n << 127n), max: (1n << 127n) - 1n })
  .map(value => ({ type: 'i128', value }));

/**
 * Generator for address Value.
 */
const addressValueArb: fc.Arbitrary<Value> = addressArb.map(value => ({ type: 'address', value }));

/**
 * Generator for bytes Value (limited size for performance).
 */
const bytesValueArb: fc.Arbitrary<Value> = fc.uint8Array({ minLength: 0, maxLength: 100 })
  .map(value => ({ type: 'bytes', value }));

/**
 * Generator for string Value (limited size for performance).
 */
const stringValueArb: fc.Arbitrary<Value> = fc.string({ minLength: 0, maxLength: 100 })
  .map(value => ({ type: 'string', value }));

/**
 * Generator for unit Value.
 */
const unitValueArb: fc.Arbitrary<Value> = fc.constant({ type: 'unit' } as Value);

/**
 * Generator for option None Value.
 */
const optionNoneValueArb: fc.Arbitrary<Value> = fc.constant({ type: 'option', value: null } as Value);

/**
 * Generator for primitive (non-recursive) Value types.
 */
const primitiveValueArb: fc.Arbitrary<Value> = fc.oneof(
  boolValueArb,
  u8ValueArb,
  u16ValueArb,
  u32ValueArb,
  u64ValueArb,
  u128ValueArb,
  u256ValueArb,
  i8ValueArb,
  i16ValueArb,
  i32ValueArb,
  i64ValueArb,
  i128ValueArb,
  addressValueArb,
  bytesValueArb,
  stringValueArb,
  unitValueArb
);

/**
 * Generator for option Some Value (with primitive inner value).
 */
const optionSomeValueArb: fc.Arbitrary<Value> = primitiveValueArb
  .map(innerValue => ({ type: 'option', value: innerValue } as Value));

/**
 * Generator for option Value (Some or None).
 */
const optionValueArb: fc.Arbitrary<Value> = fc.oneof(optionNoneValueArb, optionSomeValueArb);

/**
 * Generator for array Value (with primitive elements, limited size).
 */
const arrayValueArb: fc.Arbitrary<Value> = fc.array(primitiveValueArb, { minLength: 0, maxLength: 5 })
  .map(value => ({ type: 'array', value }));

/**
 * Generator for all Value types (including arrays and options).
 */
const valueArb: fc.Arbitrary<Value> = fc.oneof(
  primitiveValueArb,
  optionValueArb,
  arrayValueArb
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compares two Values for equality.
 */
function valuesEqual(a: Value, b: Value): boolean {
  if (a.type !== b.type) {
    return false;
  }

  switch (a.type) {
    case 'bool':
      return a.value === (b as typeof a).value;
    case 'u8':
    case 'u16':
    case 'u32':
    case 'i8':
    case 'i16':
    case 'i32':
      return a.value === (b as typeof a).value;
    case 'u64':
    case 'u128':
    case 'u256':
    case 'i64':
    case 'i128':
      return a.value === (b as typeof a).value;
    case 'address':
      return a.value.equals((b as typeof a).value);
    case 'bytes': {
      const bBytes = (b as typeof a).value;
      if (a.value.length !== bBytes.length) return false;
      for (let i = 0; i < a.value.length; i++) {
        if (a.value[i] !== bBytes[i]) return false;
      }
      return true;
    }
    case 'string':
      return a.value === (b as typeof a).value;
    case 'array': {
      const bArray = (b as typeof a).value;
      if (a.value.length !== bArray.length) return false;
      for (let i = 0; i < a.value.length; i++) {
        if (!valuesEqual(a.value[i]!, bArray[i]!)) return false;
      }
      return true;
    }
    case 'option': {
      const bOption = (b as typeof a).value;
      if (a.value === null && bOption === null) return true;
      if (a.value === null || bOption === null) return false;
      return valuesEqual(a.value, bOption);
    }
    case 'unit':
      return true;
    default:
      return false;
  }
}

/**
 * Performs round-trip encoding/decoding of a Value.
 */
function roundTripValue(value: Value): Value {
  const encoded = encodeValue(value);
  const reader = new ByteReader(encoded);
  return decodeValue(reader);
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Contract Helper Property Tests', () => {
  // Feature: synapticchain-sdks, Property 23: Value Encoding Round-Trip
  // **Validates: Requirements 8.1, 8.2, 8.3**
  describe('Property 23: Value Encoding Round-Trip', () => {
    it('for any valid bool Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(boolValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid u8 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(u8ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid u16 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(u16ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid u32 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(u32ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid u64 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(u64ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid u128 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(u128ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid u256 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(u256ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid i8 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(i8ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid i16 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(i16ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid i32 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(i32ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid i64 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(i64ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid i128 Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(i128ValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid address Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(addressValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid bytes Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(bytesValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid string Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(stringValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid array Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(arrayValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid option Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(optionValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid unit Value, encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(unitValueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid Value (all types), encoding then decoding SHALL produce an equivalent Value', () => {
      fc.assert(
        fc.property(valueArb, (value) => {
          const decoded = roundTripValue(value);
          expect(valuesEqual(value, decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('encoding should be deterministic - same value produces same bytes', () => {
      fc.assert(
        fc.property(valueArb, (value) => {
          const encoded1 = encodeValue(value);
          const encoded2 = encodeValue(value);
          const encoded3 = encodeValue(value);

          // All encodings should be identical
          expect(encoded1.length).toBe(encoded2.length);
          expect(encoded2.length).toBe(encoded3.length);

          for (let i = 0; i < encoded1.length; i++) {
            expect(encoded1[i]).toBe(encoded2[i]);
            expect(encoded2[i]).toBe(encoded3[i]);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 24: Contract Address Prediction
  // **Validates: Requirements 8.5**
  describe('Property 24: Contract Address Prediction', () => {
    it('contract address prediction should be deterministic - same deployer and nonce always produce the same address', () => {
      const deployerBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const nonceArb = fc.bigInt({ min: 0n, max: 18446744073709551615n }); // u64 max

      fc.assert(
        fc.property(deployerBytesArb, nonceArb, (deployerBytes, nonce) => {
          const deployer = new Address(deployerBytes);

          // Predict address multiple times
          const predicted1 = ContractHelper.predictAddress(deployer, nonce);
          const predicted2 = ContractHelper.predictAddress(deployer, nonce);
          const predicted3 = ContractHelper.predictAddress(deployer, nonce);

          // All predictions should be identical
          expect(predicted1.equals(predicted2)).toBe(true);
          expect(predicted2.equals(predicted3)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('predicted contract address should match the address derived using deriveContractAddress', () => {
      const deployerBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const nonceArb = fc.bigInt({ min: 0n, max: 18446744073709551615n }); // u64 max

      fc.assert(
        fc.property(deployerBytesArb, nonceArb, (deployerBytes, nonce) => {
          const deployer = new Address(deployerBytes);

          // Predict using ContractHelper
          const predicted = ContractHelper.predictAddress(deployer, nonce);

          // Derive using deriveContractAddress directly
          const derivedBytes = deriveContractAddress(deployerBytes, nonce);
          const derived = new Address(derivedBytes);

          // Both should produce the same address
          expect(predicted.equals(derived)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('different nonces should produce different contract addresses (with overwhelming probability)', () => {
      const deployerBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const nonce1Arb = fc.bigInt({ min: 0n, max: 1000000n });
      const nonce2Arb = fc.bigInt({ min: 0n, max: 1000000n });

      fc.assert(
        fc.property(deployerBytesArb, nonce1Arb, nonce2Arb, (deployerBytes, nonce1, nonce2) => {
          // Skip if nonces are the same
          if (nonce1 === nonce2) {
            return;
          }

          const deployer = new Address(deployerBytes);

          const addr1 = ContractHelper.predictAddress(deployer, nonce1);
          const addr2 = ContractHelper.predictAddress(deployer, nonce2);

          // Addresses should be different
          expect(addr1.equals(addr2)).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('different deployers should produce different contract addresses (with overwhelming probability)', () => {
      const deployer1Arb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const deployer2Arb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const nonceArb = fc.bigInt({ min: 0n, max: 1000000n });

      fc.assert(
        fc.property(deployer1Arb, deployer2Arb, nonceArb, (deployer1Bytes, deployer2Bytes, nonce) => {
          // Skip if deployers are the same
          let same = true;
          for (let i = 0; i < ADDRESS_BYTE_LENGTH; i++) {
            if (deployer1Bytes[i] !== deployer2Bytes[i]) {
              same = false;
              break;
            }
          }
          if (same) {
            return;
          }

          const deployer1 = new Address(deployer1Bytes);
          const deployer2 = new Address(deployer2Bytes);

          const addr1 = ContractHelper.predictAddress(deployer1, nonce);
          const addr2 = ContractHelper.predictAddress(deployer2, nonce);

          // Addresses should be different
          expect(addr1.equals(addr2)).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('predicted address should be a valid 20-byte address with syn1 prefix', () => {
      const deployerBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const nonceArb = fc.bigInt({ min: 0n, max: 18446744073709551615n });

      fc.assert(
        fc.property(deployerBytesArb, nonceArb, (deployerBytes, nonce) => {
          const deployer = new Address(deployerBytes);
          const predicted = ContractHelper.predictAddress(deployer, nonce);

          // Should be a valid Address instance
          expect(predicted).toBeInstanceOf(Address);

          // Should have 20 bytes
          expect(predicted.toBytes().length).toBe(ADDRESS_BYTE_LENGTH);

          // Should encode to Bech32m with syn1 prefix
          const bech32 = predicted.toBech32();
          expect(bech32.startsWith('syn1')).toBe(true);
          expect(bech32.length).toBe(42);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('predicted address should round-trip through Bech32m encoding', () => {
      const deployerBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });
      const nonceArb = fc.bigInt({ min: 0n, max: 18446744073709551615n });

      fc.assert(
        fc.property(deployerBytesArb, nonceArb, (deployerBytes, nonce) => {
          const deployer = new Address(deployerBytes);
          const predicted = ContractHelper.predictAddress(deployer, nonce);

          // Encode to Bech32m and decode back
          const bech32 = predicted.toBech32();
          const decoded = Address.fromBech32(bech32);

          // Should be equal
          expect(predicted.equals(decoded)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
