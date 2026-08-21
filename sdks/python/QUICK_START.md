# SynapticChain Python SDK - Quick Start Guide

## Installation

```bash
pip install synapticchain
```

## Basic Usage

### 1. Create a Keypair

```python
from synapticchain import Keypair

# Generate a new keypair
keypair = Keypair.generate()
print(f"Address: {keypair.address()}")

# Or load from private key
private_key = bytes.fromhex("your_private_key_hex")
keypair = Keypair.from_private_key(private_key)
```

### 2. Send a Transfer Transaction

```python
from synapticchain import TransactionBuilder, Address

# Build and sign transaction
tx = (TransactionBuilder()
      .from_address(keypair.address())
      .nonce(0)
      .gas_limit(21000)
      .gas_price(1000000000)  # 1 Gwei
      .transfer(
          to=Address.from_bech32("syn1..."),
          amount=1000000000000000000  # 1 SYN
      )
      .sign(keypair))

print(f"Transaction ID: {tx.tx_id.hex()}")
```

### 3. Submit Transaction via RPC

```python
from synapticchain import RpcClient

# Connect to node
client = RpcClient("https://rpc.synaptyx.xyz")

# Submit transaction
tx_id = client.send_transaction(tx)
print(f"Submitted: {tx_id}")

# Check status
status = client.get_status()
print(f"Network TPS: {status['tps']}")
```

### 4. Check Balance

```python
# Get balance
balance = client.get_balance(keypair.address())
print(f"Balance: {balance} wei")

# Convert to SYN
from synapticchain import wei_to_syn
print(f"Balance: {wei_to_syn(balance)} SYN")
```

## Common Patterns

### Pattern 1: Simple Transfer

```python
from synapticchain import Keypair, TransactionBuilder, Address, RpcClient

def send_transfer(from_keypair, to_address, amount_syn, nonce):
    """Send a simple transfer transaction."""
    
    # Convert SYN to wei
    from synapticchain import syn_to_wei
    amount_wei = syn_to_wei(amount_syn)
    
    # Build and sign
    tx = (TransactionBuilder()
          .from_address(from_keypair.address())
          .nonce(nonce)
          .gas_limit(21000)
          .gas_price(1000000000)
          .transfer(to_address, amount_wei)
          .sign(from_keypair))
    
    # Submit
    client = RpcClient("https://rpc.synaptyx.xyz")
    return client.send_transaction(tx)

# Usage
keypair = Keypair.from_private_key(bytes.fromhex("..."))
to = Address.from_bech32("syn1...")
tx_id = send_transfer(keypair, to, 1.5, nonce=0)
```

### Pattern 2: Deploy Contract

```python
def deploy_contract(keypair, bytecode, constructor_args, nonce):
    """Deploy a smart contract."""
    
    tx = (TransactionBuilder()
          .from_address(keypair.address())
          .nonce(nonce)
          .gas_limit(500000)
          .gas_price(1000000000)
          .deploy(bytecode, constructor_args)
          .sign(keypair))
    
    client = RpcClient("https://rpc.synaptyx.xyz")
    return client.send_transaction(tx)
```

### Pattern 3: Call Contract

```python
def call_contract(keypair, contract_address, function_name, args, nonce):
    """Call a contract function."""
    
    tx = (TransactionBuilder()
          .from_address(keypair.address())
          .nonce(nonce)
          .gas_limit(100000)
          .gas_price(1000000000)
          .call(contract_address, function_name, args)
          .sign(keypair))
    
    client = RpcClient("https://rpc.synaptyx.xyz")
    return client.send_transaction(tx)
```

### Pattern 4: Batch Transactions

```python
def send_batch(keypair, recipients, amount_per_recipient, starting_nonce):
    """Send multiple transactions in a batch."""
    
    client = RpcClient("https://rpc.synaptyx.xyz")
    tx_ids = []
    
    for i, recipient in enumerate(recipients):
        tx = (TransactionBuilder()
              .from_address(keypair.address())
              .nonce(starting_nonce + i)
              .gas_limit(21000)
              .gas_price(1000000000)
              .transfer(recipient, amount_per_recipient)
              .sign(keypair))
        
        tx_id = client.send_transaction(tx)
        tx_ids.append(tx_id)
    
    return tx_ids
```

