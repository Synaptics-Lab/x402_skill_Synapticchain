/**
 * Unit tests for Keypair class
 */

import { describe, it, expect } from 'vitest';
import {
  Keypair,
  PRIVATE_KEY_LENGTH,
  PUBLIC_KEY_LENGTH,
  SIGNATURE_LENGTH,
  ADDRESS_LENGTH,
  bytesToHex,
  hexToBytes,
  hash,
  verify,
  deriveAddressBytes,
  deriveContractAddress,
} from './index.js';
import { CryptoError, CryptoErrorCode } from '../errors/index.js';

describe('Keypair', () => {
  describe('generate()', () => {
    it('should generate a keypair with valid key lengths', () => {
      const keypair = Keypair.generate();
      expect(keypair.privateKey.length).toBe(PRIVATE_KEY_LENGTH);
      expect(keypair.publicKey.length).toBe(PUBLIC_KEY_LENGTH);
    });

    it('should generate unique keypairs', () => {
      const keypair1 = Keypair.generate();
      const keypair2 = Keypair.generate();
      expect(keypair1.publicKeyHex).not.toBe(keypair2.publicKeyHex);
      expect(keypair1.privateKeyHex).not.toBe(keypair2.privateKeyHex);
    });
  });

  describe('fromPrivateKey()', () => {
    it('should create a keypair from a valid private key', () => {
      const privateKey = new Uint8Array(32);
      privateKey[0] = 1; // Non-zero key
      const keypair = Keypair.fromPrivateKey(privateKey);
      expect(keypair.privateKey.length).toBe(PRIVATE_KEY_LENGTH);
      expect(keypair.publicKey.length).toBe(PUBLIC_KEY_LENGTH);
    });

    it('should derive the same public key from the same private key', () => {
      const privateKey = new Uint8Array(32);
      privateKey[0] = 42;
      privateKey[31] = 255;

      const keypair1 = Keypair.fromPrivateKey(privateKey);
      const keypair2 = Keypair.fromPrivateKey(privateKey);

      expect(keypair1.publicKeyHex).toBe(keypair2.publicKeyHex);
    });

    it('should throw CryptoError for invalid key length (too short)', () => {
      const shortKey = new Uint8Array(16);
      expect(() => Keypair.fromPrivateKey(shortKey)).toThrow(CryptoError);
      expect(() => Keypair.fromPrivateKey(shortKey)).toThrow(/must be 32 bytes/);
    });

    it('should throw CryptoError for invalid key length (too long)', () => {
      const longKey = new Uint8Array(64);
      expect(() => Keypair.fromPrivateKey(longKey)).toThrow(CryptoError);
      expect(() => Keypair.fromPrivateKey(longKey)).toThrow(/must be 32 bytes/);
    });

    it('should throw CryptoError for empty key', () => {
      const emptyKey = new Uint8Array(0);
      expect(() => Keypair.fromPrivateKey(emptyKey)).toThrow(CryptoError);
    });

    it('should not be affected by mutations to the original private key', () => {
      const privateKey = new Uint8Array(32);
      privateKey[0] = 42;
      const keypair = Keypair.fromPrivateKey(privateKey);
      const originalHex = keypair.privateKeyHex;

      // Mutate the original
      privateKey[0] = 99;

      // Keypair should be unaffected
      expect(keypair.privateKeyHex).toBe(originalHex);
    });
  });

  describe('fromPrivateKeyHex()', () => {
    it('should create a keypair from a valid hex string', () => {
      const hex = '0'.repeat(62) + '01'; // 32 bytes as hex
      const keypair = Keypair.fromPrivateKeyHex(hex);
      expect(keypair.privateKey.length).toBe(PRIVATE_KEY_LENGTH);
    });

    it('should handle 0x prefix', () => {
      const hex = '0x' + '0'.repeat(62) + '01';
      const keypair = Keypair.fromPrivateKeyHex(hex);
      expect(keypair.privateKey.length).toBe(PRIVATE_KEY_LENGTH);
    });

    it('should handle 0X prefix (uppercase)', () => {
      const hex = '0X' + '0'.repeat(62) + '01';
      const keypair = Keypair.fromPrivateKeyHex(hex);
      expect(keypair.privateKey.length).toBe(PRIVATE_KEY_LENGTH);
    });

    it('should throw for invalid hex characters', () => {
      const invalidHex = 'zz' + '0'.repeat(62);
      expect(() => Keypair.fromPrivateKeyHex(invalidHex)).toThrow(CryptoError);
    });

    it('should throw for odd-length hex string', () => {
      const oddHex = '0'.repeat(63);
      expect(() => Keypair.fromPrivateKeyHex(oddHex)).toThrow(CryptoError);
    });
  });

  describe('publicKey and privateKey getters', () => {
    it('should return copies that cannot mutate internal state', () => {
      const keypair = Keypair.generate();
      const publicKey1 = keypair.publicKey;
      const publicKey2 = keypair.publicKey;

      // Mutate the returned copy
      publicKey1[0] = 255;

      // Should not affect subsequent calls
      expect(publicKey2[0]).not.toBe(255);
    });
  });

  describe('sign()', () => {
    it('should produce a 64-byte signature', () => {
      const keypair = Keypair.generate();
      const message = new TextEncoder().encode('Hello, SynapticChain!');
      const signature = keypair.sign(message);
      expect(signature.length).toBe(SIGNATURE_LENGTH);
    });

    it('should produce deterministic signatures for the same message', () => {
      const keypair = Keypair.generate();
      const message = new TextEncoder().encode('Test message');
      const sig1 = keypair.sign(message);
      const sig2 = keypair.sign(message);
      expect(bytesToHex(sig1)).toBe(bytesToHex(sig2));
    });

    it('should produce different signatures for different messages', () => {
      const keypair = Keypair.generate();
      const message1 = new TextEncoder().encode('Message 1');
      const message2 = new TextEncoder().encode('Message 2');
      const sig1 = keypair.sign(message1);
      const sig2 = keypair.sign(message2);
      expect(bytesToHex(sig1)).not.toBe(bytesToHex(sig2));
    });

    it('should sign empty messages', () => {
      const keypair = Keypair.generate();
      const emptyMessage = new Uint8Array(0);
      const signature = keypair.sign(emptyMessage);
      expect(signature.length).toBe(SIGNATURE_LENGTH);
    });
  });

  describe('addressBytes()', () => {
    it('should return a 20-byte address', () => {
      const keypair = Keypair.generate();
      const address = keypair.addressBytes();
      expect(address.length).toBe(ADDRESS_LENGTH);
    });

    it('should derive the same address from the same keypair', () => {
      const keypair = Keypair.generate();
      const address1 = keypair.addressBytes();
      const address2 = keypair.addressBytes();
      expect(bytesToHex(address1)).toBe(bytesToHex(address2));
    });

    it('should derive different addresses from different keypairs', () => {
      const keypair1 = Keypair.generate();
      const keypair2 = Keypair.generate();
      const address1 = keypair1.addressBytes();
      const address2 = keypair2.addressBytes();
      expect(bytesToHex(address1)).not.toBe(bytesToHex(address2));
    });
  });

  describe('export methods', () => {
    it('exportPrivateKey should return the same as privateKey getter', () => {
      const keypair = Keypair.generate();
      expect(bytesToHex(keypair.exportPrivateKey())).toBe(bytesToHex(keypair.privateKey));
    });

    it('exportPrivateKeyHex should return the same as privateKeyHex getter', () => {
      const keypair = Keypair.generate();
      expect(keypair.exportPrivateKeyHex()).toBe(keypair.privateKeyHex);
    });

    it('exportPublicKey should return the same as publicKey getter', () => {
      const keypair = Keypair.generate();
      expect(bytesToHex(keypair.exportPublicKey())).toBe(bytesToHex(keypair.publicKey));
    });

    it('exportPublicKeyHex should return the same as publicKeyHex getter', () => {
      const keypair = Keypair.generate();
      expect(keypair.exportPublicKeyHex()).toBe(keypair.publicKeyHex);
    });
  });
});

