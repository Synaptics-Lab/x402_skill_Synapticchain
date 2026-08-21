#!/usr/bin/env python3
"""
Synapse x402 Automated Client Example (Python)
Demonstrates:
1. Making an unauthenticated call to an x402 endpoint.
2. Catching the HTTP 402 Payment Required response.
3. Automatically submitting an L1 settlement transaction on SynapticChain DAG.
4. Resubmitting the request with the x-402-receipt header to receive paid data.
"""

import sys
import json
import httpx
import asyncio

# Note: In production, import from `synapticchain`
from synapticchain import Wallet, RpcClient

GATEWAY_URL = "https://api.synapticchain.xyz/x402/vectors"
RPC_URL = "https://nodes.synapticchain.xyz/rpc"

async def fetch_with_x402_settlement():
    rpc = RpcClient(RPC_URL)
    
    # 1. 1-Click Naked Onboarding (or load existing wallet)
    print("1. Bootstrapping agent identity...")
    account_info = await rpc.auto_onboard()
    wallet = Wallet.from_private_key_hex(account_info["private_key"])
    print(f"   Agent Wallet: {wallet.address}")

    async with httpx.AsyncClient() as client:
        # 2. Initial unauthenticated request
        print(f"\n2. Pinging paywalled endpoint: {GATEWAY_URL}")
        res = await client.get(GATEWAY_URL)
        
        if res.status_code != 402:
            print(f"   Unexpected status: {res.status_code}")
            print(res.text)
            return

        # 3. Parse 402 Challenge
        invoice_id = res.headers.get("x-402-invoice")
        challenge_data = res.json()
        pay_to = challenge_data.get("payTo")
        amount = float(challenge_data.get("amount", 0.0008))
        print(f"   Received HTTP 402:")
        print(f"   - Invoice ID : {invoice_id}")
        print(f"   - Pay To     : {pay_to}")
        print(f"   - Amount     : {amount} SYN")

        # 4. Settle on Layer-1 (DAG sub-500ms finality)
        print("\n3. Settling on Layer-1 DAG (Lane 0)...")
        tx_hash = await rpc.transfer_native(
            sender_wallet=wallet,
            recipient_address=pay_to,
            amount_syn=amount,
            lane=0
        )
        print(f"   Settlement Finalized! TxHash: {tx_hash}")

        # 5. Fetch resource with receipt
        print("\n4. Requesting paid resource with x-402-receipt header...")
        headers = {
            "x-402-invoice": invoice_id,
            "x-402-receipt": tx_hash,
            "accept": "application/json"
        }
        data_res = await client.get(GATEWAY_URL, headers=headers)
        print(f"   Status Code: {data_res.status_code}")
        print("   Payload Result:")
        print(json.dumps(data_res.json(), indent=2))

if __name__ == "__main__":
    asyncio.run(fetch_with_x402_settlement())
