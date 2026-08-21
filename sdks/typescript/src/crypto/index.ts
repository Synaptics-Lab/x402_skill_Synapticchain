/**
 * Crypto module for SynapticChain SDK
 *
 * Provides cryptographic primitives using Ed25519 for signatures and SHA3-256 for hashing.
 *
 * @module crypto
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha3_256 } from '@noble/hashes/sha3';
import { CryptoError, CryptoErrorCode } from '../errors/index.js';

// Configure @noble/ed25519 to use sha512 for synchronous operations
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

/** Length of Ed25519 private key in bytes */
export const PRIVATE_KEY_LENGTH = 32;

/** Length of Ed25519 public key in bytes */
export const PUBLIC_KEY_LENGTH = 32;

/** Length of Ed25519 signature in bytes */
export const SIGNATURE_LENGTH = 64;

/** Length of address in bytes (last 20 bytes of SHA3-256 hash) */
export const ADDRESS_LENGTH = 20;

/**
 * Converts a Uint8Array to a hex string.
 * @param bytes - The bytes to convert
 * @returns Hex-encoded string (lowercase, no prefix)
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a hex string to a Uint8Array.
 * @param hex - Hex-encoded string (with or without 0x prefix)
 * @returns The decoded bytes
 * @throws {CryptoError} If the hex string is invalid
 */
export function hexToBytes(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;

  if (cleanHex.length % 2 !== 0) {
    throw new CryptoError(
      CryptoErrorCode.INVALID_KEY_LENGTH,
      'Hex string must have even length',
      { hex }
    );
  }

  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new CryptoError(
      CryptoErrorCode.INVALID_KEY_LENGTH,
      'Invalid hex string: contains non-hex characters',
      { hex }
    );
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Computes SHA3-256 hash of the input data.
 * @param data - The data to hash
 * @returns 32-byte hash
 */
export function hash(data: Uint8Array): Uint8Array {
  return sha3_256(data);
}

/**
 * Derives a 20-byte address from a 32-byte public key.
 * Address = SHA3-256(publicKey)[12:32] (last 20 bytes)
 * @param publicKey - 32-byte Ed25519 public key
 * @returns 20-byte address
 * @throws {CryptoError} If the public key is not 32 bytes
 */
export function deriveAddressBytes(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== PUBLIC_KEY_LENGTH) {
    throw new CryptoError(
      CryptoErrorCode.INVALID_KEY_LENGTH,
      `Public key must be ${PUBLIC_KEY_LENGTH} bytes, got ${publicKey.length}`,
      { expected: PUBLIC_KEY_LENGTH, actual: publicKey.length }
    );
  }
  const hashBytes = hash(publicKey);
  // Take last 20 bytes (bytes 12-31 inclusive)
  return hashBytes.slice(12, 32);
}

/**
 * Verifies an Ed25519 signature.
 * @param message - The message that was signed
 * @param signature - The 64-byte signature
 * @param publicKey - The 32-byte public key
 * @returns true if the signature is valid, false otherwise (never throws)
 */
export function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    if (signature.length !== SIGNATURE_LENGTH) {
      return false;
    }
    if (publicKey.length !== PUBLIC_KEY_LENGTH) {
      return false;
    }
    return ed.verify(signature, message, publicKey);
  } catch {
    // Per requirement 4.6: verification SHALL return false without throwing
    return false;
  }
}

/**
 * Ed25519 keypair for signing transactions and deriving addresses.
 *
 * The Keypair class encapsulates both public and private keys and provides
 * methods for signing messages and deriving addresses.
 *
 * @example
 * ```typescript
 * // Generate a new random keypair
 * const keypair = Keypair.generate();
 *
 * // Import from existing private key
 * const keypair2 = Keypair.fromPrivateKey(privateKeyBytes);
 * const keypair3 = Keypair.fromPrivateKeyHex('0x...');
 *
 * // Sign a message
 * const signature = keypair.sign(message);
 *
 * // Get the address
 * const addressBytes = keypair.addressBytes();
 * ```
 */
export class Keypair {
  private readonly _privateKey: Uint8Array;
  private readonly _publicKey: Uint8Array;

  /**
   * Creates a new Keypair from a private key.
   * Use static factory methods instead of calling this directly.
   * @internal
   */
  private constructor(privateKey: Uint8Array, publicKey: Uint8Array) {
    this._privateKey = privateKey;
    this._publicKey = publicKey;
  }

  /**
   * Generates a new random Ed25519 keypair using the OS's cryptographically
   * secure random number generator.
   *
   * @returns A new randomly generated Keypair
   *
   * @example
   * ```typescript
   * const keypair = Keypair.generate();
   * console.log('Public key:', keypair.publicKeyHex);
   * ```
   */
  static generate(): Keypair {
    // Use crypto.getRandomValues which is available in both browser and Node.js
    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = ed.getPublicKey(privateKey);
    return new Keypair(privateKey, publicKey);
  }

