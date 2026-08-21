# @synapticchain/sdk

TypeScript/JavaScript SDK for SynapticChain - a Layer 1 blockchain featuring Ed25519 cryptography, SHA3-256 hashing, and Bech32m address encoding.

## Features

- 🔐 **Keypair Management** - Generate and manage Ed25519 keypairs
- 📍 **Address Handling** - Bech32m encoding/decoding with "syn1..." format
- 📝 **Transaction Building** - Fluent builder for Transfer, Deploy, and Call transactions
- 🔏 **Signing** - Ed25519 transaction and message signing
- 📦 **Serialization** - Borsh and JSON serialization
- 🌐 **RPC Client** - JSON-RPC 2.0 client for node communication
- 💼 **Wallet** - High-level wallet abstraction
- 📜 **Contract Helpers** - Contract interaction utilities

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
   ```typescript
   // ❌ WRONG: This is NOT Ethereum units
   .gasPrice(1000000000n)  // This is SynapticChain units, not Ethereum units!
   
   // ✅ CORRECT: SynapticChain gas units
   .gasPrice(1000000000n)  // 1 nano-SYN per gas unit
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

```typescript
const transferTx = new TransactionBuilder()
  .from(senderAddress)
  .nonce(1n)
  .gasLimit(21000n)        // Max gas willing to spend
  .gasPrice(1000000000n)   // SynapticChain units (NOT Ethereum units!)
  .transfer(recipientAddress, 1000000000000000000n)
  .sign(keypair);
```

**Note:** While the gasLimit value (21000) looks similar to Ethereum, the actual gas consumed will be much lower (~120 gas) due to the precompiled execution model.

### For More Information

- [Gas System Documentation](https://docs.synaptyx.xyz/gas-model)
- [Architecture: Static Scheduling](https://docs.synaptyx.xyz/architecture/static-scheduling)
- [Whitepaper: Precompiled Execution](https://docs.synaptyx.xyz/whitepaper#execution-model)

## Installation

```bash
npm install @synapticchain/sdk
```

## Requirements

- Node.js 18+ or modern browsers (Chrome, Firefox, Safari, Edge)
- ES2020 support

## Quick Start

```typescript
import { Keypair, Address, TransactionBuilder, RpcClient, Wallet } from '@synapticchain/sdk';

// Generate a new keypair
const keypair = Keypair.generate();
console.log('Address:', keypair.address().toBech32());

// Create a wallet connected to a node
const rpc = new RpcClient('https://rpc.synaptyx.xyz');
const wallet = new Wallet(keypair, rpc);

// Check balance
const balance = await wallet.getBalance();
console.log('Balance:', balance);

// Transfer tokens
const recipient = Address.fromBech32('syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk');
const txId = await wallet.transfer(recipient, 1000000000000000000n);
console.log('Transaction ID:', txId);
```

## Module Structure

| Module | Description |
|--------|-------------|
| `crypto` | Ed25519 keypair generation, signing, verification, SHA3-256 hashing |
| `address` | Address derivation, Bech32m encoding/decoding |
| `types` | Core types (Transaction, Payload, Value, Gas) |
| `serialization` | Borsh and JSON serialization |
| `rpc` | JSON-RPC client for node communication |
| `wallet` | High-level wallet abstraction |
| `contract` | Contract interaction helpers |
| `utils` | Unit conversion, formatting utilities |

## Usage

### Keypair Generation

```typescript
import { Keypair } from '@synapticchain/sdk';

// Generate a new random keypair
const keypair = Keypair.generate();

// Import from private key (32 bytes)
const imported = Keypair.fromPrivateKey(privateKeyBytes);

// Export keys
const publicKey = keypair.publicKey;  // Uint8Array (32 bytes)
const privateKey = keypair.privateKey; // Uint8Array (32 bytes)

// Get address from keypair
const address = keypair.address();
console.log('Address:', address.toBech32());

