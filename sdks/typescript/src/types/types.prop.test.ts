/**
 * Property-based tests for types module
 *
 * Uses fast-check for property-based testing with minimum 100 iterations per property.
 *
 * Tests Property 12 from the design document.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sha3_256 } from '@noble/hashes/sha3';
import { FunctionSelector, FUNCTION_SELECTOR_LENGTH } from './index.js';

// Minimum iterations per property as specified in design document
const NUM_RUNS = 100;

describe('FunctionSelector Property Tests', () => {
  // Feature: synapticchain-sdks, Property 12: Function Selector Computation Determinism
  // **Validates: Requirements 3.7**
  describe('Property 12: Function Selector Computation Determinism', () => {
    it('for any function name string, computing the function selector SHALL always produce the same 4-byte value equal to SHA3-256(function_name)[0:4]', () => {
      // Generator for arbitrary function name strings
      const functionNameArb = fc.string({ minLength: 0, maxLength: 256 });

      fc.assert(
        fc.property(functionNameArb, (functionName) => {
          // Compute selector multiple times
          const selector1 = FunctionSelector.fromName(functionName);
          const selector2 = FunctionSelector.fromName(functionName);
          const selector3 = FunctionSelector.fromName(functionName);

          // All computations should produce the same result
          expect(selector1.toBytes()).toEqual(selector2.toBytes());
          expect(selector2.toBytes()).toEqual(selector3.toBytes());

          // Selector should be exactly 4 bytes
          expect(selector1.toBytes().length).toBe(FUNCTION_SELECTOR_LENGTH);

          // Verify it equals SHA3-256(function_name)[0:4]
          const encoder = new TextEncoder();
          const nameBytes = encoder.encode(functionName);
          const hashBytes = sha3_256(nameBytes);
          const expectedSelector = hashBytes.slice(0, FUNCTION_SELECTOR_LENGTH);

          expect(selector1.toBytes()).toEqual(expectedSelector);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('function selector computation should be deterministic across different FunctionSelector instances', () => {
      const functionNameArb = fc.string({ minLength: 1, maxLength: 128 });

      fc.assert(
        fc.property(functionNameArb, (functionName) => {
          // Create selectors at different times
          const selector1 = FunctionSelector.fromName(functionName);
          
          // Perform some other operations to ensure no state leakage
          const _otherSelector = FunctionSelector.fromName('other_function');
          
          const selector2 = FunctionSelector.fromName(functionName);

          // Should still be equal
          expect(selector1.equals(selector2)).toBe(true);
          expect(selector1.toHex()).toBe(selector2.toHex());
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('function selector should correctly handle ASCII function names', () => {
      // Generator for ASCII alphanumeric function names (common case)
      const asciiNameArb = fc.stringOf(
        fc.constantFrom(
          ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split('')
        ),
        { minLength: 1, maxLength: 64 }
      );

      fc.assert(
        fc.property(asciiNameArb, (functionName) => {
          const selector = FunctionSelector.fromName(functionName);

          // Verify against manual SHA3-256 computation
          const encoder = new TextEncoder();
          const nameBytes = encoder.encode(functionName);
          const hashBytes = sha3_256(nameBytes);
          const expectedSelector = hashBytes.slice(0, FUNCTION_SELECTOR_LENGTH);

          expect(selector.toBytes()).toEqual(expectedSelector);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('function selector should correctly handle Unicode function names', () => {
      // Generator for Unicode strings
      const unicodeNameArb = fc.unicodeString({ minLength: 1, maxLength: 64 });

      fc.assert(
        fc.property(unicodeNameArb, (functionName) => {
          const selector = FunctionSelector.fromName(functionName);

          // Verify against manual SHA3-256 computation
          const encoder = new TextEncoder();
          const nameBytes = encoder.encode(functionName);
          const hashBytes = sha3_256(nameBytes);
          const expectedSelector = hashBytes.slice(0, FUNCTION_SELECTOR_LENGTH);

          expect(selector.toBytes()).toEqual(expectedSelector);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('function selector should handle empty string deterministically', () => {
      fc.assert(
        fc.property(fc.constant(''), (emptyName) => {
          const selector1 = FunctionSelector.fromName(emptyName);
          const selector2 = FunctionSelector.fromName(emptyName);

          // Should be deterministic
          expect(selector1.toBytes()).toEqual(selector2.toBytes());

          // Verify against manual SHA3-256 computation
          const encoder = new TextEncoder();
          const nameBytes = encoder.encode(emptyName);
          const hashBytes = sha3_256(nameBytes);
          const expectedSelector = hashBytes.slice(0, FUNCTION_SELECTOR_LENGTH);

          expect(selector1.toBytes()).toEqual(expectedSelector);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('different function names should produce different selectors (with overwhelming probability)', () => {
      const functionName1Arb = fc.string({ minLength: 1, maxLength: 64 });
      const functionName2Arb = fc.string({ minLength: 1, maxLength: 64 });

      fc.assert(
        fc.property(functionName1Arb, functionName2Arb, (name1, name2) => {
          // Skip if names are the same
          if (name1 === name2) {
            return;
          }

          const selector1 = FunctionSelector.fromName(name1);
          const selector2 = FunctionSelector.fromName(name2);

          // Different names should produce different selectors
          // Note: There's a tiny probability of collision (1 in 2^32), but it's negligible
          expect(selector1.equals(selector2)).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('function selector hex representation should be consistent with bytes', () => {
      const functionNameArb = fc.string({ minLength: 0, maxLength: 128 });

      fc.assert(
        fc.property(functionNameArb, (functionName) => {
          const selector = FunctionSelector.fromName(functionName);
          const bytes = selector.toBytes();
          const hex = selector.toHex();

          // Hex should be 8 characters (4 bytes * 2 hex chars per byte)
          expect(hex.length).toBe(FUNCTION_SELECTOR_LENGTH * 2);

          // Convert hex back to bytes and compare
          const bytesFromHex = new Uint8Array(FUNCTION_SELECTOR_LENGTH);
          for (let i = 0; i < hex.length; i += 2) {
            bytesFromHex[i / 2] = parseInt(hex.slice(i, i + 2), 16);
          }

          expect(bytesFromHex).toEqual(bytes);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('function selector round-trip through hex should preserve value', () => {
      const functionNameArb = fc.string({ minLength: 0, maxLength: 128 });

      fc.assert(
        fc.property(functionNameArb, (functionName) => {
          const original = FunctionSelector.fromName(functionName);
          const hex = original.toHex();
          const restored = FunctionSelector.fromHex(hex);

          // Should be equal
          expect(original.equals(restored)).toBe(true);
          expect(original.toBytes()).toEqual(restored.toBytes());
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('function selector round-trip through bytes should preserve value', () => {
      const functionNameArb = fc.string({ minLength: 0, maxLength: 128 });

      fc.assert(
        fc.property(functionNameArb, (functionName) => {
          const original = FunctionSelector.fromName(functionName);
          const bytes = original.toBytes();
          const restored = new FunctionSelector(bytes);

          // Should be equal
          expect(original.equals(restored)).toBe(true);
          expect(original.toHex()).toBe(restored.toHex());
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });
});


// ============================================================================
// TransactionBuilder Property Tests
// ============================================================================

import { Address, ADDRESS_BYTE_LENGTH } from '../address/index.js';
import { TransactionError, TransactionErrorCode } from '../errors/index.js';
import {
  TransactionBuilder,
  TX_ID_LENGTH,
  Value,
  Payload,
  TxId,
} from './index.js';

// Custom generators for transaction-related types

/**
 * Generator for valid 20-byte address data.
 */
