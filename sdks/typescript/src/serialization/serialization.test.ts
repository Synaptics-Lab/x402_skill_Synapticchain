/**
 * Unit tests for Borsh serialization
 *
 * Tests for borshSerialize and borshDeserialize functions.
 */

import { describe, it, expect } from 'vitest';
import { borshSerialize, borshDeserialize } from './index.js';
import { Address } from '../address/index.js';
import {
  Transaction,
  TransferPayload,
  DeployPayload,
  CallPayload,
  FunctionSelector,
  Value,
} from '../types/index.js';

// Helper to create a valid signature (64 bytes)
function createSignature(): Uint8Array {
  return new Uint8Array(64).fill(0xab);
}

// Helper to create a valid TxId (32 bytes)
function createTxId(fill: number = 0xcd): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

describe('Borsh Serialization', () => {
  describe('borshSerialize', () => {
    it('should serialize a transfer transaction', () => {
      const tx: Transaction = {
        nonce: 1n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.fromHex('0000000000000000000000000000000000000001'),
          amount: 1000000000000000000n, // 1 SYN
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const bytes = borshSerialize(tx);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);

      // Verify the structure:
      // nonce (8) + from (20) + signature (64) + payload variant (1) + to (20) + amount (32)
      // + gas_limit (8) + gas_price (8) + parents length (4) + timestamp (8)
      // = 8 + 20 + 64 + 1 + 20 + 32 + 8 + 8 + 4 + 8 = 173 bytes
      expect(bytes.length).toBe(173);
    });

    it('should serialize a deploy transaction', () => {
      const code = new Uint8Array([0x00, 0x61, 0x73, 0x6d]); // WASM magic bytes
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'deploy',
          code,
          constructorArgs: [],
        },
        gasLimit: 1000000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const bytes = borshSerialize(tx);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('should serialize a call transaction', () => {
      const tx: Transaction = {
        nonce: 5n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.fromHex('1234567890123456789012345678901234567890'),
          function: FunctionSelector.fromName('transfer'),
          args: [
            { type: 'address', value: Address.zero() },
            { type: 'u256', value: 1000n },
          ],
        },
        gasLimit: 100000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const bytes = borshSerialize(tx);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('should serialize a transaction with parent references', () => {
      const tx: Transaction = {
        nonce: 10n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 100n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [createTxId(0x11), createTxId(0x22)],
        timestamp: 1700000000000n,
      };

      const bytes = borshSerialize(tx);
      expect(bytes).toBeInstanceOf(Uint8Array);
      // Should include 2 parent hashes (32 bytes each) + length prefix (4 bytes)
      // Base transfer: 173 bytes + 2 * 32 = 237 bytes
      expect(bytes.length).toBe(237);
    });

    it('should throw on invalid signature length', () => {
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: new Uint8Array(32), // Wrong length
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      expect(() => borshSerialize(tx)).toThrow('Signature must be 64 bytes');
    });
  });

  describe('borshDeserialize', () => {
    it('should deserialize a transfer transaction', () => {
      const original: Transaction = {
        nonce: 42n,
        from: Address.fromHex('abcdef0123456789abcdef0123456789abcdef01'),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.fromHex('1111111111111111111111111111111111111111'),
          amount: 5000000000000000000n,
        },
        gasLimit: 21000n,
        gasPrice: 2000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const bytes = borshSerialize(original);
      const deserialized = borshDeserialize(bytes);

      expect(deserialized.nonce).toBe(original.nonce);
      expect(deserialized.from.equals(original.from)).toBe(true);
      expect(deserialized.signature).toEqual(original.signature);
      expect(deserialized.payload.type).toBe('transfer');
      const payload = deserialized.payload as TransferPayload;
      const originalPayload = original.payload as TransferPayload;
      expect(payload.to.equals(originalPayload.to)).toBe(true);
      expect(payload.amount).toBe(originalPayload.amount);
      expect(deserialized.gasLimit).toBe(original.gasLimit);
      expect(deserialized.gasPrice).toBe(original.gasPrice);
      expect(deserialized.parents.length).toBe(0);
      expect(deserialized.timestamp).toBe(original.timestamp);
    });

    it('should deserialize a deploy transaction', () => {
      const code = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      const original: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'deploy',
          code,
          constructorArgs: [
            { type: 'string', value: 'MyToken' },
            { type: 'u256', value: 1000000n },
          ],
        },
        gasLimit: 1000000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const bytes = borshSerialize(original);
      const deserialized = borshDeserialize(bytes);

      expect(deserialized.payload.type).toBe('deploy');
      const payload = deserialized.payload as DeployPayload;
      const originalPayload = original.payload as DeployPayload;
      expect(payload.code).toEqual(originalPayload.code);
      expect(payload.constructorArgs.length).toBe(2);
      expect(payload.constructorArgs[0]).toEqual({ type: 'string', value: 'MyToken' });
      expect(payload.constructorArgs[1]).toEqual({ type: 'u256', value: 1000000n });
    });

    it('should deserialize a call transaction', () => {
      const original: Transaction = {
        nonce: 100n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.fromHex('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
          function: FunctionSelector.fromName('approve'),
          args: [
            { type: 'address', value: Address.zero() },
            { type: 'u256', value: 999999999999999999999n },
          ],
        },
        gasLimit: 50000n,
        gasPrice: 1500000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const bytes = borshSerialize(original);
      const deserialized = borshDeserialize(bytes);

      expect(deserialized.payload.type).toBe('call');
      const payload = deserialized.payload as CallPayload;
      const originalPayload = original.payload as CallPayload;
      expect(payload.contract.equals(originalPayload.contract)).toBe(true);
      expect(payload.function.equals(originalPayload.function)).toBe(true);
      expect(payload.args.length).toBe(2);
    });

    it('should deserialize a transaction with parents', () => {
      const parent1 = createTxId(0xaa);
      const parent2 = createTxId(0xbb);
      const original: Transaction = {
        nonce: 50n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 1n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [parent1, parent2],
        timestamp: 1700000000000n,
      };

      const bytes = borshSerialize(original);
      const deserialized = borshDeserialize(bytes);

      expect(deserialized.parents.length).toBe(2);
      expect(deserialized.parents[0]).toEqual(parent1);
      expect(deserialized.parents[1]).toEqual(parent2);
    });

    it('should throw on empty buffer', () => {
      expect(() => borshDeserialize(new Uint8Array(0))).toThrow('Buffer overflow');
    });

    it('should throw on truncated buffer', () => {
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const bytes = borshSerialize(tx);
      // Truncate the buffer
      const truncated = bytes.slice(0, bytes.length - 10);
      expect(() => borshDeserialize(truncated)).toThrow('Buffer overflow');
    });

    it('should throw on extra bytes', () => {
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const bytes = borshSerialize(tx);
      // Add extra bytes
      const extended = new Uint8Array(bytes.length + 5);
      extended.set(bytes);
      extended.set([0xff, 0xff, 0xff, 0xff, 0xff], bytes.length);
      expect(() => borshDeserialize(extended)).toThrow('Unexpected');
    });

    it('should throw on invalid payload variant', () => {
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const bytes = borshSerialize(tx);
      // Corrupt the payload variant byte (at offset 8 + 20 + 64 = 92)
      bytes[92] = 99; // Invalid variant
      expect(() => borshDeserialize(bytes)).toThrow('Unknown payload variant');
    });
  });

  describe('Value serialization round-trip', () => {
    const testCases: { name: string; value: Value }[] = [
      { name: 'bool true', value: { type: 'bool', value: true } },
      { name: 'bool false', value: { type: 'bool', value: false } },
      { name: 'u8', value: { type: 'u8', value: 255 } },
      { name: 'u16', value: { type: 'u16', value: 65535 } },
      { name: 'u32', value: { type: 'u32', value: 4294967295 } },
      { name: 'u64', value: { type: 'u64', value: 18446744073709551615n } },
      { name: 'u128', value: { type: 'u128', value: 340282366920938463463374607431768211455n } },
      { name: 'u256', value: { type: 'u256', value: (1n << 256n) - 1n } },
      { name: 'i8 positive', value: { type: 'i8', value: 127 } },
      { name: 'i8 negative', value: { type: 'i8', value: -128 } },
      { name: 'i16 positive', value: { type: 'i16', value: 32767 } },
      { name: 'i16 negative', value: { type: 'i16', value: -32768 } },
      { name: 'i32 positive', value: { type: 'i32', value: 2147483647 } },
      { name: 'i32 negative', value: { type: 'i32', value: -2147483648 } },
      { name: 'i64 positive', value: { type: 'i64', value: 9223372036854775807n } },
      { name: 'i64 negative', value: { type: 'i64', value: -9223372036854775808n } },
      { name: 'i128 positive', value: { type: 'i128', value: (1n << 127n) - 1n } },
      { name: 'i128 negative', value: { type: 'i128', value: -(1n << 127n) } },
      { name: 'address', value: { type: 'address', value: Address.zero() } },
      { name: 'bytes', value: { type: 'bytes', value: new Uint8Array([1, 2, 3, 4, 5]) } },
      { name: 'string', value: { type: 'string', value: 'Hello, World!' } },
      { name: 'empty string', value: { type: 'string', value: '' } },
      { name: 'array', value: { type: 'array', value: [{ type: 'u8', value: 1 }, { type: 'u8', value: 2 }] } },
      { name: 'option some', value: { type: 'option', value: { type: 'bool', value: true } } },
      { name: 'option none', value: { type: 'option', value: null } },
      { name: 'unit', value: { type: 'unit' } },
    ];

    for (const { name, value } of testCases) {
      it(`should round-trip ${name} value in call args`, () => {
        const tx: Transaction = {
          nonce: 0n,
          from: Address.zero(),
          signature: createSignature(),
          payload: {
            type: 'call',
            contract: Address.zero(),
            function: FunctionSelector.fromName('test'),
            args: [value],
          },
          gasLimit: 21000n,
          gasPrice: 1000000000n,
          parents: [],
          timestamp: 0n,
        };

        const bytes = borshSerialize(tx);
        const deserialized = borshDeserialize(bytes);

        const payload = deserialized.payload as CallPayload;
        expect(payload.args.length).toBe(1);
        
        // Deep equality check
        if (value.type === 'address') {
          expect(payload.args[0].type).toBe('address');
          expect((payload.args[0] as { type: 'address'; value: Address }).value.equals(value.value)).toBe(true);
        } else if (value.type === 'bytes') {
          expect(payload.args[0].type).toBe('bytes');
          expect((payload.args[0] as { type: 'bytes'; value: Uint8Array }).value).toEqual(value.value);
        } else {
          expect(payload.args[0]).toEqual(value);
        }
      });
    }
  });

  describe('Edge cases', () => {
    it('should handle zero values', () => {
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 0n,
        gasPrice: 0n,
        parents: [],
        timestamp: 0n,
      };

      const bytes = borshSerialize(tx);
      const deserialized = borshDeserialize(bytes);

      expect(deserialized.nonce).toBe(0n);
      expect(deserialized.gasLimit).toBe(0n);
      expect(deserialized.gasPrice).toBe(0n);
      expect(deserialized.timestamp).toBe(0n);
      expect((deserialized.payload as TransferPayload).amount).toBe(0n);
    });

    it('should handle maximum u64 values', () => {
      const maxU64 = 18446744073709551615n;
      const tx: Transaction = {
        nonce: maxU64,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: maxU64,
        gasPrice: maxU64,
        parents: [],
        timestamp: maxU64,
      };

      const bytes = borshSerialize(tx);
      const deserialized = borshDeserialize(bytes);

      expect(deserialized.nonce).toBe(maxU64);
      expect(deserialized.gasLimit).toBe(maxU64);
      expect(deserialized.gasPrice).toBe(maxU64);
      expect(deserialized.timestamp).toBe(maxU64);
    });

    it('should handle maximum u256 amount', () => {
      const maxU256 = (1n << 256n) - 1n;
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: maxU256,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const bytes = borshSerialize(tx);
      const deserialized = borshDeserialize(bytes);

      expect((deserialized.payload as TransferPayload).amount).toBe(maxU256);
    });

    it('should handle large contract code', () => {
      const largeCode = new Uint8Array(10000).fill(0x42);
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'deploy',
          code: largeCode,
          constructorArgs: [],
        },
        gasLimit: 1000000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const bytes = borshSerialize(tx);
      const deserialized = borshDeserialize(bytes);

      expect((deserialized.payload as DeployPayload).code).toEqual(largeCode);
    });

    it('should handle many parent references', () => {
      const parents = Array.from({ length: 100 }, (_, i) => createTxId(i));
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents,
        timestamp: 0n,
      };

      const bytes = borshSerialize(tx);
      const deserialized = borshDeserialize(bytes);

      expect(deserialized.parents.length).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(deserialized.parents[i]).toEqual(parents[i]);
      }
    });

    it('should handle nested array values', () => {
      const nestedArray: Value = {
        type: 'array',
        value: [
          { type: 'array', value: [{ type: 'u8', value: 1 }, { type: 'u8', value: 2 }] },
          { type: 'array', value: [{ type: 'u8', value: 3 }, { type: 'u8', value: 4 }] },
        ],
      };

      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.zero(),
          function: FunctionSelector.fromName('test'),
          args: [nestedArray],
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const bytes = borshSerialize(tx);
      const deserialized = borshDeserialize(bytes);

      const payload = deserialized.payload as CallPayload;
      expect(payload.args[0]).toEqual(nestedArray);
    });

    it('should handle unicode strings', () => {
      const unicodeString: Value = {
        type: 'string',
        value: '你好世界 🌍 مرحبا',
      };

      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.zero(),
          function: FunctionSelector.fromName('test'),
          args: [unicodeString],
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const bytes = borshSerialize(tx);
      const deserialized = borshDeserialize(bytes);

      const payload = deserialized.payload as CallPayload;
      expect(payload.args[0]).toEqual(unicodeString);
    });
  });
});


