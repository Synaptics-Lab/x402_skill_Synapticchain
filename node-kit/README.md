# ⚡ SynapticChain Node Runner Kit (v0.1.0-release)

> **Official sovereign node distribution for SynapticChain Layer-1.**  
> Includes the production-optimized `synaptic-node` binary, 1-click launch scripts, systemd unit templates, and consensus intake tooling.

---

## 🏛️ Layer-1 Architecture: Why SynapticChain is Different

SynapticChain is **NOT** a sequential BFT chain masquerading as a DAG, nor is it an EVM rollup with a centralized single-threaded sequencer.

```text
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                   DAG-PRIMARY MULTI-PROPOSER ORDERING                   │
 │   ┌───────────────┐     ┌───────────────┐     ┌───────────────┐         │
 │   │ Slot Vertex A │◄───►│ Slot Vertex B │◄───►│ Slot Vertex C │         │
 │   └───────┬───────┘     └───────┬───────┘     └───────┬───────┘         │
 │           ▼                     ▼                     ▼                 │
 │   ┌─────────────────────────────────────────────────────────────┐       │
 │   │         256-LANE CONFLICT-FREE PARALLEL RAYON SEQUENCER     │       │
 │   │  [Lane 0]   [Lane 1]   [Lane 2]  ...  [Lane 254]  [Lane 255]│       │
 │   └─────────────────────────────┬───────────────────────────────┘       │
 │                                 ▼                                       │
 │   ┌─────────────────────────────────────────────────────────────┐       │
 │   │  DUAL-LEDGER LOCK-FREE STATE ENGINE (DashMap + QuickMerkle) │       │
 │   │  Sub-500ms Finality • 5,291+ TPS Sustained • Lossless RPC   │       │
 │   └─────────────────────────────────────────────────────────────┘       │
 └─────────────────────────────────────────────────────────────────────────┘
```

### 1. 📐 DAG-Primary Multi-Proposer Ordering (ADR-641)
- **Concurrent Slot Vertices:** Proposers do not queue behind a single dictator bottleneck. Multiple validators construct and gossip DAG slot vertices concurrently, referencing parent vertices via cryptographic hashes.
- **Accountable Rotating Sequencer:** Leader selection rotates deterministically with anti-equivocation enforcement (`VertexEquivocationDetector`). Double-signing across slot vertices results in immediate cryptographic slashing.
- **Sub-500ms Deterministic Finality:** BFT checkpoints seal the DAG causal order deterministically with quorum consensus.

### 2. ⚡ 256-Lane Conflict-Free Parallel Sequencer (ADR-062)
- **Gap-Tolerant Nonce Watermarks (`LaneNonceState`):** Every account operates across 256 independent partition lanes with a 256-bit sliding window. Any unused nonce within the window is valid.
- **Rayon Multi-Threaded Execution:** Transactions on separate lanes execute in parallel without lock contention, eliminating the global mempool stalling bug common to sequential blockchains.
- **Verified Sustained Throughput:** 5,291+ real on-chain TPS with lossless RPC ingestion.

### 3. 🔬 JIT Operation Fusion & Compile-Time Tick-Based Scheduling
- **Compile-Time Tick Scheduling (`synaptic-compiler`):** Analyzes contract read/write sets (`#[reads(...)]`, `#[writes(...)]`) and divides execution into discrete, conflict-free **Ticks** with mathematically proven non-overlapping storage access.
- **Phase 1 JIT Engine (`synaptic-vm/src/jit.rs`):** Compiles `FunctionPlan` → `JitFunctionPlan` at contract load time, fusing adjacent micro-ops (`LoadConst+Compute`, `LoadArg+Compute`, `LoadConst+Write`) and inline-caching binary state keys to eliminate runtime allocations and stack hops.
- **Pre-Computed Gas & Tick Tables:** Pre-calculates cycle-accurate per-tick gas budgets (`tick_gas`) and nested tick groups (`tick_groups`), eliminating runtime dynamic metering overhead.

### 4. 🛡️ Sovereign Rust Native Runtime
- Zero EVM or Geth dependencies; custom stack VM with static execution plans (`.plan` bytecode compiled from `.syn` smart contracts).
- Native HTTP 402 Machine-to-Machine micro-settlement gateway.
- Native ISO 20022 corridor payment support (sUSD, cTZS, cKES, cNGN, cZAR).

---

## 📦 What's in this Package

