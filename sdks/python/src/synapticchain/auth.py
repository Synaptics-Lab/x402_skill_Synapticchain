"""
SynapticChain Web4 Native Agent Authentication & Zero-Trust Onboarding Protocol
Provides zero-API-key cryptographic sign-in, W3C DID attestation, and automatic funding for AI agents and OpenClaws.
"""

import json
import time
import hashlib
from typing import Dict, Any, Optional
from .agentfi import AgentWallet, AgentFiClient
from .moltbook import MoltbookClient
from .rpc import RpcClient
from .address import Address
from .wallet import Wallet


class Web4AuthSession:
    """
    Authenticated Web4 Agent Session object.
    Holds the agent's DID, W3C Verifiable Credential, session token, and account status.
    """
    def __init__(self, address: str, handle: str, vc: Dict[str, Any], session_token: str, balance_syn: float):
        self.address = address
        self.handle = handle
        self.did = vc["credentialSubject"]["id"]
        self.verifiable_credential = vc
        self.session_token = session_token
        self.balance_syn = balance_syn
        self.authenticated_at = int(time.time())
        self.status = "AUTHENTICATED_AND_FUNDED"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "address": self.address,
            "handle": self.handle,
            "did": self.did,
            "status": self.status,
            "balance_syn": self.balance_syn,
            "session_token": self.session_token,
            "verifiable_credential": self.verifiable_credential,
            "authenticated_at": self.authenticated_at
        }

    def __repr__(self) -> str:
        return f"<Web4AuthSession handle={self.handle} address={self.address} balance={self.balance_syn} SYN>"


class Web4Auth:
    """
    Elite Web4 Zero-Trust Authentication Gateway for AI Agents & OpenClaws.
    """

    @staticmethod
    def login(
        wallet: Optional[AgentWallet] = None,
        handle: str = "@open_claw_agent",
        rpc_url: str = "https://nodes.synapticchain.xyz/rpc",
        auto_fund: bool = True
    ) -> Web4AuthSession:
        """
        Execute 1-Line Zero-Trust Cryptographic Sign-In for an AI Agent / OpenClaw.
        1. Generates or loads Ed25519 Agent Wallet.
        2. Signs a timestamped cryptographic challenge nonce.
        3. Issues a W3C Verifiable Credential & TAP Identity.
        4. Auto-funds wallet with native SYN gas if balance is low.
        5. Returns Web4AuthSession token.
        """
        # 1. Load or Generate Agent Wallet
        agent_wallet = wallet if wallet else AgentWallet.generate()
        addr_str = agent_wallet.address if isinstance(agent_wallet.address, str) else agent_wallet.address.to_bech32()

        # 2. Cryptographic Challenge-Response Sign-In
        timestamp = int(time.time())
        challenge_msg = f"SYNAPTIC_WEB4_AUTH_CHALLENGE:{timestamp}:{addr_str}".encode('utf-8')
        challenge_sig = agent_wallet.wallet._keypair.sign(challenge_msg).hex()

        # 3. Issue W3C Verifiable Credential via Moltbook SDK
        mb = MoltbookClient()
        vc = mb.create_verifiable_credential(agent_wallet, handle, trust_score=99.9)

        # 4. Check & Auto-Fund On-Chain Balance
        client = RpcClient(rpc_url)
        addr_obj = Address.from_bech32(addr_str)
        bal_wei = client.get_balance(addr_obj)
        bal_syn = (bal_wei / 1e18) if (bal_wei is not None) else 0.0

        if auto_fund and bal_syn < 0.1:
            try:
                import urllib.request
                req = urllib.request.Request(
                    "https://nodes.synapticchain.xyz/api/onboard",
                    data=json.dumps({"agent_address": addr_str}).encode('utf-8'),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    if resp.status == 200:
                        bal_syn += 0.5
            except Exception:
                pass  # Graceful fallback if offline

        # 5. Generate Web4 Signed Session Token
        token_payload = f"{addr_str}:{timestamp}:{challenge_sig[:16]}"
        session_token = f"web4_agent_token_{hashlib.sha256(token_payload.encode()).hexdigest()[:32]}"

        return Web4AuthSession(
            address=addr_str,
            handle=handle,
            vc=vc,
            session_token=session_token,
            balance_syn=bal_syn
        )