import { jsonSerialize, jsonDeserialize } from './index.js';

describe('JSON Serialization', () => {
  describe('jsonSerialize', () => {
    it('should serialize a transfer transaction', () => {
      const tx: Transaction = {
        nonce: 1n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.fromHex('0000000000000000000000000000000000000001'),
          amount: 1000000000000000000n, // 1 SYN
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const json = jsonSerialize(tx);
      expect(typeof json).toBe('string');
      
      const parsed = JSON.parse(json);
      expect(parsed.nonce).toBe('1');
      expect(parsed.from).toBe(Address.zero().toBech32());
      expect(parsed.payload.type).toBe('transfer');
      expect(parsed.payload.amount).toBe('1000000000000000000');
      expect(parsed.gasLimit).toBe('21000');
      expect(parsed.gasPrice).toBe('1000000000');
      expect(parsed.timestamp).toBe('1700000000000');
    });

    it('should serialize a deploy transaction', () => {
      const code = new Uint8Array([0x00, 0x61, 0x73, 0x6d]); // WASM magic bytes
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'deploy',
          code,
          constructorArgs: [
            { type: 'string', value: 'MyToken' },
            { type: 'u256', value: 1000000n },
          ],
        },
        gasLimit: 1000000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const json = jsonSerialize(tx);
      const parsed = JSON.parse(json);
      
      expect(parsed.payload.type).toBe('deploy');
      expect(parsed.payload.code).toBe('0061736d'); // hex encoded
      expect(parsed.payload.constructorArgs.length).toBe(2);
      expect(parsed.payload.constructorArgs[0]).toEqual({ type: 'string', value: 'MyToken' });
      expect(parsed.payload.constructorArgs[1]).toEqual({ type: 'u256', value: '1000000' });
    });

    it('should serialize a call transaction', () => {
      const tx: Transaction = {
        nonce: 5n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.fromHex('1234567890123456789012345678901234567890'),
          function: FunctionSelector.fromName('transfer'),
          args: [
            { type: 'address', value: Address.zero() },
            { type: 'u256', value: 1000n },
          ],
        },
        gasLimit: 100000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const json = jsonSerialize(tx);
      const parsed = JSON.parse(json);
      
      expect(parsed.payload.type).toBe('call');
      expect(parsed.payload.contract).toBe(Address.fromHex('1234567890123456789012345678901234567890').toBech32());
      expect(parsed.payload.function).toBe(FunctionSelector.fromName('transfer').toHex());
      expect(parsed.payload.args.length).toBe(2);
      expect(parsed.payload.args[0].type).toBe('address');
      expect(parsed.payload.args[0].value).toBe(Address.zero().toBech32());
    });

    it('should serialize a transaction with parent references', () => {
      const tx: Transaction = {
        nonce: 10n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 100n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [createTxId(0x11), createTxId(0x22)],
        timestamp: 1700000000000n,
      };

      const json = jsonSerialize(tx);
      const parsed = JSON.parse(json);
      
      expect(parsed.parents.length).toBe(2);
      expect(parsed.parents[0]).toBe('11'.repeat(32)); // hex encoded
      expect(parsed.parents[1]).toBe('22'.repeat(32));
    });
  });

  describe('jsonDeserialize', () => {
    it('should deserialize a transfer transaction', () => {
      const original: Transaction = {
        nonce: 42n,
        from: Address.fromHex('abcdef0123456789abcdef0123456789abcdef01'),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.fromHex('1111111111111111111111111111111111111111'),
          amount: 5000000000000000000n,
        },
        gasLimit: 21000n,
        gasPrice: 2000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const json = jsonSerialize(original);
      const deserialized = jsonDeserialize(json);

      expect(deserialized.nonce).toBe(original.nonce);
      expect(deserialized.from.equals(original.from)).toBe(true);
      expect(deserialized.signature).toEqual(original.signature);
      expect(deserialized.payload.type).toBe('transfer');
      const payload = deserialized.payload as TransferPayload;
      const originalPayload = original.payload as TransferPayload;
      expect(payload.to.equals(originalPayload.to)).toBe(true);
      expect(payload.amount).toBe(originalPayload.amount);
      expect(deserialized.gasLimit).toBe(original.gasLimit);
      expect(deserialized.gasPrice).toBe(original.gasPrice);
      expect(deserialized.parents.length).toBe(0);
      expect(deserialized.timestamp).toBe(original.timestamp);
    });

    it('should deserialize a deploy transaction', () => {
      const code = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      const original: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'deploy',
          code,
          constructorArgs: [
            { type: 'string', value: 'MyToken' },
            { type: 'u256', value: 1000000n },
          ],
        },
        gasLimit: 1000000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const json = jsonSerialize(original);
      const deserialized = jsonDeserialize(json);

      expect(deserialized.payload.type).toBe('deploy');
      const payload = deserialized.payload as DeployPayload;
      const originalPayload = original.payload as DeployPayload;
      expect(payload.code).toEqual(originalPayload.code);
      expect(payload.constructorArgs.length).toBe(2);
      expect(payload.constructorArgs[0]).toEqual({ type: 'string', value: 'MyToken' });
      expect(payload.constructorArgs[1]).toEqual({ type: 'u256', value: 1000000n });
    });

    it('should deserialize a call transaction', () => {
      const original: Transaction = {
        nonce: 100n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.fromHex('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
          function: FunctionSelector.fromName('approve'),
          args: [
            { type: 'address', value: Address.zero() },
            { type: 'u256', value: 999999999999999999999n },
          ],
        },
        gasLimit: 50000n,
        gasPrice: 1500000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const json = jsonSerialize(original);
      const deserialized = jsonDeserialize(json);

      expect(deserialized.payload.type).toBe('call');
      const payload = deserialized.payload as CallPayload;
      const originalPayload = original.payload as CallPayload;
      expect(payload.contract.equals(originalPayload.contract)).toBe(true);
      expect(payload.function.equals(originalPayload.function)).toBe(true);
      expect(payload.args.length).toBe(2);
    });

    it('should deserialize a transaction with parents', () => {
      const parent1 = createTxId(0xaa);
      const parent2 = createTxId(0xbb);
      const original: Transaction = {
        nonce: 50n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 1n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [parent1, parent2],
        timestamp: 1700000000000n,
      };

      const json = jsonSerialize(original);
      const deserialized = jsonDeserialize(json);

      expect(deserialized.parents.length).toBe(2);
      expect(deserialized.parents[0]).toEqual(parent1);
      expect(deserialized.parents[1]).toEqual(parent2);
    });

    it('should throw on invalid JSON', () => {
      expect(() => jsonDeserialize('not valid json')).toThrow('Invalid JSON');
    });

    it('should throw on missing nonce', () => {
      const json = JSON.stringify({
        from: Address.zero().toBech32(),
        signature: 'ab'.repeat(64),
        payload: { type: 'transfer', to: Address.zero().toBech32(), amount: '0' },
        gasLimit: '21000',
        gasPrice: '1000000000',
        parents: [],
        timestamp: '0',
      });
      expect(() => jsonDeserialize(json)).toThrow('Missing or invalid nonce');
    });

    it('should throw on invalid signature length', () => {
      const json = JSON.stringify({
        nonce: '0',
        from: Address.zero().toBech32(),
        signature: 'ab'.repeat(32), // Wrong length (32 bytes instead of 64)
        payload: { type: 'transfer', to: Address.zero().toBech32(), amount: '0' },
        gasLimit: '21000',
        gasPrice: '1000000000',
        parents: [],
        timestamp: '0',
      });
      expect(() => jsonDeserialize(json)).toThrow('Signature must be 64 bytes');
    });

    it('should throw on invalid parent length', () => {
      const json = JSON.stringify({
        nonce: '0',
        from: Address.zero().toBech32(),
        signature: 'ab'.repeat(64),
        payload: { type: 'transfer', to: Address.zero().toBech32(), amount: '0' },
        gasLimit: '21000',
        gasPrice: '1000000000',
        parents: ['ab'.repeat(16)], // Wrong length (16 bytes instead of 32)
        timestamp: '0',
      });
      expect(() => jsonDeserialize(json)).toThrow('Parent transaction ID must be 32 bytes');
    });
  });

  describe('JSON Value serialization round-trip', () => {
    const testCases: { name: string; value: Value }[] = [
      { name: 'bool true', value: { type: 'bool', value: true } },
      { name: 'bool false', value: { type: 'bool', value: false } },
      { name: 'u8', value: { type: 'u8', value: 255 } },
      { name: 'u16', value: { type: 'u16', value: 65535 } },
      { name: 'u32', value: { type: 'u32', value: 4294967295 } },
      { name: 'u64', value: { type: 'u64', value: 18446744073709551615n } },
      { name: 'u128', value: { type: 'u128', value: 340282366920938463463374607431768211455n } },
      { name: 'u256', value: { type: 'u256', value: (1n << 256n) - 1n } },
      { name: 'i8 positive', value: { type: 'i8', value: 127 } },
      { name: 'i8 negative', value: { type: 'i8', value: -128 } },
      { name: 'i16 positive', value: { type: 'i16', value: 32767 } },
      { name: 'i16 negative', value: { type: 'i16', value: -32768 } },
      { name: 'i32 positive', value: { type: 'i32', value: 2147483647 } },
      { name: 'i32 negative', value: { type: 'i32', value: -2147483648 } },
      { name: 'i64 positive', value: { type: 'i64', value: 9223372036854775807n } },
      { name: 'i64 negative', value: { type: 'i64', value: -9223372036854775808n } },
      { name: 'i128 positive', value: { type: 'i128', value: (1n << 127n) - 1n } },
      { name: 'i128 negative', value: { type: 'i128', value: -(1n << 127n) } },
      { name: 'address', value: { type: 'address', value: Address.zero() } },
      { name: 'bytes', value: { type: 'bytes', value: new Uint8Array([1, 2, 3, 4, 5]) } },
      { name: 'string', value: { type: 'string', value: 'Hello, World!' } },
      { name: 'empty string', value: { type: 'string', value: '' } },
      { name: 'array', value: { type: 'array', value: [{ type: 'u8', value: 1 }, { type: 'u8', value: 2 }] } },
      { name: 'option some', value: { type: 'option', value: { type: 'bool', value: true } } },
      { name: 'option none', value: { type: 'option', value: null } },
      { name: 'unit', value: { type: 'unit' } },
    ];

    for (const { name, value } of testCases) {
      it(`should round-trip ${name} value in call args`, () => {
        const tx: Transaction = {
          nonce: 0n,
          from: Address.zero(),
          signature: createSignature(),
          payload: {
            type: 'call',
            contract: Address.zero(),
            function: FunctionSelector.fromName('test'),
            args: [value],
          },
          gasLimit: 21000n,
          gasPrice: 1000000000n,
          parents: [],
          timestamp: 0n,
        };

        const json = jsonSerialize(tx);
        const deserialized = jsonDeserialize(json);

        const payload = deserialized.payload as CallPayload;
        expect(payload.args.length).toBe(1);
        
        // Deep equality check
        if (value.type === 'address') {
          expect(payload.args[0].type).toBe('address');
          expect((payload.args[0] as { type: 'address'; value: Address }).value.equals(value.value)).toBe(true);
        } else if (value.type === 'bytes') {
          expect(payload.args[0].type).toBe('bytes');
          expect((payload.args[0] as { type: 'bytes'; value: Uint8Array }).value).toEqual(value.value);
        } else {
          expect(payload.args[0]).toEqual(value);
        }
      });
    }
  });

  describe('JSON Edge cases', () => {
    it('should handle zero values', () => {
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 0n,
        gasPrice: 0n,
        parents: [],
        timestamp: 0n,
      };

      const json = jsonSerialize(tx);
      const deserialized = jsonDeserialize(json);

      expect(deserialized.nonce).toBe(0n);
      expect(deserialized.gasLimit).toBe(0n);
      expect(deserialized.gasPrice).toBe(0n);
      expect(deserialized.timestamp).toBe(0n);
      expect((deserialized.payload as TransferPayload).amount).toBe(0n);
    });

    it('should handle maximum u64 values', () => {
      const maxU64 = 18446744073709551615n;
      const tx: Transaction = {
        nonce: maxU64,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: maxU64,
        gasPrice: maxU64,
        parents: [],
        timestamp: maxU64,
      };

      const json = jsonSerialize(tx);
      const deserialized = jsonDeserialize(json);

      expect(deserialized.nonce).toBe(maxU64);
      expect(deserialized.gasLimit).toBe(maxU64);
      expect(deserialized.gasPrice).toBe(maxU64);
      expect(deserialized.timestamp).toBe(maxU64);
    });

    it('should handle maximum u256 amount', () => {
      const maxU256 = (1n << 256n) - 1n;
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: maxU256,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const json = jsonSerialize(tx);
      const deserialized = jsonDeserialize(json);

      expect((deserialized.payload as TransferPayload).amount).toBe(maxU256);
    });

    it('should handle large contract code', () => {
      const largeCode = new Uint8Array(10000).fill(0x42);
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'deploy',
          code: largeCode,
          constructorArgs: [],
        },
        gasLimit: 1000000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const json = jsonSerialize(tx);
      const deserialized = jsonDeserialize(json);

      expect((deserialized.payload as DeployPayload).code).toEqual(largeCode);
    });

    it('should handle many parent references', () => {
      const parents = Array.from({ length: 100 }, (_, i) => createTxId(i));
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents,
        timestamp: 0n,
      };

      const json = jsonSerialize(tx);
      const deserialized = jsonDeserialize(json);

      expect(deserialized.parents.length).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(deserialized.parents[i]).toEqual(parents[i]);
      }
    });

    it('should handle nested array values', () => {
      const nestedArray: Value = {
        type: 'array',
        value: [
          { type: 'array', value: [{ type: 'u8', value: 1 }, { type: 'u8', value: 2 }] },
          { type: 'array', value: [{ type: 'u8', value: 3 }, { type: 'u8', value: 4 }] },
        ],
      };

      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.zero(),
          function: FunctionSelector.fromName('test'),
          args: [nestedArray],
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const json = jsonSerialize(tx);
      const deserialized = jsonDeserialize(json);

      const payload = deserialized.payload as CallPayload;
      expect(payload.args[0]).toEqual(nestedArray);
    });

    it('should handle unicode strings', () => {
      const unicodeString: Value = {
        type: 'string',
        value: '你好世界 🌍 مرحبا',
      };

      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.zero(),
          function: FunctionSelector.fromName('test'),
          args: [unicodeString],
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const json = jsonSerialize(tx);
      const deserialized = jsonDeserialize(json);

      const payload = deserialized.payload as CallPayload;
      expect(payload.args[0]).toEqual(unicodeString);
    });

    it('should produce valid JSON that can be parsed', () => {
      const tx: Transaction = {
        nonce: 1n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 1000n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const json = jsonSerialize(tx);
      
      // Should not throw
      const parsed = JSON.parse(json);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });
  });
});

