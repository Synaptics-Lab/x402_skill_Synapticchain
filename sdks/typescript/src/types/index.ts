/**
 * Types module for SynapticChain SDK
 *
 * Core transaction types and structures matching synaptic-types.
 *
 * @module types
 */

import { sha3_256 } from '@noble/hashes/sha3';
import { Address } from '../address/index.js';
import { Keypair } from '../crypto/index.js';
import { TransactionError, TransactionErrorCode } from '../errors/index.js';

// ============================================================================
// Type Aliases
// ============================================================================

/**
 * Transaction ID - 32-byte SHA3-256 hash of the transaction signing bytes.
 */
export type TxId = Uint8Array;

/**
 * Ed25519 signature - 64 bytes.
 */
export type Signature = Uint8Array;

/**
 * Gas unit for measuring computational cost.
 * Represented as bigint to support large values.
 */
export type Gas = bigint;

/** Length of transaction ID in bytes */
export const TX_ID_LENGTH = 32;

/** Length of function selector in bytes */
export const FUNCTION_SELECTOR_LENGTH = 4;

// ============================================================================
// Value Types
// ============================================================================

/**
 * Boolean value type.
 */
export interface BoolValue {
  type: 'bool';
  value: boolean;
}

/**
 * Unsigned 8-bit integer value type.
 */
export interface U8Value {
  type: 'u8';
  value: number;
}

/**
 * Unsigned 16-bit integer value type.
 */
export interface U16Value {
  type: 'u16';
  value: number;
}

/**
 * Unsigned 32-bit integer value type.
 */
export interface U32Value {
  type: 'u32';
  value: number;
}

/**
 * Unsigned 64-bit integer value type.
 */
export interface U64Value {
  type: 'u64';
  value: bigint;
}

/**
 * Unsigned 128-bit integer value type.
 */
export interface U128Value {
  type: 'u128';
  value: bigint;
}

/**
 * Unsigned 256-bit integer value type.
 * Used for amounts and large numeric values.
 */
export interface U256Value {
  type: 'u256';
  value: bigint;
}

/**
 * Signed 8-bit integer value type.
 */
export interface I8Value {
  type: 'i8';
  value: number;
}

/**
 * Signed 16-bit integer value type.
 */
export interface I16Value {
  type: 'i16';
  value: number;
}

/**
 * Signed 32-bit integer value type.
 */
export interface I32Value {
  type: 'i32';
  value: number;
}

/**
 * Signed 64-bit integer value type.
 */
export interface I64Value {
  type: 'i64';
  value: bigint;
}

/**
 * Signed 128-bit integer value type.
 */
export interface I128Value {
  type: 'i128';
  value: bigint;
}

/**
 * Address value type.
 */
export interface AddressValue {
  type: 'address';
  value: Address;
}

/**
 * Bytes value type for arbitrary binary data.
 */
export interface BytesValue {
  type: 'bytes';
  value: Uint8Array;
}

/**
 * String value type.
 */
export interface StringValue {
  type: 'string';
  value: string;
}

/**
 * Array value type containing other values.
 */
export interface ArrayValue {
  type: 'array';
  value: Value[];
}

/**
 * Option value type - either contains a value or null.
 */
export interface OptionValue {
  type: 'option';
  value: Value | null;
}

/**
 * Unit value type - represents no value (like void).
 */
export interface UnitValue {
  type: 'unit';
}

/**
 * Union type representing all supported value types for contract interaction.
 *
 * Supports:
 * - Boolean: `{ type: 'bool', value: boolean }`
 * - Unsigned integers: u8, u16, u32 (number), u64, u128, u256 (bigint)
 * - Signed integers: i8, i16, i32 (number), i64, i128 (bigint)
 * - Address: `{ type: 'address', value: Address }`
 * - Bytes: `{ type: 'bytes', value: Uint8Array }`
 * - String: `{ type: 'string', value: string }`
 * - Array: `{ type: 'array', value: Value[] }`
 * - Option: `{ type: 'option', value: Value | null }`
 * - Unit: `{ type: 'unit' }`
 *
 * @example
 * ```typescript
 * // Boolean value
 * const boolVal: Value = { type: 'bool', value: true };
 *
 * // U256 value (for amounts)
 * const amount: Value = { type: 'u256', value: 1000000000000000000n };
 *
 * // Address value
 * const addr: Value = { type: 'address', value: Address.zero() };
 *
 * // Array of values
 * const arr: Value = { type: 'array', value: [boolVal, amount] };
 *
 * // Optional value
 * const opt: Value = { type: 'option', value: boolVal };
 * const none: Value = { type: 'option', value: null };
 * ```
 */
export type Value =
  | BoolValue
  | U8Value
  | U16Value
  | U32Value
  | U64Value
  | U128Value
  | U256Value
  | I8Value
  | I16Value
  | I32Value
  | I64Value
  | I128Value
  | AddressValue
  | BytesValue
  | StringValue
  | ArrayValue
  | OptionValue
  | UnitValue;

