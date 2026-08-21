/**
 * Serialization module for SynapticChain SDK
 *
 * Borsh and JSON serialization for transactions.
 *
 * @module serialization
 */

import { sha3_256 } from '@noble/hashes/sha3';
import { Address, ADDRESS_BYTE_LENGTH } from '../address/index.js';
import { SerializationError, SerializationErrorCode } from '../errors/index.js';
import {
  Transaction,
  UnsignedTransaction,
  Payload,
  TransferPayload,
  DeployPayload,
  CallPayload,
  Value,
  FunctionSelector,
  TxId,
  TX_ID_LENGTH,
  FUNCTION_SELECTOR_LENGTH,
} from '../types/index.js';

// ============================================================================
// Constants
// ============================================================================

/** Length of Ed25519 signature in bytes */
const SIGNATURE_LENGTH = 64;

/** Payload variant indices */
const PAYLOAD_VARIANT_TRANSFER = 0;
const PAYLOAD_VARIANT_DEPLOY = 1;
const PAYLOAD_VARIANT_CALL = 2;

/** Value type tags */
const VALUE_TYPE_BOOL = 0;
const VALUE_TYPE_U8 = 1;
const VALUE_TYPE_U16 = 2;
const VALUE_TYPE_U32 = 3;
const VALUE_TYPE_U64 = 4;
const VALUE_TYPE_U128 = 5;
const VALUE_TYPE_U256 = 6;
const VALUE_TYPE_I8 = 7;
const VALUE_TYPE_I16 = 8;
const VALUE_TYPE_I32 = 9;
const VALUE_TYPE_I64 = 10;
const VALUE_TYPE_I128 = 11;
const VALUE_TYPE_ADDRESS = 12;
const VALUE_TYPE_BYTES = 13;
const VALUE_TYPE_STRING = 14;
const VALUE_TYPE_ARRAY = 15;
const VALUE_TYPE_OPTION = 16;
const VALUE_TYPE_UNIT = 17;

// ============================================================================
// Borsh Serialization
// ============================================================================

/**
 * Serializes a transaction to Borsh format.
 *
 * The Borsh layout for Transaction is:
 * - nonce: u64 (8 bytes, little-endian)
 * - from: [u8; 20] (20 bytes)
 * - signature: [u8; 64] (64 bytes)
 * - payload: enum variant + payload data
 * - gas_limit: u64 (8 bytes, little-endian)
 * - gas_price: u64 (8 bytes, little-endian)
 * - parents: Vec<[u8; 32]> (length prefix + hashes)
 * - timestamp: u64 (8 bytes, little-endian)
 *
 * @param transaction - The transaction to serialize
 * @returns The Borsh-encoded bytes
 *
 * @example
 * ```typescript
 * const tx: Transaction = { ... };
 * const bytes = borshSerialize(tx);
 * ```
 */
export function borshSerialize(transaction: Transaction): Uint8Array {
  const parts: Uint8Array[] = [];

  // nonce (8 bytes, little-endian)
  parts.push(bigintToLeBytes(transaction.nonce, 8));

  // nonce_key (8 bytes, little-endian) - default to 0 if not present
  const nonceKey = (transaction as any).nonceKey ?? 0n;
  parts.push(bigintToLeBytes(nonceKey, 8));

  // from (20 bytes)
  parts.push(transaction.from.toBytes());

  // public_key (32 bytes)
  if (!transaction.publicKey || transaction.publicKey.length !== 32) {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      `Public key must be 32 bytes, got ${transaction.publicKey?.length ?? 0}`,
      { expected: 32, actual: transaction.publicKey?.length ?? 0 }
    );
  }
  parts.push(new Uint8Array(transaction.publicKey));

  // signature (64 bytes)
  if (transaction.signature.length !== SIGNATURE_LENGTH) {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      `Signature must be ${SIGNATURE_LENGTH} bytes, got ${transaction.signature.length}`,
      { expected: SIGNATURE_LENGTH, actual: transaction.signature.length }
    );
  }
  parts.push(new Uint8Array(transaction.signature));

  // payload (enum variant + payload data)
  parts.push(serializePayload(transaction.payload));

  // gas_limit (8 bytes, little-endian)
  parts.push(bigintToLeBytes(transaction.gasLimit, 8));

  // gas_price (8 bytes, little-endian)
  parts.push(bigintToLeBytes(transaction.gasPrice, 8));

  // parents (length prefix + hashes)
  parts.push(serializeParents(transaction.parents));

  // timestamp (8 bytes, little-endian)
  parts.push(bigintToLeBytes(transaction.timestamp, 8));

  // chain_id (8 bytes, little-endian) - CRIT-03 fix
  const chainId = (transaction as any).chainId ?? 1n;
  parts.push(bigintToLeBytes(chainId, 8));

  // shard_hint (4 bytes, little-endian) — prevents cross-shard replay
  const shardHint = (transaction as any).shardHint ?? 0n;
  parts.push(bigintToLeBytes(shardHint, 4));

  // Concatenate all parts
  return concatBytes(parts);
}

