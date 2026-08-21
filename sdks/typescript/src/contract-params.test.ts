/**
 * Tests for contract parameter serialization
 */

import { describe, it, expect } from 'vitest';
import {
  toValue,
  serializeArgs,
  u8, u16, u32, u64,
  str, bool, array, option
} from './contract-params';

describe('toValue', () => {
  it('converts boolean values', () => {
    expect(toValue(true)).toEqual({ Bool: true });
    expect(toValue(false)).toEqual({ Bool: false });
  });

  it('converts small integers to U8', () => {
    expect(toValue(0)).toEqual({ U8: 0 });
    expect(toValue(42)).toEqual({ U8: 42 });
    expect(toValue(255)).toEqual({ U8: 255 });
  });

  it('converts medium integers to U16', () => {
    expect(toValue(256)).toEqual({ U16: 256 });
    expect(toValue(1000)).toEqual({ U16: 1000 });
    expect(toValue(65535)).toEqual({ U16: 65535 });
  });

  it('converts large integers to U32', () => {
    expect(toValue(65536)).toEqual({ U32: 65536 });
    expect(toValue(100000)).toEqual({ U32: 100000 });
    expect(toValue(4294967295)).toEqual({ U32: 4294967295 });
  });

  it('converts very large integers to U64', () => {
    expect(toValue(4294967296)).toEqual({ U64: 4294967296n });
    expect(toValue(5000000000)).toEqual({ U64: 5000000000n });
  });

  it('converts negative integers', () => {
    expect(toValue(-1)).toEqual({ I8: -1 });
    expect(toValue(-128)).toEqual({ I8: -128 });
    expect(toValue(-129)).toEqual({ I16: -129 });
    expect(toValue(-32768)).toEqual({ I16: -32768 });
    expect(toValue(-32769)).toEqual({ I32: -32769 });
  });

  it('converts bigint values', () => {
    expect(toValue(1000n)).toEqual({ U128: 1000n });
    expect(toValue(-1000n)).toEqual({ I128: -1000n });
  });

  it('converts string values', () => {
    expect(toValue("hello")).toEqual({ String: "hello" });
    expect(toValue("")).toEqual({ String: "" });
  });

  it('converts Uint8Array to Bytes', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(toValue(bytes)).toEqual({ Bytes: bytes });
  });

  it('converts arrays', () => {
    // Use array() helper for explicit array creation
    expect(array([1, 2, 3])).toEqual({
      Array: [{ U8: 1 }, { U8: 2 }, { U8: 3 }]
    });
  });

  it('converts null to Option', () => {
    expect(toValue(null)).toEqual({ Option: null });
    expect(toValue(undefined)).toEqual({ Option: null });
  });

  it('throws on floating point numbers', () => {
    expect(() => toValue(3.14)).toThrow('Floating point numbers not supported');
  });

  it('throws on unsupported types', () => {
    expect(() => toValue(Symbol('test'))).toThrow('Unsupported parameter type');
  });
});

describe('serializeArgs', () => {
  it('serializes empty array', () => {
    expect(serializeArgs([])).toEqual([]);
  });

  it('serializes single argument', () => {
    expect(serializeArgs([42])).toEqual([{ U8: 42 }]);
  });

  it('serializes multiple arguments', () => {
    expect(serializeArgs([5, "test", true])).toEqual([
      { U8: 5 },
      { String: "test" },
      { Bool: true }
    ]);
  });

  it('serializes complex arguments', () => {
    expect(serializeArgs([array([1, 2]), "hello", null])).toEqual([
      { Array: [{ U8: 1 }, { U8: 2 }] },
      { String: "hello" },
      { Option: null }
    ]);
  });
});

describe('type-safe helpers', () => {
  it('u8 creates U8 values', () => {
    expect(u8(42)).toEqual({ U8: 42 });
    expect(() => u8(256)).toThrow('must be');
    expect(() => u8(-1)).toThrow('must be');
  });

  it('u16 creates U16 values', () => {
    expect(u16(1000)).toEqual({ U16: 1000 });
    expect(() => u16(65536)).toThrow('must be');
  });

  it('u32 creates U32 values', () => {
    expect(u32(100000)).toEqual({ U32: 100000 });
    expect(() => u32(4294967296)).toThrow('must be');
  });

  it('u64 creates U64 values', () => {
    expect(u64(5000000000)).toEqual({ U64: 5000000000n });
    expect(u64(5000000000n)).toEqual({ U64: 5000000000n });
  });

  it('str creates String values', () => {
    expect(str("hello")).toEqual({ String: "hello" });
  });

  it('bool creates Bool values', () => {
    expect(bool(true)).toEqual({ Bool: true });
  });

  it('array creates Array values', () => {
    expect(array([1, 2, 3])).toEqual({
      Array: [{ U8: 1 }, { U8: 2 }, { U8: 3 }]
    });
  });

  it('option creates Option values', () => {
    expect(option(null)).toEqual({ Option: null });
    expect(option(42)).toEqual({ Option: { U8: 42 } });
  });
});
