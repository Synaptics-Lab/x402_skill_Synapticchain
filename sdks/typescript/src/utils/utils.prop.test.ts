/**
 * Property-based tests for balance utilities
 *
 * Uses fast-check for property-based testing with minimum 100 iterations per property.
 *
 * Tests Properties 21, 22, and 26 from the design document.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  formatBalance,
  parseBalance,
  weiToSyn,
  synToWei,
  MAX_U256,
} from './index.js';
import { BalanceError } from '../errors/index.js';

// Minimum iterations per property as specified in design document
const NUM_RUNS = 100;

// Helper function to compute 10^n as bigint (avoids esbuild issues with ** operator)
function pow10(n: number): bigint {
  let result = 1n;
  for (let i = 0; i < n; i++) {
    result *= 10n;
  }
  return result;
}

// Pre-computed power constants
const POW10_18 = pow10(18);
const POW10_20 = pow10(20);
const POW10_30 = pow10(30);
const POW10_36 = pow10(36);
const POW10_50 = pow10(50);
const POW10_59 = pow10(59);
const POW10_72 = pow10(72);

/**
 * Custom arbitrary for generating valid U256 bigint values (0 to 2^256-1).
 * Uses a combination of strategies to cover the full range effectively.
 */
const u256Arb = fc.oneof(
  // Small values (common case)
  fc.bigInt({ min: 0n, max: POW10_36 }),
  // Medium values
  fc.bigInt({ min: POW10_36, max: POW10_72 }),
  // Large values approaching U256 max
  fc.bigInt({ min: POW10_72, max: MAX_U256 }),
  // Edge cases around powers of 10 (important for decimal formatting)
  fc.integer({ min: 0, max: 77 }).map((exp) => pow10(exp)),
  // Values near decimal boundaries
  fc.integer({ min: 0, max: 77 }).chain((exp) =>
    fc.bigInt({ min: 0n, max: POW10_18 }).map((offset) => {
      const base = pow10(exp);
      const result = base + offset;
      return result > MAX_U256 ? MAX_U256 : result;
    })
  ),
  // Specific edge cases
  fc.constantFrom(0n, 1n, MAX_U256, MAX_U256 - 1n, POW10_18, POW10_18 - 1n)
);

/**
 * Custom arbitrary for generating valid wei values that will round-trip correctly.
 * These are non-negative bigints within the U256 range.
 */
const validWeiArb = fc.bigInt({ min: 0n, max: MAX_U256 });

/**
 * Custom arbitrary for generating invalid balance strings.
 */
const invalidBalanceStringArb = fc.oneof(
  // Negative numbers
  fc.bigInt({ min: 1n, max: POW10_30 }).map((n) => `-${n.toString()}`),
  fc.float({ min: Math.fround(0.001), max: Math.fround(1000) }).map((n) => `-${n.toString()}`),
  // Non-numeric strings
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => {
    // Filter to strings that are definitely not valid numbers
    return !/^[0-9]+(\.[0-9]+)?$/.test(s.trim()) && s.trim() !== '';
  }),
  // Strings with invalid characters
  fc.constantFrom(
    'abc',
    '1.2.3',
    '1e18',
    '1,000',
    '.',
    '.5',
    '1.',
    '1..2',
    '++1',
    '--1',
    '1+2',
    '1-2',
    '1*2',
    '1/2',
    'NaN',
    'Infinity',
    '-Infinity',
    '0x1',
    '0b1',
    '0o1',
    '1_000',
    '1 000',
    '1.2e3',
    '1.2E3',
    '1.2e+3',
    '1.2e-3',
    '$100',
    '100$',
    '100%',
    'one',
    'zero',
    '①②③'
  ),
  // Empty or whitespace-only strings
  fc.constantFrom('', '   ', '\t', '\n', '\r\n'),
  // Strings with only special characters
  fc.constantFrom('!@#$%^&*()', '[]{}|\\', '<>?/~`')
);

