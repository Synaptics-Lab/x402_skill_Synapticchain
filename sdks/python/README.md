# SynapticChain Python SDK

[![PyPI version](https://badge.fury.io/py/synapticchain.svg)](https://badge.fury.io/py/synapticchain)
[![Python versions](https://img.shields.io/pypi/pyversions/synapticchain.svg)](https://pypi.org/project/synapticchain/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Python SDK for SynapticChain blockchain - wallet integration and dApp development.

## Features

- **🔐 Ed25519 Cryptography**: Secure keypair generation, signing, and verification
- **📍 Bech32m Addresses**: Address derivation and encoding with "syn1..." format
- **📝 Transaction Building**: Fluent builder for Transfer, Deploy, and Call transactions
- **🌐 RPC Client**: JSON-RPC client for node communication (sync and async)
- **🔍 Type Hints**: Full type annotations for all public APIs (PEP 484)
- **⚡ Async Support**: Both synchronous and asynchronous interfaces
- **🛠️ CLI-Friendly**: Output formatting suitable for command-line tools
- **✅ Property-Based Testing**: Comprehensive test coverage with Hypothesis

## ⚠️ Important: SynapticChain Gas Model

**SynapticChain uses a fundamentally different gas model than Ethereum. Please read this section carefully.**

### Key Differences from Ethereum

| Aspect | Ethereum/EVM | SynapticChain |
|--------|--------------|---------------|
| **Compilation** | Runtime (bytecode interpretation) | Compile-time (precompiled execution plans) |
| **Gas Metering** | Per opcode at runtime | Pre-computed at compile-time |
| **Gas Units** | Gunits (Ethereum) | **SynapticChain units (NOT Ethereum units)** |
| **Execution** | Interpret bytecode | Stream precompiled execution plan |
| **Overhead** | 40-60% runtime overhead | Zero runtime overhead |

### What This Means for You

1. **Gas Units Are NOT Gwei**
   ```python
   # ❌ WRONG: This is NOT Ethereum units
   .gas_price(1000000000)  # This is SynapticChain units, not Ethereum units!
   
   # ✅ CORRECT: SynapticChain gas units
   .gas_price(1000000000)  # 1 nano-SYN per gas unit
   ```

2. **Gas Costs Are 99%+ Cheaper**
   - State read: 20 gas (vs 2,100 in EVM)
   - State write: 50 gas (vs 20,000 in EVM)
   - Simple transfer: 120 gas (vs 21,000 in EVM)

3. **Gas Is Predictable**
   - Exact gas cost known before execution
   - No cold/warm storage distinction
   - No runtime surprises

### Why Is It Different?

SynapticChain uses **precompiled execution plans** inspired by Groq's TSP architecture:

```
Ethereum/EVM:
  Deploy → Bytecode
  Execute → Runtime interpretation + gas metering (slow)

SynapticChain:
  Deploy → Static analysis → Execution plan with pre-computed gas
  Execute → Stream execution plan (5-100x faster)
```

### Example: Transfer Transaction

```python
tx = (
    TransactionBuilder()
    .from_address(keypair.address())
    .nonce(0)
    .gas_limit(21000)        # Max gas willing to spend
    .gas_price(1000000000)   # SynapticChain units (NOT Ethereum units!)
    .transfer(
        to=Address.from_bech32("syn1..."),
        amount=1000000000000000000  # 1 SYN
    )
    .sign(keypair)
)
```

**Note:** While the gas_limit value (21000) looks similar to Ethereum, the actual gas consumed will be much lower (~120 gas) due to the precompiled execution model.

### For More Information

- [Gas System Documentation](https://docs.synaptyx.xyz/gas-model)
- [Architecture: Static Scheduling](https://docs.synaptyx.xyz/architecture/static-scheduling)
- [Whitepaper: Precompiled Execution](https://docs.synaptyx.xyz/whitepaper#execution-model)

## Requirements

- Python 3.9+
- Dependencies: `pynacl>=1.5.0`, `httpx>=0.25.0`

## Installation

Install from PyPI:

```bash
pip install synapticchain
```

For development with testing tools:

```bash
pip install synapticchain[dev]
```

## Quick Start

### Generate a Keypair

```python
from synapticchain import Keypair

# Generate a new keypair
keypair = Keypair.generate()
print(f"Address: {keypair.address().to_bech32()}")
print(f"Public Key: {keypair.public_key.hex()}")
print(f"Private Key: {keypair.private_key.hex()}")

# Import from existing private key
private_key_hex = "a1b2c3d4..."
keypair = Keypair.from_private_key(bytes.fromhex(private_key_hex))
```

### Working with Addresses

```python
from synapticchain import Address

# Create from Bech32m string
address = Address.from_bech32("syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk")

# Create from hex string
address = Address.from_hex("0000000000000000000000000000000000000000")

# Convert between formats
bech32_str = address.to_bech32()  # "syn1..."
hex_str = address.to_hex()        # "0x..."
raw_bytes = address.to_bytes()    # bytes

# Check for zero address
if address.is_zero():
    print("This is the zero address")
```

### Create and Sign a Transaction

```python
from synapticchain import Keypair, TransactionBuilder, Address

# Create keypair
keypair = Keypair.generate()

# Build a transfer transaction
tx = (
    TransactionBuilder()
    .from_address(keypair.address())
    .nonce(0)
    .gas_limit(21000)
    .gas_price(1000000000)  # 1 Gwei
    .transfer(
        to=Address.from_bech32("syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk"),
        amount=1000000000000000000  # 1 SYN (18 decimals)
    )
    .sign(keypair)
)

print(f"Transaction ID: {tx.tx_id.hex()}")
print(f"Signature: {tx.signature.hex()}")
```

### Deploy a Smart Contract

```python
from synapticchain import TransactionBuilder, Value

# Contract bytecode
contract_code = bytes.fromhex("608060405234801561001057600080fd5b50...")

# Constructor arguments
constructor_args = [
    Value.u256(1000000),
    Value.address(Address.from_bech32("syn1...")),
    Value.string("MyToken")
]

# Build deploy transaction
tx = (
    TransactionBuilder()
    .from_address(keypair.address())
    .nonce(1)
    .gas_limit(500000)
    .gas_price(1000000000)
    .deploy(code=contract_code, constructor_args=constructor_args)
    .sign(keypair)
)

# Predict contract address
from synapticchain.crypto import derive_contract_address
contract_address = derive_contract_address(keypair.address(), nonce=1)
print(f"Contract will be deployed at: {contract_address.to_bech32()}")
```

### Call a Smart Contract

```python
from synapticchain import TransactionBuilder, Value

contract_address = Address.from_bech32("syn1...")

# Build contract call transaction
tx = (
    TransactionBuilder()
    .from_address(keypair.address())
    .nonce(2)
    .gas_limit(100000)
    .gas_price(1000000000)
    .call(
        contract=contract_address,
        function_name="transfer",
        args=[
            Value.address(recipient_address),
            Value.u256(1000000000000000000)
        ]
    )
    .sign(keypair)
)
```

### Query Balance via RPC (Synchronous)

```python
from synapticchain import RpcClient, Address

# Connect to a node
client = RpcClient("https://rpc.synaptyx.xyz")

# Query balance
address = Address.from_bech32("syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk")
balance = client.get_balance(address)
print(f"Balance: {balance} wei")

# Format balance for display
from synapticchain.utils import format_balance
print(f"Balance: {format_balance(balance)} SYN")

# Send transaction
tx_id = client.send_transaction(tx)
print(f"Transaction sent: {tx_id.hex()}")

# Get transaction details
tx_info = client.get_transaction(tx_id)
if tx_info:
    print(f"Transaction status: {tx_info['status']}")
```

### Async RPC Client

```python
import asyncio
from synapticchain import AsyncRpcClient, Address

async def main():
    # Create async client
    client = AsyncRpcClient("https://rpc.synaptyx.xyz")
    
    # Query balance
    address = Address.from_bech32("syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk")
    balance = await client.get_balance(address)
    print(f"Balance: {balance} wei")
    
    # Send transaction
    tx_id = await client.send_transaction(tx)
    print(f"Transaction sent: {tx_id.hex()}")
    
    # Get node status
    status = await client.get_status()
    print(f"Node synced: {status['synced']}")
    print(f"Checkpoint height: {status['checkpoint_height']}")

asyncio.run(main())
```

### High-Level Wallet API

```python
from synapticchain import Wallet, RpcClient, Address

# Create wallet
client = RpcClient("https://rpc.synaptyx.xyz")
wallet = Wallet.generate(client)

# Or import existing wallet
wallet = Wallet.from_private_key(private_key_bytes, client)

# Get wallet info
print(f"Address: {wallet.address().to_bech32()}")
balance = await wallet.get_balance()
print(f"Balance: {balance} wei")

# Transfer tokens
tx_id = await wallet.transfer(
    to=Address.from_bech32("syn1..."),
    amount=1000000000000000000,  # 1 SYN
    gas_limit=21000,
    gas_price=1000000000
)
print(f"Transfer sent: {tx_id.hex()}")

# Deploy contract
result = await wallet.deploy(
    code=contract_code,
    constructor_args=[Value.u256(1000)],
    gas_limit=500000
)
print(f"Contract deployed at: {result['contract_address'].to_bech32()}")

# Call contract
tx_id = await wallet.call(
    contract=contract_address,
    function_name="transfer",
    args=[Value.address(recipient), Value.u256(amount)],
    gas_limit=100000
)
```

### Contract Interaction Helper

```python
from synapticchain import ContractHelper, RpcClient, Value

client = RpcClient("https://rpc.synaptyx.xyz")
contract = ContractHelper(contract_address, client)

# Read-only call (no transaction)
result = await contract.read("balanceOf", [Value.address(owner_address)])
balance = result.as_u256()
print(f"Token balance: {balance}")

# Build transaction for write operation
tx = contract.build_call("transfer", [
    Value.address(recipient),
    Value.u256(1000)
])
signed_tx = tx.sign(keypair)
tx_id = client.send_transaction(signed_tx)
```

### Balance Formatting Utilities

```python
from synapticchain.utils import format_balance, parse_balance, wei_to_syn, syn_to_wei

# Format wei to SYN with decimals
balance_wei = 1234567890123456789
balance_syn = format_balance(balance_wei)  # "1.234567890123456789"
balance_syn_short = format_balance(balance_wei, decimals=4)  # "1.2346"

# Parse SYN string to wei
amount_wei = parse_balance("1.5")  # 1500000000000000000

# Unit conversion
syn_amount = wei_to_syn(1000000000000000000)  # 1.0
wei_amount = syn_to_wei(1.5)  # 1500000000000000000
```

### Error Handling

```python
from synapticchain import (
    Address,
    AddressError,
    CryptoError,
    TransactionError,
    RpcError,
    SerializationError
)

try:
    # Invalid Bech32m address
    address = Address.from_bech32("invalid_address")
except AddressError as e:
    print(f"Address error [{e.code}]: {e.message}")
    # e.code might be: INVALID_BECH32, INVALID_PREFIX, INVALID_CHECKSUM

try:
    # RPC call failure
    balance = client.get_balance(address)
except RpcError as e:
    print(f"RPC error [{e.code}]: {e.message}")
    print(f"RPC code: {e.rpc_code}")
    # e.code might be: CONNECTION_FAILED, TIMEOUT, INVALID_RESPONSE

try:
    # Invalid transaction
    tx = TransactionBuilder().build()
except TransactionError as e:
    print(f"Transaction error [{e.code}]: {e.message}")
    # e.code might be: MISSING_FIELD, INVALID_PAYLOAD
```

## API Reference

### Modules

- **`synapticchain.crypto`** - Ed25519 keypair generation, signing, verification, SHA3-256 hashing
  - `Keypair` - Ed25519 keypair management
  - `sign()`, `verify()` - Signature operations
  - `hash_sha3_256()` - SHA3-256 hashing
  - `derive_address()`, `derive_contract_address()` - Address derivation

- **`synapticchain.address`** - Address derivation and Bech32m encoding/decoding
  - `Address` - 20-byte address with Bech32m encoding

- **`synapticchain.types`** - Core types (Transaction, Payload, Value, Gas)
  - `Transaction` - Signed transaction
  - `Payload` - Transfer, Deploy, or Call payload
  - `Value` - Contract value types (Bool, U8-U256, I8-I128, Address, Bytes, String, Array, Option)
  - `FunctionSelector` - 4-byte function identifier

- **`synapticchain.serialization`** - Borsh and JSON serialization
  - `borsh_serialize()`, `borsh_deserialize()` - Borsh format
  - `json_serialize()`, `json_deserialize()` - JSON format

- **`synapticchain.rpc`** - JSON-RPC client for node communication
  - `RpcClient` - Synchronous RPC client
  - `AsyncRpcClient` - Asynchronous RPC client

- **`synapticchain.wallet`** - High-level wallet abstraction
  - `Wallet` - Wallet with keypair and RPC client

- **`synapticchain.contract`** - Contract interaction helpers
  - `ContractHelper` - Contract call builder and encoder

- **`synapticchain.utils`** - Unit conversion and formatting utilities
  - `format_balance()`, `parse_balance()` - Balance formatting
  - `wei_to_syn()`, `syn_to_wei()` - Unit conversion

- **`synapticchain.errors`** - Typed error classes
  - `SynapticError` - Base error class
  - `CryptoError`, `AddressError`, `TransactionError`, `RpcError`, `SerializationError`

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/synapticchain/synapticchain.git
cd synapticchain/sdks/python

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install development dependencies
pip install -e ".[dev]"
```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=synapticchain --cov-report=html

# Run property-based tests only
pytest -k "property"

# Run specific test file
pytest tests/test_crypto.py

# Run with verbose output
pytest -v
```

### Type Checking

```bash
# Check types with mypy
mypy src/synapticchain

# Check specific module
mypy src/synapticchain/crypto
```

### Linting and Formatting

```bash
# Check code style
ruff check src/synapticchain

# Format code
ruff format src/synapticchain

# Check and fix
ruff check --fix src/synapticchain
```

### Building the Package

```bash
# Install build tools
pip install build twine

# Build distribution packages
python -m build

# Check the built package
twine check dist/*

# Test installation locally
pip install dist/synapticchain-0.1.0-py3-none-any.whl
```

## Architecture

The SDK follows a layered architecture:

```
Application Layer
├── Wallet (high-level wallet abstraction)
├── ContractHelper (contract interaction)
└── TransactionBuilder (transaction construction)

Core Layer
├── Crypto (Ed25519, SHA3-256)
├── Address (Bech32m encoding)
├── Types (Transaction, Payload, Value)
└── Serialization (Borsh, JSON)

Network Layer
└── RPC Client (JSON-RPC communication)
```

## SynapticChain Overview

SynapticChain is a Layer 1 blockchain featuring:

- **Ed25519 Cryptography**: Fast and secure digital signatures
- **SHA3-256 Hashing**: Keccak-based hashing algorithm
- **Bech32m Addresses**: Human-readable addresses with checksums (syn1...)
- **Native Token**: SYNAPSE (SYN) with 18 decimals
- **Transaction Types**: Transfer, Deploy (smart contracts), Call (contract functions)
- **JSON-RPC API**: Standard interface for node communication
- **Borsh Serialization**: Efficient binary serialization format

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](https://github.com/synapticchain/synapticchain/blob/main/CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- **Homepage**: https://synaptyx.xyz
- **Documentation**: https://docs.synaptyx.xyz/sdk/python
- **GitHub**: https://github.com/synapticchain/synapticchain
- **PyPI**: https://pypi.org/project/synapticchain/
- **Issues**: https://github.com/synapticchain/synapticchain/issues
- **Discord**: https://discord.gg/synapticchain

## Support

For questions and support:
- 📖 Read the [documentation](https://docs.synaptyx.xyz)
- 💬 Join our [Discord community](https://discord.gg/synapticchain)
- 🐛 Report bugs via [GitHub Issues](https://github.com/synapticchain/synapticchain/issues)
- 📧 Email: dev@synaptyx.xyz
