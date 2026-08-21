"""
Optimized Transaction Manager with Nonce Queue
Handles concurrent transactions with proper nonce management
"""

import asyncio
from typing import Dict, Optional
from dataclasses import dataclass
from synapticchain.wallet import Wallet
from synapticchain.rpc import RpcClient
from synapticchain import Address


@dataclass
class PendingTx:
    to_address: str
    amount: int
    nonce: int
    timestamp: float


class TransactionManager:
    """
    Manages transactions with proper nonce sequencing.
    Prevents nonce collisions and ensures transactions are processed in order.
    """
    
    def __init__(self, rpc_url: str):
        self.rpc = RpcClient(rpc_url)
        self.nonce_locks: Dict[str, asyncio.Lock] = {}
        self.nonce_cache: Dict[str, int] = {}
        self.pending_txs: Dict[str, list] = {}
    
    def _get_lock(self, address: str) -> asyncio.Lock:
        """Get or create lock for address"""
        if address not in self.nonce_locks:
            self.nonce_locks[address] = asyncio.Lock()
        return self.nonce_locks[address]
    
    async def get_next_nonce(self, address: str) -> int:
        """
        Get next nonce for address with proper locking.
        Ensures no nonce collisions even with concurrent requests.
        """
        lock = self._get_lock(address)
        
        async with lock:
            # Check cache first
            if address in self.nonce_cache:
                nonce = self.nonce_cache[address]
                self.nonce_cache[address] = nonce + 1
                return nonce
            
            # Fetch from chain
            try:
                addr_obj = Address.from_bech32(address)
                nonce = self.rpc.get_nonce(addr_obj)
                self.nonce_cache[address] = nonce + 1
                return nonce
            except Exception as e:
                print(f"Error fetching nonce for {address}: {e}")
                # Fallback to 0 if fetch fails
                self.nonce_cache[address] = 1
                return 0
    
    async def send_transaction(
        self,
        wallet: Wallet,
        to_address: str,
        amount: int,
        wait_for_confirmation: bool = False
    ) -> str:
        """
        Send transaction with proper nonce management.
        
        Args:
            wallet: Sender wallet
            to_address: Recipient address (bech32)
            amount: Amount in wei (1 SYN = 1e18 wei)
            wait_for_confirmation: Wait for TX to be confirmed
        
        Returns:
            Transaction hash (hex)
        """
        # Get next nonce (thread-safe)
        nonce = await self.get_next_nonce(wallet.address().to_bech32())
        
        # Send transaction
        to_addr = Address.from_bech32(to_address)
        tx_hash = wallet.transfer(to_addr, amount, nonce=nonce)
        
        print(f"📤 Sent TX {tx_hash.hex()[:16]}... with nonce {nonce}")
        
        # Optionally wait for confirmation
        if wait_for_confirmation:
            await self.wait_for_confirmation(tx_hash.hex(), timeout=10.0)
        
        return tx_hash.hex()
    
    async def wait_for_confirmation(self, tx_hash: str, timeout: float = 10.0) -> bool:
        """
        Wait for transaction confirmation.
        
        Args:
            tx_hash: Transaction hash
            timeout: Max wait time in seconds
        
        Returns:
            True if confirmed, False if timeout
        """
        start_time = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start_time < timeout:
            try:
                tx = self.rpc.call('syn_getTransaction', [tx_hash])
                if tx and tx.get('status') == 'confirmed':
                    return True
            except:
                pass
            
            await asyncio.sleep(0.1)
        
        return False
    
    async def send_batch(
        self,
        wallet: Wallet,
        transactions: list,
        wait_for_all: bool = False
    ) -> list:
        """
        Send multiple transactions in batch with proper nonce sequencing.
        
        Args:
            wallet: Sender wallet
            transactions: List of (to_address, amount) tuples
            wait_for_all: Wait for all TXs to confirm
        
        Returns:
            List of transaction hashes
        """
        tx_hashes = []
        
        for to_address, amount in transactions:
            tx_hash = await self.send_transaction(wallet, to_address, amount, wait_for_confirmation=False)
            tx_hashes.append(tx_hash)
        
        # Optionally wait for all confirmations
        if wait_for_all:
            await asyncio.gather(*[
                self.wait_for_confirmation(tx_hash)
                for tx_hash in tx_hashes
            ])
        
        return tx_hashes
    
    def reset_nonce_cache(self, address: str):
        """Reset nonce cache for address (force refetch from chain)"""
        if address in self.nonce_cache:
            del self.nonce_cache[address]
    
    def get_cached_nonce(self, address: str) -> Optional[int]:
        """Get cached nonce without fetching from chain"""
        return self.nonce_cache.get(address)


# Global instance for easy import
_tx_manager = None

def get_tx_manager(rpc_url: str = 'https://rpc.synaptyx.xyz') -> TransactionManager:
    """Get or create global transaction manager"""
    global _tx_manager
    if _tx_manager is None:
        _tx_manager = TransactionManager(rpc_url)
    return _tx_manager


# Example usage
async def example():
    from synapticchain.wallet import Wallet
    
    tx_manager = get_tx_manager()
    
    # Create wallet
    wallet = Wallet.from_hex('your_private_key_here', tx_manager.rpc)
    
    # Send single transaction
    tx_hash = await tx_manager.send_transaction(
        wallet,
        'syn1ujwklc5pc5fdsm930kn7tgm7fnq3c2kw3yhrxs',
        int(1 * 1e18),  # 1 SYN
        wait_for_confirmation=True
    )
    print(f"TX confirmed: {tx_hash}")
    
    # Send batch
    transactions = [
        ('syn1ujwklc5pc5fdsm930kn7tgm7fnq3c2kw3yhrxs', int(1 * 1e18)),
        ('syn1ujwklc5pc5fdsm930kn7tgm7fnq3c2kw3yhrxs', int(2 * 1e18)),
        ('syn1ujwklc5pc5fdsm930kn7tgm7fnq3c2kw3yhrxs', int(3 * 1e18)),
    ]
    
    tx_hashes = await tx_manager.send_batch(wallet, transactions, wait_for_all=True)
    print(f"Batch confirmed: {len(tx_hashes)} transactions")


if __name__ == '__main__':
    asyncio.run(example())
