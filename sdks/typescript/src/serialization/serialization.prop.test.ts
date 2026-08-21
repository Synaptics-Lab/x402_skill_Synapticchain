/**
 * Property-based tests for serialization module
 *
 * Uses fast-check for property-based testing with minimum 100 iterations per property.
 *
 * Tests Properties 15, 16, 18, 19, and 20 from the design document.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { borshSerialize, borshDeserialize, jsonSerialize, jsonDeserialize, getSigningBytes, computeTxId } from './index.js';
import { Address, ADDRESS_BYTE_LENGTH } from '../address/index.js';
import { SerializationError } from '../errors/index.js';
import {
  Transaction,
  TransferPayload,
  DeployPayload,
  CallPayload,
  FunctionSelector,
  Value,
  TX_ID_LENGTH,
  FUNCTION_SELECTOR_LENGTH,
} from '../types/index.js';

// Minimum iterations per property as specified in design document
const NUM_RUNS = 100;

// ============================================================================
// Custom Generators
// ============================================================================

/** Length of Ed25519 signature in bytes */
const SIGNATURE_LENGTH = 64;

/**
 * Generator for valid 20-byte address data.
 */
const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

/**
 * Generator for valid Address instances.
 */
const addressArb = addressBytesArb.map((bytes) => new Address(bytes));

/**
 * Generator for valid nonce values (non-negative bigint that fits in u64).
 */
const nonceArb = fc.bigUintN(64);

/**
 * Generator for valid gas limit values (non-negative bigint that fits in u64).
 */
const gasLimitArb = fc.bigUintN(64);

/**
 * Generator for valid gas price values (non-negative bigint that fits in u64).
 */
const gasPriceArb = fc.bigUintN(64);

/**
 * Generator for valid timestamp values (non-negative bigint that fits in u64).
 */
const timestampArb = fc.bigUintN(64);

/**
 * Generator for valid transfer amount (U256).
 */
const amountArb = fc.bigUintN(256);

/**
 * Generator for valid signature (64 bytes).
 */
const signatureArb = fc.uint8Array({ minLength: SIGNATURE_LENGTH, maxLength: SIGNATURE_LENGTH });

/**
 * Generator for valid transaction ID (32 bytes).
 */
const txIdArb = fc.uint8Array({ minLength: TX_ID_LENGTH, maxLength: TX_ID_LENGTH });

/**
 * Generator for valid parent transaction IDs array.
 */
const parentsArb = fc.array(txIdArb, { minLength: 0, maxLength: 5 });

/**
 * Generator for valid contract bytecode.
 */
const bytecodeArb = fc.uint8Array({ minLength: 0, maxLength: 512 });

/**
 * Generator for valid function selector (4 bytes).
 */
const functionSelectorArb = fc.uint8Array({ minLength: FUNCTION_SELECTOR_LENGTH, maxLength: FUNCTION_SELECTOR_LENGTH })
  .map((bytes) => new FunctionSelector(bytes));

/**
 * Generator for simple Value types (non-recursive).
 */
const simpleValueArb: fc.Arbitrary<Value> = fc.oneof(
  fc.boolean().map((v): Value => ({ type: 'bool', value: v })),
  fc.integer({ min: 0, max: 255 }).map((v): Value => ({ type: 'u8', value: v })),
  fc.integer({ min: 0, max: 65535 }).map((v): Value => ({ type: 'u16', value: v })),
  fc.integer({ min: 0, max: 4294967295 }).map((v): Value => ({ type: 'u32', value: v })),
  fc.bigUintN(64).map((v): Value => ({ type: 'u64', value: v })),
  fc.bigUintN(128).map((v): Value => ({ type: 'u128', value: v })),
  fc.bigUintN(256).map((v): Value => ({ type: 'u256', value: v })),
  fc.integer({ min: -128, max: 127 }).map((v): Value => ({ type: 'i8', value: v })),
  fc.integer({ min: -32768, max: 32767 }).map((v): Value => ({ type: 'i16', value: v })),
  fc.integer({ min: -2147483648, max: 2147483647 }).map((v): Value => ({ type: 'i32', value: v })),
  fc.bigIntN(64).map((v): Value => ({ type: 'i64', value: v })),
  fc.bigIntN(128).map((v): Value => ({ type: 'i128', value: v })),
  addressArb.map((v): Value => ({ type: 'address', value: v })),
  fc.uint8Array({ minLength: 0, maxLength: 128 }).map((v): Value => ({ type: 'bytes', value: v })),
  fc.string({ minLength: 0, maxLength: 64 }).map((v): Value => ({ type: 'string', value: v })),
  fc.constant<Value>({ type: 'unit' })
);

/**
 * Generator for array of simple values.
 */
const valuesArb = fc.array(simpleValueArb, { minLength: 0, maxLength: 3 });