/**
 * Deserializes a transaction from Borsh format.
 *
 * @param bytes - The Borsh-encoded bytes
 * @returns The deserialized transaction
 * @throws {SerializationError} If the bytes are invalid or incomplete
 *
 * @example
 * ```typescript
 * const bytes = new Uint8Array([...]);
 * const tx = borshDeserialize(bytes);
 * ```
 */
export function borshDeserialize(bytes: Uint8Array): Transaction {
  const reader = new ByteReader(bytes);

  try {
    // nonce (8 bytes, little-endian)
    const nonce = reader.readU64();

    // nonceKey (8 bytes, little-endian) - S=0 support
    const nonceKey = reader.readU64();

    // from (20 bytes)
    const fromBytes = reader.readBytes(ADDRESS_BYTE_LENGTH);
    const from = new Address(fromBytes);

    // publicKey (32 bytes) - CRIT-03 fix: read BEFORE signature
    const publicKey = reader.readBytes(32);

    // signature (64 bytes)
    const signature = reader.readBytes(SIGNATURE_LENGTH);

    // payload (enum variant + payload data)
    const payload = deserializePayload(reader);

    // gas_limit (8 bytes, little-endian)
    const gasLimit = reader.readU64();

    // gas_price (8 bytes, little-endian)
    const gasPrice = reader.readU64();

    // parents (length prefix + hashes)
    const parents = deserializeParents(reader);

    // timestamp (8 bytes, little-endian)
    const timestamp = reader.readU64();

    // chain_id (8 bytes, little-endian) - CRIT-03 fix
    const chainId = reader.canRead(8) ? reader.readU64() : 1n;

    // Ensure we've consumed all bytes
    if (!reader.isAtEnd()) {
      throw new SerializationError(
        SerializationErrorCode.INVALID_FORMAT,
        `Unexpected ${reader.remaining()} bytes remaining after deserialization`,
        { remaining: reader.remaining() }
      );
    }

    return {
      nonce,
      nonceKey,
      from,
      publicKey,
      signature,
      payload,
      gasLimit,
      gasPrice,
      parents,
      timestamp,
      chainId,
    };
  } catch (error) {
    if (error instanceof SerializationError) {
      throw error;
    }
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      `Failed to deserialize transaction: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: String(error) }
    );
  }
}

// ============================================================================
// Internal Serialization Helpers
// ============================================================================

/**
 * Converts a bigint to little-endian bytes.
 */
function bigintToLeBytes(value: bigint, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let n = value;
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

/**
 * Converts a bigint to big-endian bytes.
 */
function bigintToBeBytes(value: bigint, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let n = value;
  for (let i = byteLength - 1; i >= 0; i--) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

/**
 * Converts little-endian bytes to a bigint.
 */
function leBytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]!);
  }
  return result;
}

/**
 * Converts big-endian bytes to a bigint.
 */
function beBytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]!);
  }
  return result;
}

/**
 * Concatenates multiple Uint8Arrays into one.
 */
function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Serializes a payload to Borsh format.
 */
function serializePayload(payload: Payload): Uint8Array {
  const parts: Uint8Array[] = [];

  switch (payload.type) {
    case 'transfer': {
      // Variant index 0
      parts.push(new Uint8Array([PAYLOAD_VARIANT_TRANSFER]));
      // to (20 bytes)
      parts.push(payload.to.toBytes());
      // amount (32 bytes, big-endian U256) - SECURITY FIX
      parts.push(bigintToBeBytes(payload.amount, 32));
      break;
    }
    case 'deploy': {
      // Variant index 1
      parts.push(new Uint8Array([PAYLOAD_VARIANT_DEPLOY]));
      // code_len (4 bytes, little-endian u32) + code
      parts.push(bigintToLeBytes(BigInt(payload.code.length), 4));
      parts.push(payload.code);
      // args_len (4 bytes, little-endian u32) + args
      parts.push(bigintToLeBytes(BigInt(payload.constructorArgs.length), 4));
      parts.push(serializeValues(payload.constructorArgs));
      break;
    }
    case 'call': {
      // Variant index 2
      parts.push(new Uint8Array([PAYLOAD_VARIANT_CALL]));
      // contract (20 bytes)
      parts.push(payload.contract.toBytes());
      // selector (4 bytes)
      parts.push(payload.function.toBytes());
      // args_len (4 bytes, little-endian u32) + args
      parts.push(bigintToLeBytes(BigInt(payload.args.length), 4));
      parts.push(serializeValues(payload.args));
      // value: 32 bytes big-endian U256
      parts.push(bigintToBeBytes(payload.value ?? 0n, 32));
      break;
    }
  }

  return concatBytes(parts);
}

/**
 * Deserializes a payload from Borsh format.
 */
function deserializePayload(reader: ByteReader): Payload {
  const variant = reader.readU8();

  switch (variant) {
    case PAYLOAD_VARIANT_TRANSFER: {
      // to (20 bytes)
      const toBytes = reader.readBytes(ADDRESS_BYTE_LENGTH);
      const to = new Address(toBytes);
      // amount (32 bytes, big-endian U256) - SECURITY FIX
      const amountBytes = reader.readBytes(32);
      const amount = beBytesToBigint(amountBytes);
      return { type: 'transfer', to, amount } as TransferPayload;
    }
    case PAYLOAD_VARIANT_DEPLOY: {
      // code_len (4 bytes) + code
      const codeLen = Number(reader.readU32());
      const code = reader.readBytes(codeLen);
      // args_len (4 bytes) + args
      const argsLen = Number(reader.readU32());
      const constructorArgs = deserializeValues(reader, argsLen);
      return { type: 'deploy', code, constructorArgs } as DeployPayload;
    }
    case PAYLOAD_VARIANT_CALL: {
      // contract (20 bytes)
      const contractBytes = reader.readBytes(ADDRESS_BYTE_LENGTH);
      const contract = new Address(contractBytes);
      // selector (4 bytes)
      const selectorBytes = reader.readBytes(FUNCTION_SELECTOR_LENGTH);
      const functionSelector = new FunctionSelector(selectorBytes);
      // args_len (4 bytes) + args
      const argsLen = Number(reader.readU32());
      const args = deserializeValues(reader, argsLen);
      // value: 32 bytes big-endian U256
      const valueBytes = reader.readBytes(32);
      const callValue = beBytesToBigint(valueBytes);
      return { type: 'call', contract, function: functionSelector, args, value: callValue } as CallPayload;
    }
    default:
      throw new SerializationError(
        SerializationErrorCode.UNEXPECTED_TYPE,
        `Unknown payload variant: ${variant}`,
        { variant }
      );
  }
}

/**
 * Serializes an array of Values to Borsh format.
 */
function serializeValues(values: Value[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const value of values) {
    parts.push(serializeValue(value));
  }
  return concatBytes(parts);
}

/**
 * Deserializes an array of Values from Borsh format.
 */
function deserializeValues(reader: ByteReader, count: number): Value[] {
  const values: Value[] = [];
  for (let i = 0; i < count; i++) {
    values.push(deserializeValue(reader));
  }
  return values;
}

/**
 * Serializes a single Value to Borsh format.
 */
function serializeValue(value: Value): Uint8Array {
  const parts: Uint8Array[] = [];

  switch (value.type) {
    case 'bool':
      parts.push(new Uint8Array([VALUE_TYPE_BOOL]));
      parts.push(new Uint8Array([value.value ? 1 : 0]));
      break;
    case 'u8':
      parts.push(new Uint8Array([VALUE_TYPE_U8]));
      parts.push(new Uint8Array([value.value]));
      break;
    case 'u16':
      parts.push(new Uint8Array([VALUE_TYPE_U16]));
      parts.push(bigintToLeBytes(BigInt(value.value), 2));
      break;
    case 'u32':
      parts.push(new Uint8Array([VALUE_TYPE_U32]));
      parts.push(bigintToLeBytes(BigInt(value.value), 4));
      break;
    case 'u64':
      parts.push(new Uint8Array([VALUE_TYPE_U64]));
      parts.push(bigintToLeBytes(value.value, 8));
      break;
    case 'u128':
      parts.push(new Uint8Array([VALUE_TYPE_U128]));
      parts.push(bigintToLeBytes(value.value, 16));
      break;
    case 'u256':
      parts.push(new Uint8Array([VALUE_TYPE_U256]));
      parts.push(bigintToLeBytes(value.value, 32));
      break;
    case 'i8':
      parts.push(new Uint8Array([VALUE_TYPE_I8]));
      // Convert signed to unsigned for byte representation
      parts.push(new Uint8Array([value.value < 0 ? value.value + 256 : value.value]));
      break;
    case 'i16':
      parts.push(new Uint8Array([VALUE_TYPE_I16]));
      parts.push(bigintToLeBytes(BigInt(value.value < 0 ? value.value + 65536 : value.value), 2));
      break;
    case 'i32':
      parts.push(new Uint8Array([VALUE_TYPE_I32]));
      parts.push(bigintToLeBytes(BigInt(value.value < 0 ? value.value + 4294967296 : value.value), 4));
      break;
    case 'i64':
      parts.push(new Uint8Array([VALUE_TYPE_I64]));
      parts.push(bigintToLeBytes(value.value < 0n ? value.value + 18446744073709551616n : value.value, 8));
      break;
    case 'i128':
      parts.push(new Uint8Array([VALUE_TYPE_I128]));
      parts.push(bigintToLeBytes(value.value < 0n ? value.value + (1n << 128n) : value.value, 16));
      break;
    case 'address':
      parts.push(new Uint8Array([VALUE_TYPE_ADDRESS]));
      parts.push(value.value.toBytes());
      break;
    case 'bytes':
      parts.push(new Uint8Array([VALUE_TYPE_BYTES]));
      parts.push(bigintToLeBytes(BigInt(value.value.length), 4));
      parts.push(value.value);
      break;
    case 'string': {
      parts.push(new Uint8Array([VALUE_TYPE_STRING]));
      const encoder = new TextEncoder();
      const strBytes = encoder.encode(value.value);
      parts.push(bigintToLeBytes(BigInt(strBytes.length), 4));
      parts.push(strBytes);
      break;
    }
    case 'array':
      parts.push(new Uint8Array([VALUE_TYPE_ARRAY]));
      parts.push(bigintToLeBytes(BigInt(value.value.length), 4));
      parts.push(serializeValues(value.value));
      break;
    case 'option':
      parts.push(new Uint8Array([VALUE_TYPE_OPTION]));
      if (value.value === null) {
        parts.push(new Uint8Array([0])); // None
      } else {
        parts.push(new Uint8Array([1])); // Some
        parts.push(serializeValue(value.value));
      }
      break;
    case 'unit':
      parts.push(new Uint8Array([VALUE_TYPE_UNIT]));
      break;
  }

  return concatBytes(parts);
}

/**
 * Deserializes a single Value from Borsh format.
 */
function deserializeValue(reader: ByteReader): Value {
  const typeTag = reader.readU8();

  switch (typeTag) {
    case VALUE_TYPE_BOOL: {
      const byte = reader.readU8();
      return { type: 'bool', value: byte !== 0 };
    }
    case VALUE_TYPE_U8: {
      const value = reader.readU8();
      return { type: 'u8', value };
    }
    case VALUE_TYPE_U16: {
      const bytes = reader.readBytes(2);
      const value = Number(leBytesToBigint(bytes));
      return { type: 'u16', value };
    }
    case VALUE_TYPE_U32: {
      const value = Number(reader.readU32());
      return { type: 'u32', value };
    }
    case VALUE_TYPE_U64: {
      const value = reader.readU64();
      return { type: 'u64', value };
    }
    case VALUE_TYPE_U128: {
      const bytes = reader.readBytes(16);
      const value = leBytesToBigint(bytes);
      return { type: 'u128', value };
    }
    case VALUE_TYPE_U256: {
      const bytes = reader.readBytes(32);
      const value = leBytesToBigint(bytes);
      return { type: 'u256', value };
    }
    case VALUE_TYPE_I8: {
      const byte = reader.readU8();
      // Convert unsigned to signed
      const value = byte >= 128 ? byte - 256 : byte;
      return { type: 'i8', value };
    }
    case VALUE_TYPE_I16: {
      const bytes = reader.readBytes(2);
      const unsigned = Number(leBytesToBigint(bytes));
      const value = unsigned >= 32768 ? unsigned - 65536 : unsigned;
      return { type: 'i16', value };
    }
    case VALUE_TYPE_I32: {
      const unsigned = Number(reader.readU32());
      const value = unsigned >= 2147483648 ? unsigned - 4294967296 : unsigned;
      return { type: 'i32', value };
    }
    case VALUE_TYPE_I64: {
      const unsigned = reader.readU64();
      const value = unsigned >= 9223372036854775808n ? unsigned - 18446744073709551616n : unsigned;
      return { type: 'i64', value };
    }
    case VALUE_TYPE_I128: {
      const bytes = reader.readBytes(16);
      const unsigned = leBytesToBigint(bytes);
      const value = unsigned >= (1n << 127n) ? unsigned - (1n << 128n) : unsigned;
      return { type: 'i128', value };
    }
    case VALUE_TYPE_ADDRESS: {
      const bytes = reader.readBytes(ADDRESS_BYTE_LENGTH);
      const value = new Address(bytes);
      return { type: 'address', value };
    }
    case VALUE_TYPE_BYTES: {
      const len = Number(reader.readU32());
      const value = reader.readBytes(len);
      return { type: 'bytes', value };
    }
    case VALUE_TYPE_STRING: {
      const len = Number(reader.readU32());
      const bytes = reader.readBytes(len);
      const decoder = new TextDecoder();
      const value = decoder.decode(bytes);
      return { type: 'string', value };
    }
    case VALUE_TYPE_ARRAY: {
      const len = Number(reader.readU32());
      const value = deserializeValues(reader, len);
      return { type: 'array', value };
    }
    case VALUE_TYPE_OPTION: {
      const isSome = reader.readU8();
      if (isSome === 0) {
        return { type: 'option', value: null };
      } else {
        const innerValue = deserializeValue(reader);
        return { type: 'option', value: innerValue };
      }
    }
    case VALUE_TYPE_UNIT:
      return { type: 'unit' };
    default:
      throw new SerializationError(
        SerializationErrorCode.UNEXPECTED_TYPE,
        `Unknown value type tag: ${typeTag}`,
        { typeTag }
      );
  }
}

/**
 * Serializes parent transaction IDs.
 */
function serializeParents(parents: TxId[]): Uint8Array {
  // Length prefix (4 bytes, little-endian u32) + hashes
  const parts: Uint8Array[] = [];
  parts.push(bigintToLeBytes(BigInt(parents.length), 4));
  for (const parent of parents) {
    if (parent.length !== TX_ID_LENGTH) {
      throw new SerializationError(
        SerializationErrorCode.INVALID_FORMAT,
        `Parent transaction ID must be ${TX_ID_LENGTH} bytes, got ${parent.length}`,
        { expected: TX_ID_LENGTH, actual: parent.length }
      );
    }
    parts.push(new Uint8Array(parent));
  }
  return concatBytes(parts);
}

/**
 * Deserializes parent transaction IDs.
 */
function deserializeParents(reader: ByteReader): TxId[] {
  const count = Number(reader.readU32());
  const parents: TxId[] = [];
  for (let i = 0; i < count; i++) {
    const parent = reader.readBytes(TX_ID_LENGTH);
    parents.push(parent);
  }
  return parents;
}

// ============================================================================
// ByteReader Helper Class
// ============================================================================

/**
 * Helper class for reading bytes sequentially from a buffer.
 */
class ByteReader {
  private readonly buffer: Uint8Array;
  private offset: number;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
    this.offset = 0;
  }

  /**
   * Reads a single byte as u8.
   */
  readU8(): number {
    if (this.offset >= this.buffer.length) {
      throw new SerializationError(
        SerializationErrorCode.BUFFER_OVERFLOW,
        `Buffer overflow: attempted to read 1 byte at offset ${this.offset}, but buffer length is ${this.buffer.length}`,
        { offset: this.offset, bufferLength: this.buffer.length }
      );
    }
    const value = this.buffer[this.offset]!;
    this.offset++;
    return value;
  }

  /**
   * Reads 4 bytes as little-endian u32.
   */
  readU32(): bigint {
    const bytes = this.readBytes(4);
    return leBytesToBigint(bytes);
  }

  /**
   * Reads 8 bytes as little-endian u64.
   */
  readU64(): bigint {
    const bytes = this.readBytes(8);
    return leBytesToBigint(bytes);
  }

  /**
   * Reads a specified number of bytes.
   */
  readBytes(length: number): Uint8Array {
    if (this.offset + length > this.buffer.length) {
      throw new SerializationError(
        SerializationErrorCode.BUFFER_OVERFLOW,
        `Buffer overflow: attempted to read ${length} bytes at offset ${this.offset}, but buffer length is ${this.buffer.length}`,
        { offset: this.offset, length, bufferLength: this.buffer.length }
      );
    }
    const bytes = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  /**
   * Returns true if all bytes have been consumed.
   */
  isAtEnd(): boolean {
    return this.offset >= this.buffer.length;
  }

  /**
   * Returns the number of remaining bytes.
   */
  remaining(): number {
    return this.buffer.length - this.offset;
  }
}

// ============================================================================
// JSON Serialization
// ============================================================================

/**
 * JSON representation of a transaction for serialization.
 */
interface JsonTransaction {
  nonce: string;
  nonceKey?: string;
  from: string;
  signature: string;
  payload: JsonPayload;
  gasLimit: string;
  gasPrice: string;
  parents: string[];
  timestamp: string;
  chainId?: string;
}

/**
 * JSON representation of a payload.
 */
type JsonPayload =
  | { type: 'transfer'; to: string; amount: string }
  | { type: 'deploy'; code: string; constructorArgs: JsonValue[] }
  | { type: 'call'; contract: string; function: string; args: JsonValue[] };

/**
 * JSON representation of a Value.
 */
type JsonValue =
  | { type: 'bool'; value: boolean }
  | { type: 'u8'; value: number }
  | { type: 'u16'; value: number }
  | { type: 'u32'; value: number }
  | { type: 'u64'; value: string }
  | { type: 'u128'; value: string }
  | { type: 'u256'; value: string }
  | { type: 'i8'; value: number }
  | { type: 'i16'; value: number }
  | { type: 'i32'; value: number }
  | { type: 'i64'; value: string }
  | { type: 'i128'; value: string }
  | { type: 'address'; value: string }
  | { type: 'bytes'; value: string }
  | { type: 'string'; value: string }
  | { type: 'array'; value: JsonValue[] }
  | { type: 'option'; value: JsonValue | null }
  | { type: 'unit' };

/**
 * Converts a Uint8Array to a hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a hex string to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;

  if (cleanHex.length % 2 !== 0) {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      `Invalid hex string: odd length ${cleanHex.length}`,
      { hex }
    );
  }

  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
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
 * Converts a Value to its JSON representation.
 */
function valueToJson(value: Value): JsonValue {
  switch (value.type) {
    case 'bool':
      return { type: 'bool', value: value.value };
    case 'u8':
      return { type: 'u8', value: value.value };
    case 'u16':
      return { type: 'u16', value: value.value };
    case 'u32':
      return { type: 'u32', value: value.value };
    case 'u64':
      return { type: 'u64', value: value.value.toString() };
    case 'u128':
      return { type: 'u128', value: value.value.toString() };
    case 'u256':
      return { type: 'u256', value: value.value.toString() };
    case 'i8':
      return { type: 'i8', value: value.value };
    case 'i16':
      return { type: 'i16', value: value.value };
    case 'i32':
      return { type: 'i32', value: value.value };
    case 'i64':
      return { type: 'i64', value: value.value.toString() };
    case 'i128':
      return { type: 'i128', value: value.value.toString() };
    case 'address':
      return { type: 'address', value: value.value.toBech32() };
    case 'bytes':
      return { type: 'bytes', value: bytesToHex(value.value) };
    case 'string':
      return { type: 'string', value: value.value };
    case 'array':
      return { type: 'array', value: value.value.map(valueToJson) };
    case 'option':
      return { type: 'option', value: value.value === null ? null : valueToJson(value.value) };
    case 'unit':
      return { type: 'unit' };
  }
}

/**
 * Converts a JSON representation back to a Value.
 */
function jsonToValue(json: JsonValue): Value {
  switch (json.type) {
    case 'bool':
      return { type: 'bool', value: json.value };
    case 'u8':
      return { type: 'u8', value: json.value };
    case 'u16':
      return { type: 'u16', value: json.value };
    case 'u32':
      return { type: 'u32', value: json.value };
    case 'u64':
      return { type: 'u64', value: BigInt(json.value) };
    case 'u128':
      return { type: 'u128', value: BigInt(json.value) };
    case 'u256':
      return { type: 'u256', value: BigInt(json.value) };
    case 'i8':
      return { type: 'i8', value: json.value };
    case 'i16':
      return { type: 'i16', value: json.value };
    case 'i32':
      return { type: 'i32', value: json.value };
    case 'i64':
      return { type: 'i64', value: BigInt(json.value) };
    case 'i128':
      return { type: 'i128', value: BigInt(json.value) };
    case 'address':
      return { type: 'address', value: Address.fromBech32(json.value) };
    case 'bytes':
      return { type: 'bytes', value: hexToBytes(json.value) };
    case 'string':
      return { type: 'string', value: json.value };
    case 'array':
      return { type: 'array', value: json.value.map(jsonToValue) };
    case 'option':
      return { type: 'option', value: json.value === null ? null : jsonToValue(json.value) };
    case 'unit':
      return { type: 'unit' };
  }
}

/**
 * Converts a Payload to its JSON representation.
 */
function payloadToJson(payload: Payload): JsonPayload {
  switch (payload.type) {
    case 'transfer':
      return {
        type: 'transfer',
        to: payload.to.toBech32(),
        amount: payload.amount.toString(),
      };
    case 'deploy':
      return {
        type: 'deploy',
        code: bytesToHex(payload.code),
        constructorArgs: payload.constructorArgs.map(valueToJson),
      };
    case 'call':
      return {
        type: 'call',
        contract: payload.contract.toBech32(),
        function: payload.function.toHex(),
        args: payload.args.map(valueToJson),
      };
  }
}

/**
 * Converts a JSON representation back to a Payload.
 */
function jsonToPayload(json: JsonPayload): Payload {
  switch (json.type) {
    case 'transfer':
      return {
        type: 'transfer',
        to: Address.fromBech32(json.to),
        amount: BigInt(json.amount),
      };
    case 'deploy':
      return {
        type: 'deploy',
        code: hexToBytes(json.code),
        constructorArgs: json.constructorArgs.map(jsonToValue),
      };
    case 'call':
      return {
        type: 'call',
        contract: Address.fromBech32(json.contract),
        function: FunctionSelector.fromHex(json.function),
        args: json.args.map(jsonToValue),
      };
  }
}

/**
 * Serializes a transaction to JSON format.
 *
 * The JSON format uses:
 * - Bech32m encoding for addresses (e.g., "syn1...")
 * - Hex encoding for bytes, signatures, and function selectors
 * - String representation for bigint values (nonce, gasLimit, gasPrice, timestamp, amounts)
 *
 * @param transaction - The transaction to serialize
 * @returns The JSON string representation
 *
 * @example
 * ```typescript
 * const tx: Transaction = { ... };
 * const json = jsonSerialize(tx);
 * console.log(json);
 * // {"nonce":"1","from":"syn1...","signature":"abcd...","payload":{...},...}
 * ```
 */
export function jsonSerialize(transaction: Transaction): string {
  const jsonTx: JsonTransaction = {
    nonce: transaction.nonce.toString(),
    from: transaction.from.toBech32(),
    signature: bytesToHex(transaction.signature),
    payload: payloadToJson(transaction.payload),
    gasLimit: transaction.gasLimit.toString(),
    gasPrice: transaction.gasPrice.toString(),
    parents: transaction.parents.map(bytesToHex),
    timestamp: transaction.timestamp.toString(),
    chainId: (transaction as any).chainId?.toString() ?? '1',
  };

  return JSON.stringify(jsonTx);
}

/**
 * Deserializes a transaction from JSON format.
 *
 * @param json - The JSON string to deserialize
 * @returns The deserialized transaction
 * @throws {SerializationError} If the JSON is invalid or contains invalid data
 *
 * @example
 * ```typescript
 * const json = '{"nonce":"1","from":"syn1...","signature":"abcd...",...}';
 * const tx = jsonDeserialize(json);
 * ```
 */
export function jsonDeserialize(json: string): Transaction {
  let parsed: JsonTransaction;
  try {
    parsed = JSON.parse(json) as JsonTransaction;
  } catch (error) {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: String(error) }
    );
  }

  // Validate required fields
  if (typeof parsed.nonce !== 'string') {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      'Missing or invalid nonce field',
      { field: 'nonce' }
    );
  }
  if (typeof parsed.from !== 'string') {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      'Missing or invalid from field',
      { field: 'from' }
    );
  }
  if (typeof parsed.signature !== 'string') {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      'Missing or invalid signature field',
      { field: 'signature' }
    );
  }
  if (!parsed.payload || typeof parsed.payload !== 'object') {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      'Missing or invalid payload field',
      { field: 'payload' }
    );
  }
  if (typeof parsed.gasLimit !== 'string') {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      'Missing or invalid gasLimit field',
      { field: 'gasLimit' }
    );
  }
  if (typeof parsed.gasPrice !== 'string') {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      'Missing or invalid gasPrice field',
      { field: 'gasPrice' }
    );
  }
  if (!Array.isArray(parsed.parents)) {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      'Missing or invalid parents field',
      { field: 'parents' }
    );
  }
  if (typeof parsed.timestamp !== 'string') {
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      'Missing or invalid timestamp field',
      { field: 'timestamp' }
    );
  }

  try {
    const signature = hexToBytes(parsed.signature);
    if (signature.length !== SIGNATURE_LENGTH) {
      throw new SerializationError(
        SerializationErrorCode.INVALID_FORMAT,
        `Signature must be ${SIGNATURE_LENGTH} bytes, got ${signature.length}`,
        { expected: SIGNATURE_LENGTH, actual: signature.length }
      );
    }

    const parents = parsed.parents.map((p) => {
      const parentBytes = hexToBytes(p);
      if (parentBytes.length !== TX_ID_LENGTH) {
        throw new SerializationError(
          SerializationErrorCode.INVALID_FORMAT,
          `Parent transaction ID must be ${TX_ID_LENGTH} bytes, got ${parentBytes.length}`,
          { expected: TX_ID_LENGTH, actual: parentBytes.length }
        );
      }
      return parentBytes;
    });

    const fromAddr = Address.fromBech32(parsed.from);
    
    return {
      nonce: BigInt(parsed.nonce),
      nonceKey: BigInt(parsed.nonceKey ?? 0),
      from: fromAddr,
      publicKey: fromAddr.toBytes(),
      signature,
      payload: jsonToPayload(parsed.payload),
      gasLimit: BigInt(parsed.gasLimit),
      gasPrice: BigInt(parsed.gasPrice),
      parents,
      timestamp: BigInt(parsed.timestamp),
    };
  } catch (error) {
    if (error instanceof SerializationError) {
      throw error;
    }
    throw new SerializationError(
      SerializationErrorCode.INVALID_FORMAT,
      `Failed to deserialize transaction: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: String(error) }
    );
  }
}