describe('verify()', () => {
  it('should return true for valid signature', () => {
    const keypair = Keypair.generate();
    const message = new TextEncoder().encode('Test message');
    const signature = keypair.sign(message);
    expect(verify(message, signature, keypair.publicKey)).toBe(true);
  });

  it('should return false for wrong message', () => {
    const keypair = Keypair.generate();
    const message = new TextEncoder().encode('Original message');
    const wrongMessage = new TextEncoder().encode('Wrong message');
    const signature = keypair.sign(message);
    expect(verify(wrongMessage, signature, keypair.publicKey)).toBe(false);
  });

  it('should return false for wrong public key', () => {
    const keypair1 = Keypair.generate();
    const keypair2 = Keypair.generate();
    const message = new TextEncoder().encode('Test message');
    const signature = keypair1.sign(message);
    expect(verify(message, signature, keypair2.publicKey)).toBe(false);
  });

  it('should return false for corrupted signature', () => {
    const keypair = Keypair.generate();
    const message = new TextEncoder().encode('Test message');
    const signature = keypair.sign(message);
    // Corrupt the signature
    signature[0] ^= 0xff;
    expect(verify(message, signature, keypair.publicKey)).toBe(false);
  });

  it('should return false (not throw) for invalid signature length', () => {
    const keypair = Keypair.generate();
    const message = new TextEncoder().encode('Test message');
    const shortSignature = new Uint8Array(32);
    expect(verify(message, shortSignature, keypair.publicKey)).toBe(false);
  });

  it('should return false (not throw) for invalid public key length', () => {
    const keypair = Keypair.generate();
    const message = new TextEncoder().encode('Test message');
    const signature = keypair.sign(message);
    const shortPublicKey = new Uint8Array(16);
    expect(verify(message, signature, shortPublicKey)).toBe(false);
  });
});

