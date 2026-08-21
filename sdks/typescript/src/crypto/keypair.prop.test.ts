/**
 * Property-based tests for Keypair class
 *
 * Uses fast-check for property-based testing with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  Keypair,
  PRIVATE_KEY_LENGTH,
  PUBLIC_KEY_LENGTH,
  bytesToHex,
  hexToBytes,
  verify,
} from './index.js';

// Minimum iterations per property as specified in design document
const NUM_RUNS = 100;

describe('Keypair Property Tests', () => {
  // Feature: synapticchain-sdks, Property 1: Keypair Generation Uniqueness
  // **Validates: Requirements 1.1**
  describe('Property 1: Keypair Generation Uniqueness', () => {
    it('for any two independently generated keypairs, the public keys SHALL be distinct (with overwhelming probability)', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          // Generate two independent keypairs
          const keypair1 = Keypair.generate();
          const keypair2 = Keypair.generate();

          // Public keys should be distinct
          // Note: With 32-byte keys, collision probability is negligible (2^-256)
          expect(keypair1.publicKeyHex).not.toBe(keypair2.publicKeyHex);

          // Private keys should also be distinct
          expect(keypair1.privateKeyHex).not.toBe(keypair2.privateKeyHex);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('generated keypairs should have valid key lengths', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const keypair = Keypair.generate();

          expect(keypair.publicKey.length).toBe(PUBLIC_KEY_LENGTH);
          expect(keypair.privateKey.length).toBe(PRIVATE_KEY_LENGTH);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 2: Public Key Derivation Determinism
  // **Validates: Requirements 1.2**
  describe('Property 2: Public Key Derivation Determinism', () => {
    it('for any valid 32-byte private key, deriving the public key multiple times SHALL always produce the same 32-byte public key', () => {
      // Generator for valid 32-byte private keys
      const privateKeyArb = fc.uint8Array({ minLength: 32, maxLength: 32 });

      fc.assert(
        fc.property(privateKeyArb, (privateKeyBytes) => {
          // Derive public key multiple times from the same private key
          const keypair1 = Keypair.fromPrivateKey(privateKeyBytes);
          const keypair2 = Keypair.fromPrivateKey(privateKeyBytes);
          const keypair3 = Keypair.fromPrivateKey(privateKeyBytes);

          // All derivations should produce the same public key
          expect(keypair1.publicKeyHex).toBe(keypair2.publicKeyHex);
          expect(keypair2.publicKeyHex).toBe(keypair3.publicKeyHex);

          // Public key should be 32 bytes
          expect(keypair1.publicKey.length).toBe(PUBLIC_KEY_LENGTH);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('deriving public key from hex-encoded private key should be deterministic', () => {
      const privateKeyArb = fc.uint8Array({ minLength: 32, maxLength: 32 });

      fc.assert(
        fc.property(privateKeyArb, (privateKeyBytes) => {
          const hex = bytesToHex(privateKeyBytes);

          // Derive from bytes and from hex
          const keypairFromBytes = Keypair.fromPrivateKey(privateKeyBytes);
          const keypairFromHex = Keypair.fromPrivateKeyHex(hex);
          const keypairFromHexWithPrefix = Keypair.fromPrivateKeyHex('0x' + hex);

          // All should produce the same public key
          expect(keypairFromBytes.publicKeyHex).toBe(keypairFromHex.publicKeyHex);
          expect(keypairFromHex.publicKeyHex).toBe(keypairFromHexWithPrefix.publicKeyHex);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Feature: synapticchain-sdks, Property 3: Key Export/Import Round-Trip
  // **Validates: Requirements 1.3, 1.4, 1.5, 1.6**
  describe('Property 3: Key Export/Import Round-Trip', () => {
    it('for any valid keypair, exporting the private key as bytes and importing it back SHALL produce a keypair with the same public key', () => {
      const privateKeyArb = fc.uint8Array({ minLength: 32, maxLength: 32 });

      fc.assert(
        fc.property(privateKeyArb, (privateKeyBytes) => {
          // Create original keypair
          const original = Keypair.fromPrivateKey(privateKeyBytes);

          // Export private key as bytes
          const exportedBytes = original.exportPrivateKey();

          // Import back
          const restored = Keypair.fromPrivateKey(exportedBytes);

          // Should have the same public key
          expect(restored.publicKeyHex).toBe(original.publicKeyHex);

          // Should have the same private key
          expect(restored.privateKeyHex).toBe(original.privateKeyHex);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid keypair, exporting the private key as hex and importing it back SHALL produce a keypair with the same public key', () => {
      const privateKeyArb = fc.uint8Array({ minLength: 32, maxLength: 32 });

      fc.assert(
        fc.property(privateKeyArb, (privateKeyBytes) => {
          // Create original keypair
          const original = Keypair.fromPrivateKey(privateKeyBytes);

          // Export private key as hex
          const exportedHex = original.exportPrivateKeyHex();

          // Import back
          const restored = Keypair.fromPrivateKeyHex(exportedHex);

          // Should have the same public key
          expect(restored.publicKeyHex).toBe(original.publicKeyHex);

          // Should have the same private key
          expect(restored.privateKeyHex).toBe(original.privateKeyHex);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid keypair, the exported public key should match the original', () => {
      const privateKeyArb = fc.uint8Array({ minLength: 32, maxLength: 32 });

      fc.assert(
        fc.property(privateKeyArb, (privateKeyBytes) => {
          const keypair = Keypair.fromPrivateKey(privateKeyBytes);

          // Export public key as bytes and hex
          const exportedBytes = keypair.exportPublicKey();
          const exportedHex = keypair.exportPublicKeyHex();

          // Should match the getters
          expect(bytesToHex(exportedBytes)).toBe(keypair.publicKeyHex);
          expect(exportedHex).toBe(keypair.publicKeyHex);

          // Bytes should be 32 bytes
          expect(exportedBytes.length).toBe(PUBLIC_KEY_LENGTH);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('for any valid keypair, round-tripped keypair SHALL have the same signing capability', () => {
      const privateKeyArb = fc.uint8Array({ minLength: 32, maxLength: 32 });
      const messageArb = fc.uint8Array({ minLength: 0, maxLength: 1024 });

      fc.assert(
        fc.property(privateKeyArb, messageArb, (privateKeyBytes, message) => {
          // Create original keypair
          const original = Keypair.fromPrivateKey(privateKeyBytes);

          // Export and import via bytes
          const restoredFromBytes = Keypair.fromPrivateKey(original.exportPrivateKey());

          // Export and import via hex
          const restoredFromHex = Keypair.fromPrivateKeyHex(original.exportPrivateKeyHex());

          // Sign with original
          const originalSignature = original.sign(message);

          // Sign with restored keypairs
          const signatureFromBytes = restoredFromBytes.sign(message);
          const signatureFromHex = restoredFromHex.sign(message);

          // All signatures should be identical (Ed25519 is deterministic)
          expect(bytesToHex(signatureFromBytes)).toBe(bytesToHex(originalSignature));
          expect(bytesToHex(signatureFromHex)).toBe(bytesToHex(originalSignature));

          // All signatures should verify with the original public key
          expect(verify(message, originalSignature, original.publicKey)).toBe(true);
          expect(verify(message, signatureFromBytes, restoredFromBytes.publicKey)).toBe(true);
          expect(verify(message, signatureFromHex, restoredFromHex.publicKey)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('hex encoding round-trip should preserve private key bytes', () => {
      const privateKeyArb = fc.uint8Array({ minLength: 32, maxLength: 32 });

      fc.assert(
        fc.property(privateKeyArb, (privateKeyBytes) => {
          // Convert to hex and back
          const hex = bytesToHex(privateKeyBytes);
          const decoded = hexToBytes(hex);

          // Should be identical
          expect(decoded.length).toBe(privateKeyBytes.length);
          for (let i = 0; i < privateKeyBytes.length; i++) {
            expect(decoded[i]).toBe(privateKeyBytes[i]);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // Additional property: Generated keypairs should be usable for signing
  describe('Generated Keypair Signing Capability', () => {
    it('any generated keypair should be able to sign and verify messages', () => {
      const messageArb = fc.uint8Array({ minLength: 0, maxLength: 1024 });

      fc.assert(
        fc.property(messageArb, (message) => {
          const keypair = Keypair.generate();

          // Sign the message
          const signature = keypair.sign(message);

          // Signature should be 64 bytes
          expect(signature.length).toBe(64);

          // Signature should verify
          expect(verify(message, signature, keypair.publicKey)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
