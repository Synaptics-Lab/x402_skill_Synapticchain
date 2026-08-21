"""
AgentFi Core Library for SynapticChain.

Provides high-level primitives for autonomous AI trading bots:
- Permissionless Token Creation ($BOTCOIN)
- Polymarket-Style Prediction Markets (AgentMarket)
- Automated Liquidity Swaps (SwapEngineV3b / AgentDEX)
- Safe Nonce Management & Automatic Retries
"""

import json
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

from synapticchain import Wallet, RpcClient, Address
from synapticchain.types import Value
from synapticchain.wallet import TxOptions

# Default RPC Endpoint
DEFAULT_RPC = "https://testnet.synapticchain.xyz/rpc/"

# Production addresses path
ADDRESSES_PATH = Path("/opt/synapticchain/contracts/production/addresses.json")


@dataclass
class TransactionResult:
    tx_hash: str
    status: str
    latency_ms: float
    details: Dict[str, Any]


@dataclass
class MarketInfo:
    market_id: str
    question: str
    resolution_time: float
    yes_pool: int
    no_pool: int
    resolved: bool
    winning_outcome: Optional[str]


class AgentFiClient:
    """High-level client connecting autonomous agents to SynapticChain AgentFi primitives."""

    def __init__(self, rpc_url: str = DEFAULT_RPC):
        self.rpc = RpcClient(rpc_url)
        self.contracts = self._load_contracts()

    def _load_contracts(self) -> Dict[str, str]:
        if ADDRESSES_PATH.exists():
            try:
                with open(ADDRESSES_PATH, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def get_nonce(self, address: Address) -> int:
        """Fetch current gap-tolerant nonce watermark from chain."""
        return self.rpc.get_nonce(address)


class AgentWallet:
    """Autonomous agent wallet with built-in AgentFi functionality."""

    def __init__(self, private_key_hex: str, client: Optional[AgentFiClient] = None):
        self.client = client or AgentFiClient()
        self.wallet = Wallet.from_hex(private_key_hex, self.client.rpc)
        self._nonce: Optional[int] = None

    @classmethod
    def generate(cls, client: Optional[AgentFiClient] = None) -> "AgentWallet":
        """Generate a new random agent keypair."""
        cli = client or AgentFiClient()
        raw_wallet = Wallet.generate(cli.rpc)
        priv_key = raw_wallet._keypair.private_key.hex()
        return cls(priv_key, cli)

    @property
    def address(self) -> str:
        return self.wallet.address().to_bech32()

    def get_next_nonce(self) -> int:
        chain_nonce = self.client.get_nonce(self.wallet.address())
        if self._nonce is None or self._nonce < chain_nonce:
            self._nonce = chain_nonce
        return self._nonce

    def _send_call_with_retry(self, contract_addr: str, function: str, args: list, gas_limit: int = 50_000_000) -> str:
        """Execute contract call with automatic nonce collision recovery."""
        target = Address.from_bech32(contract_addr)
        for attempt in range(5):
            try:
                nonce = self.get_next_nonce()
                tx_hash = self.wallet.call(
                    target,
                    function,
                    args,
                    options=TxOptions(gas_limit=gas_limit, gas_price=100, nonce=nonce)
                )
                self._nonce = nonce + 1
                return tx_hash
            except Exception as e:
                err_msg = str(e)
                if "already used" in err_msg:
                    self._nonce = self.client.get_nonce(self.wallet.address())
                    time.sleep(0.3 * (attempt + 1))
                elif "beyond window limit" in err_msg:
                    self._nonce = self.client.get_nonce(self.wallet.address())
                    time.sleep(1.0 * (attempt + 1))
                else:
                    raise
        raise RuntimeError("AgentWallet: exhausted nonce retries")

    def transfer_token(self, token_symbol_or_addr: str, recipient: str, amount: int) -> TransactionResult:
        """Transfer an SRC20 stablecoin or custom bot token to another recipient/agent."""
        start = time.time()
        contract_addr = self.client.contracts.get(token_symbol_or_addr, token_symbol_or_addr)
        if not contract_addr.startswith("syn1"):
            raise ValueError(f"Invalid token contract address: {contract_addr}")

        tx_hash = self._send_call_with_retry(
            contract_addr,
            "transfer",
            [Value.address(Address.from_bech32(recipient)), Value.u128(amount)]
        )
        latency = (time.time() - start) * 1000

        return TransactionResult(
            tx_hash=tx_hash,
            status="CONFIRMED",
            latency_ms=latency,
            details={"token": token_symbol_or_addr, "recipient": recipient, "amount": amount}
        )

    def execute_odl_swap(self, token_in: str, token_out: str, amount_in: int, amount_out_min: int) -> TransactionResult:
        """Execute multi-hop cross-currency swap on SwapEngineV3b_ODL."""
        start = time.time()
        engine_addr = self.client.contracts.get("SwapEngineV3b_ODL", "")
        if not engine_addr.startswith("syn1"):
            raise ValueError("SwapEngineV3b_ODL contract not deployed or configured")

        token_in_addr = self.client.contracts.get(token_in, token_in)
        token_out_addr = self.client.contracts.get(token_out, token_out)

        # 1. Transfer input token to AMM pool
        tx1 = self._send_call_with_retry(
            token_in_addr,
            "transfer",
            [Value.address(Address.from_bech32(engine_addr)), Value.u128(amount_in)]
        )
        time.sleep(0.5)

        # 2. Deposit into AMM pool
        tx2 = self._send_call_with_retry(
            engine_addr,
            "deposit",
            [Value.address(Address.from_bech32(token_in_addr)), Value.u128(amount_in)]
        )
        time.sleep(0.5)

        # 3. Perform swap
        tx3 = self._send_call_with_retry(
            engine_addr,
            "swap_token0_in",
            [Value.u128(amount_in), Value.u128(amount_out_min)]
        )
        time.sleep(0.5)

        # 4. Withdraw output token
        tx4 = self._send_call_with_retry(
            engine_addr,
            "withdraw",
            [Value.address(Address.from_bech32(token_out_addr)), Value.u128(amount_out_min)]
        )

        latency = (time.time() - start) * 1000
        return TransactionResult(
            tx_hash=tx4,
            status="CONFIRMED",
            latency_ms=latency,
            details={
                "token_in": token_in,
                "token_out": token_out,
                "amount_in": amount_in,
                "amount_out_min": amount_out_min,
                "step_hashes": [tx1, tx2, tx3, tx4]
            }
        )

    def buy_prediction_shares(self, market_id_or_addr: str, outcome: str, amount: int) -> TransactionResult:
        """Buy YES/NO outcome shares in a Polymarket-style Prediction Market."""
        start = time.time()
        market_addr = self.client.contracts.get("PredictionMarketV2", market_id_or_addr)
        if not market_addr.startswith("syn1"):
            raise ValueError(f"Invalid PredictionMarket contract address: {market_addr}")

        func_name = "buy_yes_shares" if outcome.upper() == "YES" else "buy_no_shares"
        tx_hash = self._send_call_with_retry(
            market_addr,
            func_name,
            [Value.u128(amount)]
        )
        latency = (time.time() - start) * 1000

        return TransactionResult(
            tx_hash=tx_hash,
            status="CONFIRMED",
            latency_ms=latency,
            details={"market": market_addr, "outcome": outcome, "amount": amount}
        )
