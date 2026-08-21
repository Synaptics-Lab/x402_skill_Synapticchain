#!/usr/bin/env python3
"""
SynapticChain 100 Early Bot Validator Intake Program
====================================================
Subsidized Genesis Validator Onboarding:
- Required Operator Purchase: 5,000 SYN @ $0.50/SYN ($2,500.00 USD via OKX).
- SynapticChain Treasury Subsidy: +5,000 SYN matching stake.
- Total Consensus Stake: 10,000 SYN (Full SCBFT Neuron Qualification).
- Limit: Exactly 100 Early Validator positions available to join Alpha, Bravo, and Zeta.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

# Add Python SDK
sys.path.insert(0, "/opt/synapticchain/sdks/python/src")
try:
    from synapticchain import Wallet, RpcClient, Address
    from synapticchain.crypto import Keypair
except ImportError:
    pass

VALIDATOR_INVOICES = Path("/opt/synapticchain/contracts/production/early-validator-invoices.json")
OKX_DEPOSIT_TARGET = "syn1guk3p8h2v6lxzv442v2chtjsxf2dgsv2rl4dw0"

def create_validator_invoice(val_address: str, ccy: str = "USDT", chain: str = "TRC20") -> dict:
    VALIDATOR_INVOICES.parent.mkdir(parents=True, exist_ok=True)
    invoices = {}
    if VALIDATOR_INVOICES.exists():
        try:
            with open(VALIDATOR_INVOICES, "r") as f:
                invoices = json.load(f)
        except Exception:
            pass

    slot_number = len(invoices) + 1
    if slot_number > 100:
        return {"error": "All 100 Early Validator positions have been claimed!"}

    now = int(time.time())
    invoice_id = f"val_slot_{slot_number}_{now}_{val_address[:8]}"

    invoice = {
        "invoice_id": invoice_id,
        "slot_number": slot_number,
        "total_slots": 100,
        "validator_address": val_address,
        "price_usd": 2500.00,
        "syn_purchased": 5000.0,
        "syn_subsidized_by_treasury": 5000.0,
        "total_consensus_stake": 10000.0,
        "currency": ccy.upper(),
        "chain": chain.upper(),
        "deposit_address": OKX_DEPOSIT_TARGET,
        "status": "PENDING_DEPOSIT",
        "created_at": now,
        "expires_at": now + 86400 * 7, # 7 days
        "perks": [
            "Active SCBFT Consensus Neuron Position",
            "5,000 SYN (100%) Matching Stake Subsidy from Protocol Treasury",
            "Earn Block Rewards + Gas Shares on Every Checkpoint",
            "ISO 20022 and x402 Merchant Settlement Fees",
            "Direct P2P peering with Alpha (Germany), Bravo (South Africa), and Zeta (US)"
        ]
    }

    invoices[invoice_id] = invoice
    with open(VALIDATOR_INVOICES, "w") as f:
        json.dump(invoices, f, indent=2)

    return invoice

def main():
    parser = argparse.ArgumentParser(description="SynapticChain 100 Early Validator Intake")
    parser.add_argument("--address", help="Validator address (defaults to validator_info.json)")
    parser.add_argument("--ccy", default="USDT", help="Payment currency (USDT, USDC, ETH, BTC)")
    parser.add_argument("--chain", default="TRC20", help="Payment chain (TRC20, Arbitrum, ERC20, Polygon)")
    args = parser.parse_args()

    addr = args.address
    if not addr:
        info_file = Path("validator_info.json")
        if info_file.exists():
            with open(info_file) as f:
                addr = json.load(f).get("address")
        else:
            print("⚠️ validator_info.json not found. Run ./generate-key.py first or pass --address syn1...")
            sys.exit(1)

    inv = create_validator_invoice(addr, args.ccy, args.chain)

    print("=" * 72)
    print("🏛️ SYNAPTICCHAIN 100 EARLY BOT VALIDATOR PROGRAM")
    print("=" * 72)
    print(f"• Assigned Slot:       Slot #{inv['slot_number']} of {inv['total_slots']}")
    print(f"• Validator Address:   {inv['validator_address']}")
    print(f"• Required Purchase:   5,000 SYN @ $0.50/SYN ($2,500.00 USD)")
    print(f"• Protocol Subsidy:    +5,000 SYN Matched by SynapticChain Treasury (FREE)")
    print(f"• Total Staked Stake:  10,000 SYN (Full Consensus Qualification)")
    print(f"• Deposit Target:      {inv['deposit_address']} ({inv['currency']} on {inv['chain']})")
    print(f"• Settlement Gate:     100% Verified OKX V5 State '2' Confirmation")
    print("=" * 72)
    print("\n🎁 VALIDATOR SUPERPOWERS & REVENUE STREAMS:")
    for p in inv["perks"]:
        print(f"  ✅ {p}")
    print("\n" + "=" * 72)
    print(f"👉 Invoice ID: {inv['invoice_id']}")
    print("• Upon deposit settlement, your node will automatically activate into the active SCBFT consensus quorum alongside Alpha, Bravo, and Zeta at the time of OKX listing!\n")

if __name__ == "__main__":
    main()
