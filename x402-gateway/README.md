# Synapse x402 Gateway Reference Server

> **Turn any API or AI microservice into an autonomous, paid machine-to-machine endpoint in under 60 seconds.**

---

## 1. How It Works

The **Synapse x402 Gateway** acts as a reverse proxy in front of your upstream services (e.g. FastAPI, Express, Flask, Ollama, vLLM). When an incoming HTTP request arrives without payment proof:
1. It intercepts the request and responds with `HTTP 402 Payment Required`.
2. It returns the required payment parameters (`payTo` address, amount in `SYN` or `sUSD`, unique invoice ID).
3. When the client settles the payment on SynapticChain L1 and returns with `x-402-receipt: <tx_hash>`, the gateway verifies the DAG transaction and proxies the request to your upstream service.

---

## 2. Quick Start

### Installation & Run
```bash
cd x402-gateway
npm install
node server.js
```

### Configuration (`config.yaml`)
```yaml
server:
  port: 8402
  bodyLimit: 2mb

chain:
  name: SynapticChain
  rpcUrl: https://nodes.synapticchain.xyz/rpc
  wsUrl: wss://nodes.synapticchain.xyz/ws
  finalityMs: 500

endpoints:
  - id: '0x4b02ee91c7735fa1'
    route: /vectors
    upstream: http://127.0.0.1:8000/vector-search
    price: 0.0008
```

---

## 3. Example Clients

See `examples/agent_paywall_client.py` and `examples/agent_paywall_client.ts` for automated client settlement loops.
