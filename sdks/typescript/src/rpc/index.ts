/**
 * RPC module for SynapticChain SDK
 *
 * JSON-RPC client for node communication.
 *
 * @module rpc
 */

import { Address } from '../address/index.js';
import { RpcError, RpcErrorCode } from '../errors/index.js';
import { borshSerialize } from '../serialization/index.js';
import {
  Transaction,
  TransactionInfo,
  TxId,
  Value,
  FunctionSelector,
} from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for configuring the RPC client.
 */
export interface RpcOptions {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retry attempts for failed requests (default: 3) */
  retries?: number;
  /** Custom HTTP headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * JSON-RPC 2.0 request structure.
 */
export interface JsonRpcRequest {
  /** JSON-RPC version (always "2.0") */
  jsonrpc: '2.0';
  /** RPC method name */
  method: string;
  /** Method parameters */
  params: unknown[];
  /** Request ID */
  id: number;
}

/**
 * JSON-RPC 2.0 response structure.
 */
export interface JsonRpcResponse<T = unknown> {
  /** JSON-RPC version (always "2.0") */
  jsonrpc: '2.0';
  /** Result (present on success) */
  result?: T;
  /** Error (present on failure) */
  error?: JsonRpcError;
  /** Request ID */
  id: number;
}

/**
 * JSON-RPC 2.0 error structure.
 */
export interface JsonRpcError {
  /** Error code */
  code: number;
  /** Error message */
  message: string;
  /** Optional additional data */
  data?: unknown;
}

/**
 * Checkpoint information from the node.
 */
export interface Checkpoint {
  /** Checkpoint height */
  height: bigint;
  /** State root hash (32 bytes) */
  stateRoot: Uint8Array;
}

/**
 * Node status information.
 */
export interface NodeStatus {
  /** Whether the node is synced */
  synced: boolean;
  /** Number of connected peers */
  peerCount: number;
  /** Current checkpoint height */
  checkpointHeight: bigint;
  /** Transactions per second */
  tps: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000;

/** Default number of retry attempts */
const DEFAULT_RETRIES = 3;

/** Delay between retries in milliseconds */
const RETRY_DELAY = 1000;

// ============================================================================
// RpcClient Class
// ============================================================================

/**
 * JSON-RPC client for communicating with SynapticChain nodes.
 *
 * Supports single-node and multi-node (load-balanced) operation.
 * For production, use multiple nodes to distribute load and maintain parallelism.
 *
 * @example
 * ```typescript
 * // Single node (development)
 * const client = new RpcClient('https://rpc.synaptyx.xyz');
 *
 * // Multi-node load balancing (production - maintains parallelism)
 * const client = new RpcClient({
 *   nodes: [
 *     'https://rpc.synaptyx.xyz',
 *     'http://localhost:8546',
 *     'http://localhost:8547',
 *   ]
 * });
 * ```
 */
export class RpcClient {
  /** The RPC endpoint URL (single node) */
  private readonly _url!: string;
  /** List of node URLs (multi-node) */
  private readonly _nodes?: string[];
  /** Whether load balancing is enabled */
  private readonly _loadBalanced: boolean;
  /** Request timeout in milliseconds */
  private readonly _timeout: number;
  /** Number of retry attempts */
  private readonly _retries: number;
  /** Custom HTTP headers */
  private readonly _headers?: Record<string, string>;
  /** Request ID counter */
  private _requestId: number = 0;

