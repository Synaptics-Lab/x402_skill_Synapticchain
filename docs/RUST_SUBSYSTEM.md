# 🦀 100% Rust SynapticChain Subsystem

> **Zero EVM. Zero Geth. Zero Cosmos/Substrate Bloat.**  
> A pure, ground-up Layer-1 blockchain platform engineered in native Rust (Edition 2021, MSRV 1.75) for deterministic machine-speed execution.

---

## 🏛️ The 12-Crate Rust Workspace Architecture

SynapticChain is modularized into 12 tightly integrated Rust crates within a unified workspace:

```text
/opt/synapticchain
├── synaptic-types/        Core data models (Address, Hash, AST, ExecutionPlan, Account v2, ISO 20022)
├── synaptic-crypto/       Ed25519 (dalek 2.1), BLS aggregate signatures, SHA3, Bech32m, Rayon parallel sigs
├── synaptic-compiler/     SynapticLang compiler (Lexer → Parser → Dependency Analyzer → Scheduler → Planner)
├── synaptic-vm/           Stack-based VM runtime, parallel Rayon lane dispatcher, s0 compile-time guards
├── synaptic-state/        Dual-ledger persistence (RocksDB + optional QMDB), DashMap lock-free indexing
├── synaptic-consensus/    SCBFT DAG-Primary Multi-Proposer, SATA topology tuning, EquivocationDetector
├── synaptic-p2p/          libp2p transport (GossipSub mesh, Kademlia DHT, Noise, Yamux, State Sync)
├── synaptic-node/         Main node binary, Axum JSON-RPC 2.0 gateway, sharded mempool, Prometheus metrics
├── synaptic-runtime/      Parallel executor glue, VRF host, oracle runtime
├── synaptic-sdk/          Pure Rust client library (Ed25519 wallet, submit_windowed 256-lane retry)
├── synaptic-stdlib/       SynapticLang stdlib interfaces (VRF randomness, math, token standards)
└── synaptic-swift/        ISO 20022 ↔ SWIFT financial message conversion gateway
```

---

## ⚡ Technical Breakdown of Crate Responsibilities

### 1. `synaptic-types` — Canonical Data Models
- **`Address` & `Hash`:** 32-byte cryptographic hashes and Bech32m-encoded `syn1...` addresses.
- **Account State v2 (`LaneNonceState`):** Gap-tolerant watermark + 256-bit sliding window bitmap per account lane.
- **`ExecutionPlan`:** Serialized binary execution bytecode containing static read/write access sets (`#[reads(...)]`, `#[writes(...)]`).
- **ISO 20022 Financial Types:** Native financial payment instructions (`pacs.008`, `pain.001`, `camt.053`).

### 2. `synaptic-crypto` — High-Throughput Cryptographic Engine
- **Ed25519 Signatures:** Built on `ed25519-dalek` v2.1 with batch verification.
- **BLS Aggregate Signatures:** `blst` integration for fast validator vote aggregation across DAG vertices.
- **Rayon Parallel Verification:** Signature verification on incoming blocks/batches is distributed across all CPU cores with Rayon data parallelism.
- **Zero-Allocation SHA3/SHA256:** Native hashing using SIMD instructions where supported.

### 3. `synaptic-compiler` — Ahead-of-Time Static Scheduler (`synlang`)
- Full compiler pipeline translating `.syn` smart contracts into deterministic `.plan` binaries.
- **Lexer & Parser:** Recursive-descent AST construction with strict type checking.
- **Compile-Time Tick Scheduling:** Analyzes memory access sets (`#[reads(...)]`, `#[writes(...)]`) and divides contract operations into discrete execution **Ticks** (`tick_idx`).
- **Parallelism Safety Proofs:** Mathematically proves at compile time that no two operations in the same tick write to the same storage slot.
- **Pre-Computed Gas & Tick Tables:** Pre-calculates cycle-accurate per-tick gas budgets (`tick_gas: Vec<u64>`) and nested tick groups (`tick_groups: Vec<Vec<Vec<usize>>>`), eliminating dynamic runtime gas metering loops.

### 4. `synaptic-vm` — Parallel Rayon Execution & Phase 1 JIT Engine (`jit.rs`)
- Stack-based virtual machine executing pre-compiled `.plan` instruction streams.
- **Phase 1 JIT Compilation:** Compiles `FunctionPlan` → `JitFunctionPlan` at contract load time.
- **Operation Fusion:** Fuses adjacent operations (e.g., `LoadConst + Compute`, `LoadArg + Compute`, `LoadConst + Write`) into single micro-instructions, bypassing intermediate register spills and stack hops.
- **Inline State Key Caching:** Pre-encodes state storage keys as raw `Vec<u8>` bytes at compile/load time, eliminating `to_vec()` allocations during hot execution loops.
- **$O(1)$ Tick Dispatch:** Slices operations by tick (`tick_ops` and `parallel_tick_ops`), turning dynamic runtime dispatch into an $O(1)$ array slice lookup.
- **Rayon Parallel Worker Pools:** Executes all disjoint parallel groups within a tick simultaneously across multi-core CPU pools.
- **Compile-Time Hot-Path Guards (`s0_enforcement`):** Prevents the introduction of `std::sync::Mutex` or blocking locks on the execution hot path.

