/**
 * Unit tests for balance formatting utilities
 */

import { describe, it, expect } from 'vitest';
import {
  formatBalance,
  parseBalance,
  weiToSyn,
  synToWei,
  SYN_DECIMALS,
  MAX_U256,
  WEI_PER_SYN,
} from './index.js';
import { BalanceError, BalanceErrorCode } from '../errors/index.js';

describe('Balance Utilities', () => {
  describe('Constants', () => {
    it('should have correct SYN_DECIMALS', () => {
      expect(SYN_DECIMALS).toBe(18);
    });

    it('should have correct MAX_U256', () => {
      expect(MAX_U256).toBe((1n << 256n) - 1n);
    });

    it('should have correct WEI_PER_SYN', () => {
      expect(WEI_PER_SYN).toBe(10n ** 18n);
    });
  });

  describe('formatBalance', () => {
    it('should format zero correctly', () => {
      expect(formatBalance(0n)).toBe('0');
    });

    it('should format whole numbers correctly', () => {
      expect(formatBalance(1000000000000000000n)).toBe('1');
      expect(formatBalance(2000000000000000000n)).toBe('2');
      expect(formatBalance(100000000000000000000n)).toBe('100');
    });

    it('should format fractional amounts correctly', () => {
      expect(formatBalance(1500000000000000000n)).toBe('1.5');
      expect(formatBalance(1230000000000000000n)).toBe('1.23');
      expect(formatBalance(1234567890000000000n)).toBe('1.23456789');
    });

    it('should format amounts less than 1 correctly', () => {
      expect(formatBalance(500000000000000000n)).toBe('0.5');
      expect(formatBalance(100000000000000000n)).toBe('0.1');
      expect(formatBalance(1000000000000000n)).toBe('0.001');
      expect(formatBalance(1n)).toBe('0.000000000000000001');
    });

    it('should handle very large numbers (U256 range)', () => {
      const largeValue = MAX_U256;
      const result = formatBalance(largeValue);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should remove trailing zeros from fractional part', () => {
      expect(formatBalance(1100000000000000000n)).toBe('1.1');
      expect(formatBalance(1010000000000000000n)).toBe('1.01');
    });

    it('should handle custom decimals', () => {
      expect(formatBalance(1000n, 3)).toBe('1');
      expect(formatBalance(1500n, 3)).toBe('1.5');
      expect(formatBalance(1n, 3)).toBe('0.001');
    });

    it('should handle zero decimals', () => {
      expect(formatBalance(123n, 0)).toBe('123');
      expect(formatBalance(0n, 0)).toBe('0');
    });

    it('should throw BalanceError for negative values', () => {
      expect(() => formatBalance(-1n)).toThrow(BalanceError);
      expect(() => formatBalance(-1n)).toThrow(/cannot be negative/);
    });

    it('should throw BalanceError for invalid decimals', () => {
      expect(() => formatBalance(1n, -1)).toThrow(BalanceError);
      expect(() => formatBalance(1n, 1.5)).toThrow(BalanceError);
      expect(() => formatBalance(1n, 78)).toThrow(BalanceError);
    });

    it('should throw BalanceError for non-bigint input', () => {
      // @ts-expect-error Testing invalid input
      expect(() => formatBalance(123)).toThrow(BalanceError);
      // @ts-expect-error Testing invalid input
      expect(() => formatBalance('123')).toThrow(BalanceError);
    });
  });

  describe('parseBalance', () => {
    it('should parse zero correctly', () => {
      expect(parseBalance('0')).toBe(0n);
      expect(parseBalance('0.0')).toBe(0n);
      expect(parseBalance('0.000000000000000000')).toBe(0n);
    });

    it('should parse whole numbers correctly', () => {
      expect(parseBalance('1')).toBe(1000000000000000000n);
      expect(parseBalance('2')).toBe(2000000000000000000n);
      expect(parseBalance('100')).toBe(100000000000000000000n);
    });

    it('should parse fractional amounts correctly', () => {
      expect(parseBalance('1.5')).toBe(1500000000000000000n);
      expect(parseBalance('1.23')).toBe(1230000000000000000n);
      expect(parseBalance('1.23456789')).toBe(1234567890000000000n);
    });

    it('should parse amounts less than 1 correctly', () => {
      expect(parseBalance('0.5')).toBe(500000000000000000n);
      expect(parseBalance('0.1')).toBe(100000000000000000n);
      expect(parseBalance('0.001')).toBe(1000000000000000n);
      expect(parseBalance('0.000000000000000001')).toBe(1n);
    });

    it('should handle leading zeros in whole part', () => {
      expect(parseBalance('01')).toBe(1000000000000000000n);
      expect(parseBalance('001.5')).toBe(1500000000000000000n);
    });

    it('should handle trailing zeros in fractional part', () => {
      expect(parseBalance('1.50')).toBe(1500000000000000000n);
      expect(parseBalance('1.500000000000000000')).toBe(1500000000000000000n);
    });

    it('should handle custom decimals', () => {
      expect(parseBalance('1', 3)).toBe(1000n);
      expect(parseBalance('1.5', 3)).toBe(1500n);
      expect(parseBalance('0.001', 3)).toBe(1n);
    });

    it('should handle zero decimals', () => {
      expect(parseBalance('123', 0)).toBe(123n);
      expect(parseBalance('0', 0)).toBe(0n);
    });

    it('should trim whitespace', () => {
      expect(parseBalance('  1  ')).toBe(1000000000000000000n);
      expect(parseBalance('\t1.5\n')).toBe(1500000000000000000n);
    });

    it('should throw BalanceError for empty string', () => {
      expect(() => parseBalance('')).toThrow(BalanceError);
      expect(() => parseBalance('   ')).toThrow(BalanceError);
    });

    it('should throw BalanceError for negative values', () => {
      expect(() => parseBalance('-1')).toThrow(BalanceError);
      expect(() => parseBalance('-0.5')).toThrow(BalanceError);
    });

    it('should throw BalanceError for invalid format', () => {
      expect(() => parseBalance('abc')).toThrow(BalanceError);
      expect(() => parseBalance('1.2.3')).toThrow(BalanceError);
      expect(() => parseBalance('1e18')).toThrow(BalanceError);
      expect(() => parseBalance('1,000')).toThrow(BalanceError);
      expect(() => parseBalance('.')).toThrow(BalanceError);
      expect(() => parseBalance('.5')).toThrow(BalanceError);
      expect(() => parseBalance('1.')).toThrow(BalanceError);
    });

    it('should throw BalanceError for too many decimal places', () => {
      expect(() => parseBalance('1.0000000000000000001')).toThrow(BalanceError);
      expect(() => parseBalance('0.0000000000000000001')).toThrow(BalanceError);
    });

    it('should throw BalanceError for invalid decimals', () => {
      expect(() => parseBalance('1', -1)).toThrow(BalanceError);
      expect(() => parseBalance('1', 1.5)).toThrow(BalanceError);
      expect(() => parseBalance('1', 78)).toThrow(BalanceError);
    });

    it('should throw BalanceError for non-string input', () => {
      // @ts-expect-error Testing invalid input
      expect(() => parseBalance(123)).toThrow(BalanceError);
      // @ts-expect-error Testing invalid input
      expect(() => parseBalance(123n)).toThrow(BalanceError);
    });

    it('should throw BalanceError for U256 overflow', () => {
      // MAX_U256 + 1 in decimal form would overflow
      const overflowValue = (MAX_U256 + 1n).toString();
      expect(() => parseBalance(overflowValue, 0)).toThrow(BalanceError);
      expect(() => parseBalance(overflowValue, 0)).toThrow(/exceeds maximum/);
    });
  });

  describe('weiToSyn', () => {
    it('should convert wei to SYN correctly', () => {
      expect(weiToSyn(0n)).toBe('0');
      expect(weiToSyn(1000000000000000000n)).toBe('1');
      expect(weiToSyn(1500000000000000000n)).toBe('1.5');
      expect(weiToSyn(1n)).toBe('0.000000000000000001');
    });

    it('should handle large values', () => {
      expect(weiToSyn(1000000000000000000000n)).toBe('1000');
      expect(weiToSyn(1234567890123456789012345678901234567890n)).toBeTruthy();
    });

    it('should throw for negative values', () => {
      expect(() => weiToSyn(-1n)).toThrow(BalanceError);
    });
  });

  describe('synToWei', () => {
    it('should convert SYN to wei correctly', () => {
      expect(synToWei('0')).toBe(0n);
      expect(synToWei('1')).toBe(1000000000000000000n);
      expect(synToWei('1.5')).toBe(1500000000000000000n);
      expect(synToWei('0.000000000000000001')).toBe(1n);
    });

    it('should handle large values', () => {
      expect(synToWei('1000')).toBe(1000000000000000000000n);
    });

    it('should throw for invalid format', () => {
      expect(() => synToWei('')).toThrow(BalanceError);
      expect(() => synToWei('abc')).toThrow(BalanceError);
      expect(() => synToWei('-1')).toThrow(BalanceError);
    });
  });

  describe('Round-trip conversions', () => {
    it('should round-trip formatBalance and parseBalance', () => {
      const testValues = [
        0n,
        1n,
        1000000000000000000n,
        1500000000000000000n,
        123456789012345678n,
        MAX_U256,
      ];

      for (const value of testValues) {
        const formatted = formatBalance(value);
        const parsed = parseBalance(formatted);
        expect(parsed).toBe(value);
      }
    });

    it('should round-trip weiToSyn and synToWei', () => {
      const testValues = [
        0n,
        1n,
        1000000000000000000n,
        1500000000000000000n,
        123456789012345678n,
      ];

      for (const value of testValues) {
        const syn = weiToSyn(value);
        const wei = synToWei(syn);
        expect(units).toBe(value);
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle maximum precision (18 decimal places)', () => {
      const value = 123456789012345678n;
      const formatted = formatBalance(value);
      expect(formatted).toBe('0.123456789012345678');
      expect(parseBalance(formatted)).toBe(value);
    });

    it('should handle very small fractions', () => {
      expect(formatBalance(1n)).toBe('0.000000000000000001');
      expect(parseBalance('0.000000000000000001')).toBe(1n);
    });

    it('should handle values at U256 boundary', () => {
      const formatted = formatBalance(MAX_U256);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });
  });
});
