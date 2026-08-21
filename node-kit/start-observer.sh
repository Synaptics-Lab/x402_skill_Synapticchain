#!/usr/bin/env bash
# ==============================================================================
# SynapticChain Observer Node Launcher
# ==============================================================================
# Syncs live blocks and state from the 3-node core mesh without staking.
# Provides local JSON-RPC (:8545) and P2P (:9000).
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${SCRIPT_DIR}/synaptic-node"
DATA_DIR="${SCRIPT_DIR}/data/observer"
BOOTSTRAP_PEER="${SYNAPTIC_BOOTSTRAP:-/dns4/nodes.synapticchain.xyz/tcp/9000/p2p/12D3KooWAlphaSeedNode}"

mkdir -p "${DATA_DIR}"

if [[ ! -f "${BIN}" ]]; then
    echo "❌ synaptic-node binary not found at ${BIN}"
    echo "👉 Build it with: cargo build --profile release-fast -p synaptic-node"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ⚡ SYNAPTICCHAIN OBSERVER NODE LAUNCHER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "• Data Directory:    ${DATA_DIR}"
echo "• RPC Port:          8545"
echo "• P2P Port:          9000"
echo "• Core Hub (Alpha):  nodes.synapticchain.xyz:9000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

export RUST_LOG=info,synaptic_consensus=info,synaptic_p2p=warn
export SYN_CONFIG_RPC_PORT=8545
export SYN_CONFIG_P2P_PORT=9000
export SYN_CONFIG_DATA_DIR="${DATA_DIR}"

exec "${BIN}" start \
    --rpc-port 8545 \
    --p2p-port 9000 \
    --data-dir "${DATA_DIR}" \
    --bootstrap "${BOOTSTRAP_PEER}"