const addressBytesArb = fc.uint8Array({ minLength: ADDRESS_BYTE_LENGTH, maxLength: ADDRESS_BYTE_LENGTH });

/**
 * Generator for valid Address instances.
 */
const addressArb = addressBytesArb.map((bytes) => new Address(bytes));

/**
 * Generator for valid nonce values (non-negative bigint).
 */
const nonceArb = fc.bigUintN(64);

/**
 * Generator for valid gas limit values (positive bigint).
 */
const gasLimitArb = fc.bigUintN(64).filter((n) => n > 0n);

/**
 * Generator for valid gas price values (non-negative bigint).
 */
const gasPriceArb = fc.bigUintN(64);

/**
 * Generator for valid timestamp values (non-negative bigint).
 */
const timestampArb = fc.bigUintN(64);

/**
 * Generator for valid transfer amount (U256).
 */
const amountArb = fc.bigUintN(256);

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
const bytecodeArb = fc.uint8Array({ minLength: 0, maxLength: 1024 });

/**
 * Generator for valid function names.
 */
const functionNameArb = fc.string({ minLength: 1, maxLength: 64 });

/**
 * Generator for simple Value types (for constructor args and call args).
 */
const simpleValueArb: fc.Arbitrary<Value> = fc.oneof(
  fc.boolean().map((v): Value => ({ type: 'bool', value: v })),
  fc.integer({ min: 0, max: 255 }).map((v): Value => ({ type: 'u8', value: v })),
  fc.integer({ min: 0, max: 65535 }).map((v): Value => ({ type: 'u16', value: v })),
  fc.integer({ min: 0, max: 4294967295 }).map((v): Value => ({ type: 'u32', value: v })),
  fc.bigUintN(64).map((v): Value => ({ type: 'u64', value: v })),
  fc.bigUintN(256).map((v): Value => ({ type: 'u256', value: v })),
  fc.constant<Value>({ type: 'unit' })
);

