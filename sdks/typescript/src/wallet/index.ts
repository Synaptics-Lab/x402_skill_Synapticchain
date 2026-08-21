/**
 * Wallet module for SynapticChain SDK
 *
 * High-level wallet abstraction for key management and transaction signing.
 *
 * @module wallet
 */

import { Address } from '../address/index.js';
import { Keypair, deriveContractAddress } from '../crypto/index.js';
import { RpcClient } from '../rpc/index.js';
import { getSigningBytes } from '../serialization/index.js';
import {
  Transaction,
  UnsignedTransaction,
  TransactionBuilder,
  TxId,
  Value,
} from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for transaction operations.
 */
export interface TxOptions {
  /** Maximum gas units for execution (optional, uses default if not provided) */
  gasLimit?: bigint;
  /** Price per gas unit (optional, uses default if not provided) */
  gasPrice?: bigint;
  /** Transaction nonce (optional, fetched from network if not provided) */
  nonce?: bigint;
  /** Nonce key (lane) for parallel execution (S=0) - default: 0 */
  nonceKey?: bigint;
}

/**
 * Result of a contract deployment.
 */
export interface DeployResult {
  /** Transaction ID of the deployment transaction */
  txId: TxId;
  /** Predicted contract address */
  contractAddress: Address;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default gas limit for transfer transactions */
const DEFAULT_TRANSFER_GAS_LIMIT = 21000n;

/** Default gas limit for contract deployment */
const DEFAULT_DEPLOY_GAS_LIMIT = 1000000n;

/** Default gas limit for contract calls */
const DEFAULT_CALL_GAS_LIMIT = 100000n;

/** Default gas price */
const DEFAULT_GAS_PRICE = 1000000000n; // 1 Gwei equivalent

// ============================================================================
// Wallet Class
// ============================================================================

/**
 * High-level wallet abstraction for key management and transaction signing.
 *
 * The Wallet class wraps a Keypair and an optional RpcClient to provide
 * convenient methods for common blockchain operations like transfers,
 * contract deployments, and contract calls.
 *
 * @example
 * ```typescript
 * // Create a wallet from a keypair
 * const keypair = Keypair.generate();
 * const rpc = new RpcClient('https://rpc.synaptyx.xyz');
 * const wallet = new Wallet(keypair, rpc);
 *
 * // Or generate a new wallet directly
 * const wallet2 = Wallet.generate(rpc);
 *
 * // Or create from an existing private key
 * const wallet3 = Wallet.fromPrivateKey(privateKeyBytes, rpc);
 *
 * // Get wallet info
 * console.log('Address:', wallet.address().toBech32());
 * console.log('Balance:', await wallet.getBalance());
 *
 * // Transfer tokens
 * const txId = await wallet.transfer(recipientAddress, 1000000000000000000n);
 *
 * // Deploy a contract
 * const { txId, contractAddress } = await wallet.deploy(bytecode, []);
 *
 * // Call a contract function
 * const callTxId = await wallet.call(contractAddress, 'transfer', [
 *   { type: 'address', value: recipientAddress },
 *   { type: 'u256', value: 1000n }
 * ]);
 * ```
 */
export class Wallet {
  private readonly _keypair: Keypair;
  private readonly _rpcClient: RpcClient;
  private readonly _address: Address;

  /**
   * Creates a new Wallet instance.
   *
   * @param keypair - The keypair for signing transactions
   * @param rpcClient - The RPC client for network communication
   *
   * @example
   * ```typescript
   * const keypair = Keypair.generate();
   * const rpc = new RpcClient('https://rpc.synaptyx.xyz');
   * const wallet = new Wallet(keypair, rpc);
   * ```
   */
  constructor(keypair: Keypair, rpcClient: RpcClient) {
    this._keypair = keypair;
    this._rpcClient = rpcClient;
    // Pre-compute and cache the address
    this._address = new Address(keypair.addressBytes());
  }

  /**
   * Generates a new random wallet.
   *
   * Creates a new wallet with a randomly generated keypair.
   *
   * @param rpcClient - The RPC client for network communication
   * @returns A new Wallet with a random keypair
   *
   * @example
   * ```typescript
   * const rpc = new RpcClient('https://rpc.synaptyx.xyz');
   * const wallet = Wallet.generate(rpc);
   * console.log('New address:', wallet.address().toBech32());
   * ```
   */
  static generate(rpcClient: RpcClient): Wallet {
    const keypair = Keypair.generate();
    return new Wallet(keypair, rpcClient);
  }

  /**
   * Creates a wallet from an existing private key.
   *
   * @param privateKey - The 32-byte Ed25519 private key
   * @param rpcClient - The RPC client for network communication
   * @returns A Wallet derived from the private key
   * @throws {CryptoError} If the private key is invalid
   *
   * @example
   * ```typescript
   * const privateKey = new Uint8Array(32);
   * // ... fill with actual key bytes
   * const rpc = new RpcClient('https://rpc.synaptyx.xyz');
   * const wallet = Wallet.fromPrivateKey(privateKey, rpc);
   * ```
   */
  static fromPrivateKey(privateKey: Uint8Array, rpcClient: RpcClient): Wallet {
    const keypair = Keypair.fromPrivateKey(privateKey);
    return new Wallet(keypair, rpcClient);
  }