// Sign a message
const message = new TextEncoder().encode('Hello, SynapticChain!');
const signature = keypair.sign(message);
```

### Address Operations

```typescript
import { Address } from '@synapticchain/sdk';

// Create from Bech32m string
const address = Address.fromBech32('syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk');

// Create from hex string
const fromHex = Address.fromHex('0000000000000000000000000000000000000000');

// Create from bytes
const fromBytes = new Address(bytes);

// Encode to different formats
const bech32 = address.toBech32(); // "syn1..."
const hex = address.toHex();       // "0x..."
const bytes = address.toBytes();   // Uint8Array (20 bytes)

// Compare addresses
const isEqual = address.equals(otherAddress);
const isZero = address.isZero();

// Zero address
const zeroAddr = Address.zero();
```

### Transaction Building

```typescript
import { TransactionBuilder, Address } from '@synapticchain/sdk';

// Build a transfer transaction
const transferTx = new TransactionBuilder()
  .from(senderAddress)
  .nonce(1n)
  .gasLimit(21000n)
  .gasPrice(1000000000n)
  .transfer(recipientAddress, 1000000000000000000n) // 1 SYN
  .sign(keypair);

// Build a contract deployment transaction
const deployTx = new TransactionBuilder()
  .from(senderAddress)
  .nonce(2n)
  .gasLimit(500000n)
  .gasPrice(1000000000n)
  .deploy(contractCode, [
    { type: 'u64', value: 100n },
    { type: 'string', value: 'Initial value' }
  ])
  .sign(keypair);

// Build a contract call transaction
const callTx = new TransactionBuilder()
  .from(senderAddress)
  .nonce(3n)
  .gasLimit(100000n)
  .gasPrice(1000000000n)
  .call(contractAddress, 'transfer', [
    { type: 'address', value: recipientAddress },
    { type: 'u256', value: 1000000000000000000n }
  ])
  .sign(keypair);

// Add parent transactions for DAG structure
const txWithParents = new TransactionBuilder()
  .from(senderAddress)
  .nonce(4n)
  .gasLimit(21000n)
  .gasPrice(1000000000n)
  .parents([parentTxId1, parentTxId2])
  .transfer(recipientAddress, 500000000000000000n)
  .sign(keypair);
```

### Lane-Parallel Execution (S=0 Feature)

SynapticChain's S=0 implementation enables lane-parallel execution, allowing multiple transactions from the same account to execute in parallel using the `nonceKey` field:

```typescript
// Execute three transactions in parallel from the same account
const tx1 = new TransactionBuilder()
  .from(senderAddress)
  .nonce(5n)
  .nonceKey(0n)  // Lane 0
  .gasLimit(21000n)
  .gasPrice(1000000000n)
  .transfer(recipient1, 1000000000000000000n)
  .sign(keypair);

const tx2 = new TransactionBuilder()
  .from(senderAddress)
  .nonce(5n)  // Same nonce!
  .nonceKey(1n)  // Lane 1 - executes in parallel
  .gasLimit(21000n)
  .gasPrice(1000000000n)
  .transfer(recipient2, 1000000000000000000n)
  .sign(keypair);

const tx3 = new TransactionBuilder()
  .from(senderAddress)
  .nonce(5n)  // Same nonce!
  .nonceKey(2n)  // Lane 2 - executes in parallel
  .gasLimit(21000n)
  .gasPrice(1000000000n)
  .transfer(recipient3, 1000000000000000000n)
  .sign(keypair);

// Send all three in parallel
await Promise.all([
  rpc.sendTransaction(tx1),
  rpc.sendTransaction(tx2),
  rpc.sendTransaction(tx3)
]);
```

**Performance Benefits:**
- 6.7x speedup for same-account transactions
- 10x overall throughput improvement
- 90% latency reduction
- No sequential bottlenecks

**Use Cases:**
- High-frequency trading: Submit multiple orders simultaneously
- Batch payments: Send to multiple recipients in parallel
- DeFi operations: Execute multiple swaps/stakes concurrently
- NFT minting: Mint multiple NFTs in parallel
- Gaming: Process multiple game actions simultaneously

**Backward Compatibility:** The `nonceKey` field defaults to `0n`, so existing code works without modification.

```