/**
 * Generator for array of simple values.
 */
const valuesArb = fc.array(simpleValueArb, { minLength: 0, maxLength: 5 });

describe('TransactionBuilder Property Tests', () => {
  // Feature: synapticchain-sdks, Property 11: Transaction Construction Preserves Fields
  // **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.8, 3.9, 3.10**
  describe('Property 11: Transaction Construction Preserves Fields', () => {
    it('for any valid transfer transaction parameters, building SHALL produce a transaction with all fields matching the input parameters', () => {
      fc.assert(
        fc.property(
          addressArb,
          nonceArb,
          gasLimitArb,
          gasPriceArb,
          timestampArb,
          parentsArb,
          addressArb,
          amountArb,
          (from, nonce, gasLimit, gasPrice, timestamp, parents, to, amount) => {
            const builder = new TransactionBuilder()
              .from(from)
              .nonce(nonce)
              .gasLimit(gasLimit)
              .gasPrice(gasPrice)
              .timestamp(timestamp)
              .parents(parents)
              .transfer(to, amount);

            const tx = builder.build();

            // Verify all fields match input parameters
            expect(tx.from.equals(from)).toBe(true);
            expect(tx.nonce).toBe(nonce);
            expect(tx.gasLimit).toBe(gasLimit);
            expect(tx.gasPrice).toBe(gasPrice);
            expect(tx.timestamp).toBe(timestamp);
            expect(tx.parents.length).toBe(parents.length);
            for (let i = 0; i < parents.length; i++) {
              expect(tx.parents[i]).toEqual(parents[i]);
            }

            // Verify transfer payload
            expect(tx.payload.type).toBe('transfer');
            if (tx.payload.type === 'transfer') {
              expect(tx.payload.to.equals(to)).toBe(true);
              expect(tx.payload.amount).toBe(amount);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid deploy transaction parameters, building SHALL produce a transaction with all fields matching the input parameters', () => {
      fc.assert(
        fc.property(
          addressArb,
          nonceArb,
          gasLimitArb,
          gasPriceArb,
          timestampArb,
          parentsArb,
          bytecodeArb,
          valuesArb,
          (from, nonce, gasLimit, gasPrice, timestamp, parents, code, constructorArgs) => {
            const builder = new TransactionBuilder()
              .from(from)
              .nonce(nonce)
              .gasLimit(gasLimit)
              .gasPrice(gasPrice)
              .timestamp(timestamp)
              .parents(parents)
              .deploy(code, constructorArgs);

            const tx = builder.build();

            // Verify all fields match input parameters
            expect(tx.from.equals(from)).toBe(true);
            expect(tx.nonce).toBe(nonce);
            expect(tx.gasLimit).toBe(gasLimit);
            expect(tx.gasPrice).toBe(gasPrice);
            expect(tx.timestamp).toBe(timestamp);
            expect(tx.parents.length).toBe(parents.length);

            // Verify deploy payload
            expect(tx.payload.type).toBe('deploy');
            if (tx.payload.type === 'deploy') {
              expect(tx.payload.code).toEqual(code);
              expect(tx.payload.constructorArgs.length).toBe(constructorArgs.length);
              for (let i = 0; i < constructorArgs.length; i++) {
                expect(tx.payload.constructorArgs[i]).toEqual(constructorArgs[i]);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid call transaction parameters, building SHALL produce a transaction with all fields matching the input parameters', () => {
      fc.assert(
        fc.property(
          addressArb,
          nonceArb,
          gasLimitArb,
          gasPriceArb,
          timestampArb,
          parentsArb,
          addressArb,
          functionNameArb,
          valuesArb,
          (from, nonce, gasLimit, gasPrice, timestamp, parents, contract, functionName, args) => {
            const builder = new TransactionBuilder()
              .from(from)
              .nonce(nonce)
              .gasLimit(gasLimit)
              .gasPrice(gasPrice)
              .timestamp(timestamp)
              .parents(parents)
              .call(contract, functionName, args);

            const tx = builder.build();

            // Verify all fields match input parameters
            expect(tx.from.equals(from)).toBe(true);
            expect(tx.nonce).toBe(nonce);
            expect(tx.gasLimit).toBe(gasLimit);
            expect(tx.gasPrice).toBe(gasPrice);
            expect(tx.timestamp).toBe(timestamp);
            expect(tx.parents.length).toBe(parents.length);

            // Verify call payload
            expect(tx.payload.type).toBe('call');
            if (tx.payload.type === 'call') {
              expect(tx.payload.contract.equals(contract)).toBe(true);
              // Function selector should be computed from function name
              const expectedSelector = FunctionSelector.fromName(functionName);
              expect(tx.payload.function.equals(expectedSelector)).toBe(true);
              expect(tx.payload.args.length).toBe(args.length);
              for (let i = 0; i < args.length; i++) {
                expect(tx.payload.args[i]).toEqual(args[i]);
              }
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('timestamp SHALL be automatically set if not provided', () => {
      fc.assert(
        fc.property(
          addressArb,
          nonceArb,
          gasLimitArb,
          gasPriceArb,
          addressArb,
          amountArb,
          (from, nonce, gasLimit, gasPrice, to, amount) => {
            const beforeBuild = BigInt(Date.now());

            const builder = new TransactionBuilder()
              .from(from)
              .nonce(nonce)
              .gasLimit(gasLimit)
              .gasPrice(gasPrice)
              .transfer(to, amount);

            const tx = builder.build();

            const afterBuild = BigInt(Date.now());

            // Timestamp should be automatically set to current time
            expect(tx.timestamp).toBeGreaterThanOrEqual(beforeBuild);
            expect(tx.timestamp).toBeLessThanOrEqual(afterBuild);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('parents SHALL default to empty array if not provided', () => {
      fc.assert(
        fc.property(
          addressArb,
          nonceArb,
          gasLimitArb,
          gasPriceArb,
          timestampArb,
          addressArb,
          amountArb,
          (from, nonce, gasLimit, gasPrice, timestamp, to, amount) => {
            const builder = new TransactionBuilder()
              .from(from)
              .nonce(nonce)
              .gasLimit(gasLimit)
              .gasPrice(gasPrice)
              .timestamp(timestamp)
              .transfer(to, amount);

            const tx = builder.build();

            // Parents should default to empty array
            expect(tx.parents).toEqual([]);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 13: Transaction Validation Rejects Incomplete
  // **Validates: Requirements 3.9**
  describe('Property 13: Transaction Validation Rejects Incomplete', () => {
    it('building without "from" field SHALL return a validation error', () => {
      fc.assert(
        fc.property(
          nonceArb,
          gasLimitArb,
          gasPriceArb,
          addressArb,
          amountArb,
          (nonce, gasLimit, gasPrice, to, amount) => {
            const builder = new TransactionBuilder()
              // .from(from) - intentionally missing
              .nonce(nonce)
              .gasLimit(gasLimit)
              .gasPrice(gasPrice)
              .transfer(to, amount);

            expect(() => builder.build()).toThrow(TransactionError);
            try {
              builder.build();
            } catch (e) {
              expect(e).toBeInstanceOf(TransactionError);
              const txError = e as TransactionError;
              expect(txError.code).toBe(TransactionErrorCode.MISSING_FIELD);
              expect(txError.details?.missingFields).toContain('from');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('building without "nonce" field SHALL return a validation error', () => {
      fc.assert(
        fc.property(
          addressArb,
          gasLimitArb,
          gasPriceArb,
          addressArb,
          amountArb,
          (from, gasLimit, gasPrice, to, amount) => {
            const builder = new TransactionBuilder()
              .from(from)
              // .nonce(nonce) - intentionally missing
              .gasLimit(gasLimit)
              .gasPrice(gasPrice)
              .transfer(to, amount);

            expect(() => builder.build()).toThrow(TransactionError);
            try {
              builder.build();
            } catch (e) {
              expect(e).toBeInstanceOf(TransactionError);
              const txError = e as TransactionError;
              expect(txError.code).toBe(TransactionErrorCode.MISSING_FIELD);
              expect(txError.details?.missingFields).toContain('nonce');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('building without "gasLimit" field SHALL return a validation error', () => {
      fc.assert(
        fc.property(
          addressArb,
          nonceArb,
          gasPriceArb,
          addressArb,
          amountArb,
          (from, nonce, gasPrice, to, amount) => {
            const builder = new TransactionBuilder()
              .from(from)
              .nonce(nonce)
              // .gasLimit(gasLimit) - intentionally missing
              .gasPrice(gasPrice)
              .transfer(to, amount);

            expect(() => builder.build()).toThrow(TransactionError);
            try {
              builder.build();
            } catch (e) {
              expect(e).toBeInstanceOf(TransactionError);
              const txError = e as TransactionError;
              expect(txError.code).toBe(TransactionErrorCode.MISSING_FIELD);
              expect(txError.details?.missingFields).toContain('gasLimit');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('building without "gasPrice" field SHALL return a validation error', () => {
      fc.assert(
        fc.property(
          addressArb,
          nonceArb,
          gasLimitArb,
          addressArb,
          amountArb,
          (from, nonce, gasLimit, to, amount) => {
            const builder = new TransactionBuilder()
              .from(from)
              .nonce(nonce)
              .gasLimit(gasLimit)
              // .gasPrice(gasPrice) - intentionally missing
              .transfer(to, amount);

            expect(() => builder.build()).toThrow(TransactionError);
            try {
              builder.build();
            } catch (e) {
              expect(e).toBeInstanceOf(TransactionError);
              const txError = e as TransactionError;
              expect(txError.code).toBe(TransactionErrorCode.MISSING_FIELD);
              expect(txError.details?.missingFields).toContain('gasPrice');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('building without "payload" field SHALL return a validation error', () => {
      fc.assert(
        fc.property(
          addressArb,
          nonceArb,
          gasLimitArb,
          gasPriceArb,
          (from, nonce, gasLimit, gasPrice) => {
            const builder = new TransactionBuilder()
              .from(from)
              .nonce(nonce)
              .gasLimit(gasLimit)
              .gasPrice(gasPrice);
            // No payload set (no transfer, deploy, or call)

            expect(() => builder.build()).toThrow(TransactionError);
            try {
              builder.build();
            } catch (e) {
              expect(e).toBeInstanceOf(TransactionError);
              const txError = e as TransactionError;
              expect(txError.code).toBe(TransactionErrorCode.MISSING_FIELD);
              expect(txError.details?.missingFields).toContain('payload');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('building with multiple missing fields SHALL report all missing fields', () => {
      fc.assert(
        fc.property(
          addressArb,
          amountArb,
          (to, amount) => {
            // Only set payload, missing from, nonce, gasLimit, gasPrice
            const builder = new TransactionBuilder()
              .transfer(to, amount);

            expect(() => builder.build()).toThrow(TransactionError);
            try {
              builder.build();
            } catch (e) {
              expect(e).toBeInstanceOf(TransactionError);
              const txError = e as TransactionError;
              expect(txError.code).toBe(TransactionErrorCode.MISSING_FIELD);
              const missingFields = txError.details?.missingFields as string[];
              expect(missingFields).toContain('from');
              expect(missingFields).toContain('nonce');
              expect(missingFields).toContain('gasLimit');
              expect(missingFields).toContain('gasPrice');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('building an empty builder SHALL report all required fields as missing', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const builder = new TransactionBuilder();

          expect(() => builder.build()).toThrow(TransactionError);
          try {
            builder.build();
          } catch (e) {
            expect(e).toBeInstanceOf(TransactionError);
            const txError = e as TransactionError;
            expect(txError.code).toBe(TransactionErrorCode.MISSING_FIELD);
            const missingFields = txError.details?.missingFields as string[];
            expect(missingFields).toContain('from');
            expect(missingFields).toContain('nonce');
            expect(missingFields).toContain('gasLimit');
            expect(missingFields).toContain('gasPrice');
            expect(missingFields).toContain('payload');
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('validation errors SHALL have MISSING_FIELD error code', () => {
      fc.assert(
        fc.property(
          // Generate a random subset of fields to omit
          fc.record({
            includeFrom: fc.boolean(),
            includeNonce: fc.boolean(),
            includeGasLimit: fc.boolean(),
            includeGasPrice: fc.boolean(),
            includePayload: fc.boolean(),
          }).filter((r) => {
            // At least one field must be missing
            return !(r.includeFrom && r.includeNonce && r.includeGasLimit && r.includeGasPrice && r.includePayload);
          }),
          addressArb,
          nonceArb,
          gasLimitArb,
          gasPriceArb,
          addressArb,
          amountArb,
          (config, from, nonce, gasLimit, gasPrice, to, amount) => {
            let builder = new TransactionBuilder();

            if (config.includeFrom) builder = builder.from(from);
            if (config.includeNonce) builder = builder.nonce(nonce);
            if (config.includeGasLimit) builder = builder.gasLimit(gasLimit);
            if (config.includeGasPrice) builder = builder.gasPrice(gasPrice);
            if (config.includePayload) builder = builder.transfer(to, amount);

            expect(() => builder.build()).toThrow(TransactionError);
            try {
              builder.build();
            } catch (e) {
              expect(e).toBeInstanceOf(TransactionError);
              const txError = e as TransactionError;
              expect(txError.code).toBe(TransactionErrorCode.MISSING_FIELD);
              expect(txError.details?.missingFields).toBeDefined();
              expect(Array.isArray(txError.details?.missingFields)).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
