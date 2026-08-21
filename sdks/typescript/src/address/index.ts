/**
 * Address module for SynapticChain SDK
 *
 * Handles address derivation and Bech32m encoding/decoding.
 *
 * @module address
 */

import { bech32m } from 'bech32';
import { AddressError, AddressErrorCode } from '../errors/index.js';

/** Length of address in bytes */
export const ADDRESS_BYTE_LENGTH = 20;

/** Expected length of Bech32m encoded address string */
export const ADDRESS_STRING_LENGTH = 42;

/**
 * Address class for SynapticChain.
 *
 * Addresses are 20-byte identifiers derived from public keys, encoded using
 * Bech32m with the "syn" prefix. The encoded format is "syn1..." with exactly
 * 42 characters.
 *
 * @example
 * ```typescript
 * // Create from Bech32m string
 * const address = Address.fromBech32('syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw0te');
 *
 * // Create from hex string
 * const address2 = Address.fromHex('0000000000000000000000000000000000000000');
 *
 * // Create from bytes
 * const address3 = Address.fromBytes(new Uint8Array(20));
 *
 * // Get zero address
 * const zeroAddr = Address.zero();
 *
 * // Convert to different formats
 * console.log(address.toBech32());  // "syn1..."
 * console.log(address.toHex());     // "0000..."
 * console.log(address.toBytes());   // Uint8Array(20)
 *
 * // Compare addresses
 * console.log(address.equals(address2));  // true
 * console.log(address.isZero());          // true
 * ```
 */
export class Address {
  /** The Bech32m prefix for SynapticChain addresses */
  static readonly PREFIX = 'syn';

  /** The raw 20-byte address data */
  private readonly _bytes: Uint8Array;

  /**
   * Creates a new Address from raw bytes.
   *
   * @param bytes - 20-byte address data
   * @throws {AddressError} If bytes is not exactly 20 bytes
   *
   * @example
   * ```typescript
   * const bytes = new Uint8Array(20);
   * const address = new Address(bytes);
   * ```
   */
  constructor(bytes: Uint8Array) {
    if (bytes.length !== ADDRESS_BYTE_LENGTH) {
      throw new AddressError(
        AddressErrorCode.INVALID_LENGTH,
        `Address must be ${ADDRESS_BYTE_LENGTH} bytes, got ${bytes.length}`,
        { expected: ADDRESS_BYTE_LENGTH, actual: bytes.length }
      );
    }
    // Make a copy to prevent external mutation
    this._bytes = new Uint8Array(bytes);
  }

  /**
   * Creates an Address from a Bech32m encoded string.
   *
   * @param encoded - Bech32m encoded address string (e.g., "syn1...")
   * @returns The decoded Address
   * @throws {AddressError} If the string is not valid Bech32m, has wrong prefix, or wrong length
   *
   * @example
   * ```typescript
   * const address = Address.fromBech32('syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw0te');
   * ```
   */
  static fromBech32(encoded: string): Address {
    let decoded;
    try {
      decoded = bech32m.decode(encoded);
    } catch (error) {
      // Determine if it's a checksum error or other decoding error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('checksum')) {
        throw new AddressError(
          AddressErrorCode.INVALID_CHECKSUM,
          `Invalid Bech32m checksum: ${errorMessage}`,
          { encoded }
        );
      }
      throw new AddressError(
        AddressErrorCode.INVALID_BECH32,
        `Invalid Bech32m encoding: ${errorMessage}`,
        { encoded }
      );
    }

    // Validate prefix
    if (decoded.prefix !== Address.PREFIX) {
      throw new AddressError(
        AddressErrorCode.INVALID_PREFIX,
        `Invalid address prefix: expected "${Address.PREFIX}", got "${decoded.prefix}"`,
        { expected: Address.PREFIX, actual: decoded.prefix }
      );
    }

    // Convert from 5-bit words to 8-bit bytes
    const bytes = bech32m.fromWords(decoded.words);

    // Validate length
    if (bytes.length !== ADDRESS_BYTE_LENGTH) {
      throw new AddressError(
        AddressErrorCode.INVALID_LENGTH,
        `Invalid address data length: expected ${ADDRESS_BYTE_LENGTH} bytes, got ${bytes.length}`,
        { expected: ADDRESS_BYTE_LENGTH, actual: bytes.length }
      );
    }

