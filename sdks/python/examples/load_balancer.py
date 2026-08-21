#!/usr/bin/env python3
"""
Load Balancer for SynapticChain - Distributes requests across all 9 nodes
"""
import random
from synapticchain.rpc import RpcClient

class LoadBalancedRpcClient:
    """RPC client that load balances across multiple nodes"""
    
    def __init__(self, nodes=None):
        if nodes is None:
            # Default: all 9 nodes
            nodes = [f'http://localhost:{8545+i}' for i in range(9)]
        self.nodes = nodes
        self.clients = [RpcClient(node) for node in nodes]
    
    def get_client(self):
        """Get a random client for load balancing"""
        return random.choice(self.clients)
    
    def get_balance(self, address):
        return self.get_client().get_balance(address)
    
    def get_nonce(self, address):
        return self.get_client().get_nonce(address)
    
    def send_transaction(self, tx):
        return self.get_client().send_transaction(tx)

# Example usage
if __name__ == '__main__':
    from synapticchain.wallet import Wallet
    from synapticchain import Address
    
    # Create load-balanced client
    rpc = LoadBalancedRpcClient()
    
    # Create wallet
    wallet = Wallet.from_hex(os.environ.get("SYNAPTIC_GENESIS_KEY", ""), rpc.get_client())
    
    # Send 10 transactions across different nodes
    to_address = Address.from_bech32('syn1ujwklc5pc5fdsm930kn7tgm7fnq3c2kw3yhrxs')
    
    print("Sending 10 transactions with load balancing...")
    for i in range(10):
        # Each transaction goes to a random node
        client = rpc.get_client()
        wallet.rpc = client
        tx_hash = wallet.transfer(to_address, int(1 * 1e18))
        print(f"  TX {i+1}: {tx_hash.hex()[:16]}... → {client.url}")
    
    print("\n✅ All transactions distributed across nodes!")
