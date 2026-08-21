/**
 * Contract module for SynapticChain SDK
 *
 * Utilities for contract interaction.
 *
 * @module contract
 */

import { Address } from '../address/index.js';
import { deriveContractAddress } from '../crypto/index.js';
import { RpcClient } from '../rpc/index.js';
import {
  UnsignedTransaction,
  TransactionBuilder,
  Value,
  FunctionSelector,
} from '../types/index.js';
import { SerializationError, SerializationErrorCode } from '../errors/index.js';

// ============================================================================
// Constants
// ============================================================================

/** Default gas limit for contract calls */
const DEFAULT_CALL_GAS_LIMIT = 100000n;

/** Default gas price */
const DEFAULT_GAS_PRICE = 1000000000n; // 1 Gwei equivalent

// ============================================================================
// Value Type Tags for Encoding/Decoding
// ============================================================================

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
// ContractHelper Class
// ============================================================================

/**
 * Helper class for interacting with deployed contracts.
 *
 * ContractHelper provides utilities for:
 * - Predicting contract addresses before deployment
 * - Making read-only contract calls
 * - Building unsigned transactions for contract calls
 * - Encoding function call data
 * - Decoding return values
 *
 * @example
 * ```typescript
 * // Create a contract helper for an existing contract
 * const rpc = new RpcClient('https://rpc.synaptyx.xyz');
 * const contract = new ContractHelper(contractAddress, rpc);
 *
 * // Make a read-only call
 * const balance = await contract.read('balanceOf', [
 *   { type: 'address', value: userAddress }
 * ]);
 *
 * // Build an unsigned transaction for a write operation
 * const unsignedTx = contract.buildCall('transfer', [
 *   { type: 'address', value: recipientAddress },
 *   { type: 'u256', value: 1000n }
 * ]);
 *
 * // Predict a contract address before deployment
 * const predictedAddress = ContractHelper.predictAddress(deployerAddress, nonce);
 * ```
 */
export class ContractHelper {
  private readonly _address: Address;
  private readonly _rpcClient: RpcClient;

  /**
   * Creates a new ContractHelper instance.
   *
   * @param address - The contract address
   * @param rpcClient - The RPC client for network communication
   *
   * @example
   * ```typescript
   * const rpc = new RpcClient('https://rpc.synaptyx.xyz');
   * const contract = new ContractHelper(contractAddress, rpc);
   * ```
   */
  constructor(address: Address, rpcClient: RpcClient) {
    this._address = address;
    this._rpcClient = rpcClient;
  }

  /**
   * Gets the contract address.
   *
   * @returns The contract address
   */
  get address(): Address {
    return this._address;
  }

  /**
   * Gets the RPC client.
   *
   * @returns The RPC client
   */
  get rpcClient(): RpcClient {
    return this._rpcClient;
  }

  /**
   * Predicts the contract address that will be created when deploying
   * from a given deployer address with a given nonce.
   *
   * The contract address is derived as:
   * SHA3-256(deployer || nonce_le_bytes)[12:32]
   *
   * @param deployer - The deployer's address
   * @param nonce - The transaction nonce used for deployment
   * @returns The predicted contract address
   *
   * @example
   * ```typescript
   * const deployerAddress = Address.fromBech32('syn1...');
   * const nonce = 5n;
   * const predictedAddress = ContractHelper.predictAddress(deployerAddress, nonce);
   * console.log('Contract will be deployed at:', predictedAddress.toBech32());
   * ```
   */
  static predictAddress(deployer: Address, nonce: bigint): Address {
    const contractAddressBytes = deriveContractAddress(deployer.toBytes(), nonce);
    return new Address(contractAddressBytes);
  }

  /**
   * Makes a read-only contract call.
   *
   * This method does not create a transaction and does not modify state.
   * It's used for querying contract state without spending gas.
   *
   * @param functionName - The function name to call
   * @param args - Optional function arguments (default: empty array)
   * @returns The return value from the contract
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * // Query a balance
   * const balance = await contract.read('balanceOf', [
   *   { type: 'address', value: userAddress }
   * ]);
   *
   * // Query a simple value
   * const totalSupply = await contract.read('totalSupply');
   * ```
   */
  async read(functionName: string, args: Value[] = []): Promise<Value> {
    return this._rpcClient.callContract(this._address, functionName, args);
  }