// ============================================================================
// Function Selector
// ============================================================================

/**
 * Function selector for contract calls.
 *
 * A function selector is the first 4 bytes of SHA3-256(function_name).
 * It uniquely identifies a function within a contract.
 *
 * @example
 * ```typescript
 * // Create from function name
 * const selector = FunctionSelector.fromName('transfer');
 *
 * // Create from raw bytes
 * const selector2 = new FunctionSelector(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
 *
 * // Get the bytes
 * const bytes = selector.toBytes();
 *
 * // Get hex representation
 * const hex = selector.toHex();  // "12345678"
 * ```
 */
export class FunctionSelector {
  private readonly _bytes: Uint8Array;

  /**
   * Creates a FunctionSelector from raw bytes.
   *
   * @param bytes - 4-byte function selector
   * @throws {Error} If bytes is not exactly 4 bytes
   *
   * @example
   * ```typescript
   * const selector = new FunctionSelector(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
   * ```
   */
  constructor(bytes: Uint8Array) {
    if (bytes.length !== FUNCTION_SELECTOR_LENGTH) {
      throw new Error(
        `Function selector must be ${FUNCTION_SELECTOR_LENGTH} bytes, got ${bytes.length}`
      );
    }
    // Make a copy to prevent external mutation
    this._bytes = new Uint8Array(bytes);
  }

  /**
   * Creates a FunctionSelector from a function name.
   *
   * The selector is computed as the first 4 bytes of SHA3-256(function_name).
   *
   * @param name - The function name
   * @returns A FunctionSelector for the given function name
   *
   * @example
   * ```typescript
   * const selector = FunctionSelector.fromName('transfer');
   * const selector2 = FunctionSelector.fromName('balanceOf');
   * ```
   */
  static fromName(name: string): FunctionSelector {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(name);
    const hash = sha3_256(nameBytes);
    // Take first 4 bytes
    return new FunctionSelector(hash.slice(0, FUNCTION_SELECTOR_LENGTH));
  }

  /**
   * Creates a FunctionSelector from a hex string.
   *
   * @param hex - Hex-encoded selector (with or without 0x prefix)
   * @returns A FunctionSelector
   * @throws {Error} If the hex string is invalid or not 4 bytes when decoded
   *
   * @example
   * ```typescript
   * const selector = FunctionSelector.fromHex('12345678');
   * const selector2 = FunctionSelector.fromHex('0x12345678');
   * ```
   */
  static fromHex(hex: string): FunctionSelector {
    // Remove 0x prefix if present
    const cleanHex = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;

    if (cleanHex.length !== FUNCTION_SELECTOR_LENGTH * 2) {
      throw new Error(
        `Function selector hex must be ${FUNCTION_SELECTOR_LENGTH * 2} characters, got ${cleanHex.length}`
      );
    }

    if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
      throw new Error('Invalid hex string: contains non-hex characters');
    }

