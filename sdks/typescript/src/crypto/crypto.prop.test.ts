/**
 * Property-based tests for crypto utilities
 *
 * Uses fast-check for property-based testing with minimum 100 iterations per property.
 *
 * Tests Properties 4, 14, and 17 from the design document.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  Keypair,
  PRIVATE_KEY_LENGTH,
  PUBLIC_KEY_LENGTH,
  SIGNATURE_LENGTH,
  verify,
} from './index.js';
import { CryptoError } from '../errors/index.js';

// Minimum iterations per property as specified in design document
const NUM_RUNS = 100;

describe('Crypto Utilities Property Tests', () => {
  // Feature: synapticchain-sdks, Property 4: Invalid Key Rejection
  // **Validates: Requirements 1.7**
  describe('Property 4: Invalid Key Rejection', () => {
    it('for any byte array that is not exactly 32 bytes, importing it as a private key SHALL return an error', () => {
      // Generator for byte arrays that are NOT 32 bytes
      const invalidLengthArb = fc.oneof(
        // Empty array
        fc.constant(new Uint8Array(0)),
        // Short arrays (1-31 bytes)
        fc.integer({ min: 1, max: 31 }).chain((len) =>
          fc.uint8Array({ minLength: len, maxLength: len })
        ),
        // Long arrays (33-256 bytes)
        fc.integer({ min: 33, max: 256 }).chain((len) =>
          fc.uint8Array({ minLength: len, maxLength: len })
        )
      );

      fc.assert(
        fc.property(invalidLengthArb, (invalidKey) => {
          // Verify the key is not 32 bytes (sanity check)
          expect(invalidKey.length).not.toBe(PRIVATE_KEY_LENGTH);

          // Importing as private key should throw CryptoError
          expect(() => Keypair.fromPrivateKey(invalidKey)).toThrow(CryptoError);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any byte array that is not exactly 32 bytes, importing it as a public key for verification SHALL return false', () => {
      // Generator for byte arrays that are NOT 32 bytes
      const invalidLengthArb = fc.oneof(
        // Empty array
        fc.constant(new Uint8Array(0)),
        // Short arrays (1-31 bytes)
        fc.integer({ min: 1, max: 31 }).chain((len) =>
          fc.uint8Array({ minLength: len, maxLength: len })
        ),
        // Long arrays (33-256 bytes)
        fc.integer({ min: 33, max: 256 }).chain((len) =>
          fc.uint8Array({ minLength: len, maxLength: len })
        )
      );

      const messageArb = fc.uint8Array({ minLength: 0, maxLength: 256 });
      const signatureArb = fc.uint8Array({ minLength: SIGNATURE_LENGTH, maxLength: SIGNATURE_LENGTH });

      fc.assert(
        fc.property(invalidLengthArb, messageArb, signatureArb, (invalidPublicKey, message, signature) => {
          // Verify the key is not 32 bytes (sanity check)
          expect(invalidPublicKey.length).not.toBe(PUBLIC_KEY_LENGTH);

          // Verification with invalid public key should return false (not throw)
          const result = verify(message, signature, invalidPublicKey);
          expect(result).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any byte array that is not exactly 64 bytes, using it as a signature for verification SHALL return false', () => {
      // Generator for byte arrays that are NOT 64 bytes
      const invalidSignatureLengthArb = fc.oneof(
        // Empty array
        fc.constant(new Uint8Array(0)),
        // Short arrays (1-63 bytes)
        fc.integer({ min: 1, max: 63 }).chain((len) =>
          fc.uint8Array({ minLength: len, maxLength: len })
        ),
        // Long arrays (65-256 bytes)
        fc.integer({ min: 65, max: 256 }).chain((len) =>
          fc.uint8Array({ minLength: len, maxLength: len })
        )
      );

      const messageArb = fc.uint8Array({ minLength: 0, maxLength: 256 });
      const publicKeyArb = fc.uint8Array({ minLength: PUBLIC_KEY_LENGTH, maxLength: PUBLIC_KEY_LENGTH });

      fc.assert(
        fc.property(invalidSignatureLengthArb, messageArb, publicKeyArb, (invalidSignature, message, publicKey) => {
          // Verify the signature is not 64 bytes (sanity check)
          expect(invalidSignature.length).not.toBe(SIGNATURE_LENGTH);

          // Verification with invalid signature length should return false (not throw)
          const result = verify(message, invalidSignature, publicKey);
          expect(result).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('importing a private key with exactly 32 bytes SHALL succeed', () => {
      const validKeyArb = fc.uint8Array({ minLength: PRIVATE_KEY_LENGTH, maxLength: PRIVATE_KEY_LENGTH });

      fc.assert(
        fc.property(validKeyArb, (validKey) => {
          // Importing a valid 32-byte key should not throw
          const keypair = Keypair.fromPrivateKey(validKey);
          expect(keypair.privateKey.length).toBe(PRIVATE_KEY_LENGTH);
          expect(keypair.publicKey.length).toBe(PUBLIC_KEY_LENGTH);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 14: Signature Round-Trip
  // **Validates: Requirements 4.1, 4.3, 4.4, 4.7**
  describe('Property 14: Signature Round-Trip', () => {
    it('for any valid keypair and message, signing the message and verifying the signature with the public key SHALL return true', () => {
      const privateKeyArb = fc.uint8Array({ minLength: PRIVATE_KEY_LENGTH, maxLength: PRIVATE_KEY_LENGTH });
      const messageArb = fc.uint8Array({ minLength: 0, maxLength: 1024 });

      fc.assert(
        fc.property(privateKeyArb, messageArb, (privateKeyBytes, message) => {
          // Create keypair from private key
          const keypair = Keypair.fromPrivateKey(privateKeyBytes);

          // Sign the message
          const signature = keypair.sign(message);

          // Signature should be 64 bytes (Ed25519)
          expect(signature.length).toBe(SIGNATURE_LENGTH);

          // Verify the signature with the public key
          const isValid = verify(message, signature, keypair.publicKey);
          expect(isValid).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any generated keypair and message, signing and verifying SHALL return true', () => {
      const messageArb = fc.uint8Array({ minLength: 0, maxLength: 1024 });

      fc.assert(
        fc.property(messageArb, (message) => {
          // Generate a random keypair
          const keypair = Keypair.generate();

          // Sign the message
          const signature = keypair.sign(message);

          // Verify the signature
          const isValid = verify(message, signature, keypair.publicKey);
          expect(isValid).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('signing the same message multiple times with the same keypair SHALL produce identical signatures (Ed25519 determinism)', () => {
      const privateKeyArb = fc.uint8Array({ minLength: PRIVATE_KEY_LENGTH, maxLength: PRIVATE_KEY_LENGTH });
      const messageArb = fc.uint8Array({ minLength: 0, maxLength: 512 });

      fc.assert(
        fc.property(privateKeyArb, messageArb, (privateKeyBytes, message) => {
          const keypair = Keypair.fromPrivateKey(privateKeyBytes);

          // Sign the same message multiple times
          const signature1 = keypair.sign(message);
          const signature2 = keypair.sign(message);
          const signature3 = keypair.sign(message);

          // All signatures should be identical (Ed25519 is deterministic)
          expect(signature1).toEqual(signature2);
          expect(signature2).toEqual(signature3);

          // All should verify
          expect(verify(message, signature1, keypair.publicKey)).toBe(true);
          expect(verify(message, signature2, keypair.publicKey)).toBe(true);
          expect(verify(message, signature3, keypair.publicKey)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('signature round-trip SHALL work for empty messages', () => {
      const privateKeyArb = fc.uint8Array({ minLength: PRIVATE_KEY_LENGTH, maxLength: PRIVATE_KEY_LENGTH });

      fc.assert(
        fc.property(privateKeyArb, (privateKeyBytes) => {
          const keypair = Keypair.fromPrivateKey(privateKeyBytes);
          const emptyMessage = new Uint8Array(0);

          // Sign empty message
          const signature = keypair.sign(emptyMessage);

          // Should verify
          expect(verify(emptyMessage, signature, keypair.publicKey)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 17: Invalid Signature Returns False
  // **Validates: Requirements 4.6**
  describe('Property 17: Invalid Signature Returns False', () => {
    it('for any message and signature not created by the corresponding private key, verification SHALL return false (not throw)', () => {
      const privateKeyArb = fc.uint8Array({ minLength: PRIVATE_KEY_LENGTH, maxLength: PRIVATE_KEY_LENGTH });
      const messageArb = fc.uint8Array({ minLength: 1, maxLength: 512 });

      fc.assert(
        fc.property(privateKeyArb, privateKeyArb, messageArb, (privateKey1Bytes, privateKey2Bytes, message) => {
          // Skip if the two private keys happen to be the same
          const key1Hex = Array.from(privateKey1Bytes).map(b => b.toString(16).padStart(2, '0')).join('');
          const key2Hex = Array.from(privateKey2Bytes).map(b => b.toString(16).padStart(2, '0')).join('');
          if (key1Hex === key2Hex) {
            return; // Skip this case
          }

          const keypair1 = Keypair.fromPrivateKey(privateKey1Bytes);
          const keypair2 = Keypair.fromPrivateKey(privateKey2Bytes);

          // Sign with keypair1
          const signature = keypair1.sign(message);

          // Verify with keypair2's public key should return false (not throw)
          const result = verify(message, signature, keypair2.publicKey);
          expect(result).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any keypair and two different messages, a signature for one message SHALL not verify for the other', () => {
      const privateKeyArb = fc.uint8Array({ minLength: PRIVATE_KEY_LENGTH, maxLength: PRIVATE_KEY_LENGTH });
      const messageArb = fc.uint8Array({ minLength: 1, maxLength: 512 });

      fc.assert(
        fc.property(privateKeyArb, messageArb, messageArb, (privateKeyBytes, message1, message2) => {
          // Skip if messages are the same
          if (message1.length === message2.length && 
              message1.every((byte, i) => byte === message2[i])) {
            return; // Skip this case
          }

          const keypair = Keypair.fromPrivateKey(privateKeyBytes);

          // Sign message1
          const signature = keypair.sign(message1);

          // Verify signature against message2 should return false (not throw)
          const result = verify(message2, signature, keypair.publicKey);
          expect(result).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any random 64-byte array used as signature, verification SHALL return false (not throw)', () => {
      const privateKeyArb = fc.uint8Array({ minLength: PRIVATE_KEY_LENGTH, maxLength: PRIVATE_KEY_LENGTH });
      const messageArb = fc.uint8Array({ minLength: 0, maxLength: 256 });
      const randomSignatureArb = fc.uint8Array({ minLength: SIGNATURE_LENGTH, maxLength: SIGNATURE_LENGTH });

      fc.assert(
        fc.property(privateKeyArb, messageArb, randomSignatureArb, (privateKeyBytes, message, randomSignature) => {
          const keypair = Keypair.fromPrivateKey(privateKeyBytes);

          // Get the actual valid signature for comparison
          const validSignature = keypair.sign(message);

          // Skip if random signature happens to match the valid one (astronomically unlikely)
          if (randomSignature.every((byte, i) => byte === validSignature[i])) {
            return; // Skip this case
          }

          // Verification with random signature should return false (not throw)
          const result = verify(message, randomSignature, keypair.publicKey);
          expect(result).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('corrupting any byte of a valid signature SHALL cause verification to return false', () => {
      const privateKeyArb = fc.uint8Array({ minLength: PRIVATE_KEY_LENGTH, maxLength: PRIVATE_KEY_LENGTH });
      const messageArb = fc.uint8Array({ minLength: 1, maxLength: 256 });
      const byteIndexArb = fc.integer({ min: 0, max: SIGNATURE_LENGTH - 1 });
      const corruptionArb = fc.integer({ min: 1, max: 255 }); // Non-zero to ensure corruption

      fc.assert(
        fc.property(privateKeyArb, messageArb, byteIndexArb, corruptionArb, (privateKeyBytes, message, byteIndex, corruption) => {
          const keypair = Keypair.fromPrivateKey(privateKeyBytes);

          // Sign the message
          const signature = keypair.sign(message);

          // Verify original signature is valid
          expect(verify(message, signature, keypair.publicKey)).toBe(true);

          // Corrupt the signature by XORing a byte
          const corruptedSignature = new Uint8Array(signature);
          corruptedSignature[byteIndex] ^= corruption;

          // Verification with corrupted signature should return false (not throw)
          const result = verify(message, corruptedSignature, keypair.publicKey);
          expect(result).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('verification with malformed inputs SHALL return false (not throw exceptions)', () => {
      // Test various malformed inputs
      const malformedCases = [
        { message: new Uint8Array(0), signature: new Uint8Array(0), publicKey: new Uint8Array(0) },
        { message: new Uint8Array(10), signature: new Uint8Array(32), publicKey: new Uint8Array(32) },
        { message: new Uint8Array(10), signature: new Uint8Array(64), publicKey: new Uint8Array(16) },
        { message: new Uint8Array(10), signature: new Uint8Array(128), publicKey: new Uint8Array(32) },
      ];

      for (const { message, signature, publicKey } of malformedCases) {
        // Should return false, not throw
        const result = verify(message, signature, publicKey);
        expect(result).toBe(false);
      }
    });
  });
});
