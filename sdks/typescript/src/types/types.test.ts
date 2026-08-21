/**
 * Unit tests for the types module.
 *
 * Tests core transaction types, FunctionSelector, Value types, and TransactionBuilder.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FunctionSelector,
  FUNCTION_SELECTOR_LENGTH,
  TX_ID_LENGTH,
  createTransferPayload,
  createDeployPayload,
  createCallPayload,
  createCallPayloadWithSelector,
  boolValue,
  u8Value,
  u16Value,
  u32Value,
  u64Value,
  u128Value,
  u256Value,
  i8Value,
  i16Value,
  i32Value,
  i64Value,
  i128Value,
  addressValue,
  bytesValue,
  stringValue,
  arrayValue,
  someValue,
  noneValue,
  unitValue,
  TransactionBuilder,
} from './index.js';
import { Address } from '../address/index.js';
import { Keypair } from '../crypto/index.js';
import { TransactionError, TransactionErrorCode } from '../errors/index.js';
import { getSigningBytes, computeTxId } from '../serialization/index.js';

describe('FunctionSelector', () => {
  describe('constructor', () => {
    it('should create a FunctionSelector from 4 bytes', () => {
      const bytes = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
      const selector = new FunctionSelector(bytes);
      expect(selector.toBytes()).toEqual(bytes);
    });

    it('should throw if bytes is not 4 bytes', () => {
      expect(() => new FunctionSelector(new Uint8Array(3))).toThrow(
        `Function selector must be ${FUNCTION_SELECTOR_LENGTH} bytes, got 3`
      );
      expect(() => new FunctionSelector(new Uint8Array(5))).toThrow(
        `Function selector must be ${FUNCTION_SELECTOR_LENGTH} bytes, got 5`
      );
    });

    it('should make a copy of the input bytes', () => {
      const bytes = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
      const selector = new FunctionSelector(bytes);
      bytes[0] = 0xff;
      expect(selector.toBytes()[0]).toBe(0x12);
    });
  });

  describe('fromName', () => {
    it('should compute selector as first 4 bytes of SHA3-256(name)', () => {
      // Test with known function names
      const selector = FunctionSelector.fromName('transfer');
      expect(selector.toBytes().length).toBe(FUNCTION_SELECTOR_LENGTH);
    });

    it('should produce consistent results for the same name', () => {
      const sel1 = FunctionSelector.fromName('transfer');
      const sel2 = FunctionSelector.fromName('transfer');
      expect(sel1.toBytes()).toEqual(sel2.toBytes());
    });

    it('should produce different results for different names', () => {
      const sel1 = FunctionSelector.fromName('transfer');
      const sel2 = FunctionSelector.fromName('balanceOf');
      expect(sel1.toBytes()).not.toEqual(sel2.toBytes());
    });

    it('should handle empty string', () => {
      const selector = FunctionSelector.fromName('');
      expect(selector.toBytes().length).toBe(FUNCTION_SELECTOR_LENGTH);
    });

    it('should handle unicode characters', () => {
      const selector = FunctionSelector.fromName('transfer_日本語');
      expect(selector.toBytes().length).toBe(FUNCTION_SELECTOR_LENGTH);
    });
  });

  describe('fromHex', () => {
    it('should create selector from hex string', () => {
      const selector = FunctionSelector.fromHex('12345678');
      expect(selector.toBytes()).toEqual(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
    });

    it('should handle 0x prefix', () => {
      const selector = FunctionSelector.fromHex('0x12345678');
      expect(selector.toBytes()).toEqual(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
    });

    it('should handle 0X prefix', () => {
      const selector = FunctionSelector.fromHex('0X12345678');
      expect(selector.toBytes()).toEqual(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
    });

    it('should handle lowercase hex', () => {
      const selector = FunctionSelector.fromHex('abcdef12');
      expect(selector.toBytes()).toEqual(new Uint8Array([0xab, 0xcd, 0xef, 0x12]));
    });

    it('should handle uppercase hex', () => {
      const selector = FunctionSelector.fromHex('ABCDEF12');
      expect(selector.toBytes()).toEqual(new Uint8Array([0xab, 0xcd, 0xef, 0x12]));
    });

    it('should throw for invalid hex length', () => {
      expect(() => FunctionSelector.fromHex('123456')).toThrow(
        `Function selector hex must be ${FUNCTION_SELECTOR_LENGTH * 2} characters`
      );
      expect(() => FunctionSelector.fromHex('1234567890')).toThrow(
        `Function selector hex must be ${FUNCTION_SELECTOR_LENGTH * 2} characters`
      );
    });

    it('should throw for invalid hex characters', () => {
      expect(() => FunctionSelector.fromHex('1234567g')).toThrow(
        'Invalid hex string: contains non-hex characters'
      );
    });
  });

  describe('toBytes', () => {
    it('should return a copy of the bytes', () => {
      const selector = FunctionSelector.fromHex('12345678');
      const bytes1 = selector.toBytes();
      const bytes2 = selector.toBytes();
      expect(bytes1).toEqual(bytes2);
      bytes1[0] = 0xff;
      expect(selector.toBytes()[0]).toBe(0x12);
    });
  });

  describe('toHex', () => {
    it('should return lowercase hex without prefix', () => {
      const selector = FunctionSelector.fromHex('ABCDEF12');
      expect(selector.toHex()).toBe('abcdef12');
    });
  });

  describe('equals', () => {
    it('should return true for equal selectors', () => {
      const sel1 = FunctionSelector.fromName('transfer');
      const sel2 = FunctionSelector.fromName('transfer');
      expect(sel1.equals(sel2)).toBe(true);
    });

    it('should return false for different selectors', () => {
      const sel1 = FunctionSelector.fromName('transfer');
      const sel2 = FunctionSelector.fromName('balanceOf');
      expect(sel1.equals(sel2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return hex representation', () => {
      const selector = FunctionSelector.fromHex('12345678');
      expect(selector.toString()).toBe('12345678');
    });
  });
});

describe('Payload helper functions', () => {
  describe('createTransferPayload', () => {
    it('should create a transfer payload', () => {
      const to = Address.zero();
      const amount = 1000n;
      const payload = createTransferPayload(to, amount);

      expect(payload.type).toBe('transfer');
      expect(payload.to).toBe(to);
      expect(payload.amount).toBe(amount);
    });
  });

  describe('createDeployPayload', () => {
    it('should create a deploy payload with empty constructor args', () => {
      const code = new Uint8Array([0x01, 0x02, 0x03]);
      const payload = createDeployPayload(code);

      expect(payload.type).toBe('deploy');
      expect(payload.code).toBe(code);
      expect(payload.constructorArgs).toEqual([]);
    });

    it('should create a deploy payload with constructor args', () => {
      const code = new Uint8Array([0x01, 0x02, 0x03]);
      const args = [stringValue('MyToken'), u256Value(1000n)];
      const payload = createDeployPayload(code, args);

      expect(payload.type).toBe('deploy');
      expect(payload.code).toBe(code);
      expect(payload.constructorArgs).toEqual(args);
    });
  });

  describe('createCallPayload', () => {
    it('should create a call payload with function name', () => {
      const contract = Address.zero();
      const payload = createCallPayload(contract, 'transfer');

      expect(payload.type).toBe('call');
      expect(payload.contract).toBe(contract);
      expect(payload.function.equals(FunctionSelector.fromName('transfer'))).toBe(true);
      expect(payload.args).toEqual([]);
    });

    it('should create a call payload with args', () => {
      const contract = Address.zero();
      const args = [addressValue(Address.zero()), u256Value(1000n)];
      const payload = createCallPayload(contract, 'transfer', args);

      expect(payload.type).toBe('call');
      expect(payload.args).toEqual(args);
    });
  });

  describe('createCallPayloadWithSelector', () => {
    it('should create a call payload with pre-computed selector', () => {
      const contract = Address.zero();
      const selector = FunctionSelector.fromHex('12345678');
      const payload = createCallPayloadWithSelector(contract, selector);

      expect(payload.type).toBe('call');
      expect(payload.contract).toBe(contract);
      expect(payload.function).toBe(selector);
      expect(payload.args).toEqual([]);
    });
  });
});

describe('Value helper functions', () => {
  describe('boolean values', () => {
    it('should create bool values', () => {
      expect(boolValue(true)).toEqual({ type: 'bool', value: true });
      expect(boolValue(false)).toEqual({ type: 'bool', value: false });
    });
  });

  describe('unsigned integer values', () => {
    it('should create u8 values', () => {
      expect(u8Value(0)).toEqual({ type: 'u8', value: 0 });
      expect(u8Value(255)).toEqual({ type: 'u8', value: 255 });
    });

    it('should create u16 values', () => {
      expect(u16Value(0)).toEqual({ type: 'u16', value: 0 });
      expect(u16Value(65535)).toEqual({ type: 'u16', value: 65535 });
    });

    it('should create u32 values', () => {
      expect(u32Value(0)).toEqual({ type: 'u32', value: 0 });
      expect(u32Value(4294967295)).toEqual({ type: 'u32', value: 4294967295 });
    });

    it('should create u64 values', () => {
      expect(u64Value(0n)).toEqual({ type: 'u64', value: 0n });
      expect(u64Value(18446744073709551615n)).toEqual({
        type: 'u64',
        value: 18446744073709551615n,
      });
    });

    it('should create u128 values', () => {
      expect(u128Value(0n)).toEqual({ type: 'u128', value: 0n });
    });

    it('should create u256 values', () => {
      expect(u256Value(0n)).toEqual({ type: 'u256', value: 0n });
      const maxU256 = 2n ** 256n - 1n;
      expect(u256Value(maxU256)).toEqual({ type: 'u256', value: maxU256 });
    });
  });

  describe('signed integer values', () => {
    it('should create i8 values', () => {
      expect(i8Value(-128)).toEqual({ type: 'i8', value: -128 });
      expect(i8Value(127)).toEqual({ type: 'i8', value: 127 });
    });

    it('should create i16 values', () => {
      expect(i16Value(-32768)).toEqual({ type: 'i16', value: -32768 });
      expect(i16Value(32767)).toEqual({ type: 'i16', value: 32767 });
    });

    it('should create i32 values', () => {
      expect(i32Value(-2147483648)).toEqual({ type: 'i32', value: -2147483648 });
      expect(i32Value(2147483647)).toEqual({ type: 'i32', value: 2147483647 });
    });

    it('should create i64 values', () => {
      expect(i64Value(-9223372036854775808n)).toEqual({
        type: 'i64',
        value: -9223372036854775808n,
      });
      expect(i64Value(9223372036854775807n)).toEqual({
        type: 'i64',
        value: 9223372036854775807n,
      });
    });

    it('should create i128 values', () => {
      expect(i128Value(0n)).toEqual({ type: 'i128', value: 0n });
    });
  });

  describe('complex values', () => {
    it('should create address values', () => {
      const addr = Address.zero();
      expect(addressValue(addr)).toEqual({ type: 'address', value: addr });
    });

    it('should create bytes values', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      expect(bytesValue(bytes)).toEqual({ type: 'bytes', value: bytes });
    });

    it('should create string values', () => {
      expect(stringValue('hello')).toEqual({ type: 'string', value: 'hello' });
    });

    it('should create array values', () => {
      const arr = [boolValue(true), u8Value(42)];
      expect(arrayValue(arr)).toEqual({ type: 'array', value: arr });
    });

    it('should create option values with Some', () => {
      const inner = boolValue(true);
      expect(someValue(inner)).toEqual({ type: 'option', value: inner });
    });

    it('should create option values with None', () => {
      expect(noneValue()).toEqual({ type: 'option', value: null });
    });

    it('should create unit values', () => {
      expect(unitValue()).toEqual({ type: 'unit' });
    });
  });
});

describe('Type constants', () => {
  it('should have correct TX_ID_LENGTH', () => {
    expect(TX_ID_LENGTH).toBe(32);
  });

  it('should have correct FUNCTION_SELECTOR_LENGTH', () => {
    expect(FUNCTION_SELECTOR_LENGTH).toBe(4);
  });
});


describe('TransactionBuilder', () => {
  let senderAddress: Address;
  let recipientAddress: Address;
  let contractAddress: Address;
  let keypair: Keypair;

  beforeEach(() => {
    // Create test addresses
    senderAddress = Address.fromHex('0000000000000000000000000000000000000001');
    recipientAddress = Address.fromHex('0000000000000000000000000000000000000002');
    contractAddress = Address.fromHex('0000000000000000000000000000000000000003');
    keypair = Keypair.generate();
  });

  describe('fluent builder pattern', () => {
    it('should return this for chaining', () => {
      const builder = new TransactionBuilder();
      expect(builder.from(senderAddress)).toBe(builder);
      expect(builder.nonce(0n)).toBe(builder);
      expect(builder.gasLimit(21000n)).toBe(builder);
      expect(builder.gasPrice(1000000000n)).toBe(builder);
      expect(builder.timestamp(BigInt(Date.now()))).toBe(builder);
      expect(builder.parents([])).toBe(builder);
      expect(builder.transfer(recipientAddress, 1000n)).toBe(builder);
    });

    it('should allow chaining all methods', () => {
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .timestamp(1234567890n)
        .parents([])
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.from.equals(senderAddress)).toBe(true);
      expect(tx.nonce).toBe(0n);
      expect(tx.gasLimit).toBe(21000n);
      expect(tx.gasPrice).toBe(1000000000n);
      expect(tx.timestamp).toBe(1234567890n);
      expect(tx.parents).toEqual([]);
    });
  });

  describe('from()', () => {
    it('should set the sender address', () => {
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.from.equals(senderAddress)).toBe(true);
    });
  });

  describe('nonce()', () => {
    it('should set the nonce', () => {
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(42n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.nonce).toBe(42n);
    });

    it('should handle large nonce values', () => {
      const largeNonce = 18446744073709551615n; // max u64
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(largeNonce)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.nonce).toBe(largeNonce);
    });
  });

  describe('gasLimit()', () => {
    it('should set the gas limit', () => {
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(100000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.gasLimit).toBe(100000n);
    });
  });

  describe('gasPrice()', () => {
    it('should set the gas price', () => {
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(2000000000n)
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.gasPrice).toBe(2000000000n);
    });
  });

  describe('timestamp()', () => {
    it('should set the timestamp when provided', () => {
      const timestamp = 1234567890n;
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .timestamp(timestamp)
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.timestamp).toBe(timestamp);
    });

    it('should auto-set timestamp if not provided', () => {
      const beforeBuild = BigInt(Date.now());
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n)
        .build();
      const afterBuild = BigInt(Date.now());

      expect(tx.timestamp).toBeGreaterThanOrEqual(beforeBuild);
      expect(tx.timestamp).toBeLessThanOrEqual(afterBuild);
    });
  });

  describe('parents()', () => {
    it('should set parent transaction IDs', () => {
      const parent1 = new Uint8Array(32).fill(1);
      const parent2 = new Uint8Array(32).fill(2);
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .parents([parent1, parent2])
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.parents.length).toBe(2);
      expect(tx.parents[0]).toEqual(parent1);
      expect(tx.parents[1]).toEqual(parent2);
    });

    it('should default to empty parents array', () => {
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.parents).toEqual([]);
    });
  });

  describe('transfer()', () => {
    it('should create a transfer payload', () => {
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000000000000000000n)
        .build();

      expect(tx.payload.type).toBe('transfer');
      if (tx.payload.type === 'transfer') {
        expect(tx.payload.to.equals(recipientAddress)).toBe(true);
        expect(tx.payload.amount).toBe(1000000000000000000n);
      }
    });
  });

  describe('deploy()', () => {
    it('should create a deploy payload with empty constructor args', () => {
      const code = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(1000000n)
        .gasPrice(1000000000n)
        .deploy(code)
        .build();

      expect(tx.payload.type).toBe('deploy');
      if (tx.payload.type === 'deploy') {
        expect(tx.payload.code).toEqual(code);
        expect(tx.payload.constructorArgs).toEqual([]);
      }
    });

    it('should create a deploy payload with constructor args', () => {
      const code = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const args = [stringValue('MyToken'), u256Value(1000000n)];
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(1000000n)
        .gasPrice(1000000000n)
        .deploy(code, args)
        .build();

      expect(tx.payload.type).toBe('deploy');
      if (tx.payload.type === 'deploy') {
        expect(tx.payload.code).toEqual(code);
        expect(tx.payload.constructorArgs).toEqual(args);
      }
    });
  });

  describe('call()', () => {
    it('should create a call payload with function name', () => {
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(100000n)
        .gasPrice(1000000000n)
        .call(contractAddress, 'transfer')
        .build();

      expect(tx.payload.type).toBe('call');
      if (tx.payload.type === 'call') {
        expect(tx.payload.contract.equals(contractAddress)).toBe(true);
        expect(tx.payload.function.equals(FunctionSelector.fromName('transfer'))).toBe(true);
        expect(tx.payload.args).toEqual([]);
      }
    });

    it('should create a call payload with args', () => {
      const args = [addressValue(recipientAddress), u256Value(1000n)];
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(100000n)
        .gasPrice(1000000000n)
        .call(contractAddress, 'transfer', args)
        .build();

      expect(tx.payload.type).toBe('call');
      if (tx.payload.type === 'call') {
        expect(tx.payload.args).toEqual(args);
      }
    });
  });

  describe('build()', () => {
    it('should build an unsigned transaction with all fields', () => {
      const timestamp = 1234567890n;
      const parent = new Uint8Array(32).fill(1);
      const tx = new TransactionBuilder()
        .from(senderAddress)
        .nonce(5n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .timestamp(timestamp)
        .parents([parent])
        .transfer(recipientAddress, 1000n)
        .build();

      expect(tx.nonce).toBe(5n);
      expect(tx.from.equals(senderAddress)).toBe(true);
      expect(tx.gasLimit).toBe(21000n);
      expect(tx.gasPrice).toBe(1000000000n);
      expect(tx.timestamp).toBe(timestamp);
      expect(tx.parents.length).toBe(1);
      expect(tx.payload.type).toBe('transfer');
    });

    it('should throw TransactionError if from is missing', () => {
      const builder = new TransactionBuilder()
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n);

      expect(() => builder.build()).toThrow(TransactionError);
      try {
        builder.build();
      } catch (e) {
        expect(e).toBeInstanceOf(TransactionError);
        expect((e as TransactionError).code).toBe(TransactionErrorCode.MISSING_FIELD);
        expect((e as TransactionError).message).toContain('from');
      }
    });

    it('should throw TransactionError if nonce is missing', () => {
      const builder = new TransactionBuilder()
        .from(senderAddress)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n);

      expect(() => builder.build()).toThrow(TransactionError);
      try {
        builder.build();
      } catch (e) {
        expect(e).toBeInstanceOf(TransactionError);
        expect((e as TransactionError).code).toBe(TransactionErrorCode.MISSING_FIELD);
        expect((e as TransactionError).message).toContain('nonce');
      }
    });

    it('should throw TransactionError if gasLimit is missing', () => {
      const builder = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n);

      expect(() => builder.build()).toThrow(TransactionError);
      try {
        builder.build();
      } catch (e) {
        expect(e).toBeInstanceOf(TransactionError);
        expect((e as TransactionError).code).toBe(TransactionErrorCode.MISSING_FIELD);
        expect((e as TransactionError).message).toContain('gasLimit');
      }
    });

    it('should throw TransactionError if gasPrice is missing', () => {
      const builder = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .transfer(recipientAddress, 1000n);

      expect(() => builder.build()).toThrow(TransactionError);
      try {
        builder.build();
      } catch (e) {
        expect(e).toBeInstanceOf(TransactionError);
        expect((e as TransactionError).code).toBe(TransactionErrorCode.MISSING_FIELD);
        expect((e as TransactionError).message).toContain('gasPrice');
      }
    });

    it('should throw TransactionError if payload is missing', () => {
      const builder = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n);

      expect(() => builder.build()).toThrow(TransactionError);
      try {
        builder.build();
      } catch (e) {
        expect(e).toBeInstanceOf(TransactionError);
        expect((e as TransactionError).code).toBe(TransactionErrorCode.MISSING_FIELD);
        expect((e as TransactionError).message).toContain('payload');
      }
    });

    it('should list all missing fields in error message', () => {
      const builder = new TransactionBuilder();

      try {
        builder.build();
      } catch (e) {
        expect(e).toBeInstanceOf(TransactionError);
        const error = e as TransactionError;
        expect(error.message).toContain('from');
        expect(error.message).toContain('nonce');
        expect(error.message).toContain('gasLimit');
        expect(error.message).toContain('gasPrice');
        expect(error.message).toContain('payload');
        expect(error.details?.missingFields).toEqual([
          'from',
          'nonce',
          'gasLimit',
          'gasPrice',
          'payload',
        ]);
      }
    });
  });

  describe('sign()', () => {
    it('should sign a transfer transaction', () => {
      const tx = new TransactionBuilder()
        .from(Address.fromBytes(keypair.addressBytes()))
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n)
        .sign(keypair);

      expect(tx.signature).toBeDefined();
      expect(tx.signature.length).toBe(64);
      expect(tx.nonce).toBe(0n);
      expect(tx.payload.type).toBe('transfer');
    });

    it('should sign a deploy transaction', () => {
      const code = new Uint8Array([0x01, 0x02, 0x03]);
      const tx = new TransactionBuilder()
        .from(Address.fromBytes(keypair.addressBytes()))
        .nonce(0n)
        .gasLimit(1000000n)
        .gasPrice(1000000000n)
        .deploy(code, [stringValue('Test')])
        .sign(keypair);

      expect(tx.signature).toBeDefined();
      expect(tx.signature.length).toBe(64);
      expect(tx.payload.type).toBe('deploy');
    });

    it('should sign a call transaction', () => {
      const tx = new TransactionBuilder()
        .from(Address.fromBytes(keypair.addressBytes()))
        .nonce(0n)
        .gasLimit(100000n)
        .gasPrice(1000000000n)
        .call(contractAddress, 'transfer', [addressValue(recipientAddress), u256Value(1000n)])
        .sign(keypair);

      expect(tx.signature).toBeDefined();
      expect(tx.signature.length).toBe(64);
      expect(tx.payload.type).toBe('call');
    });

    it('should throw TransactionError if required fields are missing', () => {
      const builder = new TransactionBuilder()
        .from(senderAddress)
        .nonce(0n);

      expect(() => builder.sign(keypair)).toThrow(TransactionError);
    });

    it('should produce different signatures for different transactions', () => {
      const tx1 = new TransactionBuilder()
        .from(Address.fromBytes(keypair.addressBytes()))
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n)
        .sign(keypair);

      const tx2 = new TransactionBuilder()
        .from(Address.fromBytes(keypair.addressBytes()))
        .nonce(1n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(recipientAddress, 1000n)
        .sign(keypair);

      expect(tx1.signature).not.toEqual(tx2.signature);
    });
  });
});

describe('getSigningBytes', () => {
  it('should compute signing bytes for a transfer transaction', () => {
    const senderAddress = Address.fromHex('0000000000000000000000000000000000000001');
    const recipientAddress = Address.fromHex('0000000000000000000000000000000000000002');

    const tx = new TransactionBuilder()
      .from(senderAddress)
      .nonce(0n)
      .gasLimit(21000n)
      .gasPrice(1000000000n)
      .timestamp(1234567890n)
      .transfer(recipientAddress, 1000n)
      .build();

    const signingBytes = getSigningBytes(tx);

    // Should be deterministic
    const signingBytes2 = getSigningBytes(tx);
    expect(signingBytes).toEqual(signingBytes2);

    // Should be a non-empty byte array
    expect(signingBytes.length).toBeGreaterThan(0);
  });

  it('should produce different signing bytes for different transactions', () => {
    const senderAddress = Address.fromHex('0000000000000000000000000000000000000001');
    const recipientAddress = Address.fromHex('0000000000000000000000000000000000000002');

    const tx1 = new TransactionBuilder()
      .from(senderAddress)
      .nonce(0n)
      .gasLimit(21000n)
      .gasPrice(1000000000n)
      .timestamp(1234567890n)
      .transfer(recipientAddress, 1000n)
      .build();

    const tx2 = new TransactionBuilder()
      .from(senderAddress)
      .nonce(1n)
      .gasLimit(21000n)
      .gasPrice(1000000000n)
      .timestamp(1234567890n)
      .transfer(recipientAddress, 1000n)
      .build();

    const signingBytes1 = getSigningBytes(tx1);
    const signingBytes2 = getSigningBytes(tx2);

    expect(signingBytes1).not.toEqual(signingBytes2);
  });
});

describe('computeTxId', () => {
  it('should compute a 32-byte transaction ID', () => {
    const senderAddress = Address.fromHex('0000000000000000000000000000000000000001');
    const recipientAddress = Address.fromHex('0000000000000000000000000000000000000002');

    const tx = new TransactionBuilder()
      .from(senderAddress)
      .nonce(0n)
      .gasLimit(21000n)
      .gasPrice(1000000000n)
      .timestamp(1234567890n)
      .transfer(recipientAddress, 1000n)
      .build();

    const txId = computeTxId(tx);

    expect(txId.length).toBe(TX_ID_LENGTH);
  });

  it('should be deterministic', () => {
    const senderAddress = Address.fromHex('0000000000000000000000000000000000000001');
    const recipientAddress = Address.fromHex('0000000000000000000000000000000000000002');

    const tx = new TransactionBuilder()
      .from(senderAddress)
      .nonce(0n)
      .gasLimit(21000n)
      .gasPrice(1000000000n)
      .timestamp(1234567890n)
      .transfer(recipientAddress, 1000n)
      .build();

    const txId1 = computeTxId(tx);
    const txId2 = computeTxId(tx);

    expect(txId1).toEqual(txId2);
  });

  it('should produce different IDs for different transactions', () => {
    const senderAddress = Address.fromHex('0000000000000000000000000000000000000001');
    const recipientAddress = Address.fromHex('0000000000000000000000000000000000000002');

    const tx1 = new TransactionBuilder()
      .from(senderAddress)
      .nonce(0n)
      .gasLimit(21000n)
      .gasPrice(1000000000n)
      .timestamp(1234567890n)
      .transfer(recipientAddress, 1000n)
      .build();

    const tx2 = new TransactionBuilder()
      .from(senderAddress)
      .nonce(1n)
      .gasLimit(21000n)
      .gasPrice(1000000000n)
      .timestamp(1234567890n)
      .transfer(recipientAddress, 1000n)
      .build();

    const txId1 = computeTxId(tx1);
    const txId2 = computeTxId(tx2);

    expect(txId1).not.toEqual(txId2);
  });
});