## Common Mistakes

### ❌ Wrong: Calling build() with address

```python
# This will fail!
tx = (TransactionBuilder()
      .nonce(0)
      .transfer(to, amount)
      .build(from_address))  # ← Wrong!
```

### ✅ Correct: Call from_address() before build()

```python
tx = (TransactionBuilder()
      .from_address(from_address)  # ← Correct!
      .nonce(0)
      .transfer(to, amount)
      .build())
```

### ❌ Wrong: Signing UnsignedTransaction

```python
# This will fail!
unsigned = builder.build()
unsigned.sign(keypair)  # ← No such method!
```

### ✅ Correct: Call sign() on builder

```python
tx = builder.sign(keypair)  # ← Correct!
```

### ❌ Wrong: Using static transfer() method

```python
# This will fail!
tx = TransactionBuilder.transfer(
    from_address=addr,
    to_address=to,
    amount=amount
)
```

### ✅ Correct: Use fluent builder pattern

```python
tx = (TransactionBuilder()
      .from_address(addr)
      .transfer(to, amount)
      .sign(keypair))
```

## Address Handling

### Creating Addresses

```python
from synapticchain import Address

# From Bech32m string
addr = Address.from_bech32("syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql7a7sh")

# From hex string
addr = Address.from_hex("0000000000000000000000000000000000000000")

# Zero address
addr = Address.zero()
```

### Converting Addresses

```python
# To Bech32m (42 characters)
bech32 = addr.to_bech32()  # "syn1..."

# To hex (40 characters)
hex_str = addr.to_hex()  # "0000..."

# To bytes (20 bytes)
raw_bytes = addr.to_bytes()
```

### Validating Addresses

```python
try:
    addr = Address.from_bech32("syn1...")
    print("Valid address!")
except AddressError as e:
    print(f"Invalid: {e}")
```

## Error Handling

```python
from synapticchain.errors import (
    AddressError,
    TransactionError,
    RpcError,
    CryptoError
)

try:
    # Build transaction
    tx = (TransactionBuilder()
          .from_address(keypair.address())
          .nonce(0)
          .transfer(to, amount)
          .sign(keypair))
    
    # Submit
    client = RpcClient("https://rpc.synaptyx.xyz")
    tx_id = client.send_transaction(tx)
    
except AddressError as e:
    print(f"Invalid address: {e}")
except TransactionError as e:
    print(f"Transaction error: {e}")
except RpcError as e:
    print(f"RPC error: {e}")
except CryptoError as e:
    print(f"Crypto error: {e}")
```

## Unit Conversion

```python
from synapticchain import syn_to_wei, wei_to_syn, gwei_to_wei

# SYN to units (1 SYN = 10^18 wei)
wei = syn_to_wei(1.5)  # 1500000000000000000

# Wei to SYN
syn = wei_to_syn(1500000000000000000)  # 1.5

# Gwei to units (1 Gwei = 10^9 wei)
wei = gwei_to_wei(1)  # 1000000000
```

## Testing

```python
# Use test wallets for development
from synapticchain import Keypair

# Generate test keypair
test_keypair = Keypair.generate()

# Or use a known test private key
test_key = bytes.fromhex("0" * 64)
test_keypair = Keypair.from_private_key(test_key)
```

## Next Steps

- Read the [API Reference](../../../docs/API_REFERENCE.md)
- See [Examples](examples/)
- Check [Tests](tests/) for more usage patterns
- Read the [Design Document](../../.kiro/specs/synapticchain-sdks/design.md)

## Support

- GitHub Issues: https://github.com/synapticchain/synapticchain
- Documentation: https://docs.synaptyx.xyz
- Discord: https://discord.gg/synapticchain
