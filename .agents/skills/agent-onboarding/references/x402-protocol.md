# Machine-to-Machine HTTP 402 Commerce Protocol Specification

## 1. Protocol Overview

The **x402 Protocol** implements the RFC standard `HTTP 402 Payment Required` as a native Layer-1 settlement layer for autonomous AI agents, LLMs, and API providers.

```
Client (AI Bot)                                                     Provider (x402 Gateway)
     │                                                                        │
     │ 1. Initial Request (GET /x402/endpoint)                                │
     ├───────────────────────────────────────────────────────────────────────►│
     │                                                                        │
     │ 2. HTTP 402 Payment Required                                           │
     │    Headers:                                                            │
     │      www-authenticate: x402 realm="SynapticChain"                      │
     │      x-402-invoice: <invoice_id>                                       │
     │      x-402-amount: <cost_in_syn>                                       │
     │    JSON Body:                                                          │
     │      { "payTo": "syn1...", "amount": "...", "asset": "SYN" }           │
     │◄───────────────────────────────────────────────────────────────────────┤
     │                                                                        │
     │ 3. On-Chain Settlement (Sub-500ms DAG Finality)                        │
     │ ───► [SynapticChain L1 RPC: syn_sendRawTransaction]                   │
     │                                                                        │
     │ 4. Paid Request (GET /x402/endpoint)                                   │
     │    Headers:                                                            │
     │      x-402-receipt: <tx_hash>                                          │
     │      x-402-invoice: <invoice_id>                                       │
     ├───────────────────────────────────────────────────────────────────────►│
     │                                                                        │
     │ 5. Verification & Service Delivery (HTTP 200 OK)                       │
     │◄───────────────────────────────────────────────────────────────────────┤
```

---

## 2. Header & Payload Specifications

### 402 Challenge Response Headers
- `Status`: `402 Payment Required`
- `WWW-Authenticate`: `x402 realm="SynapticChain"`
- `x-402-invoice`: Unique hex identifier for the generated quote
- `x-402-amount`: Decimal cost in SYN / sUSD
- `x-402-token`: Payment asset (`SYN`, `sUSD`, or `$BOTCOIN`)

### 402 Challenge Response Body
```json
{
  "reason": "payment_required",
  "endpointId": "0x4b02ee91c7735fa1",
  "payTo": "syn1zxl3lda3w3lhhcz9cn0j0uzy4qy8fqxst9alkc",
  "asset": "SYN",
  "amount": "0.0008",
  "finalityMs": 500,
  "expiresAt": 1787260500
}
```

### Paid Request Headers
- `x-402-receipt`: The Layer-1 transaction hash returned by `syn_sendRawTransaction`.
- `x-402-invoice`: The invoice ID received in the challenge.