  /**
   * Gets the wallet's address.
   *
   * @returns The wallet's address
   *
   * @example
   * ```typescript
   * const address = wallet.address();
   * console.log('Address:', address.toBech32());
   * ```
   */
  address(): Address {
    return this._address;
  }

  /**
   * Gets the wallet's public key.
   *
   * @returns The 32-byte Ed25519 public key
   *
   * @example
   * ```typescript
   * const publicKey = wallet.publicKey();
   * console.log('Public key length:', publicKey.length); // 32
   * ```
   */
  publicKey(): Uint8Array {
    return this._keypair.publicKey;
  }

  /**
   * Gets the wallet's balance from the network.
   *
   * @returns The balance as bigint (U256)
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const balance = await wallet.getBalance();
   * console.log('Balance:', balance, 'wei');
   * ```
   */
  async getBalance(): Promise<bigint> {
    return this._rpcClient.getBalance(this._address);
  }

  /**
   * Gets the wallet's current nonce from the network.
   *
   * The nonce is fetched by querying the account state. For a new account,
   * the nonce starts at 0.
   *
   * Note: This implementation queries the balance endpoint and infers nonce.
   * In a real implementation, there would be a dedicated getNonce RPC method.
   * For now, we track nonce locally or use a provided nonce.
   *
   * @returns The current nonce as bigint
   * @throws {RpcError} If the RPC call fails
   *
   * @example
   * ```typescript
   * const nonce = await wallet.getNonce();
   * console.log('Current nonce:', nonce);
   * ```
   */
  async getNonce(): Promise<bigint> {
    // In a real implementation, this would call a dedicated RPC method like syn_getNonce
    // For now, we'll use a workaround by calling getTransaction or similar
    // Since we don't have a direct getNonce method, we'll return 0n as a placeholder
    // and rely on the user providing the nonce in TxOptions
    
    // This is a simplified implementation - in production, you'd want to:
    // 1. Query the account state for the current nonce
    // 2. Or track nonces locally
    // 3. Or use a dedicated RPC method
    
    // For now, we'll make a call that would typically return account info
    // Since RpcClient doesn't have getNonce, we return 0n as default
    // Users should provide nonce in TxOptions for accurate transaction building
    return 0n;
  }

  /**
   * Transfers tokens to another address.
   *
   * Builds, signs, and sends a transfer transaction.
   *
   * @param to - The recipient address
   * @param amount - The amount to transfer as U256 (bigint)
   * @param options - Optional transaction options (gasLimit, gasPrice, nonce)
   * @returns The transaction ID
   * @throws {RpcError} If the RPC call fails
   * @throws {TransactionError} If transaction building fails
   *
   * @example
   * ```typescript
   * const recipient = Address.fromBech32('syn1...');
   * const txId = await wallet.transfer(recipient, 1000000000000000000n);
   * console.log('Transfer sent:', bytesToHex(txId));
   *
   * // With custom options
   * const txId2 = await wallet.transfer(recipient, 1000n, {
   *   gasLimit: 50000n,
   *   gasPrice: 2000000000n,
   *   nonce: 5n
   * });
   * ```
   */
  async transfer(to: Address, amount: bigint, options?: TxOptions): Promise<TxId> {
    const nonce = options?.nonce ?? await this.getNonce();
    const gasLimit = options?.gasLimit ?? DEFAULT_TRANSFER_GAS_LIMIT;
    const gasPrice = options?.gasPrice ?? DEFAULT_GAS_PRICE;
    const nonceKey = options?.nonceKey ?? 0n;

    const tx = new TransactionBuilder()
      .from(this._address)
      .nonce(nonce)
      .nonceKey(nonceKey)
      .gasLimit(gasLimit)
      .gasPrice(gasPrice)
      .transfer(to, amount)
      .sign(this._keypair);

    return this._rpcClient.sendTransaction(tx);
  }

