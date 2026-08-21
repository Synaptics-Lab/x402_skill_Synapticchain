#!/usr/bin/env bash
# ==============================================================================
# SynapticChain Active Validator Node Launcher
# ==============================================================================
# Participates in SCBFT BFT consensus, block proposal, and DAG sealing.
# Requires 10,000 SYN stake (or 5,000 SYN subsidized early validator slot).
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${SCRIPT_DIR}/synaptic-node"
DATA_DIR="${SCRIPT_DIR}/data/validator"
KEY_FILE="${SCRIPT_DIR}/validator.key"
BOOTSTRAP_PEER="${SYNAPTIC_BOOTSTRAP:-/dns4/nodes.synapticchain.xyz/tcp/9000/p2p/12D3KooWAlphaSeedNode}"

mkdir -p "${DATA_DIR}"

if [[ ! -f "${BIN}" ]]; then
    echo "❌ synaptic-node binary not found at ${BIN}"
    exit 1
fi

if [[ ! -f "${KEY_FILE}" ]]; then
    echo "⚠️  Validator key not found at ${KEY_FILE}."
    echo "👉 Generating fresh Ed25519 validator key..."
    python3 "${SCRIPT_DIR}/generate-key.py"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ⚡ SYNAPTICCHAIN CONSENSUS VALIDATOR LAUNCHER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "• Data Directory:    ${DATA_DIR}"
echo "• Key File:          ${KEY_FILE}"
echo "• Consensus Mode:    SCBFT 3-of-3 Quorum + Top-100 Early Neurons"
echo "• RPC Port:          8545"
echo "• P2P Port:          9000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

export RUST_LOG=info,synaptic_consensus=info,synaptic_p2p=warn
export SYN_CONFIG_RPC_PORT=8545
export SYN_CONFIG_P2P_PORT=9000
export SYN_CONFIG_DATA_DIR="${DATA_DIR}"
export SYN_VALIDATOR_KEY="${KEY_FILE}"

exec "${BIN}" start \
    --validator \
    --validator-key "${KEY_FILE}" \
    --rpc-port 8545 \
    --p2p-port 9000 \
    --data-dir "${DATA_DIR}" \
    --consensus-quorum 3 \
    --bootstrap "${BOOTSTRAP_PEER}"
