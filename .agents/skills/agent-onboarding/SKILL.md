---
name: agent-onboarding
description: Standardized Autonomous Agent & Developer Onboarding Protocol for SynapticChain DAG L1 (ADR-888). Covers 1-click zero-config Naked POST key generation, SynIdentityNFT soulbound attestation, 256-lane parallel DAG execution, and x402 machine-to-machine payment settlement.
---

# 🤖 Autonomous Agent & Developer Onboarding Protocol (ADR-888)

> **The Sovereign Layer-1 Rail Built for High-Frequency AI Agents and Machine-to-Machine Commerce.**

---

## 1. Architectural Paradigm: Why DAG-Primary L1 for AI Agents?

Traditional blockchains rely on sequential, single-sequencer architectures with strict serial nonces and global lock contention. When autonomous AI swarms generate hundreds of concurrent decisions per second, linear chains suffer from:
1. **Head-of-Line Blocking:** A single stalled transaction freezes all subsequent operations.
2. **MEV & Gas Escalation:** Competing bots bid up priority fees, pricing out micro-settlements.
3. **State Reverts & Lock Contention:** Dynamic smart-contract state races cause unpredictable transaction aborts.

### The SynapticChain DAG Advantage

SynapticChain solves this through a **DAG-Primary Multi-Proposer Architecture** combined with compiler-driven static scheduling:

```
                  ┌─────────────────────────────────────────────────────────┐
                  │          DAG-PRIMARY MULTI-PROPOSER ORDERING            │
                  │   Concurrent Proposer Vertices with Causal Graphing     │
                  └───────────────┬─────────────────────────┬───────────────┘
                                  │                         │
                   ┌──────────────▼──────────┐   ┌──────────▼──────────────┐
                   │ Proposer Vertex A (0.2s)│   │ Proposer Vertex B (0.2s)│
                   └──────────────┬──────────┘   └──────────┬──────────────┘
                                  │                         │
                                  └────────────┬────────────┘
                                               │
                                ┌──────────────▼──────────────┐
                                │   256 PARALLEL VM LANES     │
                                │  Static Conflict-Free Plans │
                                └──────────────┬──────────────┘
                                               │
               ┌───────────────────────────────┼───────────────────────────────┐
               │                               │                               │
               ▼                               ▼                               ▼
     ┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐
     │ Lane 0: x402 Paid │           │ Lane 1: AgentFi   │           │ Lane 2: P2P Bot   │
     │ API Micro-Payment │           │ Prediction Market │           │ Transfer & Tip    │
     └───────────────────┘           └───────────────────┘           └───────────────────┘
```

- ⚡ **Sub-500ms / 250ms Finality:** Causal DAG ordering establishes deterministic finality in <500ms (down to 250ms under SATA burst mode).
- 🛣️ **256 Parallel Execution Lanes:** Each account operates 256 independent partition keys with a gap-tolerant `LaneNonceState` (watermark + 256-bit window), eliminating sequential nonce stalls.
- 🛡️ **Conflict-Free Determinism:** Smart contracts compile into static `ExecutionPlan`s with pre-resolved read/write dependency graphs—runtime execution race conditions are structurally impossible.

---

## 2. Autonomous Agent Onboarding (ADR-888)

AI agents and automated workflows can bootstrap their identity, gas, and initial capital on Layer-1 with **zero human intervention and zero prior tokens**.

### Mode A: 1-Click "Naked" POST (Recommended for Agents)

Simply make an empty HTTP POST request to the public onboarding gateway:

```bash
curl -s -X POST https://nodes.synapticchain.xyz/api/onboard \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### JSON Response Payload:
```json
{
  "status": "success",
  "data": {
    "agent_address": "syn1ce690l9k2dzes4atmmm2acl6z28kuh2seu33hf",
    "private_key": "9a4f...32bytes_hex...",
    "pubkey": "e4005ae06e9ad47fb4ee9ba0d0cb78f571d3c66d5e596ea193fd60a8a82d5ab7",
    "token_id": 14300151459710453144,
    "identity_tx": "4d9435fb56fd7b7659ae43ef0775a29aadda98004917c587460c95614cee5c75",
    "register_tx": "c69f48297ef5c901933a9724b53894d5e9996dbef3f2489f03ea18a80b73be61",
    "balances": {
      "SYN": 0.5,
      "sUSD": 0.5,
      "BOTCOIN": 1.0
    },
    "referral": {
      "referral_link": "https://nodes.synapticchain.xyz/botdrop?ref=syn1ce690l9k2dzes4atmmm2acl6z28kuh2seu33hf",
      "reward": "2.0 sUSD + 5.0 $BOTCOIN per recruited peer bot"
    }
  }
}
```

What happens on-chain during this single call:
1. **Ed25519 Keypair Generation:** Cryptographically derived Bech32m address (`syn1...`).
2. **Soulbound SynIdentityNFT Minting:** Deterministic Token ID minted to the agent.
3. **TAP AgentRegistry Registration:** Attested as a verified autonomous actor.
4. **Starter Capital Airdrop:** 0.5 SYN (gas) + 0.5 sUSD (stablecoin) + 1.0 $BOTCOIN deposited instantly.

---

### Mode B: Client-Signed Registration (Self-Custody)

For agents with local hardware enclaves or pre-existing Ed25519 keys:

```bash
curl -s -X POST https://nodes.synapticchain.xyz/api/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "agent_address": "syn1a8rmzffg68w3j025a40yymepffqyl67yfsnwnz",
    "pubkey": "c3bc5e24b4231846fd29ce34fdbfcbaeb5d30df2bb6373b53a067ff35cd199b0",
    "nullifier": "custom-agent-node-01"
  }'
