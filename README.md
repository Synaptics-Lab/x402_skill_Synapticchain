# ⚡ Synapse x402 — Developer & Autonomous Agent Starter Suite

<p align="center">
  <strong>The Machine-to-Machine (M2M) Autonomous Commerce & DAG Execution Rail on SynapticChain Layer-1</strong>
</p>

<p align="center">
  <a href="https://nodes.synapticchain.xyz"><img src="https://img.shields.io/badge/Network-SynapticChain%20L1-00F59B?style=for-the-badge&logo=fastapi&logoColor=black" alt="Network"></a>
  <a href="https://nodes.synapticchain.xyz"><img src="https://img.shields.io/badge/Consensus-DAG--Primary%20Sub--500ms-00D8F6?style=for-the-badge&logo=rust&logoColor=black" alt="Consensus"></a>
  <a href="https://api.synapticchain.xyz/x402/vectors"><img src="https://img.shields.io/badge/Protocol-HTTP%20402%20Live-8A2BE2?style=for-the-badge&logo=json&logoColor=white" alt="x402 Protocol"></a>
  <a href="https://api.synapticchain.xyz/checkout"><img src="https://img.shields.io/badge/Bridge-OKX%20SynapticPay-FFA500?style=for-the-badge" alt="SynapticPay"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge" alt="License"></a>
</p>

---

## 🌟 Overview

**Synapse x402** is the production developer suite for Machine-to-Machine (M2M) paid APIs, autonomous AI agent marketplaces, and DAG-parallel smart contracts on **SynapticChain Layer-1**.

Built from the ground up for high-frequency AI swarms, Synapse x402 revives the standard `HTTP 402 Payment Required` protocol to provide autonomous bots and LLM agents with sovereign, zero-friction spending and monetization power.

```
                    ┌──────────────────────────────────────────────────────────┐
                    │             DAG-PRIMARY MULTI-PROPOSER ORDERING          │
                    │   Concurrent Proposer Vertices with Causal Dependencies  │
                    └───────────────┬──────────────────────────┬───────────────┘
                                    │                          │
                     ┌──────────────▼───────────┐   ┌──────────▼───────────────┐
                     │ Proposer Vertex A (0.25s)│   │ Proposer Vertex B (0.25s)│
                     └──────────────┬───────────┘   └──────────┬───────────────┘
                                    │                          │
                                    └─────────────┬────────────┘
                                                  │
                                    ┌─────────────▼────────────┐
                                    │  Deterministic DAG Merge │
                                    │   Causal State Checkpoint│
                                    └─────────────┬────────────┘
                                                  │
                                    ┌─────────────▼────────────┐
                                    │  256-Lane Parallel Exec  │
                                    │  Lock-Free Nonce Matrix  │
                                    └──────────────────────────┘
```

---

## ⚡ Key Architectural Moats

* 🛣️ **DAG-Primary Multi-Proposer Ordering:** Multiple proposers submit transaction vertices concurrently into a Directed Acyclic Graph. Causal graph edges establish deterministic finality without linear single-sequencer bottlenecks.
* ⚡ **Sub-500ms / 250ms Finality:** SCBFT DAG consensus delivers finality in <500ms, dynamically scaling down to 250ms under SATA (Self-Adaptive Topology Adjustment) during high-load bursts.
* 🔄 **256 Parallel Execution Lanes:** Each account operates across 256 independent lanes with a sliding watermark and 256-bit bitmap window (`LaneNonceState`), eliminating head-of-line nonce stalls.
* 🤖 **Zero-Friction 1-Click Onboarding (ADR-888):** A single `POST /api/onboard` provisions Ed25519 keys, mints a Soulbound `SynIdentityNFT`, and dispenses starter gas + capital + $BOTCOIN.
* 💳 **Native HTTP 402 Micro-Settlements:** Settle paid API calls directly on Layer-1 with sub-second turnaround and zero custodial middleman risk.
* 🌐 **SynapticPay (OKX Multi-Chain Deposit Bridge):** Cross-chain atomic gateway allowing users and agents to deposit USDT, USDC, BTC, ETH, SOL, or TRX and receive SYN & sUSD on L1.

---

## 📂 Repository Layout

```
synapse-x402-debut/
├── .agents/                           # AI Agent Skills (for Claude, Cursor, OpenClaw, GPT)
│   └── skills/agent-onboarding/       # ADR-888 Onboarding & DAG Execution Protocol
├── sdks/
│   ├── python/                        # Production Python SDK (synapticchain)
│   └── typescript/                    # Production TypeScript SDK (@synapticchain/sdk)
├── dashboard/                         # x402 Marketplace & Developer Console (Next.js)
├── x402-gateway/                      # Standalone HTTP 402 Reverse Proxy Middleware
├── docs/                              # Architecture, x402 Spec & API Reference
└── package.json                       # Workspace convenience scripts
```

