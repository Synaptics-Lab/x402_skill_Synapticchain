/**
 * Unit tests for ContractHelper class
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractHelper, encodeValue, decodeValue, encodeValues } from './index.js';
import { Address } from '../address/index.js';
import { RpcClient } from '../rpc/index.js';
import { FunctionSelector, Value } from '../types/index.js';

// Mock RpcClient
vi.mock('../rpc/index.js', () => {
  return {
    RpcClient: vi.fn().mockImplementation((url: string) => ({
      url,
      getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
      sendTransaction: vi.fn().mockResolvedValue(new Uint8Array(32).fill(0xab)),
      getTransaction: vi.fn().mockResolvedValue(null),
      callContract: vi.fn().mockResolvedValue({ type: 'u256', value: 1000n }),
      getCode: vi.fn().mockResolvedValue(new Uint8Array([0x00, 0x61, 0x73, 0x6d])),
      getCheckpoint: vi.fn().mockResolvedValue({ height: 100n, stateRoot: new Uint8Array(32) }),
      getStatus: vi.fn().mockResolvedValue({ synced: true, peerCount: 10, checkpointHeight: 100n, tps: 1000 }),
    })),
  };
});

describe('ContractHelper', () => {
  let contractAddress: Address;
  let rpcClient: RpcClient;
  let contract: ContractHelper;

  beforeEach(() => {
    vi.clearAllMocks();
    contractAddress = Address.fromHex('1234567890abcdef1234567890abcdef12345678');
    rpcClient = new RpcClient('https://rpc.test.synaptyx.xyz');
    contract = new ContractHelper(contractAddress, rpcClient);
  });

  describe('constructor', () => {
    it('should create a ContractHelper from address and rpcClient', () => {
      const helper = new ContractHelper(contractAddress, rpcClient);
      expect(helper).toBeInstanceOf(ContractHelper);
      expect(helper.address.equals(contractAddress)).toBe(true);
    });

    it('should store the rpcClient', () => {
      const helper = new ContractHelper(contractAddress, rpcClient);
      expect(helper.rpcClient).toBe(rpcClient);
    });
  });

  describe('address getter', () => {
    it('should return the contract address', () => {
      expect(contract.address).toBeInstanceOf(Address);
      expect(contract.address.equals(contractAddress)).toBe(true);
    });
  });

  describe('rpcClient getter', () => {
    it('should return the RPC client', () => {
      expect(contract.rpcClient).toBe(rpcClient);
    });
  });

  describe('static predictAddress', () => {
    it('should predict contract address from deployer and nonce', () => {
      const deployer = Address.fromHex('0000000000000000000000000000000000000001');
      const nonce = 0n;

      const predicted = ContractHelper.predictAddress(deployer, nonce);

      expect(predicted).toBeInstanceOf(Address);
      expect(predicted.toBech32()).toMatch(/^syn1/);
    });

    it('should produce different addresses for different nonces', () => {
      const deployer = Address.fromHex('0000000000000000000000000000000000000001');

      const addr1 = ContractHelper.predictAddress(deployer, 0n);
      const addr2 = ContractHelper.predictAddress(deployer, 1n);

      expect(addr1.equals(addr2)).toBe(false);
    });

    it('should produce different addresses for different deployers', () => {
      const deployer1 = Address.fromHex('0000000000000000000000000000000000000001');
      const deployer2 = Address.fromHex('0000000000000000000000000000000000000002');
      const nonce = 0n;

      const addr1 = ContractHelper.predictAddress(deployer1, nonce);
      const addr2 = ContractHelper.predictAddress(deployer2, nonce);

      expect(addr1.equals(addr2)).toBe(false);
    });

    it('should produce deterministic addresses', () => {
      const deployer = Address.fromHex('0000000000000000000000000000000000000001');
      const nonce = 5n;

      const addr1 = ContractHelper.predictAddress(deployer, nonce);
      const addr2 = ContractHelper.predictAddress(deployer, nonce);

      expect(addr1.equals(addr2)).toBe(true);
    });
  });

  describe('read', () => {
    it('should call rpcClient.callContract with correct parameters', async () => {
      const functionName = 'balanceOf';
      const args: Value[] = [{ type: 'address', value: Address.zero() }];

      await contract.read(functionName, args);

      expect(rpcClient.callContract).toHaveBeenCalledWith(contractAddress, functionName, args);
    });

    it('should return the result from rpcClient', async () => {
      const result = await contract.read('totalSupply');

      expect(result).toEqual({ type: 'u256', value: 1000n });
    });

    it('should work with no arguments', async () => {
      await contract.read('totalSupply');

      expect(rpcClient.callContract).toHaveBeenCalledWith(contractAddress, 'totalSupply', []);
    });
  });

  describe('buildCall', () => {
    it('should build an unsigned transaction for a contract call', () => {
      const functionName = 'transfer';
      const args: Value[] = [
        { type: 'address', value: Address.zero() },
        { type: 'u256', value: 1000n },
      ];

      const unsignedTx = contract.buildCall(functionName, args);

      expect(unsignedTx).toBeDefined();
      expect(unsignedTx.payload.type).toBe('call');
      expect((unsignedTx.payload as { contract: Address }).contract.equals(contractAddress)).toBe(true);
    });

    it('should use default gas values', () => {
      const unsignedTx = contract.buildCall('test');

      expect(unsignedTx.gasLimit).toBe(100000n);
      expect(unsignedTx.gasPrice).toBe(1000000000n);
    });

    it('should use Address.zero() as placeholder for from', () => {
      const unsignedTx = contract.buildCall('test');

      expect(unsignedTx.from.isZero()).toBe(true);
    });

    it('should work with no arguments', () => {
      const unsignedTx = contract.buildCall('getOwner');

      expect(unsignedTx.payload.type).toBe('call');
      expect((unsignedTx.payload as { args: Value[] }).args).toEqual([]);
    });
  });

  describe('encodeCall', () => {
    it('should encode function call with selector and args', () => {
      const functionName = 'transfer';
      const args: Value[] = [
        { type: 'address', value: Address.zero() },
        { type: 'u256', value: 1000n },
      ];

      const encoded = contract.encodeCall(functionName, args);

      expect(encoded).toBeInstanceOf(Uint8Array);
      // First 4 bytes should be the function selector
      const selector = FunctionSelector.fromName(functionName);
      expect(encoded.slice(0, 4)).toEqual(selector.toBytes());
    });

    it('should encode function call with no args', () => {
      const functionName = 'totalSupply';

      const encoded = contract.encodeCall(functionName);

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(4); // Just the selector
    });

    it('should produce different encodings for different functions', () => {
      const encoded1 = contract.encodeCall('transfer');
      const encoded2 = contract.encodeCall('approve');

      expect(encoded1).not.toEqual(encoded2);
    });
  });

  describe('decodeReturn', () => {
    it('should decode a bool value', () => {
      const encoded = new Uint8Array([0, 1]); // type tag 0 (bool), value 1 (true)
      const decoded = contract.decodeReturn(encoded);

      expect(decoded).toEqual({ type: 'bool', value: true });
    });

    it('should decode a u256 value', () => {
      // type tag 6 (u256), followed by 32 bytes little-endian
      const encoded = new Uint8Array(33);
      encoded[0] = 6; // u256 type tag
      encoded[1] = 0xe8; // 1000 in little-endian
      encoded[2] = 0x03;

      const decoded = contract.decodeReturn(encoded);

      expect(decoded.type).toBe('u256');
      expect((decoded as { value: bigint }).value).toBe(1000n);
    });

    it('should decode an address value', () => {
      const addressBytes = new Uint8Array(20).fill(0xab);
      const encoded = new Uint8Array(21);
      encoded[0] = 12; // address type tag
      encoded.set(addressBytes, 1);

      const decoded = contract.decodeReturn(encoded);

      expect(decoded.type).toBe('address');
      expect((decoded as { value: Address }).value.toBytes()).toEqual(addressBytes);
    });

    it('should decode a string value', () => {
      const str = 'Hello';
      const strBytes = new TextEncoder().encode(str);
      const encoded = new Uint8Array(1 + 4 + strBytes.length);
      encoded[0] = 14; // string type tag
      // Length as 4-byte little-endian
      encoded[1] = strBytes.length;
      encoded[2] = 0;
      encoded[3] = 0;
      encoded[4] = 0;
      encoded.set(strBytes, 5);

      const decoded = contract.decodeReturn(encoded);

      expect(decoded).toEqual({ type: 'string', value: 'Hello' });
    });

    it('should decode a unit value', () => {
      const encoded = new Uint8Array([17]); // unit type tag

      const decoded = contract.decodeReturn(encoded);

      expect(decoded).toEqual({ type: 'unit' });
    });

    it('should throw for invalid data with extra bytes', () => {
      const encoded = new Uint8Array([17, 0, 0]); // unit type tag + extra bytes

      expect(() => contract.decodeReturn(encoded)).toThrow();
    });

    it('should throw for unknown type tag', () => {
      const encoded = new Uint8Array([255]); // Invalid type tag

      expect(() => contract.decodeReturn(encoded)).toThrow();
    });
  });
});

describe('Value encoding/decoding', () => {
  describe('encodeValue', () => {
    it('should encode bool values', () => {
      const trueVal: Value = { type: 'bool', value: true };
      const falseVal: Value = { type: 'bool', value: false };

      const encodedTrue = encodeValue(trueVal);
      const encodedFalse = encodeValue(falseVal);

      expect(encodedTrue).toEqual(new Uint8Array([0, 1]));
      expect(encodedFalse).toEqual(new Uint8Array([0, 0]));
    });

    it('should encode u8 values', () => {
      const val: Value = { type: 'u8', value: 255 };
      const encoded = encodeValue(val);

      expect(encoded).toEqual(new Uint8Array([1, 255]));
    });

    it('should encode u16 values', () => {
      const val: Value = { type: 'u16', value: 0x1234 };
      const encoded = encodeValue(val);

      expect(encoded).toEqual(new Uint8Array([2, 0x34, 0x12])); // Little-endian
    });

    it('should encode u32 values', () => {
      const val: Value = { type: 'u32', value: 0x12345678 };
      const encoded = encodeValue(val);

      expect(encoded).toEqual(new Uint8Array([3, 0x78, 0x56, 0x34, 0x12])); // Little-endian
    });

    it('should encode u64 values', () => {
      const val: Value = { type: 'u64', value: 1000n };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(4); // type tag
      expect(encoded.length).toBe(9); // 1 + 8 bytes
    });

    it('should encode u128 values', () => {
      const val: Value = { type: 'u128', value: 1000n };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(5); // type tag
      expect(encoded.length).toBe(17); // 1 + 16 bytes
    });

    it('should encode u256 values', () => {
      const val: Value = { type: 'u256', value: 1000n };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(6); // type tag
      expect(encoded.length).toBe(33); // 1 + 32 bytes
    });

    it('should encode i8 values', () => {
      const posVal: Value = { type: 'i8', value: 127 };
      const negVal: Value = { type: 'i8', value: -128 };

      const encodedPos = encodeValue(posVal);
      const encodedNeg = encodeValue(negVal);

      expect(encodedPos).toEqual(new Uint8Array([7, 127]));
      expect(encodedNeg).toEqual(new Uint8Array([7, 128])); // -128 as unsigned = 128
    });

    it('should encode i16 values', () => {
      const val: Value = { type: 'i16', value: -1 };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(8); // type tag
      expect(encoded).toEqual(new Uint8Array([8, 0xff, 0xff])); // -1 as unsigned
    });

    it('should encode i32 values', () => {
      const val: Value = { type: 'i32', value: -1 };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(9); // type tag
      expect(encoded).toEqual(new Uint8Array([9, 0xff, 0xff, 0xff, 0xff]));
    });

    it('should encode i64 values', () => {
      const val: Value = { type: 'i64', value: -1n };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(10); // type tag
      expect(encoded.length).toBe(9); // 1 + 8 bytes
    });

    it('should encode i128 values', () => {
      const val: Value = { type: 'i128', value: -1n };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(11); // type tag
      expect(encoded.length).toBe(17); // 1 + 16 bytes
    });

    it('should encode address values', () => {
      const addr = Address.zero();
      const val: Value = { type: 'address', value: addr };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(12); // type tag
      expect(encoded.length).toBe(21); // 1 + 20 bytes
    });

    it('should encode bytes values', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const val: Value = { type: 'bytes', value: bytes };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(13); // type tag
      // 1 (tag) + 4 (length) + 5 (data)
      expect(encoded.length).toBe(10);
    });

    it('should encode string values', () => {
      const val: Value = { type: 'string', value: 'Hello' };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(14); // type tag
      // 1 (tag) + 4 (length) + 5 (data)
      expect(encoded.length).toBe(10);
    });

    it('should encode array values', () => {
      const val: Value = {
        type: 'array',
        value: [
          { type: 'u8', value: 1 },
          { type: 'u8', value: 2 },
        ],
      };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(15); // type tag
      // 1 (tag) + 4 (length) + 2 * 2 (two u8 values)
      expect(encoded.length).toBe(9);
    });

    it('should encode option Some values', () => {
      const val: Value = {
        type: 'option',
        value: { type: 'u8', value: 42 },
      };
      const encoded = encodeValue(val);

      expect(encoded[0]).toBe(16); // type tag
      expect(encoded[1]).toBe(1); // Some
      expect(encoded[2]).toBe(1); // u8 type tag
      expect(encoded[3]).toBe(42); // value
    });

    it('should encode option None values', () => {
      const val: Value = { type: 'option', value: null };
      const encoded = encodeValue(val);

      expect(encoded).toEqual(new Uint8Array([16, 0])); // type tag + None
    });

    it('should encode unit values', () => {
      const val: Value = { type: 'unit' };
      const encoded = encodeValue(val);

      expect(encoded).toEqual(new Uint8Array([17]));
    });
  });

  describe('encodeValues', () => {
    it('should encode multiple values', () => {
      const values: Value[] = [
        { type: 'bool', value: true },
        { type: 'u8', value: 42 },
      ];

      const encoded = encodeValues(values);

      expect(encoded).toEqual(new Uint8Array([0, 1, 1, 42]));
    });

    it('should encode empty array', () => {
      const encoded = encodeValues([]);

      expect(encoded).toEqual(new Uint8Array(0));
    });
  });

  describe('round-trip encoding/decoding', () => {
    // Helper to create a ByteReader-like interface for decodeValue
    function roundTrip(value: Value): Value {
      const encoded = encodeValue(value);
      const reader = {
        buffer: encoded,
        offset: 0,
        readU8() {
          return this.buffer[this.offset++];
        },
        readU32() {
          const bytes = this.readBytes(4);
          let result = 0n;
          for (let i = 3; i >= 0; i--) {
            result = (result << 8n) | BigInt(bytes[i]);
          }
          return result;
        },
        readU64() {
          const bytes = this.readBytes(8);
          let result = 0n;
          for (let i = 7; i >= 0; i--) {
            result = (result << 8n) | BigInt(bytes[i]);
          }
          return result;
        },
        readBytes(length: number) {
          const bytes = this.buffer.slice(this.offset, this.offset + length);
          this.offset += length;
          return bytes;
        },
        isAtEnd() {
          return this.offset >= this.buffer.length;
        },
        remaining() {
          return this.buffer.length - this.offset;
        },
      };

      // Use the contract helper to decode
      const contract = new ContractHelper(Address.zero(), new RpcClient('http://test'));
      return contract.decodeReturn(encoded);
    }

    it('should round-trip bool values', () => {
      expect(roundTrip({ type: 'bool', value: true })).toEqual({ type: 'bool', value: true });
      expect(roundTrip({ type: 'bool', value: false })).toEqual({ type: 'bool', value: false });
    });

    it('should round-trip u8 values', () => {
      expect(roundTrip({ type: 'u8', value: 0 })).toEqual({ type: 'u8', value: 0 });
      expect(roundTrip({ type: 'u8', value: 255 })).toEqual({ type: 'u8', value: 255 });
    });

    it('should round-trip u16 values', () => {
      expect(roundTrip({ type: 'u16', value: 0 })).toEqual({ type: 'u16', value: 0 });
      expect(roundTrip({ type: 'u16', value: 65535 })).toEqual({ type: 'u16', value: 65535 });
    });

    it('should round-trip u32 values', () => {
      expect(roundTrip({ type: 'u32', value: 0 })).toEqual({ type: 'u32', value: 0 });
      expect(roundTrip({ type: 'u32', value: 4294967295 })).toEqual({ type: 'u32', value: 4294967295 });
    });

    it('should round-trip u64 values', () => {
      expect(roundTrip({ type: 'u64', value: 0n })).toEqual({ type: 'u64', value: 0n });
      expect(roundTrip({ type: 'u64', value: 18446744073709551615n })).toEqual({
        type: 'u64',
        value: 18446744073709551615n,
      });
    });

    it('should round-trip u128 values', () => {
      expect(roundTrip({ type: 'u128', value: 0n })).toEqual({ type: 'u128', value: 0n });
      expect(roundTrip({ type: 'u128', value: 1000000000000000000n })).toEqual({
        type: 'u128',
        value: 1000000000000000000n,
      });
    });

    it('should round-trip u256 values', () => {
      expect(roundTrip({ type: 'u256', value: 0n })).toEqual({ type: 'u256', value: 0n });
      expect(roundTrip({ type: 'u256', value: 1000000000000000000n })).toEqual({
        type: 'u256',
        value: 1000000000000000000n,
      });
    });

    it('should round-trip i8 values', () => {
      expect(roundTrip({ type: 'i8', value: 0 })).toEqual({ type: 'i8', value: 0 });
      expect(roundTrip({ type: 'i8', value: 127 })).toEqual({ type: 'i8', value: 127 });
      expect(roundTrip({ type: 'i8', value: -128 })).toEqual({ type: 'i8', value: -128 });
    });

    it('should round-trip i16 values', () => {
      expect(roundTrip({ type: 'i16', value: 0 })).toEqual({ type: 'i16', value: 0 });
      expect(roundTrip({ type: 'i16', value: 32767 })).toEqual({ type: 'i16', value: 32767 });
      expect(roundTrip({ type: 'i16', value: -32768 })).toEqual({ type: 'i16', value: -32768 });
    });

    it('should round-trip i32 values', () => {
      expect(roundTrip({ type: 'i32', value: 0 })).toEqual({ type: 'i32', value: 0 });
      expect(roundTrip({ type: 'i32', value: 2147483647 })).toEqual({ type: 'i32', value: 2147483647 });
      expect(roundTrip({ type: 'i32', value: -2147483648 })).toEqual({ type: 'i32', value: -2147483648 });
    });

    it('should round-trip i64 values', () => {
      expect(roundTrip({ type: 'i64', value: 0n })).toEqual({ type: 'i64', value: 0n });
      expect(roundTrip({ type: 'i64', value: 9223372036854775807n })).toEqual({
        type: 'i64',
        value: 9223372036854775807n,
      });
      expect(roundTrip({ type: 'i64', value: -9223372036854775808n })).toEqual({
        type: 'i64',
        value: -9223372036854775808n,
      });
    });

    it('should round-trip i128 values', () => {
      expect(roundTrip({ type: 'i128', value: 0n })).toEqual({ type: 'i128', value: 0n });
      expect(roundTrip({ type: 'i128', value: -1n })).toEqual({ type: 'i128', value: -1n });
    });

    it('should round-trip string values', () => {
      expect(roundTrip({ type: 'string', value: '' })).toEqual({ type: 'string', value: '' });
      expect(roundTrip({ type: 'string', value: 'Hello, World!' })).toEqual({
        type: 'string',
        value: 'Hello, World!',
      });
    });

    it('should round-trip unit values', () => {
      expect(roundTrip({ type: 'unit' })).toEqual({ type: 'unit' });
    });
  });
});

describe('ContractHelper integration scenarios', () => {
  let rpcClient: RpcClient;

  beforeEach(() => {
    vi.clearAllMocks();
    rpcClient = new RpcClient('https://rpc.test.synaptyx.xyz');
  });

  it('should support typical ERC20-like interactions', async () => {
    const tokenAddress = Address.fromHex('1234567890abcdef1234567890abcdef12345678');
    const token = new ContractHelper(tokenAddress, rpcClient);

    // Read total supply
    const totalSupply = await token.read('totalSupply');
    expect(totalSupply).toBeDefined();

    // Read balance
    const balance = await token.read('balanceOf', [
      { type: 'address', value: Address.zero() },
    ]);
    expect(balance).toBeDefined();

    // Build a transfer call
    const transferTx = token.buildCall('transfer', [
      { type: 'address', value: Address.zero() },
      { type: 'u256', value: 1000n },
    ]);
    expect(transferTx.payload.type).toBe('call');
  });

  it('should predict contract addresses correctly', () => {
    const deployer = Address.fromHex('0000000000000000000000000000000000000001');

    // Predict addresses for sequential deployments
    const addr0 = ContractHelper.predictAddress(deployer, 0n);
    const addr1 = ContractHelper.predictAddress(deployer, 1n);
    const addr2 = ContractHelper.predictAddress(deployer, 2n);

    // All should be valid addresses
    expect(addr0.toBech32()).toMatch(/^syn1/);
    expect(addr1.toBech32()).toMatch(/^syn1/);
    expect(addr2.toBech32()).toMatch(/^syn1/);

    // All should be different
    expect(addr0.equals(addr1)).toBe(false);
    expect(addr1.equals(addr2)).toBe(false);
    expect(addr0.equals(addr2)).toBe(false);
  });

  it('should encode and decode call data', () => {
    const contract = new ContractHelper(Address.zero(), rpcClient);

    // Encode a function call
    const callData = contract.encodeCall('transfer', [
      { type: 'address', value: Address.zero() },
      { type: 'u256', value: 1000n },
    ]);

    // Verify it starts with the function selector
    const selector = FunctionSelector.fromName('transfer');
    expect(callData.slice(0, 4)).toEqual(selector.toBytes());

    // The rest should be the encoded arguments
    expect(callData.length).toBeGreaterThan(4);
  });
});