// ============================================================================
// Signing Bytes and Transaction ID
// ============================================================================

/**
 * Computes the signing bytes for a transaction.
 *
 * The signing bytes are the canonical bytes that get signed to produce
 * the transaction signature. The format is:
 *
 * nonce (8 bytes LE) || from (20 bytes) || borsh(payload) || gas_limit (8 bytes LE) ||
 * gas_price (8 bytes LE) || parents || timestamp (8 bytes LE)
 *
 * Note: The signature field is NOT included in the signing bytes.
 *
 * @param transaction - The transaction (signed or unsigned)
 * @returns The signing bytes as Uint8Array
 *
 * @example
 * ```typescript
 * const tx: Transaction = { ... };
 * const signingBytes = getSigningBytes(tx);
 *
 * // Sign the bytes
 * const signature = keypair.sign(signingBytes);
 * ```
 *
 * @see computeTxId - Computes the transaction ID from signing bytes
 */
export function getSigningBytes(transaction: Transaction | UnsignedTransaction): Uint8Array {
  const parts: Uint8Array[] = [];

  // nonce (8 bytes, little-endian)
  parts.push(bigintToLeBytes(transaction.nonce, 8));

  // nonce_key (8 bytes, little-endian) - default to 0 if not present
  const nonceKey = (transaction as any).nonceKey ?? 0n;
  parts.push(bigintToLeBytes(nonceKey, 8));

  // from (20 bytes)
  parts.push(transaction.from.toBytes());

  // borsh(payload)
  parts.push(serializePayload(transaction.payload));

  // gas_limit (8 bytes, little-endian)
  parts.push(bigintToLeBytes(transaction.gasLimit, 8));

  // gas_price (8 bytes, little-endian)
  parts.push(bigintToLeBytes(transaction.gasPrice, 8));

  // parents (length prefix + hashes)
  parts.push(serializeParents(transaction.parents));

  // timestamp (8 bytes, little-endian)
  parts.push(bigintToLeBytes(transaction.timestamp, 8));

  // chain_id (8 bytes, little-endian) - CRIT-03 fix
  const chainId = (transaction as any).chainId ?? 1n;
  parts.push(bigintToLeBytes(chainId, 8));

  // Concatenate all parts
  return concatBytes(parts);
}

/**
 * Computes the transaction ID as SHA3-256 hash of the signing bytes.
 *
 * The transaction ID uniquely identifies a transaction and is computed
 * as the SHA3-256 hash of the signing bytes (which excludes the signature).
 *
 * @param transaction - The transaction (signed or unsigned)
 * @returns The 32-byte transaction ID
 *
 * @example
 * ```typescript
 * const tx: Transaction = { ... };
 * const txId = computeTxId(tx);
 * console.log('Transaction ID:', bytesToHex(txId));
 * ```
 *
 * @see getSigningBytes - Gets the bytes that are hashed
 */
export function computeTxId(transaction: Transaction | UnsignedTransaction): TxId {
  const signingBytes = getSigningBytes(transaction);
  return sha3_256(signingBytes);
}
