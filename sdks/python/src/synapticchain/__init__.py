"""
SynapticChain Python SDK

A Python SDK for SynapticChain blockchain - wallet integration and dApp development.

This SDK provides:
- Ed25519 keypair generation, signing, and verification
- Bech32m address encoding/decoding with "syn1..." format
- Transaction building for Transfer, Deploy, and Call operations
- JSON-RPC client for node communication (sync and async)
- Full type hints for all public APIs

Example:
    >>> from synapticchain import Keypair, Address
    >>> keypair = Keypair.generate()
    >>> print(keypair.address().to_bech32())
    syn1...
"""

from synapticchain.address import Address
from synapticchain.crypto import (
    Keypair,
    derive_address,
    derive_contract_address,
    hash_sha3_256,
    verify,
)
from synapticchain.errors import (
    AddressError,
    CryptoError,
    RpcError,
    SerializationError,
    SynapticError,
    TransactionError,
)
from synapticchain.batcher import BatchedRpcClient, BatcherOptions, BatchingWallet, FutureResult
from synapticchain.rpc import AsyncRpcClient, CallResult, RpcClient
from synapticchain.types import (
    CallPayload,
    DeployPayload,
    FunctionSelector,
    Payload,
    Transaction,
    TransactionBuilder,
    TransferPayload,
    Value,
)
from synapticchain.utils import format_balance, parse_balance, syn_to_wei, wei_to_syn
from synapticchain.wallet import Wallet

__version__ = "0.1.0"

__all__ = [
    # Version
    "__version__",
    # Crypto
    "Keypair",
    "verify",
    "hash_sha3_256",
    "derive_address",
    "derive_contract_address",
    # Address
    "Address",
    # Types
    "Transaction",
    "TransactionBuilder",
    "Payload",
    "TransferPayload",
    "DeployPayload",
    "CallPayload",
    "FunctionSelector",
    "Value",
    # Batcher (amortized submission path)
    "BatchedRpcClient",
    "BatcherOptions",
    "BatchingWallet",
    "FutureResult",
    # RPC
    "RpcClient",
    "AsyncRpcClient",
    "CallResult",
    # Wallet
    "Wallet",
    # Utils
    "format_balance",
    "parse_balance",
    "wei_to_syn",
    "syn_to_wei",
    # Errors
    "SynapticError",
    "CryptoError",
    "AddressError",
    "TransactionError",
    "RpcError",
    "SerializationError",
]
