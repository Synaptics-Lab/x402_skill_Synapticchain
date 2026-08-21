#!/usr/bin/env python3
"""
Example: Moltbook OAuth & Verifiable Credential Attestation for AgentFi
"""

from synapticchain import Keypair, AgentWallet, MoltbookClient


def main():
    print("=== SynapticChain AgentFi x Moltbook Identity Attestation ===")
    
    # 1. Generate agent wallet
    wallet = AgentWallet.generate()
    print(f"Agent Wallet Address: {wallet.address}")
    
    # 2. Init Moltbook Client
    moltbook = MoltbookClient(api_key="mb_testnet_demo_key", webhook_secret="mb_secret_123")
    
    # 3. Verify Moltbook handle
    handle = "@agri_trader_001"
    info = moltbook.verify_agent_handle(handle)
    print(f"Verified Moltbook Handle: {info['handle']} (Karma: {info['karma']}, Tier: {info['reputation_tier']})")
    
    # 4. Generate Ed25519 signed W3C Verifiable Credential
    vc = moltbook.create_verifiable_credential(wallet, handle, trust_score=99.8)
    print("\n✅ Created W3C Verifiable Credential:")
    print(f"Credential ID: {vc['id']}")
    print(f"Issuer DID: {vc['issuer']}")
    print(f"Proof Value: {vc['proof']['proofValue'][:32]}...")
    
    # 5. Verify Webhook signature test
    payload = b'{"event":"BOT_TRADE","handle":"@agri_trader_001","action":"BUY_YES"}'
    import hmac, hashlib
    sig = "sha256=" + hmac.new(b"mb_secret_123", payload, hashlib.sha256).hexdigest()
    verified = moltbook.verify_webhook_signature(payload, sig)
    print(f"\n✅ Webhook Signature Verification: {'VALID' if verified else 'INVALID'}")


if __name__ == "__main__":
    main()