describe('Balance Utilities Property Tests', () => {
  // Feature: synapticchain-sdks, Property 21: Balance Formatting Round-Trip
  // **Validates: Requirements 7.3, 7.4, 7.5**
  describe('Property 21: Balance Formatting Round-Trip', () => {
    it('for any valid wei value, parseBalance(formatBalance(units)) equals wei', () => {
      fc.assert(
        fc.property(validWeiArb, (units) => {
          // Format the wei value to a string
          const formatted = formatBalance(units);

          // Parse it back to wei
          const parsed = parseBalance(formatted);

          // Should equal the original value
          expect(parsed).toBe(units);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('round-trip should work with custom decimal places', () => {
      // Test with various decimal configurations
      const decimalsArb = fc.integer({ min: 0, max: 77 });

      fc.assert(
        fc.property(validWeiArb, decimalsArb, (wei, decimals) => {
          // Format with custom decimals
          const formatted = formatBalance(wei, decimals);

          // Parse back with same decimals
          const parsed = parseBalance(formatted, decimals);

          // Should equal the original value
          expect(parsed).toBe(units);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('weiToSyn and synToWei should round-trip correctly', () => {
      fc.assert(
        fc.property(validWeiArb, (units) => {
          // Convert wei to SYN string
          const syn = weiToSyn(units);

          // Convert back to wei
          const backToWei = synToWei(syn);

          // Should equal the original value
          expect(backToWei).toBe(units);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('formatted string should be parseable back to original value for edge cases', () => {
      // Test specific edge cases
      const edgeCases = [
        0n,
        1n,
        POW10_18, // 1 SYN
        POW10_18 - 1n, // Just under 1 SYN
        POW10_18 + 1n, // Just over 1 SYN
        POW10_36, // Large value
        MAX_U256,
        MAX_U256 - 1n,
      ];

      for (const wei of edgeCases) {
        const formatted = formatBalance(units);
        const parsed = parseBalance(formatted);
        expect(parsed).toBe(units);
      }
    });

    it('formatting should preserve precision for all 18 decimal places', () => {
      // Generate values that use all 18 decimal places
      const precisionArb = fc.bigInt({ min: 1n, max: POW10_18 - 1n });

      fc.assert(
        fc.property(precisionArb, (fractionalPart) => {
          // Create a value with a whole part and fractional part
          const wholePart = fc.sample(fc.bigInt({ min: 0n, max: POW10_20 }), 1)[0];
          const wei = wholePart * POW10_18 + fractionalPart;

          if (wei <= MAX_U256) {
            const formatted = formatBalance(units);
            const parsed = parseBalance(formatted);
            expect(parsed).toBe(units);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 22: Invalid Balance Rejection
  // **Validates: Requirements 7.6**
  describe('Property 22: Invalid Balance Rejection', () => {
    it('for any string that is not a valid decimal number, parsing as a balance SHALL return a parsing error', () => {
      fc.assert(
        fc.property(invalidBalanceStringArb, (invalidString) => {
          // Parsing should throw BalanceError
          expect(() => parseBalance(invalidString)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('negative balance strings should be rejected', () => {
      const negativeArb = fc.oneof(
        fc.bigInt({ min: 1n, max: POW10_50 }).map((n) => `-${n.toString()}`),
        fc.float({ min: Math.fround(0.000001), max: Math.fround(1000000) })
          .filter((n) => !isNaN(n) && isFinite(n))
          .map((n) => `-${n.toString()}`)
      );

      fc.assert(
        fc.property(negativeArb, (negativeString) => {
          expect(() => parseBalance(negativeString)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('strings with too many decimal places should be rejected', () => {
      // Generate strings with more than 18 decimal places
      const tooManyDecimalsArb = fc
        .integer({ min: 19, max: 30 })
        .chain((numDecimals) =>
          fc.tuple(
            fc.bigInt({ min: 0n, max: pow10(10) }),
            fc.bigInt({ min: 1n, max: pow10(numDecimals) - 1n })
          ).map(([whole, frac]) => {
            const fracStr = frac.toString().padStart(numDecimals, '0');
            return `${whole}.${fracStr}`;
          })
        );

      fc.assert(
        fc.property(tooManyDecimalsArb, (tooManyDecimals) => {
          expect(() => parseBalance(tooManyDecimals)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('strings with multiple decimal points should be rejected', () => {
      const multipleDecimalsArb = fc.tuple(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 })
      ).map(([a, b, c]) => `${a}.${b}.${c}`);

      fc.assert(
        fc.property(multipleDecimalsArb, (multipleDecimals) => {
          expect(() => parseBalance(multipleDecimals)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('strings with scientific notation should be rejected', () => {
      const scientificArb = fc.oneof(
        fc.tuple(fc.float({ min: Math.fround(0.1), max: Math.fround(100) }), fc.integer({ min: -10, max: 10 }))
          .filter(([base]) => !isNaN(base) && isFinite(base))
          .map(([base, exp]) => `${base}e${exp}`),
        fc.tuple(fc.float({ min: Math.fround(0.1), max: Math.fround(100) }), fc.integer({ min: -10, max: 10 }))
          .filter(([base]) => !isNaN(base) && isFinite(base))
          .map(([base, exp]) => `${base}E${exp >= 0 ? '+' : ''}${exp}`)
      );

      fc.assert(
        fc.property(scientificArb, (scientific) => {
          expect(() => parseBalance(scientific)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('strings with leading decimal point should be rejected', () => {
      const leadingDecimalArb = fc.integer({ min: 1, max: 999999 }).map((n) => `.${n}`);

      fc.assert(
        fc.property(leadingDecimalArb, (leadingDecimal) => {
          expect(() => parseBalance(leadingDecimal)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('strings with trailing decimal point should be rejected', () => {
      const trailingDecimalArb = fc.integer({ min: 0, max: 999999 }).map((n) => `${n}.`);

      fc.assert(
        fc.property(trailingDecimalArb, (trailingDecimal) => {
          expect(() => parseBalance(trailingDecimal)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('non-string inputs should be rejected', () => {
      const nonStringArb = fc.oneof(
        fc.integer(),
        fc.bigInt(),
        fc.float(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.array(fc.integer()),
        fc.object()
      );

      fc.assert(
        fc.property(nonStringArb, (nonString) => {
          // @ts-expect-error Testing invalid input types
          expect(() => parseBalance(nonString)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('formatBalance should reject negative bigint values', () => {
      // Use helper function to avoid esbuild parsing issues with ** operator
      const minNegative = -POW10_50;
      const negativeBigintArb = fc.bigInt({ min: minNegative, max: -1n });

      fc.assert(
        fc.property(negativeBigintArb, (negative) => {
          expect(() => formatBalance(negative)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('formatBalance should reject non-bigint inputs', () => {
      const nonBigintArb = fc.oneof(
        fc.integer(),
        fc.float(),
        fc.string(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined)
      );

      fc.assert(
        fc.property(nonBigintArb, (nonBigint) => {
          // @ts-expect-error Testing invalid input types
          expect(() => formatBalance(nonBigint)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 26: U256 Balance Representation
  // **Validates: Requirements 7.2**
  describe('Property 26: U256 Balance Representation', () => {
    it('balance values should correctly represent the full U256 range (0 to 2^256-1)', () => {
      fc.assert(
        fc.property(u256Arb, (value) => {
          // Value should be within U256 range
          expect(value >= 0n).toBe(true);
          expect(value <= MAX_U256).toBe(true);

          // Should be able to format without error
          const formatted = formatBalance(value);
          expect(typeof formatted).toBe('string');
          expect(formatted.length).toBeGreaterThan(0);

          // Should be able to parse back without error
          const parsed = parseBalance(formatted);
          expect(parsed).toBe(value);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('should handle values at U256 boundaries correctly', () => {
      // Test specific boundary values
      const boundaryValues = [
        0n, // Minimum
        1n, // Just above minimum
        MAX_U256 - 1n, // Just below maximum
        MAX_U256, // Maximum (2^256 - 1)
        1n << 128n, // Middle of range (2^128)
        1n << 64n, // u64 max (2^64)
        1n << 32n, // u32 max (2^32)
        1n << 16n, // u16 max (2^16)
        1n << 8n, // u8 max (2^8)
      ];

      for (const value of boundaryValues) {
        // Format should work
        const formatted = formatBalance(value);
        expect(typeof formatted).toBe('string');

        // Parse should return original value
        const parsed = parseBalance(formatted);
        expect(parsed).toBe(value);
      }
    });

    it('should handle values that span multiple decimal magnitudes', () => {
      // Test values at different orders of magnitude
      const magnitudeArb = fc.integer({ min: 0, max: 77 }).map((exp) => pow10(exp));

      fc.assert(
        fc.property(magnitudeArb, (value) => {
          if (value <= MAX_U256) {
            const formatted = formatBalance(value);
            const parsed = parseBalance(formatted);
            expect(parsed).toBe(value);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('should correctly represent values with maximum precision', () => {
      // Generate values that use all available precision
      const maxPrecisionArb = fc.tuple(
        fc.bigInt({ min: 0n, max: POW10_59 }), // Whole part (up to ~10^59 to stay in U256)
        fc.bigInt({ min: 0n, max: POW10_18 - 1n }) // Fractional part (18 decimals)
      ).map(([whole, frac]) => whole * POW10_18 + frac);

      fc.assert(
        fc.property(maxPrecisionArb, (value) => {
          if (value <= MAX_U256) {
            const formatted = formatBalance(value);
            const parsed = parseBalance(formatted);
            expect(parsed).toBe(value);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('should reject values exceeding U256 range', () => {
      // Generate values that exceed U256
      const overflowArb = fc.bigInt({ min: 1n, max: POW10_20 }).map((offset) => MAX_U256 + offset);

      fc.assert(
        fc.property(overflowArb, (overflow) => {
          // Converting to string and parsing should throw overflow error
          const overflowStr = overflow.toString();
          expect(() => parseBalance(overflowStr, 0)).toThrow(BalanceError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('should handle arithmetic operations without precision loss', () => {
      // Test that values can be added/subtracted without precision loss
      const valueArb = fc.bigInt({ min: 0n, max: MAX_U256 / 2n });

      fc.assert(
        fc.property(valueArb, valueArb, (a, b) => {
          const sum = a + b;
          if (sum <= MAX_U256) {
            // Format and parse sum
            const formattedSum = formatBalance(sum);
            const parsedSum = parseBalance(formattedSum);
            expect(parsedSum).toBe(sum);

            // Format and parse individual values, then add
            const formattedA = formatBalance(a);
            const formattedB = formatBalance(b);
            const parsedA = parseBalance(formattedA);
            const parsedB = parseBalance(formattedB);
            expect(parsedA + parsedB).toBe(sum);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('should maintain ordering after round-trip', () => {
      // Test that a < b implies parseBalance(formatBalance(a)) < parseBalance(formatBalance(b))
      const valueArb = fc.bigInt({ min: 0n, max: MAX_U256 });

      fc.assert(
        fc.property(valueArb, valueArb, (a, b) => {
          const parsedA = parseBalance(formatBalance(a));
          const parsedB = parseBalance(formatBalance(b));

          if (a < b) {
            expect(parsedA < parsedB).toBe(true);
          } else if (a > b) {
            expect(parsedA > parsedB).toBe(true);
          } else {
            expect(parsedA === parsedB).toBe(true);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('should handle the exact MAX_U256 value', () => {
      // MAX_U256 = 2^256 - 1
      const formatted = formatBalance(MAX_U256);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);

      const parsed = parseBalance(formatted);
      expect(parsed).toBe(MAX_U256);
    });

    it('should handle zero correctly', () => {
      const formatted = formatBalance(0n);
      expect(formatted).toBe('0');

      const parsed = parseBalance('0');
      expect(parsed).toBe(0n);

      // Various zero representations
      expect(parseBalance('0.0')).toBe(0n);
      expect(parseBalance('0.000000000000000000')).toBe(0n);
      expect(parseBalance('00')).toBe(0n);
      expect(parseBalance('000.000')).toBe(0n);
    });
  });
});