    const bytes = new Uint8Array(FUNCTION_SELECTOR_LENGTH);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
    }

    return new FunctionSelector(bytes);
  }

  /**
   * Returns the raw 4-byte selector data.
   *
   * @returns A copy of the 4-byte selector data
   *
   * @example
   * ```typescript
   * const selector = FunctionSelector.fromName('transfer');
   * const bytes = selector.toBytes();
   * console.log(bytes.length);  // 4
   * ```
   */
  toBytes(): Uint8Array {
    // Return a copy to prevent external mutation
    return new Uint8Array(this._bytes);
  }

  /**
   * Returns the selector as a hex string.
   *
   * @returns Hex-encoded selector (lowercase, no prefix)
   *
   * @example
   * ```typescript
   * const selector = FunctionSelector.fromName('transfer');
   * console.log(selector.toHex());  // e.g., "a9059cbb"
   * ```
   */
  toHex(): string {
    return Array.from(this._bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Compares this selector with another for equality.
   *
   * @param other - The selector to compare with
   * @returns true if the selectors are equal, false otherwise
   *
   * @example
   * ```typescript
   * const sel1 = FunctionSelector.fromName('transfer');
   * const sel2 = FunctionSelector.fromName('transfer');
   * console.log(sel1.equals(sel2));  // true
   * ```
   */
  equals(other: FunctionSelector): boolean {
    for (let i = 0; i < FUNCTION_SELECTOR_LENGTH; i++) {
      if (this._bytes[i] !== other._bytes[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns the hex string representation.
   *
   * @returns Hex-encoded selector
   */
  toString(): string {
    return this.toHex();
  }
}

// ============================================================================
// Payload Types
// ============================================================================

/**
 * Transfer payload for sending tokens to an address.
 *
 * @example
 * ```typescript
 * const payload: TransferPayload = {
 *   type: 'transfer',
 *   to: Address.fromBech32('syn1...'),
 *   amount: 1000000000000000000n  // 1 SYN (18 decimals)
 * };
 * ```
 */
export interface TransferPayload {
  type: 'transfer';
  /** Recipient address */
  to: Address;
  /** Amount to transfer as U256 (bigint) */
  amount: bigint;
}

/**
 * Deploy payload for deploying a new contract.
 *
 * @example
 * ```typescript
 * const payload: DeployPayload = {
 *   type: 'deploy',
 *   code: contractBytecode,
 *   constructorArgs: [
 *     { type: 'string', value: 'MyToken' },
 *     { type: 'u256', value: 1000000n }
 *   ]
 * };
 * ```
 */
export interface DeployPayload {
  type: 'deploy';
  /** Contract bytecode */
  code: Uint8Array;
  /** Constructor arguments */
  constructorArgs: Value[];
}

/**
 * Call payload for calling a contract function.
 *
 * @example
 * ```typescript
 * const payload: CallPayload = {
 *   type: 'call',
 *   contract: Address.fromBech32('syn1...'),
 *   function: FunctionSelector.fromName('transfer'),
 *   args: [
 *     { type: 'address', value: recipientAddress },
 *     { type: 'u256', value: 1000n }
 *   ]
 * };
 * ```
 */
export interface CallPayload {
  type: 'call';
  /** Contract address to call */
  contract: Address;
  /** Function selector */
  function: FunctionSelector;
  /** Function arguments */
  args: Value[];
  /** SYN value attached to this call (bigint, 0 for non-payable calls) */
  value?: bigint;
}

/**
 * Union type for all transaction payload types.
 *
 * - Transfer: Send tokens to an address
 * - Deploy: Deploy a new contract
 * - Call: Call a contract function
 *
 * @example
 * ```typescript
 * // Transfer payload
 * const transfer: Payload = {
 *   type: 'transfer',
 *   to: Address.zero(),
 *   amount: 1000n
 * };
 *
 * // Deploy payload
 * const deploy: Payload = {
 *   type: 'deploy',
 *   code: new Uint8Array([...]),
 *   constructorArgs: []
 * };
 *
 * // Call payload
 * const call: Payload = {
 *   type: 'call',
 *   contract: Address.zero(),
 *   function: FunctionSelector.fromName('transfer'),
 *   args: []
 * };
 * ```
 */
export type Payload = TransferPayload | DeployPayload | CallPayload;

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * A signed transaction on SynapticChain.
 *
 * Transactions can transfer tokens, deploy contracts, or call contract functions.
 * Each transaction includes:
 * - Nonce: Sequential counter preventing replay attacks
 * - Nonce Key: Lane identifier for parallel execution (S=0)
 * - From: Sender's address
 * - Signature: Ed25519 signature (64 bytes)
 * - Payload: The transaction action (transfer, deploy, or call)
 * - Gas limit and price: Computational cost parameters
 * - Parents: References to parent transactions (DAG structure)
 * - Timestamp: Transaction creation time
 *
 * @example
 * ```typescript
 * const transaction: Transaction = {
 *   nonce: 0n,
 *   nonceKey: 0n,
 *   from: senderAddress,
 *   publicKey: publicKeyBytes,
 *   signature: signatureBytes,
 *   payload: {
 *     type: 'transfer',
 *     to: recipientAddress,
 *     amount: 1000000000000000000n
 *   },
 *   gasLimit: 21000n,
 *   gasPrice: 1000000000n,
 *   parents: [],
 *   timestamp: BigInt(Date.now())
 * };
 * ```
 */
export interface Transaction {
  /** Sequential nonce preventing replay attacks */
  nonce: bigint;
  /** Nonce key (lane) for parallel execution (S=0) - default: 0 */
  nonceKey: bigint;
  /** Sender's address */
  from: Address;
  /** Sender's Ed25519 public key (32 bytes) */
  publicKey: Uint8Array;
  /** Ed25519 signature (64 bytes) */
  signature: Signature;
  /** Transaction payload (transfer, deploy, or call) */
  payload: Payload;
  /** Maximum gas units for execution */
  gasLimit: Gas;
  /** Price per gas unit */
  gasPrice: bigint;
  /** Parent transaction IDs (DAG structure) */
  parents: TxId[];
  /** Transaction timestamp (milliseconds since epoch) */
  timestamp: bigint;
  /** Chain ID for replay protection (1 = mainnet, 321 = testnet) */
  chainId: bigint;
}

/**
 * An unsigned transaction ready to be signed.
 *
 * Contains all transaction fields except the signature.
 * Use TransactionBuilder to create unsigned transactions,
 * then sign with a Keypair.
 *
 * @example
 * ```typescript
 * const unsignedTx: UnsignedTransaction = {
 *   nonce: 0n,
 *   nonceKey: 0n,
 *   from: senderAddress,
 *   payload: {
 *     type: 'transfer',
 *     to: recipientAddress,
 *     amount: 1000n
 *   },
 *   gasLimit: 21000n,
 *   gasPrice: 1000000000n,
 *   parents: [],
 *   timestamp: BigInt(Date.now())
 * };
 * ```
 */
export interface UnsignedTransaction {
  /** Sequential nonce preventing replay attacks */
  nonce: bigint;
  /** Nonce key (lane) for parallel execution (S=0) - default: 0 */
  nonceKey: bigint;
  /** Sender's address */
  from: Address;
  /** Transaction payload (transfer, deploy, or call) */
  payload: Payload;
  /** Maximum gas units for execution */
  gasLimit: Gas;
  /** Price per gas unit */
  gasPrice: bigint;
  /** Parent transaction IDs (DAG structure) */
  parents: TxId[];
  /** Transaction timestamp (milliseconds since epoch) */
  timestamp: bigint;
  /** Chain ID for replay protection (1 = mainnet, 321 = testnet) */
  chainId: bigint;
}

/**
 * Transaction information returned from RPC queries.
 *
 * Mirrors the node's syn_getTransaction response envelope
 * ({ context, value }) where value contains the on-chain summary.
 */
export interface TransactionInfo {
  /** Transaction ID (SHA3-256 hash) as raw bytes */
  txId: TxId;
  /** Hex transaction hash */
  hash: string;
  /** Sender address (bech32) */
  from: string;
  /** Recipient address (bech32) for transfers/calls */
  to?: string;
  /** Amount transferred (wei string) */
  amount?: string;
  /** Transaction type, e.g. "transfer", "contract_call" */
  type: string;
  /** On-chain status, e.g. "Confirmed", "Pending" */
  status: string;
  /** Checkpoint height where the transaction was finalized */
  checkpointHeight?: number;
  /** Shard that processed the transaction */
  shardId?: number;
  /** Unix timestamp (ms) */
  timestamp?: number;
  /** Gas used by the transaction */
  gasUsed?: number;
  /**
   * @deprecated Use checkpointHeight instead.
   */
  height?: bigint;
  /**
   * @deprecated Replaced by the flat fields above. Always undefined for
   *             responses from current nodes.
   */
  transaction?: Transaction;
  /**
   * @deprecated Check status directly; kept for transitional compatibility.
   */
  confirmed?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a transfer payload.
 *
 * @param to - Recipient address
 * @param amount - Amount to transfer as U256 (bigint)
 * @returns A TransferPayload
 *
 * @example
 * ```typescript
 * const payload = createTransferPayload(recipientAddress, 1000000000000000000n);
 * ```
 */
export function createTransferPayload(to: Address, amount: bigint): TransferPayload {
  return {
    type: 'transfer',
    to,
    amount,
  };
}

/**
 * Creates a deploy payload.
 *
 * @param code - Contract bytecode
 * @param constructorArgs - Constructor arguments (default: empty array)
 * @returns A DeployPayload
 *
 * @example
 * ```typescript
 * const payload = createDeployPayload(bytecode, [
 *   { type: 'string', value: 'MyToken' }
 * ]);
 * ```
 */
export function createDeployPayload(
  code: Uint8Array,
  constructorArgs: Value[] = []
): DeployPayload {
  return {
    type: 'deploy',
    code,
    constructorArgs,
  };
}

/**
 * Creates a call payload.
 *
 * @param contract - Contract address to call
 * @param functionName - Function name (will be converted to selector)
 * @param args - Function arguments (default: empty array)
 * @returns A CallPayload
 *
 * @example
 * ```typescript
 * const payload = createCallPayload(
 *   contractAddress,
 *   'transfer',
 *   [
 *     { type: 'address', value: recipientAddress },
 *     { type: 'u256', value: 1000n }
 *   ]
 * );
 * ```
 */
export function createCallPayload(
  contract: Address,
  functionName: string,
  args: Value[] = []
): CallPayload {
  return {
    type: 'call',
    contract,
    function: FunctionSelector.fromName(functionName),
    args,
  };
}

/**
 * Creates a call payload with a pre-computed function selector.
 *
 * @param contract - Contract address to call
 * @param selector - Pre-computed function selector
 * @param args - Function arguments (default: empty array)
 * @returns A CallPayload
 *
 * @example
 * ```typescript
 * const selector = FunctionSelector.fromName('transfer');
 * const payload = createCallPayloadWithSelector(contractAddress, selector, args);
 * ```
 */
export function createCallPayloadWithSelector(
  contract: Address,
  selector: FunctionSelector,
  args: Value[] = []
): CallPayload {
  return {
    type: 'call',
    contract,
    function: selector,
    args,
  };
}

// ============================================================================
// Value Helper Functions
// ============================================================================

/**
 * Creates a boolean Value.
 */
export function boolValue(value: boolean): BoolValue {
  return { type: 'bool', value };
}

/**
 * Creates a u8 Value.
 */
export function u8Value(value: number): U8Value {
  return { type: 'u8', value };
}

/**
 * Creates a u16 Value.
 */
export function u16Value(value: number): U16Value {
  return { type: 'u16', value };
}

/**
 * Creates a u32 Value.
 */
export function u32Value(value: number): U32Value {
  return { type: 'u32', value };
}

/**
 * Creates a u64 Value.
 */
export function u64Value(value: bigint): U64Value {
  return { type: 'u64', value };
}

/**
 * Creates a u128 Value.
 */
export function u128Value(value: bigint): U128Value {
  return { type: 'u128', value };
}

/**
 * Creates a u256 Value.
 */
export function u256Value(value: bigint): U256Value {
  return { type: 'u256', value };
}

/**
 * Creates an i8 Value.
 */
export function i8Value(value: number): I8Value {
  return { type: 'i8', value };
}

/**
 * Creates an i16 Value.
 */
export function i16Value(value: number): I16Value {
  return { type: 'i16', value };
}

/**
 * Creates an i32 Value.
 */
export function i32Value(value: number): I32Value {
  return { type: 'i32', value };
}

/**
 * Creates an i64 Value.
 */
export function i64Value(value: bigint): I64Value {
  return { type: 'i64', value };
}

/**
 * Creates an i128 Value.
 */
export function i128Value(value: bigint): I128Value {
  return { type: 'i128', value };
}

/**
 * Creates an address Value.
 */
export function addressValue(value: Address): AddressValue {
  return { type: 'address', value };
}

/**
 * Creates a bytes Value.
 */
export function bytesValue(value: Uint8Array): BytesValue {
  return { type: 'bytes', value };
}

/**
 * Creates a string Value.
 */
export function stringValue(value: string): StringValue {
  return { type: 'string', value };
}

/**
 * Creates an array Value.
 */
export function arrayValue(value: Value[]): ArrayValue {
  return { type: 'array', value };
}

/**
 * Creates an option Value with a value.
 */
export function someValue(value: Value): OptionValue {
  return { type: 'option', value };
}

/**
 * Creates an option Value with null (None).
 */
export function noneValue(): OptionValue {
  return { type: 'option', value: null };
}

/**
 * Creates a unit Value.
 */
export function unitValue(): UnitValue {
  return { type: 'unit' };
}


// ============================================================================
// TransactionBuilder
// ============================================================================

/**
 * Fluent builder for constructing transactions.
 *
 * TransactionBuilder provides a convenient way to construct transactions
 * with a fluent API. It validates required fields and supports all
 * transaction types (transfer, deploy, call).
 *
 * @example
 * ```typescript
 * // Build a transfer transaction
 * const builder = new TransactionBuilder()
 *   .from(senderAddress)
 *   .nonce(0n)
 *   .gasLimit(21000n)
 *   .gasPrice(1000000000n)
 *   .transfer(recipientAddress, 1000000000000000000n);
 *
 * // Build unsigned transaction
 * const unsignedTx = builder.build();
 *
 * // Or sign directly with a keypair
 * const signedTx = builder.sign(keypair);
 * ```
 *
 * @example
 * ```typescript
 * // Build a contract deployment transaction
 * const deployTx = new TransactionBuilder()
 *   .from(deployerAddress)
 *   .nonce(1n)
 *   .gasLimit(1000000n)
 *   .gasPrice(1000000000n)
 *   .deploy(contractBytecode, [stringValue('MyToken')])
 *   .sign(keypair);
 * ```
 *
 * @example
 * ```typescript
 * // Build a contract call transaction
 * const callTx = new TransactionBuilder()
 *   .from(callerAddress)
 *   .nonce(2n)
 *   .gasLimit(100000n)
 *   .gasPrice(1000000000n)
 *   .call(contractAddress, 'transfer', [
 *     addressValue(recipientAddress),
 *     u256Value(1000n)
 *   ])
 *   .sign(keypair);
 * ```
 */
export class TransactionBuilder {
  private _from: Address | undefined;
  private _nonce: bigint | undefined;
  private _nonceKey: bigint = 0n;
  private _gasLimit: bigint | undefined;
  private _gasPrice: bigint | undefined;
  private _timestamp: bigint | undefined;
  private _parents: TxId[] = [];
  private _payload: Payload | undefined;
  private _chainId: bigint = 1n;

  /**
   * Creates a new TransactionBuilder.
   *
   * @example
   * ```typescript
   * const builder = new TransactionBuilder();
   * ```
   */
  constructor() {
    // Initialize with empty state
  }

  /**
   * Sets the sender address for the transaction.
   *
   * @param address - The sender's address
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.from(senderAddress);
   * ```
   */
  from(address: Address): this {
    this._from = address;
    return this;
  }

  /**
   * Sets the nonce for the transaction.
   *
   * The nonce is a sequential counter that prevents replay attacks.
   * Each account's nonce starts at 0 and increments with each transaction.
   *
   * @param nonce - The transaction nonce
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.nonce(0n);
   * ```
   */
  nonce(nonce: bigint): this {
    this._nonce = nonce;
    return this;
  }

  /**
   * Sets the nonce key (lane) for parallel execution.
   *
   * The nonce key enables lane-parallel execution within the same account.
   * Multiple transactions with the same nonce but different nonce keys can
   * execute in parallel, achieving up to 6.7x speedup.
   *
   * @param key - The lane identifier (default: 0)
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * // Main lane (default)
   * builder.nonceKey(0n);
   *
   * // Parallel lane for concurrent transactions
   * builder.nonceKey(1n);
   * ```
   */
  nonceKey(nonceKey: bigint): this {
    this._nonceKey = nonceKey;
    return this;
  }

  /**
   * Sets the gas limit for the transaction.
   *
   * The gas limit is the maximum amount of gas units that can be consumed
   * by the transaction execution.
   *
   * @param limit - The maximum gas units
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.gasLimit(21000n);
   * ```
   */
  gasLimit(limit: bigint): this {
    this._gasLimit = limit;
    return this;
  }

  /**
   * Sets the gas price for the transaction.
   *
   * The gas price is the amount of tokens paid per gas unit.
   *
   * @param price - The price per gas unit
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.gasPrice(1000000000n);
   * ```
   */
  gasPrice(price: bigint): this {
    this._gasPrice = price;
    return this;
  }

  /**
   * Sets the timestamp for the transaction.
   *
   * If not set, the timestamp will be automatically set to the current time
   * when build() or sign() is called.
   *
   * @param ts - The timestamp in milliseconds since epoch
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.timestamp(BigInt(Date.now()));
   * ```
   */
  timestamp(ts: bigint): this {
    this._timestamp = ts;
    return this;
  }

  /**
   * Sets the parent transaction IDs for DAG structure.
   *
   * Parent transactions are references to previous transactions in the DAG.
   *
   * @param parents - Array of parent transaction IDs (32-byte hashes)
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.parents([parentTxId1, parentTxId2]);
   * ```
   */
  parents(parents: TxId[]): this {
    this._parents = parents;
    return this;
  }

  /**
   * Sets the payload to a transfer operation.
   *
   * Creates a transfer payload that sends tokens to the specified address.
   *
   * @param to - The recipient address
   * @param amount - The amount to transfer as U256 (bigint)
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.transfer(recipientAddress, 1000000000000000000n);
   * ```
   */
  transfer(to: Address, amount: bigint): this {
    this._payload = createTransferPayload(to, amount);
    return this;
  }

  /**
   * Sets the chain ID for replay protection.
   *
   * @param chainId - The chain ID (1 = mainnet, 321 = testnet)
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.chainId(1n);
   * ```
   */
  chainId(chainId: bigint): this {
    this._chainId = chainId;
    return this;
  }

  /**
   * Sets the payload to a contract deployment operation.
   *
   * Creates a deploy payload that deploys a new contract with the given
   * bytecode and constructor arguments.
   *
   * @param code - The contract bytecode
   * @param constructorArgs - Optional constructor arguments (default: empty array)
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.deploy(contractBytecode, [stringValue('MyToken')]);
   * ```
   */
  deploy(code: Uint8Array, constructorArgs: Value[] = []): this {
    this._payload = createDeployPayload(code, constructorArgs);
    return this;
  }

  /**
   * Sets the payload to a contract call operation.
   *
   * Creates a call payload that calls a function on the specified contract.
   *
   * @param contract - The contract address to call
   * @param functionName - The function name (will be converted to selector)
   * @param args - Optional function arguments (default: empty array)
   * @returns this builder for chaining
   *
   * @example
   * ```typescript
   * builder.call(contractAddress, 'transfer', [
   *   addressValue(recipientAddress),
   *   u256Value(1000n)
   * ]);
   * ```
   */
  call(contract: Address, functionName: string, args: Value[] = []): this {
    this._payload = createCallPayload(contract, functionName, args);
    return this;
  }

  /**
   * Validates that all required fields are set.
   *
   * @throws {TransactionError} If any required field is missing
   */
  private validate(): void {
    const missingFields: string[] = [];

    if (this._from === undefined) {
      missingFields.push('from');
    }
    if (this._nonce === undefined) {
      missingFields.push('nonce');
    }
    if (this._gasLimit === undefined) {
      missingFields.push('gasLimit');
    }
    if (this._gasPrice === undefined) {
      missingFields.push('gasPrice');
    }
    if (this._payload === undefined) {
      missingFields.push('payload');
    }

    if (missingFields.length > 0) {
      throw new TransactionError(
        TransactionErrorCode.MISSING_FIELD,
        `Missing required transaction fields: ${missingFields.join(', ')}`,
        { missingFields }
      );
    }
  }

  /**
   * Builds an unsigned transaction from the builder state.
   *
   * Validates that all required fields are set and returns an UnsignedTransaction.
   * If timestamp is not set, it will be automatically set to the current time.
   *
   * @returns The unsigned transaction
   * @throws {TransactionError} If required fields are missing
   *
   * @example
   * ```typescript
   * const unsignedTx = new TransactionBuilder()
   *   .from(senderAddress)
   *   .nonce(0n)
   *   .gasLimit(21000n)
   *   .gasPrice(1000000000n)
   *   .transfer(recipientAddress, 1000n)
   *   .build();
   * ```
   */
  build(): UnsignedTransaction {
    this.validate();

    // Set timestamp automatically if not provided (Requirement 3.6)
    const timestamp = this._timestamp ?? BigInt(Date.now());

    return {
      nonce: this._nonce!,
      nonceKey: this._nonceKey,  // Include nonce_key (defaults to 0)
      from: this._from!,
      payload: this._payload!,
      gasLimit: this._gasLimit!,
      gasPrice: this._gasPrice!,
      parents: this._parents,
      timestamp,
      chainId: this._chainId,
    };
  }

  /**
   * Builds and signs the transaction with the given keypair.
   *
   * This is a convenience method that combines build() and signing.
   * The signing bytes are computed as:
   * nonce || from || borsh(payload) || gas_limit || gas_price || parents || timestamp
   *
   * @param keypair - The keypair to sign with
   * @returns The signed transaction
   * @throws {TransactionError} If required fields are missing
   *
   * @example
   * ```typescript
   * const signedTx = new TransactionBuilder()
   *   .from(senderAddress)
   *   .nonce(0n)
   *   .gasLimit(21000n)
   *   .gasPrice(1000000000n)
   *   .transfer(recipientAddress, 1000n)
   *   .sign(keypair);
   * ```
   */
  sign(keypair: Keypair): Transaction {
    const unsignedTx = this.build();

    // Compute signing bytes
    const signingBytes = computeSigningBytes(unsignedTx);

    // Sign the message
    const signature = keypair.sign(signingBytes);

    return {
      ...unsignedTx,
      publicKey: keypair.publicKey,  // Include public key for verification
      signature,
      chainId: this._chainId,
    };
  }
}

// ============================================================================
// Signing Bytes Computation (Internal)
// ============================================================================

/**
 * Computes the signing bytes for a transaction.
 * This is an internal function used by TransactionBuilder.sign().
 * For public API, use getSigningBytes from the serialization module.
 *
 * The signing bytes format is:
 * nonce (8 bytes LE) || from (20 bytes) || borsh(payload) || gas_limit (8 bytes LE) ||
 * gas_price (8 bytes LE) || parents || timestamp (8 bytes LE)
 *
 * @param tx - The unsigned transaction
 * @returns The signing bytes
 * @internal
 */
function computeSigningBytes(tx: UnsignedTransaction): Uint8Array {
  const parts: Uint8Array[] = [];

  // nonce (8 bytes, little-endian)
  parts.push(bigintToLeBytes(tx.nonce, 8));

  // nonce_key (8 bytes, little-endian) - NEW for S=0
  parts.push(bigintToLeBytes(tx.nonceKey, 8));

  // from (20 bytes)
  parts.push(tx.from.toBytes());

  // borsh(payload)
  parts.push(serializePayload(tx.payload));

  // gas_limit (8 bytes, little-endian)
  parts.push(bigintToLeBytes(tx.gasLimit, 8));

  // gas_price (8 bytes, little-endian)
  parts.push(bigintToLeBytes(tx.gasPrice, 8));

  // parents (length prefix + hashes)
  parts.push(serializeParents(tx.parents));

  // timestamp (8 bytes, little-endian)
  parts.push(bigintToLeBytes(tx.timestamp, 8));

  // chain_id (8 bytes, little-endian) - CRIT-03 fix
  parts.push(bigintToLeBytes(tx.chainId, 8));

  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
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
 * Serializes a payload to Borsh format.
 */
function serializePayload(payload: Payload): Uint8Array {
  const parts: Uint8Array[] = [];

  switch (payload.type) {
    case 'transfer': {
      // Variant index 0
      parts.push(new Uint8Array([0]));
      // to (20 bytes)
      parts.push(payload.to.toBytes());
      // amount (32 bytes, big-endian U256) - SECURITY FIX
      parts.push(bigintToBeBytes(payload.amount, 32));
      break;
    }
    case 'deploy': {
      // Variant index 1
      parts.push(new Uint8Array([1]));
      // code_len (4 bytes, little-endian u32) + code
      parts.push(bigintToLeBytes(BigInt(payload.code.length), 4));
      parts.push(payload.code);
      // args_len (4 bytes, little-endian u32) + args
      const argsBytes = serializeValues(payload.constructorArgs);
      parts.push(bigintToLeBytes(BigInt(payload.constructorArgs.length), 4));
      parts.push(argsBytes);
      break;
    }
    case 'call': {
      // Variant index 2
      parts.push(new Uint8Array([2]));
      // contract (20 bytes)
      parts.push(payload.contract.toBytes());
      // selector (4 bytes)
      parts.push(payload.function.toBytes());
      // args_len (4 bytes, little-endian u32) + args
      const callArgsBytes = serializeValues(payload.args);
      parts.push(bigintToLeBytes(BigInt(payload.args.length), 4));
      parts.push(callArgsBytes);
      break;
    }
  }

  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Serializes an array of Values to Borsh format.
 */
function serializeValues(values: Value[]): Uint8Array {
  const parts: Uint8Array[] = [];

  for (const value of values) {
    parts.push(serializeValue(value));
  }

  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Serializes a single Value to Borsh format.
 */
function serializeValue(value: Value): Uint8Array {
  const parts: Uint8Array[] = [];

  switch (value.type) {
    case 'bool':
      parts.push(new Uint8Array([0])); // type tag
      parts.push(new Uint8Array([value.value ? 1 : 0]));
      break;
    case 'u8':
      parts.push(new Uint8Array([1])); // type tag
      parts.push(new Uint8Array([value.value]));
      break;
    case 'u16':
      parts.push(new Uint8Array([2])); // type tag
      parts.push(bigintToLeBytes(BigInt(value.value), 2));
      break;
    case 'u32':
      parts.push(new Uint8Array([3])); // type tag
      parts.push(bigintToLeBytes(BigInt(value.value), 4));
      break;
    case 'u64':
      parts.push(new Uint8Array([4])); // type tag
      parts.push(bigintToLeBytes(value.value, 8));
      break;
    case 'u128':
      parts.push(new Uint8Array([5])); // type tag
      parts.push(bigintToLeBytes(value.value, 16));
      break;
    case 'u256':
      parts.push(new Uint8Array([6])); // type tag
      parts.push(bigintToLeBytes(value.value, 32));
      break;
    case 'i8':
      parts.push(new Uint8Array([7])); // type tag
      // Convert signed to unsigned for byte representation
      parts.push(new Uint8Array([value.value < 0 ? value.value + 256 : value.value]));
      break;
    case 'i16':
      parts.push(new Uint8Array([8])); // type tag
      parts.push(bigintToLeBytes(BigInt(value.value < 0 ? value.value + 65536 : value.value), 2));
      break;
    case 'i32':
      parts.push(new Uint8Array([9])); // type tag
      parts.push(bigintToLeBytes(BigInt(value.value < 0 ? value.value + 4294967296 : value.value), 4));
      break;
    case 'i64':
      parts.push(new Uint8Array([10])); // type tag
      parts.push(bigintToLeBytes(value.value < 0n ? value.value + 18446744073709551616n : value.value, 8));
      break;
    case 'i128':
      parts.push(new Uint8Array([11])); // type tag
      parts.push(bigintToLeBytes(value.value < 0n ? value.value + (1n << 128n) : value.value, 16));
      break;
    case 'address':
      parts.push(new Uint8Array([12])); // type tag
      parts.push(value.value.toBytes());
      break;
    case 'bytes':
      parts.push(new Uint8Array([13])); // type tag
      parts.push(bigintToLeBytes(BigInt(value.value.length), 4));
      parts.push(value.value);
      break;
    case 'string': {
      parts.push(new Uint8Array([14])); // type tag
      const encoder = new TextEncoder();
      const strBytes = encoder.encode(value.value);
      parts.push(bigintToLeBytes(BigInt(strBytes.length), 4));
      parts.push(strBytes);
      break;
    }
    case 'array':
      parts.push(new Uint8Array([15])); // type tag
      parts.push(bigintToLeBytes(BigInt(value.value.length), 4));
      parts.push(serializeValues(value.value));
      break;
    case 'option':
      parts.push(new Uint8Array([16])); // type tag
      if (value.value === null) {
        parts.push(new Uint8Array([0])); // None
      } else {
        parts.push(new Uint8Array([1])); // Some
        parts.push(serializeValue(value.value));
      }
      break;
    case 'unit':
      parts.push(new Uint8Array([17])); // type tag
      break;
  }

  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Serializes parent transaction IDs.
 */
function serializeParents(parents: TxId[]): Uint8Array {
  // Length prefix (4 bytes, little-endian u32) + hashes
  const lengthPrefix = bigintToLeBytes(BigInt(parents.length), 4);
  const totalLength = 4 + parents.length * TX_ID_LENGTH;
  const result = new Uint8Array(totalLength);

  result.set(lengthPrefix, 0);
  let offset = 4;
  for (const parent of parents) {
    result.set(parent, offset);
    offset += TX_ID_LENGTH;
  }

  return result;
}