import { getSigningBytes, computeTxId } from './index.js';
import { UnsignedTransaction } from '../types/index.js';

describe('Signing Bytes and Transaction ID', () => {
  describe('getSigningBytes', () => {
    it('should compute signing bytes for a transfer transaction', () => {
      const tx: Transaction = {
        nonce: 1n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.fromHex('0000000000000000000000000000000000000001'),
          amount: 1000000000000000000n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const signingBytes = getSigningBytes(tx);
      expect(signingBytes).toBeInstanceOf(Uint8Array);
      expect(signingBytes.length).toBeGreaterThan(0);

      // Verify the structure:
      // nonce (8) + nonce_key (8) + from (20) + payload variant (1) + to (20) + amount (32)
      // + gas_limit (8) + gas_price (8) + parents length (4) + timestamp (8) + chain_id (8) + shard_hint (4)
      // = 8 + 8 + 20 + 1 + 20 + 32 + 8 + 8 + 4 + 8 + 8 + 4 = 129 bytes
      expect(signingBytes.length).toBe(129);
    });

    it('should NOT include signature in signing bytes', () => {
      const tx1: Transaction = {
        nonce: 1n,
        from: Address.zero(),
        signature: new Uint8Array(64).fill(0x00),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 100n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const tx2: Transaction = {
        ...tx1,
        signature: new Uint8Array(64).fill(0xff),
      };

      const signingBytes1 = getSigningBytes(tx1);
      const signingBytes2 = getSigningBytes(tx2);

      // Signing bytes should be identical regardless of signature
      expect(signingBytes1).toEqual(signingBytes2);
    });

    it('should compute signing bytes for an unsigned transaction', () => {
      const unsignedTx: UnsignedTransaction = {
        nonce: 0n,
        from: Address.zero(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const signingBytes = getSigningBytes(unsignedTx);
      expect(signingBytes).toBeInstanceOf(Uint8Array);
      expect(signingBytes.length).toBeGreaterThan(0);
    });

    it('should produce deterministic signing bytes', () => {
      const tx: Transaction = {
        nonce: 42n,
        from: Address.fromHex('abcdef0123456789abcdef0123456789abcdef01'),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.fromHex('1111111111111111111111111111111111111111'),
          amount: 5000000000000000000n,
        },
        gasLimit: 21000n,
        gasPrice: 2000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const signingBytes1 = getSigningBytes(tx);
      const signingBytes2 = getSigningBytes(tx);

      expect(signingBytes1).toEqual(signingBytes2);
    });

    it('should include all transaction fields except signature', () => {
      const tx: Transaction = {
        nonce: 100n,
        from: Address.fromHex('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.fromHex('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
          function: FunctionSelector.fromName('transfer'),
          args: [{ type: 'u256', value: 1000n }],
        },
        gasLimit: 100000n,
        gasPrice: 1500000000n,
        parents: [createTxId(0x11), createTxId(0x22)],
        timestamp: 1700000000000n,
      };

      const signingBytes = getSigningBytes(tx);

      // Verify nonce is at the beginning (first 8 bytes, little-endian)
      const nonceBytes = signingBytes.slice(0, 8);
      expect(nonceBytes[0]).toBe(100); // 100 in little-endian

      // Verify from address follows nonce (bytes 8-27)
      const fromBytes = signingBytes.slice(8, 28);
      expect(fromBytes).toEqual(tx.from.toBytes());
    });

    it('should handle deploy payload', () => {
      const code = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'deploy',
          code,
          constructorArgs: [{ type: 'string', value: 'MyToken' }],
        },
        gasLimit: 1000000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const signingBytes = getSigningBytes(tx);
      expect(signingBytes).toBeInstanceOf(Uint8Array);
      expect(signingBytes.length).toBeGreaterThan(0);
    });

    it('should handle call payload', () => {
      const tx: Transaction = {
        nonce: 5n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.fromHex('1234567890123456789012345678901234567890'),
          function: FunctionSelector.fromName('approve'),
          args: [
            { type: 'address', value: Address.zero() },
            { type: 'u256', value: 999999999999999999999n },
          ],
        },
        gasLimit: 50000n,
        gasPrice: 1500000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const signingBytes = getSigningBytes(tx);
      expect(signingBytes).toBeInstanceOf(Uint8Array);
      expect(signingBytes.length).toBeGreaterThan(0);
    });

    it('should include parent transaction IDs', () => {
      const parent1 = createTxId(0xaa);
      const parent2 = createTxId(0xbb);
      
      const txWithParents: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [parent1, parent2],
        timestamp: 0n,
      };

      const txWithoutParents: Transaction = {
        ...txWithParents,
        parents: [],
      };

      const signingBytesWithParents = getSigningBytes(txWithParents);
      const signingBytesWithoutParents = getSigningBytes(txWithoutParents);

      // Should be different due to parents
      expect(signingBytesWithParents.length).toBeGreaterThan(signingBytesWithoutParents.length);
      expect(signingBytesWithParents).not.toEqual(signingBytesWithoutParents);
    });
  });

  describe('computeTxId', () => {
    it('should compute a 32-byte transaction ID', () => {
      const tx: Transaction = {
        nonce: 1n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 1000n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const txId = computeTxId(tx);
      expect(txId).toBeInstanceOf(Uint8Array);
      expect(txId.length).toBe(32);
    });

    it('should produce deterministic transaction IDs', () => {
      const tx: Transaction = {
        nonce: 42n,
        from: Address.fromHex('abcdef0123456789abcdef0123456789abcdef01'),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.fromHex('1111111111111111111111111111111111111111'),
          amount: 5000000000000000000n,
        },
        gasLimit: 21000n,
        gasPrice: 2000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const txId1 = computeTxId(tx);
      const txId2 = computeTxId(tx);

      expect(txId1).toEqual(txId2);
    });

    it('should produce same transaction ID regardless of signature', () => {
      const tx1: Transaction = {
        nonce: 1n,
        from: Address.zero(),
        signature: new Uint8Array(64).fill(0x00),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 100n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const tx2: Transaction = {
        ...tx1,
        signature: new Uint8Array(64).fill(0xff),
      };

      const txId1 = computeTxId(tx1);
      const txId2 = computeTxId(tx2);

      // Transaction IDs should be identical regardless of signature
      expect(txId1).toEqual(txId2);
    });

    it('should produce different transaction IDs for different transactions', () => {
      const tx1: Transaction = {
        nonce: 1n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 100n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const tx2: Transaction = {
        ...tx1,
        nonce: 2n, // Different nonce
      };

      const txId1 = computeTxId(tx1);
      const txId2 = computeTxId(tx2);

      expect(txId1).not.toEqual(txId2);
    });

    it('should compute transaction ID for unsigned transaction', () => {
      const unsignedTx: UnsignedTransaction = {
        nonce: 0n,
        from: Address.zero(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 0n,
      };

      const txId = computeTxId(unsignedTx);
      expect(txId).toBeInstanceOf(Uint8Array);
      expect(txId.length).toBe(32);
    });

    it('should produce same ID for signed and unsigned versions of same transaction', () => {
      const unsignedTx: UnsignedTransaction = {
        nonce: 5n,
        from: Address.fromHex('1234567890123456789012345678901234567890'),
        payload: {
          type: 'transfer',
          to: Address.fromHex('abcdef0123456789abcdef0123456789abcdef01'),
          amount: 1000000000000000000n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const signedTx: Transaction = {
        ...unsignedTx,
        signature: createSignature(),
      };

      const unsignedTxId = computeTxId(unsignedTx);
      const signedTxId = computeTxId(signedTx);

      expect(unsignedTxId).toEqual(signedTxId);
    });

    it('should handle deploy transactions', () => {
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'deploy',
          code: new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
          constructorArgs: [],
        },
        gasLimit: 1000000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const txId = computeTxId(tx);
      expect(txId).toBeInstanceOf(Uint8Array);
      expect(txId.length).toBe(32);
    });

    it('should handle call transactions', () => {
      const tx: Transaction = {
        nonce: 10n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'call',
          contract: Address.fromHex('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
          function: FunctionSelector.fromName('transfer'),
          args: [
            { type: 'address', value: Address.zero() },
            { type: 'u256', value: 1000n },
          ],
        },
        gasLimit: 100000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: 1700000000000n,
      };

      const txId = computeTxId(tx);
      expect(txId).toBeInstanceOf(Uint8Array);
      expect(txId.length).toBe(32);
    });

    it('should handle transactions with parent references', () => {
      const tx: Transaction = {
        nonce: 0n,
        from: Address.zero(),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.zero(),
          amount: 0n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [createTxId(0x11), createTxId(0x22), createTxId(0x33)],
        timestamp: 0n,
      };

      const txId = computeTxId(tx);
      expect(txId).toBeInstanceOf(Uint8Array);
      expect(txId.length).toBe(32);
    });
  });

  describe('getSigningBytes and computeTxId consistency', () => {
    it('should produce consistent results - txId is SHA3-256 of signing bytes', () => {
      const tx: Transaction = {
        nonce: 123n,
        from: Address.fromHex('abcdef0123456789abcdef0123456789abcdef01'),
        signature: createSignature(),
        payload: {
          type: 'transfer',
          to: Address.fromHex('1111111111111111111111111111111111111111'),
          amount: 9999999999999999999n,
        },
        gasLimit: 50000n,
        gasPrice: 2000000000n,
        parents: [createTxId(0xaa)],
        timestamp: 1700000000000n,
      };

      const signingBytes = getSigningBytes(tx);
      const txId = computeTxId(tx);

      // Manually compute SHA3-256 of signing bytes
      const { sha3_256 } = require('@noble/hashes/sha3');
      const expectedTxId = sha3_256(signingBytes);

      expect(txId).toEqual(expectedTxId);
    });
  });
});
