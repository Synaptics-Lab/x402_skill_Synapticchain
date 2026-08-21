/**
 * Deterministic RPC Client for SynapticChain
 * NO ROUND-ROBIN. NO RACE CONDITIONS FOR READS.
 *
 * Architecture:
 * - Reads (getBalance, getNonce, etc.): route deterministically to shard leader
 * - Writes (sendTransaction): broadcast to all nodes for redundancy
 * - Confirmations: poll single authoritative node deterministically
 */

interface NodeEndpoint {
  url: string;
  port: number;
  shard: number;
  name: string;
}

interface RpcRequest {
  jsonrpc: string;
  method: string;
  params: any[];
  id: number;
}

interface RpcResponse {
  jsonrpc: string;
  result?: any;
  error?: any;
  id: number;
}

/** Shard routing: XOR-fold address hash mod num_shards (matches Rust impl) */
function routeToShard(address: string, numShards: number): number {
  if (numShards <= 1) return 0;
  const encoder = new TextEncoder();
  const data = encoder.encode(address);
  // Simple hash: djb2
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash) + data[i];
    hash |= 0;
  }
  return Math.abs(hash) % numShards;
}

export class DeterministicRpcClient {
  private nodes: NodeEndpoint[];
  private requestId: number = 0;
  private abortControllers: Map<number, AbortController> = new Map();
  private numShards: number = 3;

  constructor(endpoints?: { host: string; port: number; shard: number; name: string }[]) {
    if (endpoints) {
      this.nodes = endpoints.map(e => ({
        url: `http://${e.host}:${e.port}`,
        port: e.port,
        shard: e.shard,
        name: e.name
      }));
    } else {
      // Default production DAG endpoints
      this.nodes = [
        { url: 'https://nodes.synapticchain.xyz/rpc', port: 443, shard: 0, name: 'Shard-0' },
      ];
    }
  }

  private nextRequestId(): number {
    return ++this.requestId;
  }

  private async callNode(node: NodeEndpoint, method: string, params: any[]): Promise<any> {
    const id = this.nextRequestId();
    const controller = new AbortController();
    this.abortControllers.set(id, controller);

    const payload: RpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    try {
      const response = await fetch(node.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data: RpcResponse = await response.json();

      if (data.error) {
        throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
      }

      return data.result;
    } finally {
      this.abortControllers.delete(id);
    }
  }

  /**
   * Get the primary node for a shard.
   * DETERMINISTIC: always returns the first configured node for the shard.
   */
  private getShardNode(shardId: number): NodeEndpoint {
    const shardNodes = this.nodes.filter(n => n.shard === shardId);
    if (shardNodes.length > 0) return shardNodes[0];
    return this.nodes[0]; // fallback
  }

  /**
   * Route an address to its shard node.
   * NO ROUND-ROBIN. Same address always hits same node.
   */
  private routeAddress(address: string): NodeEndpoint {
    const shard = routeToShard(address, this.numShards);
    return this.getShardNode(shard);
  }

  /**
   * Read from the authoritative node for an address.
   * Deterministic routing ensures consistent reads.
   */
  async getBalance(address: string): Promise<string> {
    const node = this.routeAddress(address);
    return this.callNode(node, 'syn_getBalance', [address]);
  }

  async getNonce(address: string, blockTag: string = 'pending', nonceKey: number = 0): Promise<number> {
    const node = this.routeAddress(address);
    return this.callNode(node, 'syn_getNonce', [address, blockTag, nonceKey]);
  }

  async getTransaction(hash: string): Promise<any> {
    // Tx hash has no address — query primary node (Alpha)
    return this.callNode(this.nodes[0], 'syn_getTransaction', [hash]);
  }

  async getTransactionReceipt(hash: string): Promise<any> {
    return this.callNode(this.nodes[0], 'syn_getTransactionReceipt', [hash]);
  }

  async getStatus(): Promise<any> {
    return this.callNode(this.nodes[0], 'syn_getStatus', []);
  }

  async callContract(address: string, method: string, args: any[] = [], caller?: string, gasLimit?: number): Promise<any> {
    const node = this.routeAddress(address);
    return this.callNode(node, 'syn_callContractV2', [address, method, args, caller, gasLimit]);
  }

  /**
   * Send a transaction.
   * Broadcasts to ALL nodes for redundancy (writes are idempotent via tx hash).
   * Returns the first successful response.
   */
  async sendTransaction(signedTx: string): Promise<string> {
    const promises = this.nodes.map(node =>
      this.callNode(node, 'syn_sendTransaction', [signedTx]).catch(() => null)
    );

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
    }

    throw new Error('Transaction submission failed on all nodes');
  }

  /**
   * Send a raw transaction.
   * Broadcasts to ALL nodes.
   */
  async sendRawTransaction(rawTx: string): Promise<string> {
    const promises = this.nodes.map(node =>
      this.callNode(node, 'syn_sendRawTransaction', [rawTx]).catch(() => null)
    );

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
    }

    throw new Error('Raw transaction submission failed on all nodes');
  }

  /**
   * Wait for transaction confirmation.
   * Polls the PRIMARY node (Alpha) deterministically.
   * NO ROUND-ROBIN across nodes.
   */
  async waitForConfirmation(txHash: string, timeoutMs: number = 30000, pollIntervalMs: number = 1000): Promise<any> {
    const startTime = Date.now();
    const node = this.nodes[0]; // Primary node only

    while (Date.now() - startTime < timeoutMs) {
      try {
        const tx = await this.callNode(node, 'syn_getTransaction', [txHash]);
        if (tx && tx.status === 'confirmed') {
          return tx;
        }
      } catch {
        // ignore polling errors
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Transaction ${txHash} not confirmed within ${timeoutMs}ms`);
  }

  /**
   * Get status from all nodes (for monitoring only).
   * This is NOT for state reads — it's for health checks.
   */
  async getAllNodeStatus(): Promise<Array<{ name: string; port: number; shard: number; status: any; error?: string }>> {
    const promises = this.nodes.map(async node => {
      try {
        const status = await this.callNode(node, 'syn_getStatus', []);
        return { name: node.name, port: node.port, shard: node.shard, status };
      } catch (error) {
        return { name: node.name, port: node.port, shard: node.shard, status: null, error: String(error) };
      }
    });

    return Promise.all(promises);
  }
}

export default DeterministicRpcClient;