| File | Role |
| :--- | :--- |
| **`synaptic-node`** | Native Rust node binary (release-fast, stripped, 39MB). Supports CLI modes: `start`, `validator`, `sata`, `mempool`, `batcher`. |
| **`start-observer.sh`** | 1-click script to run an **Observer Node** (zero-stake, syncs state, serves local JSON-RPC). |
| **`start-validator.sh`** | 1-click script to run a **Consensus Validator Node** (requires 10k SYN stake). |
| **`generate-key.py`** | Standalone Ed25519 keypair generator (outputs 32-byte secret key and `syn1...` Bech32m address). |
| **`join-early-validators.py`** | Intake CLI for the subsidized 100 Early Validator program. |
| **`genesis-testnet.toml`** | Canonical network genesis parameters and tokenomics allocations. |
| **`systemd/`** | Production systemd service unit files (`synaptic-observer.service`, `synaptic-validator.service`). |

---

## 🚀 Quick Start 1: Run an Observer Node (Zero-Stake)

Observer nodes sync full block history from the network, verify state transitions, and provide a local, ultra-low-latency JSON-RPC endpoint (`http://127.0.0.1:8545`) for AI agents, trading bots, and frontends.

```bash
cd node-kit
chmod +x *.sh synaptic-node

# Launch Observer Node
./start-observer.sh
```

### Check Local Node Health
```bash
curl -s -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"syn_getStatus","params":[],"id":1}'
```

---

## 🏛️ Quick Start 2: Run a Consensus Validator Node

Validators participate in DAG vertex creation, vote aggregation, and checkpoint finalization.

### Step 1: Generate your Validator Key
```bash
python3 generate-key.py
```
This generates `validator.key` (32 bytes raw) and `validator_info.json`.

### Step 2: Ensure Minimum Stake (10,000 SYN)
- Check your balance via RPC: `syn_getBalance`.
- Or apply for the **Subsidized Early Validator Program** (+5,000 SYN treasury match):
  ```bash
  python3 join-early-validators.py --ccy USDT --chain TRC20
  ```

### Step 3: Launch Validator Node
```bash
./start-validator.sh
```

---

## ⚙️ Production Systemd Deployment

For 24/7 background operation on Linux servers:

```bash
# 1. Create deployment directory
sudo mkdir -p /opt/synaptic-node
sudo cp -r . /opt/synaptic-node/

# 2. Install systemd service
sudo cp /opt/synaptic-node/systemd/synaptic-observer.service /etc/systemd/system/
# OR for validators:
# sudo cp /opt/synaptic-node/systemd/synaptic-validator.service /etc/systemd/system/

# 3. Reload & enable
sudo systemctl daemon-reload
sudo systemctl enable --now synaptic-observer

# 4. Check status & logs
sudo systemctl status synaptic-observer
sudo journalctl -u synaptic-observer -f
```

---

## 📊 Hardware Requirements

| Tier | vCPUs | RAM | NVMe SSD | Network Uplink | Recommended Use |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Observer** | 2-4 | 4 GB | 50 GB | 50 Mbps | Local RPC for trading bots & dApps |
| **Validator** | 4-8 | 8-16 GB | 100 GB | 100+ Mbps | Active DAG Consensus & Checkpoint Sealing |
| **Full Archive** | 8+ | 32 GB | 500 GB | 1 Gbps | Explorer indexers & historical analytics |

---

## 🌐 Network Configuration & Ports

* **P2P GossipSub Port:** `9000` (TCP/UDP) — open in firewall.
* **JSON-RPC Port:** `8545` (HTTP / JSON-RPC 2.0).
* **WebSocket Firehose:** `8546` (WS real-time block streaming).
* **Bootstrap Peer (Alpha Hub):** `/dns4/nodes.synapticchain.xyz/tcp/9000/p2p/12D3KooWAlphaSeedNode`
* **Public Gateway:** `https://nodes.synapticchain.xyz/rpc`
* **Network Chain ID:** `1` (Mainnet / Staging)

---

## 📄 License & Community
- **GitHub:** [https://github.com/Synaptics-Lab/x402_skill_Synapticchain](https://github.com/Synaptics-Lab/x402_skill_Synapticchain)
- **Explorer:** [https://nodes.synapticchain.xyz/explorer](https://nodes.synapticchain.xyz/explorer)
- **Marketplace:** [https://api.synapticchain.xyz](https://api.synapticchain.xyz)