---

## 🚀 60-Second Quickstarts

### 1. 1-Click Autonomous Agent Onboarding (Naked POST)

Any AI bot, LLM, or script can onboard in seconds without prior funds or human intervention:

```bash
curl -s -X POST https://nodes.synapticchain.xyz/api/onboard \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Live JSON Response:**
```json
{
  "status": "success",
  "data": {
    "agent_address": "syn1ce690l9k2dzes4atmmm2acl6z28kuh2seu33hf",
    "private_key": "9a4f...32bytes_hex...",
    "pubkey": "e4005ae06e9ad47fb4ee9ba0d0cb78f571d3c66d5e596ea193fd60a8a82d5ab7",
    "token_id": 14300151459710453144,
    "balances": {
      "SYN": 0.5,
      "sUSD": 0.5,
      "BOTCOIN": 1.0
    }
  }
}
```

---

### 2. Test Live x402 Paywall in Terminal

Ping the live vector recall paywall:

```bash
curl -i https://api.synapticchain.xyz/x402/vectors
```

**HTTP 402 Challenge:**
```http
HTTP/2 402 Payment Required
www-authenticate: x402 realm="SynapticChain"
x-402-invoice: 0x3e734da0ba811b...
x-402-amount: 0.0008

{
  "reason": "payment_required",
  "payTo": "syn1zxl3lda3w3lhhcz9cn0j0uzy4qy8fqxst9alkc",
  "asset": "SYN",
  "amount": "0.0008",
  "finalityMs": 500
}
```

---

### 3. Python SDK: Automated Agent & 256-Lane Dispatch

```python
import asyncio
from synapticchain import Wallet, RpcClient

async def main():
    rpc = RpcClient("https://nodes.synapticchain.xyz/rpc")
    
    # 1-click onboard
    info = await rpc.auto_onboard()
    wallet = Wallet.from_private_key_hex(info["private_key"])
    print(f"🤖 Bot Online: {wallet.address}")

    # Dispatch across Lane 0 (0-255 available for non-blocking parallelism)
    tx_hash = await rpc.transfer_native(
        sender_wallet=wallet,
        recipient_address="syn1zxl3lda3w3lhhcz9cn0j0uzy4qy8fqxst9alkc",
        amount_syn=0.001,
        lane=0
    )
    print(f"⚡ L1 DAG Transaction Finalized: {tx_hash}")

if __name__ == "__main__":
    asyncio.run(main())
```

---

### 4. Run the x402 Marketplace & Dashboard Locally

```bash
# Install and launch dashboard
npm run dashboard:dev
```
Open [http://localhost:3000](http://localhost:3000) to access the Consumer Console, x402 API Testbench, SynapticPay Checkout, and Skills Market.

---

## 🌐 Live Network Directory

| Service | Protocol | Endpoint URL | Description |
| :--- | :--- | :--- | :--- |
| **JSON-RPC Gateway** | HTTP / JSON-RPC 2.0 | `https://nodes.synapticchain.xyz/rpc` | Primary DAG Node RPC |
| **WebSocket Stream** | WSS | `wss://nodes.synapticchain.xyz/ws` | Real-time DAG block & tx stream |
| **x402 M2M Gateway** | HTTP 402 | `https://api.synapticchain.xyz/x402` | Paid AI & microservice endpoints |
| **Autonomous Onboarding** | HTTP POST | `https://nodes.synapticchain.xyz/api/onboard` | 1-Click Naked POST onboarding |
| **SynapticPay Bridge** | Web App / API | `https://api.synapticchain.xyz/checkout` | OKX Multi-Chain Atomic Bridge |
| **Block Explorer** | Web UI | `https://explorer.synapticchain.xyz` | DAG vertex & block explorer |

---

## 🔒 Security & Privacy Notice

- **No Proprietary Backend Code Exposed:** This starter repository contains client SDKs, API interfaces, gateway middleware, and frontend dashboards. Internal consensus engines and low-level validator state machines remain private.
- **Zero Sourcemaps:** Sourcemap generation is strictly disabled in all configurations (`productionBrowserSourceMaps: false`).
- **No Hardcoded Private Keys:** Never commit real private keys or `.env.local` files.

---

## 📜 License

Apache-2.0 © 2026 SynapticChain Core Contributors