  /**
   * Creates a new RpcClient instance.
   *
   * @param url - The RPC endpoint URL (HTTP or HTTPS)
   * @param options - Optional configuration options
   *
   * @example
   * ```typescript
   * // Single node
   * const client = new RpcClient('https://rpc.synaptyx.xyz');
   *
   * // Multi-node load balancing (maintains parallelism)
   * const client = new RpcClient({
   *   nodes: ['https://rpc.synaptyx.xyz', 'http://localhost:8546'],
   *   timeout: 10000,
   *   retries: 5
   * });
   * ```
   */
  constructor(urlOrOptions: string | (RpcOptions & { nodes?: string[] }), options?: RpcOptions) {
    if (typeof urlOrOptions === 'string') {
      // Single node mode
      this._url = urlOrOptions;
      this._loadBalanced = false;
      this._timeout = options?.timeout ?? DEFAULT_TIMEOUT;
      this._retries = options?.retries ?? DEFAULT_RETRIES;
      if (options?.headers) {
        this._headers = options.headers;
      }
    } else {
      // Multi-node mode
      if (!urlOrOptions.nodes || urlOrOptions.nodes.length === 0) {
        throw new Error('Must provide either url string or nodes array');
      }
      this._nodes = urlOrOptions.nodes;
      this._url = urlOrOptions.nodes[0]!;
      this._loadBalanced = true;
      this._timeout = urlOrOptions.timeout ?? DEFAULT_TIMEOUT;
      this._retries = urlOrOptions.retries ?? DEFAULT_RETRIES;
      if (urlOrOptions.headers) {
        this._headers = urlOrOptions.headers;
      }
    }
  }

  /**
   * Gets a URL for the next request (load balanced if multiple nodes).
   */
  private _getUrl(): string {
    if (this._loadBalanced && this._nodes && this._nodes.length > 0) {
      return this._nodes[Math.floor(Math.random() * this._nodes.length)]!;
    }
    return this._url!;
  }

  /**
   * Gets the RPC endpoint URL.
   */
  get url(): string {
    return this._url;
  }

  /**
   * Gets the request timeout in milliseconds.
   */
  get timeout(): number {
    return this._timeout;
  }

  /**
   * Gets the number of retry attempts.
   */
  get retries(): number {
    return this._retries;
  }

  /**
   * Gets the custom HTTP headers.
   */
  get headers(): Record<string, string> {
    return { ...this._headers };
  }

