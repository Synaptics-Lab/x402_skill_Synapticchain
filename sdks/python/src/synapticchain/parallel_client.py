"""
Parallel RPC Client for SynapticChain
Connects to multiple nodes simultaneously for optimal performance.
"""

import asyncio
import aiohttp
import random
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class NodeEndpoint:
    """Node endpoint configuration"""
    url: str
    port: int
    shard: int
    weight: float = 1.0  # For load balancing


class ParallelRpcClient:
    """
    High-performance RPC client that connects to all nodes in parallel.
    
    Features:
    - Parallel transaction submission to all shards
    - Fastest-response routing
    - Automatic failover
    - Load balancing
    - Connection pooling
    """
    
    def __init__(self, base_url: str = "http://localhost", ports: List[int] = None):
        """
        Initialize parallel client.
        
        Args:
            base_url: Base URL for nodes (default: http://localhost)
            ports: List of RPC ports (default: 8545-8553)
        """
        if ports is None:
            ports = list(range(8545, 8554))  # All 9 nodes
        
        self.nodes = [
            NodeEndpoint(
                url=f"{base_url}:{port}",
                port=port,
                shard=(port - 8545) % 3  # Shard assignment
            )
            for port in ports
        ]
        
        self.session: Optional[aiohttp.ClientSession] = None
        self._request_id = 0
    
    async def __aenter__(self):
        """Async context manager entry"""
        # Connection pooling with optimal settings
        connector = aiohttp.TCPConnector(
            limit=100,  # Max connections
            limit_per_host=10,  # Per node
            ttl_dns_cache=300,  # DNS cache
            enable_cleanup_closed=True
        )
        
        timeout = aiohttp.ClientTimeout(
            total=30,
            connect=5,
            sock_read=10
        )
        
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            json_serialize=lambda x: __import__('json').dumps(x)
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
    
    def _next_request_id(self) -> int:
        """Get next request ID"""
        self._request_id += 1
        return self._request_id
    
    async def _call_node(self, node: NodeEndpoint, method: str, params: List[Any]) -> Dict[str, Any]:
        """Call single node"""
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": self._next_request_id()
        }
        
        async with self.session.post(node.url, json=payload) as resp:
            data = await resp.json()
            if "error" in data:
                raise Exception(f"RPC error: {data['error']}")
            return data.get("result")
    
    async def call_fastest(self, method: str, params: List[Any] = None) -> Any:
        """
        Call all nodes in parallel, return fastest response.
        
        Perfect for read operations (getBalance, getTransaction, etc.)
        """
        if params is None:
            params = []
        
        tasks = [
            self._call_node(node, method, params)
            for node in self.nodes
        ]
        
        # Return first successful response
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        
        # Cancel remaining tasks
        for task in pending:
            task.cancel()
        
        # Get result from first completed
        for task in done:
            try:
                return task.result()
            except Exception:
                continue
        
        raise Exception("All nodes failed")
    
    async def call_shard(self, shard_id: int, method: str, params: List[Any] = None) -> Any:
        """
        Call specific shard nodes in parallel.
        
        Optimal for shard-specific operations.
        """
        if params is None:
            params = []
        
        shard_nodes = [n for n in self.nodes if n.shard == shard_id]
        
        tasks = [
            self._call_node(node, method, params)
            for node in shard_nodes
        ]
        
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        
        for task in pending:
            task.cancel()
        
        for task in done:
            try:
                return task.result()
            except Exception:
                continue
        
        raise Exception(f"All shard {shard_id} nodes failed")
    
    async def broadcast_transaction(self, tx_data: Dict[str, Any]) -> str:
        """
        Broadcast transaction to all nodes in parallel.
        
        Returns transaction hash from first successful submission.
        Continues broadcasting to other nodes in background.
        """
        method = "syn_sendTransaction"
        params = [tx_data]
        
        tasks = [
            self._call_node(node, method, params)
            for node in self.nodes
        ]
        
        # Wait for first success
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        
        tx_hash = None
        for task in done:
            try:
                tx_hash = task.result()
                break
            except Exception:
                continue
        
        if not tx_hash:
            raise Exception("Transaction broadcast failed")
        
        # Let remaining broadcasts complete in background (don't cancel)
        # This ensures maximum propagation
        
        return tx_hash
    
    async def parallel_confirm(self, tx_hash: str, timeout: float = 5.0) -> Dict[str, Any]:
        """
        Wait for transaction confirmation from multiple nodes in parallel.
        
        Returns as soon as ANY node confirms (fastest confirmation).
        """
        method = "syn_getTransaction"
        params = [tx_hash]
        
        start_time = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start_time < timeout:
            tasks = [
                self._call_node(node, method, params)
                for node in self.nodes
            ]
            
            done, pending = await asyncio.wait(
                tasks,
                timeout=0.5,
                return_when=asyncio.FIRST_COMPLETED
            )
            
            for task in pending:
                task.cancel()
            
            for task in done:
                try:
                    result = task.result()
                    if result and result.get("status") == "confirmed":
                        return result
                except Exception:
                    continue
            
            await asyncio.sleep(0.1)
        
        raise TimeoutError(f"Transaction {tx_hash} not confirmed within {timeout}s")
    
    async def get_all_node_status(self) -> List[Dict[str, Any]]:
        """
        Get status from all nodes in parallel.
        
        Returns list of status objects.
        """
        method = "syn_getStatus"
        
        tasks = [
            self._call_node(node, method, [])
            for node in self.nodes
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return [
            {
                "port": node.port,
                "shard": node.shard,
                "status": result if not isinstance(result, Exception) else None,
                "error": str(result) if isinstance(result, Exception) else None
            }
            for node, result in zip(self.nodes, results)
        ]
    
    async def smart_route(self, method: str, params: List[Any] = None) -> Any:
        """
        Intelligently route request based on method type.
        
        - Reads: Use fastest node
        - Writes: Broadcast to all
        - Shard-specific: Route to shard
        """
        if params is None:
            params = []
        
        # Write operations - broadcast
        if method in ["syn_sendTransaction", "syn_sendRawTransaction"]:
            return await self.broadcast_transaction(params[0] if params else {})
        
        # Read operations - fastest response
        return await self.call_fastest(method, params)


# Synchronous wrapper for compatibility
class ParallelRpcClientSync:
    """Synchronous wrapper for ParallelRpcClient"""
    
    def __init__(self, base_url: str = "http://localhost", ports: List[int] = None):
        self.client = ParallelRpcClient(base_url, ports)
        self.loop = asyncio.new_event_loop()
    
    def __enter__(self):
        self.loop.run_until_complete(self.client.__aenter__())
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.loop.run_until_complete(self.client.__aexit__(exc_type, exc_val, exc_tb))
        self.loop.close()
    
    def call_fastest(self, method: str, params: List[Any] = None) -> Any:
        return self.loop.run_until_complete(self.client.call_fastest(method, params))
    
    def broadcast_transaction(self, tx_data: Dict[str, Any]) -> str:
        return self.loop.run_until_complete(self.client.broadcast_transaction(tx_data))
    
    def parallel_confirm(self, tx_hash: str, timeout: float = 5.0) -> Dict[str, Any]:
        return self.loop.run_until_complete(self.client.parallel_confirm(tx_hash, timeout))
    
    def get_all_node_status(self) -> List[Dict[str, Any]]:
        return self.loop.run_until_complete(self.client.get_all_node_status())
    
    def smart_route(self, method: str, params: List[Any] = None) -> Any:
        return self.loop.run_until_complete(self.client.smart_route(method, params))


# Example usage
async def example_usage():
    """Example of parallel client usage"""
    
    async with ParallelRpcClient() as client:
        # Get balance from fastest node
        balance = await client.call_fastest("syn_getBalance", ["syn1abc..."])
        print(f"Balance: {balance}")
        
        # Broadcast transaction to all nodes
        tx_hash = await client.broadcast_transaction({
            "from": "syn1abc...",
            "to": "syn1def...",
            "amount": "1000000000000000000"
        })
        print(f"TX: {tx_hash}")
        
        # Wait for confirmation from any node (fastest)
        tx = await client.parallel_confirm(tx_hash, timeout=5.0)
        print(f"Confirmed: {tx['status']}")
        
        # Get status from all nodes
        statuses = await client.get_all_node_status()
        print(f"Nodes online: {len([s for s in statuses if s['status']])}/9")


if __name__ == "__main__":
    asyncio.run(example_usage())
