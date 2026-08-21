/**
 * @synapticchain/sdk - SynapticChain SDK for TypeScript/JavaScript
 *
 * This SDK provides a complete interface for interacting with the SynapticChain
 * Layer 1 blockchain, including:
 * - Keypair generation and management (Ed25519)
 * - Address derivation and Bech32m encoding
 * - Transaction building and signing
 * - Borsh and JSON serialization
 * - JSON-RPC client for node communication
 * - Wallet abstraction for common operations
 * - Contract interaction helpers
 *
 * @example
 * ```typescript
 * import { Keypair, Address, TransactionBuilder, RpcClient, Wallet } from '@synapticchain/sdk';
 *
 * // Generate a new keypair
 * const keypair = Keypair.generate();
 * console.log('Address:', keypair.address().toBech32());
 *
 * // Create a wallet connected to a node
 * const rpc = new RpcClient('https://rpc.synaptyx.xyz');
 * const wallet = new Wallet(keypair, rpc);
 *
 * // Transfer tokens
 * const txId = await wallet.transfer(recipientAddress, 1000000000000000000n);
 * ```
 *
 * @packageDocumentation
 */

// Re-export all modules
export * from './crypto/index.js';
export * from './address/index.js';
export * from './types/index.js';
export * from './serialization/index.js';
export * from './rpc/index.js';
export * from './wallet/index.js';
export * from './contract/index.js';
export * from './utils/index.js';
export * from './errors/index.js';