### 5. `synaptic-state` — Dual-Ledger Lock-Free State Store
- **In-Memory Cache:** High-concurrency `DashMap` indices for O(1) balance and nonce queries.
- **RocksDB Backend:** Column-family persistent key-value store optimized for NVMe I/O.
- **LayerZero QMDB (Quick Merkle DB):** Optional high-performance verifiable storage with zero-copy root updates.
- **O_DIRECT NVMe Direct Paths:** Bypasses OS page cache under high-throughput sustained write loads.

### 6. `synaptic-consensus` — SCBFT DAG-Primary Multi-Proposer
- **DAG-Primary Ordering (ADR-641):** Concurrent proposer slot vertices with causal edge composition.
- **Rotating Sequencer Accountability (ADR-640):** Bounded censorship timeouts (`force_include_timeout`) and cryptographic slashing via `VertexEquivocationDetector`.
- **SATA (Self-Adaptive Topology Adjustment):** Dynamically modulates checkpoint flush intervals from 500ms to 250ms based on EMA throughput feedback.

### 7. `synaptic-p2p` — High-Throughput libp2p Networking
- **Transport:** Multiplexed TCP/QUIC with Noise encryption and Yamux stream multiplexing.
- **Propagation:** GossipSub 1.1 mesh with non-blocking publish retries and peer scoring.
- **State Synchronization:** Fast chunked snapshot sync and delta catchup over request-response protocols.

### 8. `synaptic-node` — Sovereign Node Runtime & Gateway
- **Axum & Tower HTTP Server:** Async JSON-RPC 2.0 server with rate limiting, CORS, and connection pooling.
- **Sharded Mempool:** Speculative dual-ledger nonce marks reconciled before every admission cycle.
- **Prometheus Metrics:** Microsecond-precision histograms for consensus finality, TPS, mempool depth, and DAG vertex latency.

---

## 🔒 Lock-Free S=0 Architecture Directives

SynapticChain enforces strict **S=0 Lock-Free Guidelines** across its Rust codebase:

1. **No `std::sync::Mutex` on Hot Paths:** All hot-path state uses `DashMap`, `parking_lot::RwLock`, atomic primitives (`AtomicU64`, `AtomicBool`), and lock-free crossbeam/tokio channels.
2. **Rayon Multi-Threading:** Signature batching, DAG topological sorting, and non-conflicting contract execution are parallelized via Rayon threadpools.
3. **Deterministic Replay Parity (ADR-643):** Every execution context (proposer shadow, follower catchup, P2P sync) produces 100% bit-for-bit identical state roots.
4. **Thin LTO & Optimized Codegen:** Compiled with `opt-level = 2/3`, Thin LTO, and CPU target optimizations for maximum bare-metal throughput.

---

## 📊 Summary Comparison: SynapticChain vs Legacy Chains

| Metric / Dimension | Traditional EVM / Geth | Tendermint / Cosmos | **SynapticChain (100% Rust)** |
| :--- | :--- | :--- | :--- |
| **Language & Engine** | Go / C++ / EVM | Go / Cosmos-SDK | **100% Native Rust (MSRV 1.75)** |
| **Consensus Structure** | Single Leader / PoS | Sequential Round BFT | **DAG-Primary Multi-Proposer (ADR-641)** |
| **Execution Model** | Single-threaded EVM | Sequential State Machine | **256-Lane Conflict-Free Rayon Parallelism** |
| **Finality Latency** | 12s – 15min (probabilistic) | 2s – 6s | **Sub-500ms / 250ms (Deterministic)** |
| **Sustained Real TPS** | 15 – 30 TPS | 200 – 500 TPS | **5,291+ TPS Sustained on L1** |
| **HTTP 402 Settlement** | None (External L2 wrapper) | None | **Native Machine-to-Machine L1 Protocol** |
| **Account Nonce Model** | Sequential Global Counter | Sequential Global Counter | **256-Lane Sliding Bitmap Window (Gap-Tolerant)** |

---

## 🛠️ Building From Source

```bash
# Clone the repository
git clone https://github.com/Synaptics-Lab/x402_skill_Synapticchain.git
cd x402_skill_Synapticchain

# Build the node binary with memory-efficient profile
cargo build --profile release-fast -p synaptic-node

# Run workspace unit and integration tests
cargo test --all-features --workspace
```