### RPC Client

```typescript
import { RpcClient, Address } from '@synapticchain/sdk';

const rpc = new RpcClient('https://rpc.synaptyx.xyz', {
  timeout: 30000,  // 30 seconds
  retries: 3,
  headers: {
    'Authorization': 'Bearer your-api-key'
  }
});

// Get balance
const balance = await rpc.getBalance(address);
console.log('Balance:', balance.toString(), 'wei');

// Send transaction
const txId = await rpc.sendTransaction(signedTx);
console.log('Transaction ID:', Buffer.from(txId).toString('hex'));

// Get transaction details
const txInfo = await rpc.getTransaction(txId);
if (txInfo) {
  console.log('Transaction found:', txInfo);
} else {
  console.log('Transaction not found');
}

// Read-only contract call
const result = await rpc.call(
  contractAddress,
  'balanceOf',
  [{ type: 'address', value: userAddress }]
);
console.log('Balance:', result);

// Get contract code
const code = await rpc.getCode(contractAddress);
if (code) {
  console.log('Contract code length:', code.length);
}

// Get checkpoint info
const checkpoint = await rpc.getCheckpoint();
console.log('Current height:', checkpoint.height);

// Get node status
const status = await rpc.getStatus();
console.log('Synced:', status.synced);
console.log('Peers:', status.peerCount);
```

### Wallet Operations

```typescript
import { Wallet, RpcClient, Address } from '@synapticchain/sdk';

// Create wallet from existing keypair
const rpc = new RpcClient('https://rpc.synaptyx.xyz');
const wallet = new Wallet(keypair, rpc);

// Or generate a new wallet
const newWallet = Wallet.generate(rpc);

// Or import from private key
const importedWallet = Wallet.fromPrivateKey(privateKeyBytes, rpc);

// Get wallet info
console.log('Address:', wallet.address().toBech32());
console.log('Public key:', Buffer.from(wallet.publicKey()).toString('hex'));

// Check balance
const balance = await wallet.getBalance();
console.log('Balance:', balance.toString(), 'wei');

// Get current nonce
const nonce = await wallet.getNonce();

// Transfer tokens (automatically fetches nonce and uses default gas)
const recipient = Address.fromBech32('syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk');
const txId = await wallet.transfer(recipient, 1000000000000000000n);
console.log('Transfer sent:', Buffer.from(txId).toString('hex'));

// Transfer with custom options
const txId2 = await wallet.transfer(recipient, 500000000000000000n, {
  gasLimit: 25000n,
  gasPrice: 2000000000n,
  nonce: 5n
});

// Deploy a contract
const deployResult = await wallet.deploy(contractCode, [
  { type: 'string', value: 'Token Name' },
  { type: 'string', value: 'TKN' },
  { type: 'u256', value: 1000000000000000000000000n }
]);
console.log('Contract deployed at:', deployResult.contractAddress.toBech32());
console.log('Deploy tx:', Buffer.from(deployResult.txId).toString('hex'));

// Call a contract function
const callTxId = await wallet.call(
  contractAddress,
  'transfer',
  [
    { type: 'address', value: recipient },
    { type: 'u256', value: 100000000000000000n }
  ],
  { gasLimit: 100000n }
);

// Sign a custom transaction
const customTx = new TransactionBuilder()
  .from(wallet.address())
  .nonce(await wallet.getNonce())
  .gasLimit(50000n)
  .gasPrice(1000000000n)
  .transfer(recipient, 250000000000000000n)
  .build();
const signedTx = wallet.signTransaction(customTx);

// Sign an arbitrary message
const message = new TextEncoder().encode('Sign this message');
const signature = wallet.signMessage(message);
```

