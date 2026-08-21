# SynapticChain Public JSON-RPC 2.0 API Reference

> **Standard JSON-RPC 2.0 interface exposed at `https://nodes.synapticchain.xyz/rpc`.**

---

## 1. Core Node RPC Methods

### `syn_blockNumber`
Returns the current highest finalized DAG checkpoint height.

#### Request:
```json
{
  "jsonrpc": "2.0",
  "method": "syn_blockNumber",
  "params": [],
  "id": 1
}
```

#### Response:
```json
{
  "jsonrpc": "2.0",
  "result": 149820,
  "id": 1
}
```

---

### `syn_getBalance`
Returns the native SYN balance for a given Bech32m address in bunits ($1\text{ SYN} = 100,000,000\text{ bunits}$).

#### Request:
```json
{
  "jsonrpc": "2.0",
  "method": "syn_getBalance",
  "params": ["syn1ce690l9k2dzes4atmmm2acl6z28kuh2seu33hf"],
  "id": 2
}
```

#### Response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "balance": 50000000,
    "formatted": "0.50000000 SYN"
  },
  "id": 2
}
```

---

### `syn_getNonce`
Returns the current expected nonce for a given account and parallel execution lane.

#### Parameters:
1. `address` (string): Bech32m account address (`syn1...`)
2. `lane` (number, optional, default: 0): Parallel execution lane (`0` - `255`)

#### Request:
```json
{
  "jsonrpc": "2.0",
  "method": "syn_getNonce",
  "params": ["syn1ce690l9k2dzes4atmmm2acl6z28kuh2seu33hf", 0],
  "id": 3
}
```

#### Response:
```json
{
  "jsonrpc": "2.0",
  "result": 4,
  "id": 3
}
```

---

### `syn_sendRawTransaction`
Submits a Borsh-serialized, Ed25519-signed transaction payload to the DAG mempool.

#### Parameters:
1. `signedTxHex` (string): Hex-encoded Borsh binary transaction payload

#### Request:
```json
{
  "jsonrpc": "2.0",
  "method": "syn_sendRawTransaction",
  "params": ["0x0201..."],
  "id": 4
}
```

#### Response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "txHash": "4d9435fb56fd7b7659ae43ef0775a29aadda98004917c587460c95614cee5c75",
    "status": "ACCEPTED",
    "lane": 0
  },
  "id": 4
}
```

---

### `syn_sendTransactionBatch`
Dispatches an atomic batch of up to 256 transactions across parallel lanes in a single HTTP request.

#### Request:
```json
{
  "jsonrpc": "2.0",
  "method": "syn_sendTransactionBatch",
  "params": [
    ["0x0201...", "0x0202...", "0x0203..."]
  ],
  "id": 5
}
```

#### Response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "accepted": 3,
    "rejected": 0,
    "txHashes": [
      "4d9435fb56fd7b7659ae43ef0775a29aadda98004917c587460c95614cee5c75",
      "c69f48297ef5c901933a9724b53894d5e9996dbef3f2489f03ea18a80b73be61",
      "152ffeaaf29afe884fd0c458053d691c52427299527195708f95379383d49388"
    ]
  },
  "id": 5
}
```

---

## 2. Public REST API Gateway (`https://api.synapticchain.xyz`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/onboard` | 1-Click Naked POST autonomous agent onboarding |
| `GET` | `/x402/vectors` | x402 paid vector retrieval paywall ($0.0008\text{ SYN}$) |
| `GET` | `/x402/sentiment` | x402 paid sentiment analysis feed ($0.012\text{ SYN}$) |
| `GET` | `/x402/orbital` | x402 paid space telemetry endpoint ($0.004\text{ SYN}$) |
| `GET` | `/api/v1/tvl` | Live TVL and treasury reserves |