  /**
   * Makes a JSON-RPC 2.0 call to the node.
   *
   * This is the low-level method for making RPC calls. It handles:
   * - Request formatting as JSON-RPC 2.0
   * - Response parsing
   * - Error handling
   * - Timeouts
   * - Automatic retries on transient failures
   *
   * @typeParam T - The expected result type
   * @param method - The RPC method name
   * @param params - The method parameters (default: empty array)
   * @returns The result from the RPC call
   * @throws {RpcError} If the call fails
   *
   * @example
   * ```typescript
   * // Call with no parameters
   * const status = await client.call<NodeStatus>('syn_getStatus');
   *
   * // Call with parameters
   * const balance = await client.call<string>('syn_getBalance', ['syn1...']);
   * ```
   */
  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const request = this.buildRequest(method, params);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this._retries; attempt++) {
      try {
        const response = await this.sendRequest<T>(request);
        return this.handleResponse<T>(response);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on non-transient errors
        if (error instanceof RpcError) {
          if (
            error.code === RpcErrorCode.METHOD_NOT_FOUND ||
            error.code === RpcErrorCode.INVALID_RESPONSE
          ) {
            throw error;
          }
        }

        // Wait before retrying (except on last attempt)
        if (attempt < this._retries) {
          await this.delay(RETRY_DELAY * (attempt + 1));
        }
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Builds a JSON-RPC 2.0 request object.
   *
   * @param method - The RPC method name
   * @param params - The method parameters
   * @returns The JSON-RPC request object
   */
  buildRequest(method: string, params: unknown[]): JsonRpcRequest {
    return {
      jsonrpc: '2.0',
      method,
      params,
      id: ++this._requestId,
    };
  }

  /**
   * Sends a JSON-RPC request to the node.
   *
   * @param request - The JSON-RPC request object
   * @returns The JSON-RPC response
   * @throws {RpcError} If the request fails
   */
  private async sendRequest<T>(request: JsonRpcRequest): Promise<JsonRpcResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);

    try {
      const response = await fetch(this._getUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this._headers,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new RpcError(
          RpcErrorCode.CONNECTION_FAILED,
          `HTTP error: ${response.status} ${response.statusText}`,
          { httpStatus: response.status }
        );
      }

      const json = await response.json();
      return json as JsonRpcResponse<T>;
    } catch (error) {
      if (error instanceof RpcError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new RpcError(
            RpcErrorCode.TIMEOUT,
            `Request timed out after ${this._timeout}ms`,
            { timeout: this._timeout }
          );
        }

        throw new RpcError(RpcErrorCode.CONNECTION_FAILED, `Connection failed: ${error.message}`, {
          originalError: error.message,
        });
      }

      throw new RpcError(RpcErrorCode.CONNECTION_FAILED, 'Unknown connection error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handles a JSON-RPC response, extracting the result or throwing an error.
   *
   * @param response - The JSON-RPC response
   * @returns The result from the response
   * @throws {RpcError} If the response contains an error
   */
  private handleResponse<T>(response: JsonRpcResponse<T>): T {
    // Validate response format
    if (response.jsonrpc !== '2.0') {
      throw new RpcError(
        RpcErrorCode.INVALID_RESPONSE,
        'Invalid JSON-RPC response: missing or invalid jsonrpc field',
        { response }
      );
    }

    // Check for error
    if (response.error) {
      const { code, message, data } = response.error;

      // Map JSON-RPC error codes to our error codes
      let errorCode: RpcErrorCode;
      if (code === -32601) {
        errorCode = RpcErrorCode.METHOD_NOT_FOUND;
      } else {
        errorCode = RpcErrorCode.INVALID_RESPONSE;
      }

      throw new RpcError(errorCode, message, {
        rpcCode: code,
        rpcMessage: message,
        data,
      });
    }

    // Return result (may be undefined for void methods)
    return response.result as T;
  }

  /**
   * Delays execution for the specified duration.
   *
   * @param ms - Delay in milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // High-Level RPC Methods
  // ==========================================================================

  /**
   * Gets the balance of an address.
   *
   * @param address - The address to query
   * @returns The balance as bigint (U256)
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const balance = await client.getBalance(address);
   * console.log(`Balance: ${balance} wei`);
   * ```
   */
  async getBalance(address: Address): Promise<bigint> {
    const result = await this.call<string>('syn_getBalance', [address.toBech32()]);
    return BigInt(result);
  }

  /**
   * Gets the transaction nonce for an address.
   *
   * @param address - The address to query
   * @returns The current nonce as bigint
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const nonce = await client.getNonce(address);
   * console.log(`Current nonce: ${nonce}`);
   * ```
   */
  async getNonce(address: Address): Promise<bigint> {
    const result = await this.call<number>('syn_getNonce', [address.toBech32()]);
    return BigInt(result);
  }

  /**
   * Sends a signed transaction to the network.
   *
   * @param tx - The signed transaction to send
   * @returns The transaction ID (32-byte hash)
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const txId = await client.sendTransaction(signedTx);
   * console.log(`Transaction sent: ${bytesToHex(txId)}`);
   * ```
   */
  async sendTransaction(tx: Transaction): Promise<TxId> {
    // Serialize the transaction to Borsh format
    const serialized = borshSerialize(tx);
    // Convert to hex for JSON-RPC transmission
    const hexData = bytesToHex(serialized);
    const result = await this.call<string>('syn_sendTransaction', [hexData]);
    // Result is the transaction ID as hex string
    return hexToBytes(result);
  }

  /**
   * Gets transaction information by ID.
   *
   * @param txId - The transaction ID (32-byte hash)
   * @returns The transaction info, or null if not found
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const txInfo = await client.getTransaction(txId);
   * if (txInfo) {
   *   console.log(`Transaction confirmed: ${txInfo.confirmed}`);
   * }
   * ```
   */
  async getTransaction(txId: TxId): Promise<TransactionInfo | null> {
    const hexId = bytesToHex(txId);
    const result = await this.call<RpcTransactionInfo | null>('syn_getTransaction', [hexId]);

    if (result === null) {
      return null;
    }

    return parseTransactionInfo(result);
  }

  /**
   * Makes a read-only contract call.
   *
   * This method does not create a transaction and does not modify state.
   * It's used for querying contract state.
   *
   * @param contract - The contract address to call
   * @param functionName - The function name to call
   * @param args - The function arguments
   * @returns The return value from the contract
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const result = await client.call(
   *   contractAddress,
   *   'balanceOf',
   *   [{ type: 'address', value: userAddress }]
   * );
   * ```
   */
  async callContract(
    contract: Address,
    functionName: string,
    args: Value[] = []
  ): Promise<Value> {
    const selector = FunctionSelector.fromName(functionName);
    const result = await this.call<RpcValue>('syn_call', [
      contract.toBech32(),
      selector.toHex(),
      args.map(valueToRpc),
    ]);
    return rpcToValue(result);
  }

  /**
   * Gets the bytecode of a contract.
   *
   * @param address - The contract address
   * @returns The contract bytecode, or null if not a contract
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const code = await client.getCode(contractAddress);
   * if (code) {
   *   console.log(`Contract code size: ${code.length} bytes`);
   * }
   * ```
   */
  async getCode(address: Address): Promise<Uint8Array | null> {
    const result = await this.call<string | null>('syn_getCode', [address.toBech32()]);

    if (result === null) {
      return null;
    }

    return hexToBytes(result);
  }

  /**
   * Gets the current checkpoint information.
   *
   * @returns The current checkpoint info
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const checkpoint = await client.getCheckpoint();
   * console.log(`Checkpoint height: ${checkpoint.height}`);
   * ```
   */
  async getCheckpoint(): Promise<Checkpoint> {
    const result = await this.call<RpcCheckpoint>('syn_getCheckpoint', []);
    return {
      height: BigInt(result.height),
      stateRoot: hexToBytes(result.stateRoot),
    };
  }

  /**
   * Gets the node status.
   *
   * @returns The node status information
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const status = await client.getStatus();
   * console.log(`Synced: ${status.synced}, Peers: ${status.peerCount}`);
   * ```
   */
  async getStatus(): Promise<NodeStatus> {
    const result = await this.call<RpcNodeStatus>('syn_getStatus', []);
    return {
      synced: result.synced,
      peerCount: result.peerCount,
      checkpointHeight: BigInt(result.checkpointHeight),
      tps: result.tps,
    };
  }
}

// ============================================================================
// Internal Types for RPC Responses
// ============================================================================

/** RPC response format for checkpoint */
interface RpcCheckpoint {
  height: string;
  stateRoot: string;
}

/** RPC response format for node status */
interface RpcNodeStatus {
  synced: boolean;
  peerCount: number;
  checkpointHeight: string;
  tps: number;
}

/** RPC response format for transaction info.
 *  Current nodes return { context: { slot }, value: { ...txSummary } }.
 *  We also tolerate legacy flat responses for backward compatibility.
 */
interface RpcTransactionInfo {
  context?: { slot?: number };
  value?: RpcTransactionSummary;
  // Legacy / flat fallback fields
  txId?: string;
  hash?: string;
  transaction?: RpcTransaction;
  confirmed?: boolean;
  height?: string;
  checkpoint_height?: number;
  status?: string;
}

/** RPC response format for the on-chain transaction summary. */
interface RpcTransactionSummary {
  hash: string;
  from: string;
  to?: string;
  amount?: string;
  type: string;
  status: string;
  checkpoint_height?: number;
  shard_id?: number;
  timestamp?: number;
  gas_used?: number;
}

/** RPC response format for a full transaction (legacy nodes). */
interface RpcTransaction {
  nonce: string;
  nonceKey?: string;
  from: string;
  publicKey?: string;
  signature: string;
  payload: RpcPayload;
  gasLimit: string;
  gasPrice: string;
  parents: string[];
  timestamp: string;
}

/** RPC response format for payload */
type RpcPayload =
  | { type: 'transfer'; to: string; amount: string }
  | { type: 'deploy'; code: string; constructorArgs: RpcValue[] }
  | { type: 'call'; contract: string; function: string; args: RpcValue[] };

/** RPC response format for Value */
type RpcValue =
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
  | { type: 'array'; value: RpcValue[] }
  | { type: 'option'; value: RpcValue | null }
  | { type: 'unit' };

// ============================================================================
// Helper Functions
// ============================================================================

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

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Value to RPC format.
 */
function valueToRpc(value: Value): RpcValue {
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
      return { type: 'array', value: value.value.map(valueToRpc) };
    case 'option':
      return { type: 'option', value: value.value === null ? null : valueToRpc(value.value) };
    case 'unit':
      return { type: 'unit' };
  }
}

/**
 * Converts an RPC Value to SDK Value.
 */
function rpcToValue(rpc: RpcValue): Value {
  switch (rpc.type) {
    case 'bool':
      return { type: 'bool', value: rpc.value };
    case 'u8':
      return { type: 'u8', value: rpc.value };
    case 'u16':
      return { type: 'u16', value: rpc.value };
    case 'u32':
      return { type: 'u32', value: rpc.value };
    case 'u64':
      return { type: 'u64', value: BigInt(rpc.value) };
    case 'u128':
      return { type: 'u128', value: BigInt(rpc.value) };
    case 'u256':
      return { type: 'u256', value: BigInt(rpc.value) };
    case 'i8':
      return { type: 'i8', value: rpc.value };
    case 'i16':
      return { type: 'i16', value: rpc.value };
    case 'i32':
      return { type: 'i32', value: rpc.value };
    case 'i64':
      return { type: 'i64', value: BigInt(rpc.value) };
    case 'i128':
      return { type: 'i128', value: BigInt(rpc.value) };
    case 'address':
      return { type: 'address', value: Address.fromBech32(rpc.value) };
    case 'bytes':
      return { type: 'bytes', value: hexToBytes(rpc.value) };
    case 'string':
      return { type: 'string', value: rpc.value };
    case 'array':
      return { type: 'array', value: rpc.value.map(rpcToValue) };
    case 'option':
      return { type: 'option', value: rpc.value === null ? null : rpcToValue(rpc.value) };
    case 'unit':
      return { type: 'unit' };
  }
}

/**
 * Parses RPC transaction info to SDK TransactionInfo.
 *
 * Current nodes wrap the summary in { context, value }. Legacy nodes may
 * return a flat object or a full transaction envelope. We normalise both.
 */
function parseTransactionInfo(rpc: RpcTransactionInfo): TransactionInfo {
  const tx: RpcTransactionSummary | undefined = rpc.value || (rpc as unknown as RpcTransactionSummary);
  const hash = tx?.hash || rpc.hash || '';
  const hexId = hash || rpc.txId || '';

  const result: TransactionInfo = {
    txId: hexToBytes(hexId),
    hash,
    from: tx?.from || '',
    type: tx?.type || 'unknown',
    status: tx?.status || rpc.status || 'unknown',
  };

  // exactOptionalPropertyTypes is enabled: only set optional fields when they
  // have a concrete value so we never assign undefined to an optional property.
  if (tx?.to !== undefined) result.to = tx.to;
  if (tx?.amount !== undefined) result.amount = tx.amount;
  if (tx?.checkpoint_height !== undefined) {
    result.checkpointHeight = tx.checkpoint_height;
    result.height = BigInt(tx.checkpoint_height);
  } else if (rpc.height !== undefined) {
    result.height = BigInt(rpc.height);
  }
  if (tx?.shard_id !== undefined) result.shardId = tx.shard_id;
  if (tx?.timestamp !== undefined) result.timestamp = tx.timestamp;
  if (tx?.gas_used !== undefined) result.gasUsed = tx.gas_used;

  // Backward compatibility: if a legacy full transaction envelope is present,
  // keep the old shape as well without re-parsing (the envelope is opaque here).
  if (rpc.transaction) {
    result.transaction = rpc.transaction as unknown as Transaction;
    result.confirmed = rpc.confirmed ?? true;
  }

  return result;
}