### Contract Interaction

```typescript
import { ContractHelper, RpcClient, Address } from '@synapticchain/sdk';

const rpc = new RpcClient('https://rpc.synaptyx.xyz');
const contract = new ContractHelper(contractAddress, rpc);

// Predict contract address before deployment
const deployerAddress = Address.fromBech32('syn1...');
const nonce = 5n;
const predictedAddress = ContractHelper.predictAddress(deployerAddress, nonce);
console.log('Contract will be deployed at:', predictedAddress.toBech32());

// Read-only contract call (doesn't require gas or signing)
const balance = await contract.read('balanceOf', [
  { type: 'address', value: userAddress }
]);
console.log('Token balance:', balance);

// Build a contract call transaction (needs to be signed and sent separately)
const callTx = contract.buildCall('transfer', [
  { type: 'address', value: recipientAddress },
  { type: 'u256', value: 1000000000000000000n }
]);
// Sign with wallet and send...

// Encode function call data
const callData = contract.encodeCall('approve', [
  { type: 'address', value: spenderAddress },
  { type: 'u256', value: 5000000000000000000n }
]);

// Decode return value
const returnData = new Uint8Array([...]); // from RPC response
const decoded = contract.decodeReturn(returnData);
```

### Balance Utilities

```typescript
import { formatBalance, parseBalance, weiToSyn, synToWei } from '@synapticchain/sdk/utils';

// Format balance for display (18 decimals by default)
const balance = 1234567890123456789n;
const formatted = formatBalance(balance); // "1.234567890123456789"
const formattedSyn = formatBalance(balance, 18); // "1.234567890123456789 SYN"

// Parse balance from string
const parsed = parseBalance("1.5"); // 1500000000000000000n
const parsedWei = parseBalance("0.000000000000000001"); // 1n

// Convert between units
const syn = weiToSyn(1000000000000000000n); // "1.0"
const wei = synToWei("2.5"); // 2500000000000000000n

// Handle large numbers (U256)
const maxU256 = (2n ** 256n) - 1n;
const formatted = formatBalance(maxU256);
```

### Serialization

```typescript
import { borshSerialize, borshDeserialize, jsonSerialize, jsonDeserialize } from '@synapticchain/sdk/serialization';

// Serialize transaction to Borsh (for network transmission)
const borshBytes = borshSerialize(transaction);

// Deserialize from Borsh
const tx = borshDeserialize(borshBytes);

// Serialize to JSON (for human-readable output)
const jsonStr = jsonSerialize(transaction);
console.log(JSON.parse(jsonStr));

// Deserialize from JSON
const txFromJson = jsonDeserialize(jsonStr);

// Compute transaction ID
import { computeTxId } from '@synapticchain/sdk/serialization';
const txId = computeTxId(transaction);
console.log('Transaction ID:', Buffer.from(txId).toString('hex'));
```

### Error Handling

```typescript
import {
  SynapticError,
  CryptoError,
  AddressError,
  TransactionError,
  RpcError,
  SerializationError
} from '@synapticchain/sdk/errors';

try {
  const address = Address.fromBech32('invalid-address');
} catch (error) {
  if (error instanceof AddressError) {
    console.error('Address error:', error.code, error.message);
    // error.code might be: INVALID_BECH32, INVALID_PREFIX, INVALID_CHECKSUM
  }
}

try {
  const balance = await rpc.getBalance(address);
} catch (error) {
  if (error instanceof RpcError) {
    console.error('RPC error:', error.code, error.message);
    console.error('RPC code:', error.rpcCode);
    // error.code might be: CONNECTION_FAILED, TIMEOUT, INVALID_RESPONSE
  }
}

try {
  const tx = new TransactionBuilder()
    .from(address)
    .build(); // Missing required fields
} catch (error) {
  if (error instanceof TransactionError) {
    console.error('Transaction error:', error.code, error.message);
    // error.code might be: MISSING_FIELD, INVALID_PAYLOAD
  }
}
```