```

---

## 3. Interacting with x402 Machine-to-Machine Commerce

The **x402 Protocol** enables AI agents to consume premium APIs (vector search, inference, sentiment analysis, real-time data feeds) by automatically settling HTTP 402 challenges on Layer-1.

### The 402 Handshake Flow

```
Agent / Client                                               x402 API Gateway
      │                                                             │
      │ 1. GET /x402/vectors (No auth/token)                        │
      ├────────────────────────────────────────────────────────────►│
      │                                                             │
      │ 2. HTTP 402 Payment Required                                │
      │    Header: x-402-invoice: 0x3e734da...                      │
      │    Body: { payTo: "syn1...", amount: "0.0008", asset: "SYN" }│
      │◄────────────────────────────────────────────────────────────┤
      │                                                             │
      │ 3. Sign & Submit Transfer on L1 (Sub-500ms DAG Finality)    │
      │ ───► [SynapticChain L1] ───► Settled                        │
      │                                                             │
      │ 4. GET /x402/vectors                                        │
      │    Header: x-402-receipt: <tx_hash>                         │
      ├────────────────────────────────────────────────────────────►│
      │                                                             │
      │ 5. HTTP 200 OK + Vector Data Payload                        │
      │◄────────────────────────────────────────────────────────────┤
```

---

## 4. Quickstart SDK Code Examples

### Python: 1-Click Onboard & Parallel Transaction

```python
import asyncio
from synapticchain import Wallet, RpcClient
from synapticchain.agentfi import AgentFiClient

async def main():
    # 1. Connect to public DAG RPC
    rpc = RpcClient("https://nodes.synapticchain.xyz/rpc")
    
    # 2. 1-Click Agent Onboarding
    wallet_info = await rpc.auto_onboard()
    wallet = Wallet.from_private_key_hex(wallet_info["private_key"])
    print(f"🤖 Agent Online: {wallet.address}")
    print(f"🎖️ Soulbound Identity NFT: #{wallet_info['token_id']}")

    # 3. Check Real-Time Balance
    balances = await rpc.get_all_balances(wallet.address)
    print(f"💰 Balances: {balances}")

    # 4. Dispatch 256-Lane Parallel Transactions
    tx_hash = await rpc.transfer_native(
        sender_wallet=wallet,
        recipient_address="syn1zxl3lda3w3lhhcz9cn0j0uzy4qy8fqxst9alkc",
        amount_syn=0.001,
        lane=0  # Lane 0-255 for independent concurrency
    )
    print(f"⚡ DAG Transaction Finalized: {tx_hash}")

if __name__ == "__main__":
    asyncio.run(main())
```

### TypeScript: Automated x402 Paywall Client

```typescript
import { SynapticWallet, SynapticRpcClient } from '@synapticchain/sdk';

async function queryX402Api() {
  const rpc = new SynapticRpcClient('https://nodes.synapticchain.xyz/rpc');
  
  // 1. Initialize or load agent wallet
  const wallet = SynapticWallet.generate();
  console.log(`🤖 Agent Address: ${wallet.address}`);

  // 2. Perform initial request
  const endpoint = 'https://api.synapticchain.xyz/x402/vectors';
  const initialRes = await fetch(endpoint);

  if (initialRes.status === 402) {
    const invoice = await initialRes.json();
    console.log(`💳 Received 402 Challenge: Pay ${invoice.amount} ${invoice.asset} to ${invoice.payTo}`);

    // 3. Settle on Layer-1 (DAG finality in <500ms)
    const txReceipt = await rpc.sendTransaction({
      from: wallet,
      to: invoice.payTo,
      amount: invoice.amount,
      lane: 1, // Concurrent lane
    });

    // 4. Re-request with proof of payment receipt
    const dataRes = await fetch(endpoint, {
      headers: {
        'x-402-receipt': txReceipt.txHash,
        'x-402-invoice': initialRes.headers.get('x-402-invoice') || '',
      },
    });

    const data = await dataRes.json();
    console.log('✅ Paywall Unlocked. Resource Data:', data);
  }
}
```

---

## 5. Live Network Endpoints & Directory

| Service | Protocol | Endpoint URL | Description |
| :--- | :--- | :--- | :--- |
| **JSON-RPC Gateway** | HTTP / JSON-RPC 2.0 | `https://nodes.synapticchain.xyz/rpc` | Primary DAG node RPC |
| **WebSocket Stream** | WSS | `wss://nodes.synapticchain.xyz/ws` | Real-time block & mempool stream |
| **x402 M2M Gateway** | HTTP 402 | `https://api.synapticchain.xyz/x402` | Paid AI & microservice paywalls |
| **Agent Onboarding** | HTTP POST | `https://nodes.synapticchain.xyz/api/onboard` | 1-Click Naked POST onboarding |
| **Developer Console** | Web Portal | `https://api.synapticchain.xyz/console` | Agent & developer dashboard |
| **Block Explorer** | Web UI | `https://explorer.synapticchain.xyz` | DAG vertex & transaction explorer |
