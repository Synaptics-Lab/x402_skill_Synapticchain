# Synapse x402: Machine-to-Machine Commerce Specification

> **The Native Layer-1 Standard for HTTP 402 Payment Required Autonomous API Monetization.**

---

## 1. Overview

The **x402 Protocol** formalizes autonomous machine-to-machine (M2M) billing and instant on-chain settlement over standard HTTP. It allows any API provider to monetize inference, vector lookups, weather data, or computing resources without requiring credit cards, OAuth account creation, or monthly subscriptions.

---

## 2. The 402 Handshake Lifecycle

```
Agent / Client                                               x402 Gateway / Provider
      │                                                                  │
      │ 1. Initial Unauthenticated Request (GET /x402/resource)          │
      ├─────────────────────────────────────────────────────────────────►│
      │                                                                  │
      │ 2. HTTP 402 Payment Required                                     │
      │    Header: www-authenticate: x402 realm="SynapticChain"          │
      │    Header: x-402-invoice: 0x7fa2b9...                            │
      │    Body: { payTo: "syn1...", amount: "0.0008", asset: "SYN" }    │
      │◄─────────────────────────────────────────────────────────────────┤
      │                                                                  │
      │ 3. Sign & Submit L1 Transaction (Sub-500ms DAG Finality)         │
      │ ───► [SynapticChain L1] ───► Settled (txHash: 0x8a92...)         │
      │                                                                  │
      │ 4. Paid Request (GET /x402/resource)                             │
      │    Header: x-402-receipt: 0x8a92...                              │
      │    Header: x-402-invoice: 0x7fa2b9...                            │
      ├─────────────────────────────────────────────────────────────────►│
      │                                                                  │
      │ 5. Verification & Service Delivery (HTTP 200 OK)                 │
      │◄─────────────────────────────────────────────────────────────────┤
```

---

## 3. Wire Protocol & Headers

### Provider Challenge Response (HTTP 402)
```http
HTTP/2 402 Payment Required
content-type: application/json
www-authenticate: x402 realm="SynapticChain"
x-402-invoice: 0x3e734da0ba811b...
x-402-amount: 0.0008
x-402-token: SYN
x-402-payto: syn1zxl3lda3w3lhhcz9cn0j0uzy4qy8fqxst9alkc
access-control-expose-headers: x-402-invoice, x-402-amount, x-402-token, x-402-payto

{
  "reason": "payment_required",
  "endpointId": "0x4b02ee91c7735fa1",
  "payTo": "syn1zxl3lda3w3lhhcz9cn0j0uzy4qy8fqxst9alkc",
  "method": "pay_per_call(uint64,string)",
  "asset": "SYN",
  "amount": "0.0008",
  "finalityMs": 500,
  "expiresAt": 1787260800
}
```

### Client Settlement Request (HTTP 200 Target)
```http
GET /x402/vectors HTTP/2
Host: api.synapticchain.xyz
x-402-invoice: 0x3e734da0ba811b...
x-402-receipt: 0x8a921dce3199f1bcda48102941b...
accept: application/json
```

---

## 4. Smart Contract Resolution

Payments can be routed directly to:
1. **Direct EOA/Wallet (`syn1...`):** Instant peer-to-peer settlement.
2. **On-Chain ServiceRegistry (`x402_ServiceRegistry`):** Protocol-level revenue sharing, escrow verification, and automated dynamic volume discounts.