    return new Address(new Uint8Array(bytes));
  }

  /**
   * Creates an Address from a hex-encoded string.
   *
   * @param hex - Hex-encoded address string (with or without 0x prefix)
   * @returns The decoded Address
   * @throws {AddressError} If the hex string is invalid or wrong length
   *
   * @example
   * ```typescript
   * const address = Address.fromHex('0000000000000000000000000000000000000000');
   * const address2 = Address.fromHex('0x0000000000000000000000000000000000000000');
   * ```
   */
  static fromHex(hex: string): Address {
    // Remove 0x prefix if present
    const cleanHex = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;

    // Validate hex string
    if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
      throw new AddressError(
        AddressErrorCode.INVALID_BECH32,
        'Invalid hex string: contains non-hex characters',
        { hex }
      );
    }

    // Validate length (20 bytes = 40 hex characters)
    if (cleanHex.length !== ADDRESS_BYTE_LENGTH * 2) {
      throw new AddressError(
        AddressErrorCode.INVALID_LENGTH,
        `Invalid hex length: expected ${ADDRESS_BYTE_LENGTH * 2} characters, got ${cleanHex.length}`,
        { expected: ADDRESS_BYTE_LENGTH * 2, actual: cleanHex.length }
      );
    }

    // Convert hex to bytes
    const bytes = new Uint8Array(ADDRESS_BYTE_LENGTH);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
    }

    return new Address(bytes);
  }

  /**
   * Creates an Address from a Uint8Array.
   *
   * This is an alias for the constructor, provided for API consistency.
   *
   * @param bytes - 20-byte address data
   * @returns The Address
   * @throws {AddressError} If bytes is not exactly 20 bytes
   *
   * @example
   * ```typescript
   * const bytes = new Uint8Array(20);
   * const address = Address.fromBytes(bytes);
   * ```
   */
  static fromBytes(bytes: Uint8Array): Address {
    return new Address(bytes);
  }

  /**
   * Creates a zero address (all bytes are 0).
   *
   * @returns The zero address
   *
   * @example
   * ```typescript
   * const zeroAddr = Address.zero();
   * console.log(zeroAddr.isZero());  // true
   * ```
   */
  static zero(): Address {
    return new Address(new Uint8Array(ADDRESS_BYTE_LENGTH));
  }

  /**
   * Encodes the address as a Bech32m string.
   *
   * @returns Bech32m encoded address string (e.g., "syn1...")
   *
   * @example
   * ```typescript
   * const address = Address.zero();
   * console.log(address.toBech32());  // "syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw0te"
   * ```
   */
  toBech32(): string {
    const words = bech32m.toWords(this._bytes);
    return bech32m.encode(Address.PREFIX, words);
  }

  /**
   * Encodes the address as a hex string.
   *
   * @returns Hex-encoded address string (lowercase, no prefix)
   *
   * @example
   * ```typescript
   * const address = Address.zero();
   * console.log(address.toHex());  // "0000000000000000000000000000000000000000"
   * ```
   */
  toHex(): string {
    return Array.from(this._bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Returns the raw 20-byte address data.
   *
   * @returns A copy of the 20-byte address data
   *
   * @example
   * ```typescript
   * const address = Address.zero();
   * const bytes = address.toBytes();
   * console.log(bytes.length);  // 20
   * ```
   */
  toBytes(): Uint8Array {
    // Return a copy to prevent external mutation
    return new Uint8Array(this._bytes);
  }

  /**
   * Checks if this is the zero address (all bytes are 0).
   *
   * @returns true if all bytes are 0, false otherwise
   *
   * @example
   * ```typescript
   * const zeroAddr = Address.zero();
   * console.log(zeroAddr.isZero());  // true
   *
   * const nonZero = Address.fromHex('0000000000000000000000000000000000000001');
   * console.log(nonZero.isZero());  // false
   * ```
   */
  isZero(): boolean {
    return this._bytes.every((b) => b === 0);
  }

  /**
   * Compares this address with another for equality.
   *
   * @param other - The address to compare with
   * @returns true if the addresses are equal, false otherwise
   *
   * @example
   * ```typescript
   * const addr1 = Address.zero();
   * const addr2 = Address.zero();
   * const addr3 = Address.fromHex('0000000000000000000000000000000000000001');
   *
   * console.log(addr1.equals(addr2));  // true
   * console.log(addr1.equals(addr3));  // false
   * ```
   */
  equals(other: Address): boolean {
    if (this._bytes.length !== other._bytes.length) {
      return false;
    }
    for (let i = 0; i < this._bytes.length; i++) {
      if (this._bytes[i] !== other._bytes[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns the Bech32m encoded string representation.
   *
   * @returns Bech32m encoded address string
   */
  toString(): string {
    return this.toBech32();
  }
}