## Browser Support

The SDK works in modern browsers using native Web Crypto APIs when available:

- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

### Browser Usage Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>SynapticChain SDK Demo</title>
</head>
<body>
  <script type="module">
    import { Keypair, Address, RpcClient, Wallet } from 'https://unpkg.com/@synapticchain/sdk/dist/esm/index.js';
    
    // Generate a new wallet
    const keypair = Keypair.generate();
    const rpc = new RpcClient('https://rpc.synaptyx.xyz');
    const wallet = new Wallet(keypair, rpc);
    
    console.log('Address:', wallet.address().toBech32());
    
    // Check balance
    const balance = await wallet.getBalance();
    console.log('Balance:', balance.toString());
  </script>
</body>
</html>
```

## CommonJS Support

For CommonJS environments (Node.js with `require`):

```javascript
const { Keypair, Address, RpcClient, Wallet } = require('@synapticchain/sdk');

const keypair = Keypair.generate();
console.log('Address:', keypair.address().toBech32());
```

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```typescript
import type { Transaction, Payload, Value, TxId } from '@synapticchain/sdk/types';
import type { RpcOptions, Checkpoint, NodeStatus } from '@synapticchain/sdk/rpc';

// All types are fully typed
const tx: Transaction = {
  nonce: 1n,
  from: address,
  signature: new Uint8Array(64),
  payload: {
    type: 'transfer',
    to: recipientAddress,
    amount: 1000000000000000000n
  },
  gasLimit: 21000n,
  gasPrice: 1000000000n,
  parents: [],
  timestamp: BigInt(Date.now())
};
```

## Advanced Topics

### Custom Gas Estimation

```typescript
// Estimate gas for different transaction types
const transferGas = 21000n;
const deployGas = 500000n;
const callGas = 100000n;

// Use custom gas limits
const tx = await wallet.transfer(recipient, amount, {
  gasLimit: transferGas,
  gasPrice: 2000000000n // 2 Gwei
});
```

### Transaction DAG Structure

SynapticChain uses a DAG (Directed Acyclic Graph) structure for transactions:

```typescript
// Create a transaction that depends on previous transactions
const tx1 = await wallet.transfer(recipient1, amount1);
const tx2 = await wallet.transfer(recipient2, amount2);

// Create a transaction that references both as parents
const builder = new TransactionBuilder()
  .from(wallet.address())
  .nonce(await wallet.getNonce())
  .gasLimit(21000n)
  .gasPrice(1000000000n)
  .parents([tx1, tx2]) // This transaction depends on tx1 and tx2
  .transfer(recipient3, amount3);

const tx3 = wallet.signTransaction(builder.build());
await rpc.sendTransaction(tx3);
```

### Contract Address Prediction

```typescript
import { ContractHelper } from '@synapticchain/sdk/contract';

// Predict where a contract will be deployed
const deployerAddress = wallet.address();
const nonce = await wallet.getNonce();
const contractAddress = ContractHelper.predictAddress(deployerAddress, nonce);

console.log('Contract will be deployed at:', contractAddress.toBech32());

// Deploy the contract
const result = await wallet.deploy(contractCode, constructorArgs);
console.log('Deployed at:', result.contractAddress.toBech32());
console.log('Matches prediction:', result.contractAddress.equals(contractAddress));
```

### Value Types

The SDK supports all SynapticChain value types for contract interaction:

```typescript
import type { Value } from '@synapticchain/sdk/types';

// Primitive types
const boolValue: Value = { type: 'bool', value: true };
const u64Value: Value = { type: 'u64', value: 100n };
const u256Value: Value = { type: 'u256', value: 1000000000000000000n };
const i128Value: Value = { type: 'i128', value: -50n };

// Complex types
const addressValue: Value = { type: 'address', value: address };
const bytesValue: Value = { type: 'bytes', value: new Uint8Array([1, 2, 3]) };
const stringValue: Value = { type: 'string', value: 'Hello' };

