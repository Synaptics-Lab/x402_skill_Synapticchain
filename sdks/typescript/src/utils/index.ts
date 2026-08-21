/**
 * Utils module for SynapticChain SDK
 *
 * Unit conversion and formatting utilities for balance operations.
 *
 * @module utils
 */

import { BalanceError, BalanceErrorCode } from '../errors/index.js';

/**
 * Default number of decimals for SYN token (18 decimals like ETH).
 */
export const SYN_DECIMALS = 18;

/**
 * Maximum value for U256 (2^256 - 1).
 */
export const MAX_U256 = (1n << 256n) - 1n;

/**
 * Conversion factor from wei to SYN (10^18).
 */
export const WEI_PER_SYN = 10n ** BigInt(SYN_DECIMALS);

/**
 * Formats a wei balance as a human-readable string with decimal notation.
 *
 * @param wei - The balance in units (smallest unit) as bigint
 * @param decimals - Number of decimal places (default: 18 for SYN)
 * @returns A string representation with decimal notation (e.g., "1.5" for 1.5 SYN)
 * @throws {BalanceError} If wei is negative or decimals is invalid
 *
 * @example
 * ```typescript
 * formatBalance(1000000000000000000n); // "1"
 * formatBalance(1500000000000000000n); // "1.5"
 * formatBalance(123456789012345678n);  // "0.123456789012345678"
 * formatBalance(0n);                   // "0"
 * ```
 */
export function formatBalance(wei: bigint, decimals: number = SYN_DECIMALS): string {
  // Validate inputs
  if (typeof wei !== 'bigint') {
    throw new BalanceError(
      BalanceErrorCode.INVALID_FORMAT,
      'Wei value must be a bigint',
      { value: String(wei) }
    );
  }

  if (wei < 0n) {
    throw new BalanceError(
      BalanceErrorCode.NEGATIVE_VALUE,
      'Wei value cannot be negative',
      { value: wei.toString() }
    );
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
    throw new BalanceError(
      BalanceErrorCode.INVALID_DECIMALS,
      'Decimals must be a non-negative integer not exceeding 77',
      { decimals }
    );
  }

  // Handle zero decimals case
  if (decimals === 0) {
    return wei.toString();
  }

  const divisor = 10n ** BigInt(decimals);
  const wholePart = wei / divisor;
  const fractionalPart = wei % divisor;

  // If no fractional part, return just the whole number
  if (fractionalPart === 0n) {
    return wholePart.toString();
  }

  // Format fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');

  // Remove trailing zeros from fractional part
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  return `${wholePart}.${trimmedFractional}`;
}

/**
 * Parses a human-readable balance string into units (bigint).
 *
 * @param str - The balance string with decimal notation (e.g., "1.5")
 * @param decimals - Number of decimal places (default: 18 for SYN)
 * @returns The balance in units as bigint
 * @throws {BalanceError} If the string format is invalid
 *
 * @example
 * ```typescript
 * parseBalance("1");     // 1000000000000000000n
 * parseBalance("1.5");   // 1500000000000000000n
 * parseBalance("0.001"); // 1000000000000000n
 * parseBalance("0");     // 0n
 * ```
 */
export function parseBalance(str: string, decimals: number = SYN_DECIMALS): bigint {
  // Validate input is a string FIRST (before any other operations)
  if (typeof str !== 'string') {
    throw new BalanceError(
      BalanceErrorCode.INVALID_FORMAT,
      'Balance must be a string',
      { value: typeof str }
    );
  }

  // Validate decimals
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
    throw new BalanceError(
      BalanceErrorCode.INVALID_DECIMALS,
      'Decimals must be a non-negative integer not exceeding 77',
      { decimals }
    );
  }

  // Trim whitespace
  const trimmed = str.trim();

  // Check for empty string
  if (trimmed === '') {
    throw new BalanceError(
      BalanceErrorCode.INVALID_FORMAT,
      'Balance string cannot be empty',
      { value: str }
    );
  }

  // Check for negative values
  if (trimmed.startsWith('-')) {
    throw new BalanceError(
      BalanceErrorCode.NEGATIVE_VALUE,
      'Balance cannot be negative',
      { value: str }
    );
  }

  // Validate format: only digits and at most one decimal point
  const validPattern = /^[0-9]+(\.[0-9]+)?$/;
  if (!validPattern.test(trimmed)) {
    throw new BalanceError(
      BalanceErrorCode.INVALID_FORMAT,
      'Invalid balance format. Expected a decimal number (e.g., "1.5" or "100")',
      { value: str }
    );
  }

  // Split into whole and fractional parts
  const parts = trimmed.split('.');
  const wholePart = parts[0];
  const fractionalPart = parts[1] || '';

  // Check if fractional part exceeds allowed decimals
  if (fractionalPart.length > decimals) {
    throw new BalanceError(
      BalanceErrorCode.INVALID_FORMAT,
      `Too many decimal places. Maximum allowed: ${decimals}`,
      { value: str, decimals, actualDecimals: fractionalPart.length }
    );
  }

  // Pad fractional part with zeros to match decimals
  const paddedFractional = fractionalPart.padEnd(decimals, '0');

  // Combine and convert to bigint
  const combined = wholePart + paddedFractional;

  // Remove leading zeros (but keep at least one digit)
  const normalized = combined.replace(/^0+/, '') || '0';

  const result = BigInt(normalized);

  // Check for U256 overflow
  if (result > MAX_U256) {
    throw new BalanceError(
      BalanceErrorCode.OVERFLOW,
      'Balance exceeds maximum U256 value',
      { value: str, max: MAX_U256.toString() }
    );
  }

  return result;
}

/**
 * Converts wei to SYN (1 SYN = 10^18 wei).
 *
 * @param wei - The amount in units as bigint
 * @returns The amount in SYN as a string with decimal notation
 * @throws {BalanceError} If wei is negative
 *
 * @example
 * ```typescript
 * weiToSyn(1000000000000000000n); // "1"
 * weiToSyn(1500000000000000000n); // "1.5"
 * weiToSyn(1n);                   // "0.000000000000000001"
 * ```
 */
export function weiToSyn(wei: bigint): string {
  return formatBalance(wei, SYN_DECIMALS);
}

/**
 * Converts SYN to units (1 SYN = 10^18 wei).
 *
 * @param syn - The amount in SYN as a string with decimal notation
 * @returns The amount in units as bigint
 * @throws {BalanceError} If the string format is invalid
 *
 * @example
 * ```typescript
 * synToWei("1");   // 1000000000000000000n
 * synToWei("1.5"); // 1500000000000000000n
 * synToWei("0.1"); // 100000000000000000n
 * ```
 */
export function synToWei(syn: string): bigint {
  return parseBalance(syn, SYN_DECIMALS);
}