  /**
   * Creates a Keypair from an existing private key (Uint8Array).
   *
   * @param privateKey - 32-byte Ed25519 private key
   * @returns A Keypair derived from the private key
   * @throws {CryptoError} If the private key is not exactly 32 bytes
   *
   * @example
   * ```typescript
   * const privateKey = new Uint8Array(32);
   * crypto.getRandomValues(privateKey);
   * const keypair = Keypair.fromPrivateKey(privateKey);
   * ```
   */
  static fromPrivateKey(privateKey: Uint8Array): Keypair {
    if (privateKey.length !== PRIVATE_KEY_LENGTH) {
      throw new CryptoError(
        CryptoErrorCode.INVALID_KEY_LENGTH,
        `Private key must be ${PRIVATE_KEY_LENGTH} bytes, got ${privateKey.length}`,
        { expected: PRIVATE_KEY_LENGTH, actual: privateKey.length }
      );
    }
    // Make a copy to prevent external mutation
    const privateKeyCopy = new Uint8Array(privateKey);
    const publicKey = ed.getPublicKey(privateKeyCopy);
    return new Keypair(privateKeyCopy, publicKey);
  }

  /**
   * Creates a Keypair from a hex-encoded private key string.
   *
   * @param hex - Hex-encoded private key (with or without 0x prefix)
   * @returns A Keypair derived from the private key
   * @throws {CryptoError} If the hex string is invalid or not 32 bytes when decoded
   *
   * @example
   * ```typescript
   * const keypair = Keypair.fromPrivateKeyHex('0x1234...');
   * ```
   */
  static fromPrivateKeyHex(hex: string): Keypair {
    const privateKey = hexToBytes(hex);
    return Keypair.fromPrivateKey(privateKey);
  }

  /**
   * The 32-byte Ed25519 public key.
   */
  get publicKey(): Uint8Array {
    // Return a copy to prevent external mutation
    return new Uint8Array(this._publicKey);
  }

  /**
   * The 32-byte Ed25519 private key.
   *
   * **Security Warning**: Handle private keys with care. Never log or expose them.
   */
  get privateKey(): Uint8Array {
    // Return a copy to prevent external mutation
    return new Uint8Array(this._privateKey);
  }

  /**
   * The public key as a hex-encoded string (lowercase, no prefix).
   */
  get publicKeyHex(): string {
    return bytesToHex(this._publicKey);
  }

  /**
   * The private key as a hex-encoded string (lowercase, no prefix).
   *
   * **Security Warning**: Handle private keys with care. Never log or expose them.
   */
  get privateKeyHex(): string {
    return bytesToHex(this._privateKey);
  }

  /**
   * Derives the 20-byte address from this keypair's public key.
   * Address = SHA3-256(publicKey)[12:32] (last 20 bytes)
   *
   * @returns 20-byte address derived from the public key
   *
   * @example
   * ```typescript
   * const keypair = Keypair.generate();
   * const addressBytes = keypair.addressBytes();
   * console.log('Address bytes:', addressBytes);
   * ```
   */
  addressBytes(): Uint8Array {
    return deriveAddressBytes(this._publicKey);
  }

  /**
   * Signs a message using Ed25519.
   *
   * @param message - The message to sign
   * @returns 64-byte Ed25519 signature
   *
   * @example
   * ```typescript
   * const keypair = Keypair.generate();
   * const message = new TextEncoder().encode('Hello, SynapticChain!');
   * const signature = keypair.sign(message);
   * ```
   */
  sign(message: Uint8Array): Uint8Array {
    return ed.sign(message, this._privateKey);
  }

  /**
   * Exports the private key as a Uint8Array.
   * This is equivalent to accessing the `privateKey` getter.
   *
   * @returns A copy of the 32-byte private key
   */
  exportPrivateKey(): Uint8Array {
    return this.privateKey;
  }

  /**
   * Exports the private key as a hex string.
   * This is equivalent to accessing the `privateKeyHex` getter.
   *
   * @returns Hex-encoded private key (lowercase, no prefix)
   */
  exportPrivateKeyHex(): string {
    return this.privateKeyHex;
  }

  /**
   * Exports the public key as a Uint8Array.
   * This is equivalent to accessing the `publicKey` getter.
   *
   * @returns A copy of the 32-byte public key
   */
  exportPublicKey(): Uint8Array {
    return this.publicKey;
  }

  /**
   * Exports the public key as a hex string.
   * This is equivalent to accessing the `publicKeyHex` getter.
   *
   * @returns Hex-encoded public key (lowercase, no prefix)
   */
  exportPublicKeyHex(): string {
    return this.publicKeyHex;
  }
}

/**
 * Derives a contract address from deployer address and nonce.
 * Contract address = SHA3-256(deployer || nonce_le_bytes)[12:32]
 *
 * @param deployerAddress - 20-byte deployer address
 * @param nonce - Transaction nonce as bigint
 * @returns 20-byte contract address
 * @throws {CryptoError} If the deployer address is not 20 bytes
 */
export function deriveContractAddress(deployerAddress: Uint8Array, nonce: bigint): Uint8Array {
  if (deployerAddress.length !== ADDRESS_LENGTH) {
    throw new CryptoError(
      CryptoErrorCode.INVALID_KEY_LENGTH,
      `Deployer address must be ${ADDRESS_LENGTH} bytes, got ${deployerAddress.length}`,
      { expected: ADDRESS_LENGTH, actual: deployerAddress.length }
    );
  }

  // Convert nonce to 8-byte little-endian
  const nonceBytes = new Uint8Array(8);
  let n = nonce;
  for (let i = 0; i < 8; i++) {
    nonceBytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }

  // Concatenate deployer address and nonce
  const data = new Uint8Array(ADDRESS_LENGTH + 8);
  data.set(deployerAddress, 0);
  data.set(nonceBytes, ADDRESS_LENGTH);

  // Hash and take last 20 bytes
  const hashBytes = hash(data);
  return hashBytes.slice(12, 32);
}