  /**
   * Builds an unsigned transaction for a contract call.
   *
   * This creates an UnsignedTransaction that can be signed by a wallet
   * and submitted to the network. The transaction will call the specified
   * function on this contract.
   *
   * Note: The `from` address must be set before signing. The returned
   * transaction uses Address.zero() as a placeholder.
   *
   * @param functionName - The function name to call
   * @param args - Optional function arguments (default: empty array)
   * @returns An unsigned transaction ready to be signed
   *
   * @example
   * ```typescript
   * // Build a transfer call
   * const unsignedTx = contract.buildCall('transfer', [
   *   { type: 'address', value: recipientAddress },
   *   { type: 'u256', value: 1000n }
   * ]);
   *
   * // The caller needs to set from, nonce, and sign
   * const builder = new TransactionBuilder()
   *   .from(senderAddress)
   *   .nonce(currentNonce)
   *   .gasLimit(unsignedTx.gasLimit)
   *   .gasPrice(unsignedTx.gasPrice)
   *   .call(contract.address, 'transfer', args);
   *
   * const signedTx = builder.sign(keypair);
   * ```
   */
  buildCall(functionName: string, args: Value[] = []): UnsignedTransaction {
    // Build the transaction with placeholder values
    // The caller will need to set from and nonce before signing
    return new TransactionBuilder()
      .from(Address.zero())
      .nonce(0n)
      .gasLimit(DEFAULT_CALL_GAS_LIMIT)
      .gasPrice(DEFAULT_GAS_PRICE)
      .call(this._address, functionName, args)
      .build();
  }

  /**
   * Encodes a function call into bytes.
   *
   * The encoded format is:
   * function_selector (4 bytes) || encoded_args
   *
   * This is useful for preparing call data that can be used in
   * low-level transaction construction or for debugging.
   *
   * @param functionName - The function name to encode
   * @param args - Optional function arguments (default: empty array)
   * @returns The encoded call data as bytes
   *
   * @example
   * ```typescript
   * const callData = contract.encodeCall('transfer', [
   *   { type: 'address', value: recipientAddress },
   *   { type: 'u256', value: 1000n }
   * ]);
   * console.log('Call data:', bytesToHex(callData));
   * ```
   */
  encodeCall(functionName: string, args: Value[] = []): Uint8Array {
    const selector = FunctionSelector.fromName(functionName);
    const selectorBytes = selector.toBytes();
    const argsBytes = encodeValues(args);

    // Concatenate selector and args
    const result = new Uint8Array(selectorBytes.length + argsBytes.length);
    result.set(selectorBytes, 0);
    result.set(argsBytes, selectorBytes.length);

    return result;
  }

  /**
   * Decodes return value data from bytes.
   *
   * This decodes the raw bytes returned from a contract call into
   * a Value object that can be inspected and used.
   *
   * @param data - The raw return data bytes
   * @returns The decoded Value
   * @throws {SerializationError} If the data cannot be decoded
   *
   * @example
   * ```typescript
   * const rawData = new Uint8Array([...]); // From low-level call
   * const value = contract.decodeReturn(rawData);
   * if (value.type === 'u256') {
   *   console.log('Balance:', value.value);
   * }
   * ```
   */
  decodeReturn(data: Uint8Array): Value {
    const reader = new ByteReader(data);
    const value = decodeValue(reader);

    // Ensure we've consumed all bytes
    if (!reader.isAtEnd()) {
      throw new SerializationError(
        SerializationErrorCode.INVALID_FORMAT,
        `Unexpected ${reader.remaining()} bytes remaining after decoding return value`,
        { remaining: reader.remaining() }
      );
    }

    return value;
  }
}

// ============================================================================
// Value Encoding/Decoding Helpers
// ============================================================================

/**
 * Encodes an array of Values to bytes.
 */
function encodeValues(values: Value[]): Uint8Array {
  const parts: Uint8Array[] = [];

  for (const value of values) {
    parts.push(encodeValue(value));
  }

  return concatBytes(parts);
}

/**
 * Encodes a single Value to bytes.
 */
function encodeValue(value: Value): Uint8Array {
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
      parts.push(encodeValues(value.value));
      break;
    case 'option':
      parts.push(new Uint8Array([VALUE_TYPE_OPTION]));
      if (value.value === null) {
        parts.push(new Uint8Array([0])); // None
      } else {
        parts.push(new Uint8Array([1])); // Some
        parts.push(encodeValue(value.value));
      }
      break;
    case 'unit':
      parts.push(new Uint8Array([VALUE_TYPE_UNIT]));
      break;
  }

  return concatBytes(parts);
}

/**
 * Decodes a single Value from the reader.
 */
function decodeValue(reader: ByteReader): Value {
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
      const bytes = reader.readBytes(20);
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
      const value: Value[] = [];
      for (let i = 0; i < len; i++) {
        value.push(decodeValue(reader));
      }
      return { type: 'array', value };
    }
    case VALUE_TYPE_OPTION: {
      const isSome = reader.readU8();
      if (isSome === 0) {
        return { type: 'option', value: null };
      } else {
        const innerValue = decodeValue(reader);
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

// ============================================================================
// Utility Functions
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
// Exports
// ============================================================================

export { encodeValue, encodeValues, decodeValue, ByteReader };
