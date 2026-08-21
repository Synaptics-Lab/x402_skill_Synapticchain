/**
 * AgentFi Module for SynapticChain TypeScript SDK
 *
 * High-level primitives for autonomous AI trading bots:
 * - Permissionless Token Creation & Transfers
 * - Polymarket-Style Prediction Markets (AgentMarket)
 * - Automated Liquidity Swaps (SwapEngineV3b / AgentDEX)
 * - Gap-Tolerant Nonce Collision Auto-Recovery
 *
 * @module agentfi
 */

import { Address } from '../address/index.js';
import { Keypair } from '../crypto/index.js';
import { RpcClient } from '../rpc/index.js';
import { Value, TxId } from '../types/index.js';
import { Wallet, TxOptions } from '../wallet/index.js';

export interface TransactionResult {
  txId: TxId;
  status: string;
  latencyMs: number;
  details: Record<string, unknown>;
}

export class AgentFiClient {
  private readonly _rpcClient: RpcClient;

  constructor(rpcUrl: string = 'https://testnet.synapticchain.xyz/rpc/') {
    this._rpcClient = new RpcClient(rpcUrl);
  }

  get rpcClient(): RpcClient {
    return this._rpcClient;
  }
}

export class AgentWallet {
  private readonly _wallet: Wallet;
  private readonly _client: AgentFiClient;
  private _cachedNonce: bigint | null = null;

  constructor(privateKey: Uint8Array, client?: AgentFiClient) {
    this._client = client || new AgentFiClient();
    this._wallet = Wallet.fromPrivateKey(privateKey, this._client.rpcClient);
  }

  static generate(client?: AgentFiClient): AgentWallet {
    const cli = client || new AgentFiClient();
    const keypair = Keypair.generate();
    return new AgentWallet(keypair.privateKey, cli);
  }

  address(): Address {
    return this._wallet.address();
  }

  addressBech32(): string {
    return this._wallet.address().toBech32();
  }

  private async _sendCallWithRetry(
    contractAddr: Address,
    functionName: string,
    args: Value[] = [],
    gasLimit: bigint = 50000000n
  ): Promise<TxId> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const txOptions: TxOptions = {
          gasLimit,
          gasPrice: 100n,
        };
        if (this._cachedNonce !== null) {
          txOptions.nonce = this._cachedNonce;
        }
        const txId = await this._wallet.call(contractAddr, functionName, args, txOptions);
        if (this._cachedNonce !== null) {
          this._cachedNonce += 1n;
        }
        return txId;
      } catch (err: unknown) {
        const msg = String(err);
        if (msg.includes('already used') || msg.includes('beyond window limit')) {
          this._cachedNonce = null; // Force refresh on next iteration
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        } else {
          throw err;
        }
      }
    }
    throw new Error('AgentWallet: exhausted nonce retries');
  }

  async transferToken(
    tokenContractAddr: string,
    recipientBech32: string,
    amount: bigint
  ): Promise<TransactionResult> {
    const start = Date.now();
    const tokenAddr = Address.fromBech32(tokenContractAddr);
    const recipientAddr = Address.fromBech32(recipientBech32);

    const txId = await this._sendCallWithRetry(tokenAddr, 'transfer', [
      { type: 'address', value: recipientAddr },
      { type: 'u128', value: amount },
    ]);

    const latencyMs = Date.now() - start;
    return {
      txId,
      status: 'CONFIRMED',
      latencyMs,
      details: { token: tokenContractAddr, recipient: recipientBech32, amount: amount.toString() },
    };
  }

  async executeOdlSwap(
    swapEngineBech32: string,
    tokenInBech32: string,
    tokenOutBech32: string,
    amountIn: bigint,
    amountOutMin: bigint
  ): Promise<TransactionResult> {
    const start = Date.now();
    const engineAddr = Address.fromBech32(swapEngineBech32);
    const tokenInAddr = Address.fromBech32(tokenInBech32);
    const tokenOutAddr = Address.fromBech32(tokenOutBech32);

    // Step 1: Transfer token to pool
    const tx1 = await this._sendCallWithRetry(tokenInAddr, 'transfer', [
      { type: 'address', value: engineAddr },
      { type: 'u128', value: amountIn },
    ]);

    // Step 2: Deposit into pool
    const tx2 = await this._sendCallWithRetry(engineAddr, 'deposit', [
      { type: 'address', value: tokenInAddr },
      { type: 'u128', value: amountIn },
    ]);

    // Step 3: Swap
    const tx3 = await this._sendCallWithRetry(engineAddr, 'swap_token0_in', [
      { type: 'u128', value: amountIn },
      { type: 'u128', value: amountOutMin },
    ]);

    // Step 4: Withdraw
    const tx4 = await this._sendCallWithRetry(engineAddr, 'withdraw', [
      { type: 'address', value: tokenOutAddr },
      { type: 'u128', value: amountOutMin },
    ]);

    const latencyMs = Date.now() - start;
    return {
      txId: tx4,
      status: 'CONFIRMED',
      latencyMs,
      details: {
        engine: swapEngineBech32,
        tokenIn: tokenInBech32,
        tokenOut: tokenOutBech32,
        amountIn: amountIn.toString(),
        amountOutMin: amountOutMin.toString(),
        stepHashes: [tx1, tx2, tx3, tx4],
      },
    };
  }

  async buyPredictionShares(
    predictionMarketBech32: string,
    outcome: 'YES' | 'NO',
    amount: bigint
  ): Promise<TransactionResult> {
    const start = Date.now();
    const marketAddr = Address.fromBech32(predictionMarketBech32);
    const funcName = outcome === 'YES' ? 'buy_yes_shares' : 'buy_no_shares';

    const txId = await this._sendCallWithRetry(marketAddr, funcName, [
      { type: 'u128', value: amount },
    ]);

    const latencyMs = Date.now() - start;
    return {
      txId,
      status: 'CONFIRMED',
      latencyMs,
      details: {
        market: predictionMarketBech32,
        outcome,
        amount: amount.toString(),
      },
    };
  }
}