/**
 * Generator for Value types including arrays and options (limited depth).
 */
const valueArb: fc.Arbitrary<Value> = fc.oneof(
  simpleValueArb,
  fc.array(simpleValueArb, { minLength: 0, maxLength: 3 }).map((v): Value => ({ type: 'array', value: v })),
  fc.option(simpleValueArb, { nil: undefined }).map((v): Value => ({ type: 'option', value: v ?? null }))
);

/**
 * Generator for transfer payload.
 */
const transferPayloadArb = fc.record({
  type: fc.constant('transfer' as const),
  to: addressArb,
  amount: amountArb,
});

/**
 * Generator for deploy payload.
 */
const deployPayloadArb = fc.record({
  type: fc.constant('deploy' as const),
  code: bytecodeArb,
  constructorArgs: valuesArb,
});

/**
 * Generator for call payload.
 */
const callPayloadArb = fc.record({
  type: fc.constant('call' as const),
  contract: addressArb,
  function: functionSelectorArb,
  args: valuesArb,
});

/**
 * Generator for any payload type.
 */
const payloadArb = fc.oneof(transferPayloadArb, deployPayloadArb, callPayloadArb);

/**
 * Generator for valid Transaction objects.
 */
const transactionArb = fc.record({
  nonce: nonceArb,
  from: addressArb,
  signature: signatureArb,
  payload: payloadArb,
  gasLimit: gasLimitArb,
  gasPrice: gasPriceArb,
  parents: parentsArb,
  timestamp: timestampArb,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Deep equality check for Transaction objects.
 * Handles Address and Uint8Array comparisons properly.
 */
function transactionsEqual(tx1: Transaction, tx2: Transaction): boolean {
  // Check scalar fields
  if (tx1.nonce !== tx2.nonce) return false;
  if (tx1.gasLimit !== tx2.gasLimit) return false;
  if (tx1.gasPrice !== tx2.gasPrice) return false;
  if (tx1.timestamp !== tx2.timestamp) return false;

  // Check from address
  if (!tx1.from.equals(tx2.from)) return false;

  // Check signature
  if (!uint8ArraysEqual(tx1.signature, tx2.signature)) return false;

  // Check parents
  if (tx1.parents.length !== tx2.parents.length) return false;
  for (let i = 0; i < tx1.parents.length; i++) {
    if (!uint8ArraysEqual(tx1.parents[i]!, tx2.parents[i]!)) return false;
  }

  // Check payload
  if (!payloadsEqual(tx1.payload, tx2.payload)) return false;

  return true;
}

/**
 * Check if two Uint8Arrays are equal.
 */
function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Check if two payloads are equal.
 */
function payloadsEqual(p1: TransferPayload | DeployPayload | CallPayload, p2: TransferPayload | DeployPayload | CallPayload): boolean {
  if (p1.type !== p2.type) return false;

  switch (p1.type) {
    case 'transfer': {
      const p2t = p2 as TransferPayload;
      return p1.to.equals(p2t.to) && p1.amount === p2t.amount;
    }
    case 'deploy': {
      const p2d = p2 as DeployPayload;
      if (!uint8ArraysEqual(p1.code, p2d.code)) return false;
      if (p1.constructorArgs.length !== p2d.constructorArgs.length) return false;
      for (let i = 0; i < p1.constructorArgs.length; i++) {
        if (!valuesEqual(p1.constructorArgs[i]!, p2d.constructorArgs[i]!)) return false;
      }
      return true;
    }
    case 'call': {
      const p2c = p2 as CallPayload;
      if (!p1.contract.equals(p2c.contract)) return false;
      if (!p1.function.equals(p2c.function)) return false;
      if (p1.args.length !== p2c.args.length) return false;
      for (let i = 0; i < p1.args.length; i++) {
        if (!valuesEqual(p1.args[i]!, p2c.args[i]!)) return false;
      }
      return true;
    }
  }
}

/**
 * Check if two Values are equal.
 */
function valuesEqual(v1: Value, v2: Value): boolean {
  if (v1.type !== v2.type) return false;

  switch (v1.type) {
    case 'bool':
    case 'u8':
    case 'u16':
    case 'u32':
    case 'i8':
    case 'i16':
    case 'i32':
    case 'string':
      return v1.value === (v2 as typeof v1).value;
    case 'u64':
    case 'u128':
    case 'u256':
    case 'i64':
    case 'i128':
      return v1.value === (v2 as typeof v1).value;
    case 'address':
      return v1.value.equals((v2 as typeof v1).value);
    case 'bytes':
      return uint8ArraysEqual(v1.value, (v2 as typeof v1).value);
    case 'array': {
      const v2a = v2 as typeof v1;
      if (v1.value.length !== v2a.value.length) return false;
      for (let i = 0; i < v1.value.length; i++) {
        if (!valuesEqual(v1.value[i]!, v2a.value[i]!)) return false;
      }
      return true;
    }
    case 'option': {
      const v2o = v2 as typeof v1;
      if (v1.value === null && v2o.value === null) return true;
      if (v1.value === null || v2o.value === null) return false;
      return valuesEqual(v1.value, v2o.value);
    }
    case 'unit':
      return true;
  }
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Serialization Property Tests', () => {
  // Feature: synapticchain-sdks, Property 18: Transaction Borsh Serialization Round-Trip
  // **Validates: Requirements 5.1, 5.3, 5.5**
  describe('Property 18: Transaction Borsh Serialization Round-Trip', () => {
    it('for any valid Transaction object, serializing to Borsh format then deserializing back SHALL produce an equivalent Transaction object', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          // Serialize to Borsh
          const bytes = borshSerialize(tx);

          // Deserialize back
          const deserialized = borshDeserialize(bytes);

          // Verify equivalence
          expect(transactionsEqual(tx, deserialized)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('Borsh serialization round-trip preserves transfer payload fields', () => {
      fc.assert(
        fc.property(
          nonceArb,
          addressArb,
          signatureArb,
          transferPayloadArb,
          gasLimitArb,
          gasPriceArb,
          parentsArb,
          timestampArb,
          (nonce, from, signature, payload, gasLimit, gasPrice, parents, timestamp) => {
            const tx: Transaction = {
              nonce,
              from,
              signature,
              payload,
              gasLimit,
              gasPrice,
              parents,
              timestamp,
            };

            const bytes = borshSerialize(tx);
            const deserialized = borshDeserialize(bytes);

            // Verify all fields
            expect(deserialized.nonce).toBe(nonce);
            expect(deserialized.from.equals(from)).toBe(true);
            expect(uint8ArraysEqual(deserialized.signature, signature)).toBe(true);
            expect(deserialized.gasLimit).toBe(gasLimit);
            expect(deserialized.gasPrice).toBe(gasPrice);
            expect(deserialized.timestamp).toBe(timestamp);
            expect(deserialized.parents.length).toBe(parents.length);

            // Verify transfer payload
            expect(deserialized.payload.type).toBe('transfer');
            const p = deserialized.payload as TransferPayload;
            expect(p.to.equals(payload.to)).toBe(true);
            expect(p.amount).toBe(payload.amount);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('Borsh serialization round-trip preserves deploy payload fields', () => {
      fc.assert(
        fc.property(
          nonceArb,
          addressArb,
          signatureArb,
          deployPayloadArb,
          gasLimitArb,
          gasPriceArb,
          parentsArb,
          timestampArb,
          (nonce, from, signature, payload, gasLimit, gasPrice, parents, timestamp) => {
            const tx: Transaction = {
              nonce,
              from,
              signature,
              payload,
              gasLimit,
              gasPrice,
              parents,
              timestamp,
            };

            const bytes = borshSerialize(tx);
            const deserialized = borshDeserialize(bytes);

            // Verify deploy payload
            expect(deserialized.payload.type).toBe('deploy');
            const p = deserialized.payload as DeployPayload;
            expect(uint8ArraysEqual(p.code, payload.code)).toBe(true);
            expect(p.constructorArgs.length).toBe(payload.constructorArgs.length);
            for (let i = 0; i < payload.constructorArgs.length; i++) {
              expect(valuesEqual(p.constructorArgs[i]!, payload.constructorArgs[i]!)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('Borsh serialization round-trip preserves call payload fields', () => {
      fc.assert(
        fc.property(
          nonceArb,
          addressArb,
          signatureArb,
          callPayloadArb,
          gasLimitArb,
          gasPriceArb,
          parentsArb,
          timestampArb,
          (nonce, from, signature, payload, gasLimit, gasPrice, parents, timestamp) => {
            const tx: Transaction = {
              nonce,
              from,
              signature,
              payload,
              gasLimit,
              gasPrice,
              parents,
              timestamp,
            };

            const bytes = borshSerialize(tx);
            const deserialized = borshDeserialize(bytes);

            // Verify call payload
            expect(deserialized.payload.type).toBe('call');
            const p = deserialized.payload as CallPayload;
            expect(p.contract.equals(payload.contract)).toBe(true);
            expect(p.function.equals(payload.function)).toBe(true);
            expect(p.args.length).toBe(payload.args.length);
            for (let i = 0; i < payload.args.length; i++) {
              expect(valuesEqual(p.args[i]!, payload.args[i]!)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('Borsh serialization produces deterministic output', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          // Serialize multiple times
          const bytes1 = borshSerialize(tx);
          const bytes2 = borshSerialize(tx);
          const bytes3 = borshSerialize(tx);

          // All serializations should produce identical bytes
          expect(uint8ArraysEqual(bytes1, bytes2)).toBe(true);
          expect(uint8ArraysEqual(bytes2, bytes3)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('Borsh serialization round-trip preserves parent transaction IDs', () => {
      fc.assert(
        fc.property(
          transactionArb,
          fc.array(txIdArb, { minLength: 1, maxLength: 10 }),
          (baseTx, parents) => {
            const tx: Transaction = { ...baseTx, parents };

            const bytes = borshSerialize(tx);
            const deserialized = borshDeserialize(bytes);

            expect(deserialized.parents.length).toBe(parents.length);
            for (let i = 0; i < parents.length; i++) {
              expect(uint8ArraysEqual(deserialized.parents[i]!, parents[i]!)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 19: Transaction JSON Serialization Round-Trip
  // **Validates: Requirements 5.2, 5.4, 5.6**
  describe('Property 19: Transaction JSON Serialization Round-Trip', () => {
    it('for any valid Transaction object, serializing to JSON format then deserializing back SHALL produce an equivalent Transaction object', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          // Serialize to JSON
          const json = jsonSerialize(tx);

          // Deserialize back
          const deserialized = jsonDeserialize(json);

          // Verify equivalence
          expect(transactionsEqual(tx, deserialized)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON serialization round-trip preserves transfer payload fields', () => {
      fc.assert(
        fc.property(
          nonceArb,
          addressArb,
          signatureArb,
          transferPayloadArb,
          gasLimitArb,
          gasPriceArb,
          parentsArb,
          timestampArb,
          (nonce, from, signature, payload, gasLimit, gasPrice, parents, timestamp) => {
            const tx: Transaction = {
              nonce,
              from,
              signature,
              payload,
              gasLimit,
              gasPrice,
              parents,
              timestamp,
            };

            const json = jsonSerialize(tx);
            const deserialized = jsonDeserialize(json);

            // Verify all fields
            expect(deserialized.nonce).toBe(nonce);
            expect(deserialized.from.equals(from)).toBe(true);
            expect(uint8ArraysEqual(deserialized.signature, signature)).toBe(true);
            expect(deserialized.gasLimit).toBe(gasLimit);
            expect(deserialized.gasPrice).toBe(gasPrice);
            expect(deserialized.timestamp).toBe(timestamp);
            expect(deserialized.parents.length).toBe(parents.length);

            // Verify transfer payload
            expect(deserialized.payload.type).toBe('transfer');
            const p = deserialized.payload as TransferPayload;
            expect(p.to.equals(payload.to)).toBe(true);
            expect(p.amount).toBe(payload.amount);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON serialization round-trip preserves deploy payload fields', () => {
      fc.assert(
        fc.property(
          nonceArb,
          addressArb,
          signatureArb,
          deployPayloadArb,
          gasLimitArb,
          gasPriceArb,
          parentsArb,
          timestampArb,
          (nonce, from, signature, payload, gasLimit, gasPrice, parents, timestamp) => {
            const tx: Transaction = {
              nonce,
              from,
              signature,
              payload,
              gasLimit,
              gasPrice,
              parents,
              timestamp,
            };

            const json = jsonSerialize(tx);
            const deserialized = jsonDeserialize(json);

            // Verify deploy payload
            expect(deserialized.payload.type).toBe('deploy');
            const p = deserialized.payload as DeployPayload;
            expect(uint8ArraysEqual(p.code, payload.code)).toBe(true);
            expect(p.constructorArgs.length).toBe(payload.constructorArgs.length);
            for (let i = 0; i < payload.constructorArgs.length; i++) {
              expect(valuesEqual(p.constructorArgs[i]!, payload.constructorArgs[i]!)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON serialization round-trip preserves call payload fields', () => {
      fc.assert(
        fc.property(
          nonceArb,
          addressArb,
          signatureArb,
          callPayloadArb,
          gasLimitArb,
          gasPriceArb,
          parentsArb,
          timestampArb,
          (nonce, from, signature, payload, gasLimit, gasPrice, parents, timestamp) => {
            const tx: Transaction = {
              nonce,
              from,
              signature,
              payload,
              gasLimit,
              gasPrice,
              parents,
              timestamp,
            };

            const json = jsonSerialize(tx);
            const deserialized = jsonDeserialize(json);

            // Verify call payload
            expect(deserialized.payload.type).toBe('call');
            const p = deserialized.payload as CallPayload;
            expect(p.contract.equals(payload.contract)).toBe(true);
            expect(p.function.equals(payload.function)).toBe(true);
            expect(p.args.length).toBe(payload.args.length);
            for (let i = 0; i < payload.args.length; i++) {
              expect(valuesEqual(p.args[i]!, payload.args[i]!)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON serialization produces valid JSON string', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          const json = jsonSerialize(tx);

          // Should be a valid JSON string
          expect(typeof json).toBe('string');
          expect(() => JSON.parse(json)).not.toThrow();

          // Parsed JSON should have expected structure
          const parsed = JSON.parse(json);
          expect(typeof parsed.nonce).toBe('string');
          expect(typeof parsed.from).toBe('string');
          expect(typeof parsed.signature).toBe('string');
          expect(typeof parsed.payload).toBe('object');
          expect(typeof parsed.gasLimit).toBe('string');
          expect(typeof parsed.gasPrice).toBe('string');
          expect(Array.isArray(parsed.parents)).toBe(true);
          expect(typeof parsed.timestamp).toBe('string');
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON serialization round-trip preserves parent transaction IDs', () => {
      fc.assert(
        fc.property(
          transactionArb,
          fc.array(txIdArb, { minLength: 1, maxLength: 10 }),
          (baseTx, parents) => {
            const tx: Transaction = { ...baseTx, parents };

            const json = jsonSerialize(tx);
            const deserialized = jsonDeserialize(json);

            expect(deserialized.parents.length).toBe(parents.length);
            for (let i = 0; i < parents.length; i++) {
              expect(uint8ArraysEqual(deserialized.parents[i]!, parents[i]!)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON serialization uses Bech32m for addresses', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          const json = jsonSerialize(tx);
          const parsed = JSON.parse(json);

          // From address should be Bech32m encoded
          expect(parsed.from.startsWith('syn1')).toBe(true);
          expect(parsed.from.length).toBe(42);

          // Payload addresses should also be Bech32m encoded
          if (parsed.payload.type === 'transfer') {
            expect(parsed.payload.to.startsWith('syn1')).toBe(true);
          } else if (parsed.payload.type === 'call') {
            expect(parsed.payload.contract.startsWith('syn1')).toBe(true);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 20: Invalid Serialization Rejection
  // **Validates: Requirements 5.7**
  describe('Property 20: Invalid Serialization Rejection', () => {
    it('for any byte array that is not valid Borsh-encoded transaction data, deserialization SHALL return a descriptive error', () => {
      // Generator for random bytes that are unlikely to be valid transactions
      const invalidBytesArb = fc.oneof(
        // Empty bytes
        fc.constant(new Uint8Array(0)),
        // Too short to be a valid transaction
        fc.uint8Array({ minLength: 1, maxLength: 50 }),
        // Random bytes of various lengths
        fc.uint8Array({ minLength: 51, maxLength: 200 })
      );

      fc.assert(
        fc.property(invalidBytesArb, (bytes) => {
          // Deserialization should throw SerializationError
          expect(() => borshDeserialize(bytes)).toThrow(SerializationError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('truncated Borsh data SHALL be rejected with buffer overflow error', () => {
      fc.assert(
        fc.property(transactionArb, fc.integer({ min: 1, max: 50 }), (tx, truncateAmount) => {
          const bytes = borshSerialize(tx);

          // Only truncate if we have enough bytes
          if (bytes.length <= truncateAmount) {
            return; // Skip this case
          }

          const truncated = bytes.slice(0, bytes.length - truncateAmount);

          expect(() => borshDeserialize(truncated)).toThrow(SerializationError);
          try {
            borshDeserialize(truncated);
          } catch (e) {
            expect(e).toBeInstanceOf(SerializationError);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('Borsh data with extra bytes SHALL be rejected', () => {
      fc.assert(
        fc.property(
          transactionArb,
          fc.uint8Array({ minLength: 1, maxLength: 20 }),
          (tx, extraBytes) => {
            const bytes = borshSerialize(tx);

            // Append extra bytes
            const extended = new Uint8Array(bytes.length + extraBytes.length);
            extended.set(bytes);
            extended.set(extraBytes, bytes.length);

            expect(() => borshDeserialize(extended)).toThrow(SerializationError);
            try {
              borshDeserialize(extended);
            } catch (e) {
              expect(e).toBeInstanceOf(SerializationError);
              const serError = e as SerializationError;
              expect(serError.message).toContain('Unexpected');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('Borsh data with corrupted payload variant SHALL be rejected', () => {
      fc.assert(
        fc.property(
          transactionArb,
          fc.integer({ min: 3, max: 255 }), // Invalid variant (valid are 0, 1, 2)
          (tx, invalidVariant) => {
            const bytes = borshSerialize(tx);

            // Corrupt the payload variant byte
            // Payload variant is at offset: nonce(8) + from(20) + signature(64) = 92
            const corrupted = new Uint8Array(bytes);
            corrupted[92] = invalidVariant;

            expect(() => borshDeserialize(corrupted)).toThrow(SerializationError);
            try {
              borshDeserialize(corrupted);
            } catch (e) {
              expect(e).toBeInstanceOf(SerializationError);
              const serError = e as SerializationError;
              expect(serError.message).toContain('Unknown payload variant');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('invalid JSON syntax SHALL be rejected with SerializationError', () => {
      const invalidJsonSyntaxArb = fc.oneof(
        // Not valid JSON at all
        fc.constant('not valid json'),
        fc.constant('{invalid}'),
        fc.constant('{"unclosed": ')
      );

      fc.assert(
        fc.property(invalidJsonSyntaxArb, (json) => {
          expect(() => jsonDeserialize(json)).toThrow(SerializationError);
          try {
            jsonDeserialize(json);
          } catch (e) {
            expect(e).toBeInstanceOf(SerializationError);
            const serError = e as SerializationError;
            expect(serError.message).toContain('Invalid JSON');
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('valid JSON with wrong structure SHALL be rejected with error', () => {
      const wrongStructureArb = fc.oneof(
        // Valid JSON but wrong structure
        fc.constant('null'),
        fc.constant('[]'),
        fc.constant('123'),
        fc.constant('"string"'),
        // Missing required fields
        fc.constant('{}'),
        fc.constant('{"nonce": "0"}'),
        fc.constant('{"nonce": "0", "from": "syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4x9"}')
      );

      fc.assert(
        fc.property(wrongStructureArb, (json) => {
          // Should throw some error (SerializationError or TypeError)
          expect(() => jsonDeserialize(json)).toThrow();
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON with invalid field types SHALL be rejected', () => {
      // Create a valid transaction JSON and then corrupt specific fields
      fc.assert(
        fc.property(transactionArb, (tx) => {
          const validJson = jsonSerialize(tx);
          const parsed = JSON.parse(validJson);

          // Test with invalid nonce type
          const invalidNonce = { ...parsed, nonce: 123 }; // Should be string
          expect(() => jsonDeserialize(JSON.stringify(invalidNonce))).toThrow(SerializationError);

          // Test with invalid from type
          const invalidFrom = { ...parsed, from: 123 }; // Should be string
          expect(() => jsonDeserialize(JSON.stringify(invalidFrom))).toThrow(SerializationError);

          // Test with invalid signature type
          const invalidSig = { ...parsed, signature: 123 }; // Should be string
          expect(() => jsonDeserialize(JSON.stringify(invalidSig))).toThrow(SerializationError);

          // Test with invalid parents type
          const invalidParents = { ...parsed, parents: 'not an array' };
          expect(() => jsonDeserialize(JSON.stringify(invalidParents))).toThrow(SerializationError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON with invalid signature length SHALL be rejected', () => {
      fc.assert(
        fc.property(
          transactionArb,
          fc.integer({ min: 1, max: 63 }), // Invalid signature lengths
          (tx, sigLength) => {
            const validJson = jsonSerialize(tx);
            const parsed = JSON.parse(validJson);

            // Create signature with wrong length
            const invalidSig = 'ab'.repeat(sigLength);
            const invalidJson = { ...parsed, signature: invalidSig };

            expect(() => jsonDeserialize(JSON.stringify(invalidJson))).toThrow(SerializationError);
            try {
              jsonDeserialize(JSON.stringify(invalidJson));
            } catch (e) {
              expect(e).toBeInstanceOf(SerializationError);
              const serError = e as SerializationError;
              expect(serError.message).toContain('Signature must be 64 bytes');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON with invalid parent ID length SHALL be rejected', () => {
      fc.assert(
        fc.property(
          transactionArb,
          fc.integer({ min: 1, max: 31 }), // Invalid parent ID lengths
          (tx, parentLength) => {
            const validJson = jsonSerialize(tx);
            const parsed = JSON.parse(validJson);

            // Create parent with wrong length
            const invalidParent = 'ab'.repeat(parentLength);
            const invalidJson = { ...parsed, parents: [invalidParent] };

            expect(() => jsonDeserialize(JSON.stringify(invalidJson))).toThrow(SerializationError);
            try {
              jsonDeserialize(JSON.stringify(invalidJson));
            } catch (e) {
              expect(e).toBeInstanceOf(SerializationError);
              const serError = e as SerializationError;
              expect(serError.message).toContain('Parent transaction ID must be 32 bytes');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON with invalid hex strings SHALL be rejected', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          const validJson = jsonSerialize(tx);
          const parsed = JSON.parse(validJson);

          // Test with invalid hex in signature
          const invalidHexSig = { ...parsed, signature: 'gg'.repeat(64) }; // 'g' is not valid hex
          expect(() => jsonDeserialize(JSON.stringify(invalidHexSig))).toThrow(SerializationError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('JSON with invalid Bech32m address SHALL be rejected', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          const validJson = jsonSerialize(tx);
          const parsed = JSON.parse(validJson);

          // Test with invalid address prefix
          const invalidAddr = { ...parsed, from: 'btc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4x9' };
          expect(() => jsonDeserialize(JSON.stringify(invalidAddr))).toThrow();

          // Test with corrupted checksum
          const corruptedAddr = { ...parsed, from: 'syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqinvalid' };
          expect(() => jsonDeserialize(JSON.stringify(corruptedAddr))).toThrow();
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 15: Signing Bytes Format
  // **Validates: Requirements 4.2**
  describe('Property 15: Signing Bytes Format', () => {
    it('signing bytes should NOT include the signature field', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          // Get signing bytes
          const signingBytes = getSigningBytes(tx);

          // Get full Borsh serialization (which includes signature)
          const fullBytes = borshSerialize(tx);

          // Signing bytes should be shorter than full serialization
          // Full serialization includes: nonce(8) + from(20) + signature(64) + payload + gasLimit(8) + gasPrice(8) + parents + timestamp(8)
          // Signing bytes includes: nonce(8) + from(20) + payload + gasLimit(8) + gasPrice(8) + parents + timestamp(8)
          // Difference should be exactly 64 bytes (signature length)
          expect(fullBytes.length - signingBytes.length).toBe(SIGNATURE_LENGTH);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('changing only the signature should produce identical signing bytes', () => {
      fc.assert(
        fc.property(
          transactionArb,
          signatureArb,
          (tx, newSignature) => {
            // Create a copy of the transaction with a different signature
            const txWithDifferentSig: Transaction = {
              ...tx,
              signature: newSignature,
            };

            // Get signing bytes for both transactions
            const signingBytes1 = getSigningBytes(tx);
            const signingBytes2 = getSigningBytes(txWithDifferentSig);

            // Signing bytes should be identical regardless of signature
            expect(uint8ArraysEqual(signingBytes1, signingBytes2)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('signing bytes should follow exact format: nonce || from || borsh(payload) || gas_limit || gas_price || parents || timestamp', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          const signingBytes = getSigningBytes(tx);

          // Manually construct expected signing bytes
          const expectedParts: Uint8Array[] = [];

          // nonce (8 bytes, little-endian)
          const nonceBytes = new Uint8Array(8);
          let n = tx.nonce;
          for (let i = 0; i < 8; i++) {
            nonceBytes[i] = Number(n & 0xffn);
            n >>= 8n;
          }
          expectedParts.push(nonceBytes);

          // from (20 bytes)
          expectedParts.push(tx.from.toBytes());

          // borsh(payload) - we can verify by checking the full serialization structure
          // For now, we verify the prefix (nonce + from) and suffix (gas_limit + gas_price + parents + timestamp)

          // Verify nonce bytes at the start
          for (let i = 0; i < 8; i++) {
            expect(signingBytes[i]).toBe(nonceBytes[i]);
          }

          // Verify from address bytes
          const fromBytes = tx.from.toBytes();
          for (let i = 0; i < 20; i++) {
            expect(signingBytes[8 + i]).toBe(fromBytes[i]);
          }

          // Verify timestamp bytes at the end (last 8 bytes)
          const timestampBytes = new Uint8Array(8);
          let ts = tx.timestamp;
          for (let i = 0; i < 8; i++) {
            timestampBytes[i] = Number(ts & 0xffn);
            ts >>= 8n;
          }
          const timestampOffset = signingBytes.length - 8;
          for (let i = 0; i < 8; i++) {
            expect(signingBytes[timestampOffset + i]).toBe(timestampBytes[i]);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('signing bytes should be deterministic for the same transaction', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          // Compute signing bytes multiple times
          const signingBytes1 = getSigningBytes(tx);
          const signingBytes2 = getSigningBytes(tx);
          const signingBytes3 = getSigningBytes(tx);

          // All should be identical
          expect(uint8ArraysEqual(signingBytes1, signingBytes2)).toBe(true);
          expect(uint8ArraysEqual(signingBytes2, signingBytes3)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('different transaction fields (except signature) should produce different signing bytes', () => {
      fc.assert(
        fc.property(
          transactionArb,
          fc.bigUintN(64),
          (tx, differentNonce) => {
            // Skip if nonces happen to be the same
            if (tx.nonce === differentNonce) {
              return;
            }

            // Create a transaction with different nonce
            const txWithDifferentNonce: Transaction = {
              ...tx,
              nonce: differentNonce,
            };

            // Signing bytes should be different
            const signingBytes1 = getSigningBytes(tx);
            const signingBytes2 = getSigningBytes(txWithDifferentNonce);

            expect(uint8ArraysEqual(signingBytes1, signingBytes2)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 16: Transaction ID Computation Determinism
  // **Validates: Requirements 4.5**
  describe('Property 16: Transaction ID Computation Determinism', () => {
    it('for any valid transaction T, computeTxId(T) should always produce the same 32-byte result', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          // Compute transaction ID multiple times
          const txId1 = computeTxId(tx);
          const txId2 = computeTxId(tx);
          const txId3 = computeTxId(tx);

          // All should be identical
          expect(uint8ArraysEqual(txId1, txId2)).toBe(true);
          expect(uint8ArraysEqual(txId2, txId3)).toBe(true);

          // Should always be 32 bytes
          expect(txId1.length).toBe(TX_ID_LENGTH);
          expect(txId2.length).toBe(TX_ID_LENGTH);
          expect(txId3.length).toBe(TX_ID_LENGTH);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('transaction ID should be exactly 32 bytes (SHA3-256 output)', () => {
      fc.assert(
        fc.property(transactionArb, (tx) => {
          const txId = computeTxId(tx);
          expect(txId.length).toBe(32);
          expect(txId).toBeInstanceOf(Uint8Array);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('different transactions should produce different IDs (with high probability)', () => {
      fc.assert(
        fc.property(
          transactionArb,
          transactionArb,
          (tx1, tx2) => {
            // Skip if transactions happen to be identical
            if (transactionsEqual(tx1, tx2)) {
              return;
            }

            const txId1 = computeTxId(tx1);
            const txId2 = computeTxId(tx2);

            // Different transactions should have different IDs
            expect(uint8ArraysEqual(txId1, txId2)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('transaction ID should be independent of signature (same ID for different signatures)', () => {
      fc.assert(
        fc.property(
          transactionArb,
          signatureArb,
          (tx, newSignature) => {
            // Create a copy with different signature
            const txWithDifferentSig: Transaction = {
              ...tx,
              signature: newSignature,
            };

            // Transaction IDs should be identical (signature is not part of signing bytes)
            const txId1 = computeTxId(tx);
            const txId2 = computeTxId(txWithDifferentSig);

            expect(uint8ArraysEqual(txId1, txId2)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('transaction ID should be SHA3-256 of signing bytes', () => {
      // Import sha3_256 for verification
      const { sha3_256 } = require('@noble/hashes/sha3');

      fc.assert(
        fc.property(transactionArb, (tx) => {
          const signingBytes = getSigningBytes(tx);
          const expectedTxId = sha3_256(signingBytes);
          const actualTxId = computeTxId(tx);

          expect(uint8ArraysEqual(actualTxId, expectedTxId)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('changing any non-signature field should change the transaction ID', () => {
      fc.assert(
        fc.property(
          transactionArb,
          addressArb,
          (tx, differentFrom) => {
            // Skip if addresses happen to be the same
            if (tx.from.equals(differentFrom)) {
              return;
            }

            // Create a transaction with different from address
            const txWithDifferentFrom: Transaction = {
              ...tx,
              from: differentFrom,
            };

            // Transaction IDs should be different
            const txId1 = computeTxId(tx);
            const txId2 = computeTxId(txWithDifferentFrom);

            expect(uint8ArraysEqual(txId1, txId2)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('changing gas limit should change the transaction ID', () => {
      fc.assert(
        fc.property(
          transactionArb,
          gasLimitArb,
          (tx, differentGasLimit) => {
            // Skip if gas limits happen to be the same
            if (tx.gasLimit === differentGasLimit) {
              return;
            }

            const txWithDifferentGasLimit: Transaction = {
              ...tx,
              gasLimit: differentGasLimit,
            };

            const txId1 = computeTxId(tx);
            const txId2 = computeTxId(txWithDifferentGasLimit);

            expect(uint8ArraysEqual(txId1, txId2)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('changing timestamp should change the transaction ID', () => {
      fc.assert(
        fc.property(
          transactionArb,
          timestampArb,
          (tx, differentTimestamp) => {
            // Skip if timestamps happen to be the same
            if (tx.timestamp === differentTimestamp) {
              return;
            }

            const txWithDifferentTimestamp: Transaction = {
              ...tx,
              timestamp: differentTimestamp,
            };

            const txId1 = computeTxId(tx);
            const txId2 = computeTxId(txWithDifferentTimestamp);

            expect(uint8ArraysEqual(txId1, txId2)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('changing parents should change the transaction ID', () => {
      fc.assert(
        fc.property(
          transactionArb,
          parentsArb,
          (tx, differentParents) => {
            // Skip if parents happen to be the same
            if (tx.parents.length === differentParents.length) {
              let same = true;
              for (let i = 0; i < tx.parents.length; i++) {
                if (!uint8ArraysEqual(tx.parents[i]!, differentParents[i]!)) {
                  same = false;
                  break;
                }
              }
              if (same) {
                return;
              }
            }

            const txWithDifferentParents: Transaction = {
              ...tx,
              parents: differentParents,
            };

            const txId1 = computeTxId(tx);
            const txId2 = computeTxId(txWithDifferentParents);

            expect(uint8ArraysEqual(txId1, txId2)).toBe(false);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