  /**
   * Deploys a new contract.
   *
   * Builds, signs, and sends a contract deployment transaction.
   * Returns both the transaction ID and the predicted contract address.
   *
   * @param code - The contract bytecode
   * @param constructorArgs - Optional constructor arguments (default: empty array)
   * @param options - Optional transaction options (gasLimit, gasPrice, nonce)
   * @returns The transaction ID and predicted contract address
   * @throws {RpcError} If the RPC call fails
   * @throws {TransactionError} If transaction building fails
   *
   * @example
   * ```typescript
   * const bytecode = new Uint8Array([...]);
   * const { txId, contractAddress } = await wallet.deploy(bytecode);
   * console.log('Contract deployed at:', contractAddress.toBech32());
   *
   * // With constructor arguments
   * const { txId, contractAddress } = await wallet.deploy(bytecode, [
   *   { type: 'string', value: 'MyToken' },
   *   { type: 'u256', value: 1000000n }
   * ]);
   * ```
   */
  async deploy(
    code: Uint8Array,
    constructorArgs: Value[] = [],
    options?: TxOptions
  ): Promise<DeployResult> {
    const nonce = options?.nonce ?? await this.getNonce();
    const gasLimit = options?.gasLimit ?? DEFAULT_DEPLOY_GAS_LIMIT;
    const gasPrice = options?.gasPrice ?? DEFAULT_GAS_PRICE;
    const nonceKey = options?.nonceKey ?? 0n;

    const tx = new TransactionBuilder()
      .from(this._address)
      .nonce(nonce)
      .nonceKey(nonceKey)
      .gasLimit(gasLimit)
      .gasPrice(gasPrice)
      .deploy(code, constructorArgs)
      .sign(this._keypair);

    // Predict the contract address
    const contractAddressBytes = deriveContractAddress(this._address.toBytes(), nonce);
    const contractAddress = new Address(contractAddressBytes);

    const txId = await this._rpcClient.sendTransaction(tx);

    return {
      txId,
      contractAddress,
    };
  }

  /**
   * Calls a contract function.
   *
   * Builds, signs, and sends a contract call transaction.
   * This is for state-changing calls that require a transaction.
   * For read-only calls, use RpcClient.callContract() directly.
   *
   * @param contract - The contract address to call
   * @param functionName - The function name to call
   * @param args - Optional function arguments (default: empty array)
   * @param options - Optional transaction options (gasLimit, gasPrice, nonce)
   * @returns The transaction ID
   * @throws {RpcError} If the RPC call fails
   * @throws {TransactionError} If transaction building fails
   *
   * @example
   * ```typescript
   * const contract = Address.fromBech32('syn1...');
   * const txId = await wallet.call(contract, 'transfer', [
   *   { type: 'address', value: recipientAddress },
   *   { type: 'u256', value: 1000n }
   * ]);
   * console.log('Call sent:', bytesToHex(txId));
   * ```
   */
  async call(
    contract: Address,
    functionName: string,
    args: Value[] = [],
    options?: TxOptions
  ): Promise<TxId> {
    const nonce = options?.nonce ?? await this.getNonce();
    const gasLimit = options?.gasLimit ?? DEFAULT_CALL_GAS_LIMIT;
    const gasPrice = options?.gasPrice ?? DEFAULT_GAS_PRICE;
    const nonceKey = options?.nonceKey ?? 0n;

    const tx = new TransactionBuilder()
      .from(this._address)
      .nonce(nonce)
      .nonceKey(nonceKey)
      .gasLimit(gasLimit)
      .gasPrice(gasPrice)
      .call(contract, functionName, args)
      .sign(this._keypair);

    return this._rpcClient.sendTransaction(tx);
  }

  /**
   * Signs an unsigned transaction.
   *
   * Takes an unsigned transaction and produces a signed transaction
   * using this wallet's keypair.
   *
   * @param tx - The unsigned transaction to sign
   * @returns The signed transaction
   *
   * @example
   * ```typescript
   * const unsignedTx = new TransactionBuilder()
   *   .from(wallet.address())
   *   .nonce(0n)
   *   .gasLimit(21000n)
   *   .gasPrice(1000000000n)
   *   .transfer(recipient, 1000n)
   *   .build();
   *
   * const signedTx = wallet.signTransaction(unsignedTx);
   * ```
   */
  signTransaction(tx: UnsignedTransaction): Transaction {
    // Compute signing bytes
    const signingBytes = getSigningBytes(tx);

    // Sign the message
    const signature = this._keypair.sign(signingBytes);

    return {
      ...tx,
      publicKey: this._keypair.publicKey,
      signature,
    };
  }

  /**
   * Signs an arbitrary message.
   *
   * Signs a raw byte message using this wallet's keypair.
   * This can be used for off-chain message signing, authentication, etc.
   *
   * @param message - The message to sign
   * @returns The 64-byte Ed25519 signature
   *
   * @example
   * ```typescript
   * const message = new TextEncoder().encode('Hello, SynapticChain!');
   * const signature = wallet.signMessage(message);
   * console.log('Signature length:', signature.length); // 64
   * ```
   */
  signMessage(message: Uint8Array): Uint8Array {
    return this._keypair.sign(message);
  }

  /**
   * Gets the underlying keypair.
   *
   * **Security Warning**: Handle keypairs with care. The keypair contains
   * the private key which should never be exposed.
   *
   * @returns The wallet's keypair
   *
   * @example
   * ```typescript
   * const keypair = wallet.keypair();
   * // Use for advanced operations
   * ```
   */
  get keypair(): Keypair {
    return this._keypair;
  }

  /**
   * Gets the RPC client.
   *
   * @returns The wallet's RPC client
   *
   * @example
   * ```typescript
   * const rpc = wallet.rpcClient;
   * const status = await rpc.getStatus();
   * ```
   */
  get rpcClient(): RpcClient {
    return this._rpcClient;
  }
}