// Array type
const arrayValue: Value = {
  type: 'array',
  value: [
    { type: 'u64', value: 1n },
    { type: 'u64', value: 2n },
    { type: 'u64', value: 3n }
  ]
};

// Option type
const someValue: Value = { type: 'option', value: { type: 'u64', value: 42n } };
const noneValue: Value = { type: 'option', value: null };

// Unit type
const unitValue: Value = { type: 'unit' };
```

### Message Signing and Verification

```typescript
import { verify } from '@synapticchain/sdk/crypto';

// Sign a message
const message = new TextEncoder().encode('Sign this message');
const signature = keypair.sign(message);

// Verify signature
const isValid = verify(message, signature, keypair.publicKey);
console.log('Signature valid:', isValid);

// Verify with different public key (should fail)
const otherKeypair = Keypair.generate();
const isInvalid = verify(message, signature, otherKeypair.publicKey);
console.log('Invalid signature:', !isInvalid);
```

## API Reference

### Modules

- **crypto** - Ed25519 keypair generation, signing, verification, SHA3-256 hashing
- **address** - Address derivation, Bech32m encoding/decoding
- **types** - Core types (Transaction, Payload, Value, Gas)
- **serialization** - Borsh and JSON serialization
- **rpc** - JSON-RPC client for node communication
- **wallet** - High-level wallet abstraction
- **contract** - Contract interaction helpers
- **utils** - Unit conversion, formatting utilities
- **errors** - Typed error classes

### Key Classes

- `Keypair` - Ed25519 keypair management
- `Address` - 20-byte address with Bech32m encoding
- `TransactionBuilder` - Fluent builder for transactions
- `RpcClient` - JSON-RPC 2.0 client
- `Wallet` - High-level wallet operations
- `ContractHelper` - Contract interaction utilities
- `FunctionSelector` - 4-byte function identifier

### Constants

```typescript
// Address constants
Address.PREFIX // "syn"
Address.zero() // Zero address (20 zero bytes)

// Token decimals
const SYNAPSE_DECIMALS = 18;

// Gas constants
const MIN_GAS_PRICE = 1000000000n; // 1 Gwei
const TRANSFER_GAS = 21000n;
const MIN_DEPLOY_GAS = 100000n;
const MIN_CALL_GAS = 21000n;
```

## Testing

The SDK includes comprehensive unit tests and property-based tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Building from Source

```bash
# Clone the repository
git clone https://github.com/synapticchain/synapticchain-sdk
cd synapticchain-sdk/sdks/typescript

# Install dependencies
npm install

# Build all outputs (ESM, CommonJS, TypeScript declarations)
npm run build

# Clean build artifacts
npm run clean
```

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass (`npm test`)
2. Code is properly typed (`npm run typecheck`)
3. Code follows style guidelines (`npm run lint`)
4. New features include tests and documentation

## Security

This SDK handles private keys and signs transactions. Always:

- Keep private keys secure and never expose them
- Use secure random number generation (provided by the SDK)
- Verify addresses before sending transactions
- Test thoroughly on testnet before mainnet
- Review transaction details before signing

## Support

- Documentation: https://docs.synaptyx.xyz
- GitHub Issues: https://github.com/synapticchain/synapticchain-sdk/issues
- Discord: https://discord.gg/synapticchain

## Changelog

### 0.1.0 (Initial Release)

- ✅ Ed25519 keypair generation and management
- ✅ Bech32m address encoding/decoding
- ✅ Transaction building and signing
- ✅ Borsh and JSON serialization
- ✅ JSON-RPC client
- ✅ Wallet abstraction
- ✅ Contract interaction helpers
- ✅ Balance utilities
- ✅ Comprehensive error handling
- ✅ Full TypeScript support
- ✅ Browser and Node.js compatibility
- ✅ ESM and CommonJS support

## License

MIT