describe('bytesToHex() and hexToBytes()', () => {
  it('should round-trip correctly', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const hex = bytesToHex(original);
    const decoded = hexToBytes(hex);
    expect(decoded).toEqual(original);
  });

  it('should produce lowercase hex', () => {
    const bytes = new Uint8Array([0xab, 0xcd, 0xef]);
    const hex = bytesToHex(bytes);
    expect(hex).toBe('abcdef');
  });

  it('should handle empty arrays', () => {
    const empty = new Uint8Array(0);
    const hex = bytesToHex(empty);
    expect(hex).toBe('');
    expect(hexToBytes(hex)).toEqual(empty);
  });

  it('hexToBytes should handle uppercase hex', () => {
    const hex = 'ABCDEF';
    const bytes = hexToBytes(hex);
    expect(bytes).toEqual(new Uint8Array([0xab, 0xcd, 0xef]));
  });

  it('hexToBytes should handle mixed case hex', () => {
    const hex = 'AbCdEf';
    const bytes = hexToBytes(hex);
    expect(bytes).toEqual(new Uint8Array([0xab, 0xcd, 0xef]));
  });
});

describe('hash()', () => {
  it('should produce a 32-byte hash', () => {
    const data = new TextEncoder().encode('Hello, World!');
    const hashResult = hash(data);
    expect(hashResult.length).toBe(32);
  });

  it('should produce deterministic hashes', () => {
    const data = new TextEncoder().encode('Test data');
    const hash1 = hash(data);
    const hash2 = hash(data);
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
  });

  it('should produce different hashes for different inputs', () => {
    const data1 = new TextEncoder().encode('Data 1');
    const data2 = new TextEncoder().encode('Data 2');
    const hash1 = hash(data1);
    const hash2 = hash(data2);
    expect(bytesToHex(hash1)).not.toBe(bytesToHex(hash2));
  });

  it('should hash empty data', () => {
    const empty = new Uint8Array(0);
    const hashResult = hash(empty);
    expect(hashResult.length).toBe(32);
  });
});

describe('deriveAddressBytes()', () => {
  it('should produce a 20-byte address', () => {
    const publicKey = new Uint8Array(32);
    publicKey[0] = 1;
    const address = deriveAddressBytes(publicKey);
    expect(address.length).toBe(ADDRESS_LENGTH);
  });

  it('should throw for invalid public key length', () => {
    const shortKey = new Uint8Array(16);
    expect(() => deriveAddressBytes(shortKey)).toThrow(CryptoError);
    expect(() => deriveAddressBytes(shortKey)).toThrow(/must be 32 bytes/);
  });

  it('should produce deterministic addresses', () => {
    const publicKey = new Uint8Array(32);
    publicKey[0] = 42;
    const address1 = deriveAddressBytes(publicKey);
    const address2 = deriveAddressBytes(publicKey);
    expect(bytesToHex(address1)).toBe(bytesToHex(address2));
  });
});

describe('deriveContractAddress()', () => {
  it('should produce a 20-byte contract address', () => {
    const deployerAddress = new Uint8Array(20);
    deployerAddress[0] = 1;
    const contractAddress = deriveContractAddress(deployerAddress, 0n);
    expect(contractAddress.length).toBe(ADDRESS_LENGTH);
  });

  it('should throw for invalid deployer address length', () => {
    const shortAddress = new Uint8Array(10);
    expect(() => deriveContractAddress(shortAddress, 0n)).toThrow(CryptoError);
    expect(() => deriveContractAddress(shortAddress, 0n)).toThrow(/must be 20 bytes/);
  });

  it('should produce different addresses for different nonces', () => {
    const deployerAddress = new Uint8Array(20);
    deployerAddress[0] = 1;
    const address1 = deriveContractAddress(deployerAddress, 0n);
    const address2 = deriveContractAddress(deployerAddress, 1n);
    expect(bytesToHex(address1)).not.toBe(bytesToHex(address2));
  });

  it('should produce different addresses for different deployers', () => {
    const deployer1 = new Uint8Array(20);
    deployer1[0] = 1;
    const deployer2 = new Uint8Array(20);
    deployer2[0] = 2;
    const address1 = deriveContractAddress(deployer1, 0n);
    const address2 = deriveContractAddress(deployer2, 0n);
    expect(bytesToHex(address1)).not.toBe(bytesToHex(address2));
  });

  it('should produce deterministic addresses', () => {
    const deployerAddress = new Uint8Array(20);
    deployerAddress[0] = 42;
    const address1 = deriveContractAddress(deployerAddress, 123n);
    const address2 = deriveContractAddress(deployerAddress, 123n);
    expect(bytesToHex(address1)).toBe(bytesToHex(address2));
  });

  it('should handle large nonces', () => {
    const deployerAddress = new Uint8Array(20);
    deployerAddress[0] = 1;
    const largeNonce = BigInt('0xFFFFFFFFFFFFFFFF'); // Max u64
    const address = deriveContractAddress(deployerAddress, largeNonce);
    expect(address.length).toBe(ADDRESS_LENGTH);
  });
});
