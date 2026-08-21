#!/usr/bin/env node
/**
 * x402 Gateway Proxy
 * ------------------
 * Sits in front of an existing HTTP API and enforces payment on SynapticChain.
 *
 *   request without receipt  -> 402 + invoice descriptor
 *   request with receipt     -> verified, then proxied upstream
 *
 * Settlement is observed live over the SynapticChain WebSocket by subscribing to
 * `PaymentProcessed` on the ServiceRegistry contract. Paid invoices are cached in
 * memory so the client's retry succeeds immediately.
 *
 *   node server.js --config ./config.yaml
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const express = require('express')
const yaml = require('js-yaml')
const WebSocket = require('ws')

/* ---------------------------------------------------------------- config */

function loadConfig() {
  const flagIndex = process.argv.indexOf('--config')
  const file = flagIndex > -1 ? process.argv[flagIndex + 1] : process.env.X402_CONFIG || './config.yaml'
  const raw = fs.readFileSync(path.resolve(file), 'utf8')
  const cfg = yaml.load(raw)

  cfg.chain = cfg.chain || {}
  cfg.chain.name = cfg.chain.name || 'SynapticChain'
  cfg.chain.chainId = cfg.chain.chainId ?? 7402
  cfg.chain.rpcUrl = cfg.chain.rpcUrl || 'https://nodes.synapticchain.xyz/rpc'
  cfg.chain.wsUrl = cfg.chain.wsUrl || 'wss://nodes.synapticchain.xyz/ws'
  cfg.chain.currency = cfg.chain.currency || 'SYN'
  cfg.chain.finalityMs = cfg.chain.finalityMs ?? 480
  cfg.server = cfg.server || {}
  cfg.server.port = Number(process.env.PORT || cfg.server.port || 8402)
  cfg.invoiceTtlSeconds = cfg.invoiceTtlSeconds ?? 300

  if (!Array.isArray(cfg.endpoints) || cfg.endpoints.length === 0) {
    throw new Error('config.yaml: `endpoints` must contain at least one mapping')
  }
  return cfg
}

const config = loadConfig()

const RECEIPT_DOMAIN = 'synapticchain/x402/v1'
const log = (...a) => console.log(new Date().toISOString(), '[x402]', ...a)
const warn = (...a) => console.warn(new Date().toISOString(), '[x402] warn', ...a)

function jsonLog(type, data) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), type, ...data }))
}

/* ----------------------------------------------------------------- state */

/** invoiceHash -> { endpointId, amount, payer, status, expiresAt, txHash } */
const invoices = new Map()
/** endpointId -> route config */
const routes = new Map()
for (const e of config.endpoints) {
  if (!e.id || !e.upstream) throw new Error('each endpoint needs `id` and `upstream`')
  routes.set(String(e.id).toLowerCase(), {
    id: String(e.id).toLowerCase(),
    numericId: Number(e.numericId ?? 0),
    route: e.route || '/' + String(e.id).slice(2, 10),
    upstream: e.upstream.replace(/\/$/, ''),
    price: Number(e.price ?? 0),
    subscription: !!e.subscription,
    forwardHeaders: e.forwardHeaders || [],
    stripPrefix: e.stripPrefix !== false,
    timeoutMs: Number(e.timeoutMs ?? 15000),
  })
}

const MAX_SETTLEMENT_HISTORY = 200
const recentSettlements = []
const chainValidation = new Map()

function pushSettlement(entry) {
  recentSettlements.unshift(entry)
  if (recentSettlements.length > MAX_SETTLEMENT_HISTORY) {
    recentSettlements.length = MAX_SETTLEMENT_HISTORY
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [hash, inv] of invoices) {
    if (inv.expiresAt + 60_000 < now && inv.status !== 'paid') invoices.delete(hash)
  }
}, 30_000).unref()

/* --------------------------------------------------------------- crypto */

function digest(input) {
  // Isomorphic digest shared with the consumer wallet + x402-client.
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  let h3 = 0xdeadbeef
  let h4 = 0x9e3779b9
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = (h1 ^ c) * 16777619
    h2 = (h2 + c * (i + 7)) ^ (h2 << 5)
    h3 = (h3 ^ (c << (i % 13))) * 2654435761
    h4 = (h4 + (c << 3)) ^ (h4 >>> 7)
    h1 >>>= 0
    h2 >>>= 0
    h3 >>>= 0
    h4 >>>= 0
  }
  const part = (n) => (n >>> 0).toString(16).padStart(8, '0')
  const a = part(h1) + part(h2) + part(h3) + part(h4)
  const b = part(h1 ^ h4) + part(h2 ^ h3) + part(h3 + h1) + part(h4 + h2)
  return (a + b).slice(0, 64)
}

function expectedSignature(payer, invoiceHash, endpointId) {
  const key = digest('sk:' + String(payer).toLowerCase())
  return digest([RECEIPT_DOMAIN, key, String(payer).toLowerCase(), invoiceHash, endpointId].join('|'))
}

function newInvoiceHash(endpointId) {
  return '0x' + digest(`${endpointId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`)
}

function decodeReceipt(header) {
  if (!header) return null
  const token = String(header).replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/* ------------------------------------------------- chain event listener */

let ws = null
let wsBackoff = 500
let lastBlock = 0

function connectChain() {
  const url = config.chain.wsUrl
  log('connecting to chain ws', url)
  ws = new WebSocket(url)

  ws.on('open', () => {
    wsBackoff = 500
    log('ws open — subscribing to PaymentProcessed')
    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'syn_subscribe',
        params: [
          'logs',
          {
            address: config.contracts.ServiceRegistry,
            topics: ['PaymentProcessed'],
          },
        ],
      }),
    )
  })

  ws.on('message', (buf) => {
    let msg
    try {
      msg = JSON.parse(buf.toString())
    } catch {
      return
    }
    const ev = msg?.params?.result || msg?.result
    if (!ev || !ev.args) return
    if (ev.name && ev.name !== 'PaymentProcessed') return
    lastBlock = ev.block ?? lastBlock
    settle(ev.args.invoice_hash, ev.args.payer, ev.args.id, ev.args.amount, ev.txHash, ev.block)
  })

  ws.on('close', () => {
    log('ws closed — reconnecting in', wsBackoff, 'ms')
    setTimeout(connectChain, wsBackoff)
    wsBackoff = Math.min(wsBackoff * 2, 15_000)
  })

  ws.on('error', (err) => log('ws error', err.message))
}

function settle(invoiceHash, payer, endpointId, amount, txHash, block) {
  if (!invoiceHash) return
  const numericId = Number(endpointId || 0)
  const routeByNumeric = [...routes.values()].find((r) => r.numericId === numericId)
  const stringId = routeByNumeric?.id ?? String(endpointId || '').toLowerCase()
  const route = routeByNumeric?.route ?? ''

  const inv = invoices.get(invoiceHash) || {
    endpointId: stringId,
    numericId,
    amount: Number(amount || 0),
    expiresAt: Date.now() + config.invoiceTtlSeconds * 1000,
  }
  inv.status = 'paid'
  inv.payer = String(payer).toLowerCase()
  inv.txHash = txHash
  inv.block = block
  inv.numericId = numericId
  invoices.set(invoiceHash, inv)

  const ts = new Date().toISOString()
  const settlement = {
    invoiceHash,
    endpointId: stringId,
    endpointNumericId: numericId,
    route,
    amount: Number(amount || 0),
    payer: inv.payer,
    txHash,
    block,
    ts,
  }
  pushSettlement(settlement)

  // Human-readable line for operators
  log(
    'settled',
    invoiceHash.slice(0, 18),
    'endpoint',
    stringId,
    'payer',
    inv.payer.slice(0, 10),
    'amount',
    settlement.amount,
    'block',
    block,
  )

  // Structured JSON line for production log aggregation
  jsonLog('settlement', settlement)
}

/* ---------------------------------------------------- on-chain validation */

const U128_SCALE = 1_000_000_000_000_000_000n

function priceToFloat(raw) {
  try {
    const n = BigInt(String(raw || 0))
    if (U128_SCALE === 0n) return 0
    const intPart = n / U128_SCALE
    const fracPart = n % U128_SCALE
    return Number(intPart) + Number(fracPart) / Number(U128_SCALE)
  } catch {
    return Number(raw || 0)
  }
}

function toNodeArg(arg) {
  const { type, value } = arg
  switch (String(type).toLowerCase()) {
    case 'bool':
      return { Bool: value }
    case 'u8':
      return { U8: value }
    case 'u16':
      return { U16: value }
    case 'u32':
      return { U32: value }
    case 'u64':
      return { U64: value }
    case 'u128':
      return { U128: value }
    case 'u256':
      return { U256: value }
    case 'address':
      return { Address: value }
    case 'bytes':
      return { Bytes: value }
    case 'string':
      return { String: value }
    default:
      return value
  }
}

async function callServiceRegistry(functionName, args) {
  const res = await fetch(config.chain.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'syn_callContractV2',
      params: [
        config.contracts.ServiceRegistry,
        functionName,
        Array.isArray(args) ? args.map(toNodeArg) : args,
        'syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql7a7sh',
        500_000,
      ],
    }),
  })
  const json = await res.json()
  if (json?.error) throw new Error(json.error.message || 'contract call failed')
  return json?.result?.result
}

async function fetchEndpointPrice(numericId) {
  // Call the individual price getter (get_endpoint struct return is not supported by the compiler).
  try {
    const raw = await callServiceRegistry('get_endpoint_price', [{ type: 'u64', value: numericId }])
    return priceToFloat(raw)
  } catch {}
  return null
}

async function validateEndpointsAgainstChain() {
  log('validating endpoint configuration against ServiceRegistry...')
  for (const route of routes.values()) {
    const entry = {
      numericId: route.numericId,
      route: route.route,
      configPrice: route.price,
      chainPrice: null,
      matched: false,
      error: null,
      checkedAt: new Date().toISOString(),
    }
    try {
      const chainPrice = await fetchEndpointPrice(route.numericId)
      entry.chainPrice = chainPrice
      if (chainPrice == null) {
        entry.error = 'endpoint_not_found_on_chain'
        warn(`endpoint ${route.route} numericId=${route.numericId} not found on chain`)
      } else {
        const diff = Math.abs(chainPrice - route.price)
        entry.matched = diff < 0.000_000_1
        if (!entry.matched) {
          entry.error = 'price_mismatch'
          warn(
            `price mismatch for ${route.route}: config=${route.price} chain=${chainPrice}`,
          )
        }
      }
    } catch (err) {
      entry.error = err.message || 'validation_failed'
      warn(`could not validate ${route.route} against chain: ${err.message}`)
    }
    chainValidation.set(route.id, entry)
  }
  const matched = [...chainValidation.values()].filter((v) => v.matched).length
  const total = chainValidation.size
  log(`endpoint chain validation: ${matched}/${total} matched`)
}

/*
 * Fallback / primary observer for this network: poll recent transactions and
 * mark any ServiceRegistry pay_per_call whose String argument matches a pending
 * invoice hash as settled.
 */
async function pollChain() {
  const seenHashes = new Set()
  for (;;) {
    try {
      const res = await fetch(config.chain.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'syn_getRecentTransactions',
          params: [config.contracts.ServiceRegistry, 100],
        }),
      })
      const json = await res.json()
      const summaries = json?.result || []
      for (const summary of summaries) {
        if (!summary.hash || seenHashes.has(summary.hash)) continue
        seenHashes.add(summary.hash)
        if (summary.to !== config.contracts.ServiceRegistry) continue
        const detailRes = await fetch(config.chain.rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'syn_getTransaction',
            params: [summary.hash],
          }),
        })
        const detailJson = await detailRes.json()
        const tx = detailJson?.result?.value
        if (!tx) continue
        const args = tx.args || []
        const invoiceArg = args.find((a) => a.String)
        if (!invoiceArg) continue
        const invoiceHash = invoiceArg.String
        if (invoices.has(invoiceHash)) {
          settle(invoiceHash, tx.from, null, null, tx.hash, tx.checkpoint_height)
          lastBlock = Math.max(lastBlock, tx.checkpoint_height || 0)
        }
      }
    } catch (err) {
      log('poll error', err.message)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
}


/* ------------------------------------------------------------------ app */

const app = express()
app.disable('x-powered-by')

// Allow cross-origin requests from the marketplace consumer and Web4 wallet domains.
// In production the consumer is served from the same origin, but wallet/onboarding
// flows and alpha smoke tests may hit the gateway directly.
app.use((req, res, next) => {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-402-receipt, x-402-endpoint')
  res.setHeader('Access-Control-Expose-Headers', 'X-402-Mode, X-402-Cost, X-402-Upstream-Latency')
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  next()
})

app.use(express.raw({ type: '*/*', limit: config.server.bodyLimit || '2mb' }))

app.get('/health', (_req, res) => res.redirect('/healthz'))
app.get('/healthz', (_req, res) => {
  const validated = [...chainValidation.values()]
  res.json({
    ok: true,
    chain: config.chain.name,
    ws: ws?.readyState === WebSocket.OPEN ? 'open' : 'down',
    lastBlock,
    endpoints: [...routes.values()].map((r) => ({ id: r.id, route: r.route, price: r.price, subscription: r.subscription })),
    cachedInvoices: invoices.size,
    recentSettlements: recentSettlements.length,
    chainValidation: {
      checked: validated.length,
      matched: validated.filter((v) => v.matched).length,
      endpoints: validated,
    },
  })
})

function isAdmin(req) {
  const token = process.env.X402_ADMIN_TOKEN
  const forwarded = req.headers['x-forwarded-for']
  const remote = String(req.socket.remoteAddress || forwarded || 'unknown')
    .split(',')[0]
    .trim()
  const local = remote === '127.0.0.1' || remote === '::1' || remote === 'localhost'
  if (!token) return local
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  return local || bearer === token
}

app.get('/admin/settlements', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const limit = Math.min(Number(req.query.limit || 50), 200)
  return res.json({
    ok: true,
    count: recentSettlements.length,
    settlements: recentSettlements.slice(0, limit),
  })
})

function challenge(res, route, reason) {
  const invoiceHash = newInvoiceHash(route.id)
  const expiresAt = Date.now() + config.invoiceTtlSeconds * 1000
  invoices.set(invoiceHash, {
    endpointId: route.id,
    numericId: route.numericId,
    amount: route.price,
    payer: null,
    status: 'pending',
    expiresAt,
  })
  res
    .status(402)
    .set({
      'WWW-Authenticate': `x402 realm="${config.chain.name}", invoice="${invoiceHash}", amount="${route.price}", asset="${config.chain.currency}"`,
      'X-402-Invoice': invoiceHash,
      'X-402-Amount': String(route.price),
      'Cache-Control': 'no-store',
    })
    .json({
      x402Version: 1,
      reason,
      chain: {
        name: config.chain.name,
        chainId: config.chain.chainId,
        currency: config.chain.currency,
        rpcUrl: config.chain.publicRpcUrl || config.chain.rpcUrl,
        wsUrl: config.chain.publicWsUrl || config.chain.wsUrl,
        finalityMs: config.chain.finalityMs,
        pollFallback: config.chain.pollFallback,
      },
      endpointId: route.id,
      endpointNumericId: route.numericId,
      payTo: config.contracts.ServiceRegistry,
      method: 'pay_per_call(uint64,string)',
      asset: config.chain.currency,
      amount: String(route.price),
      invoiceHash,
      expiresAt: new Date(expiresAt).toISOString(),
      settlementEvent: 'PaymentProcessed',
      retry: { header: 'Authorization', scheme: 'Bearer', encoding: 'base64(json receipt)' },
    })
}

for (const route of routes.values()) {
  app.all(`${route.route}{/*path}`, async (req, res) => {
    const started = Date.now()
    const receipt = decodeReceipt(req.headers.authorization)

    if (!receipt) return challenge(res, route, 'payment_required')
    if (String(receipt.endpointId).toLowerCase() !== route.id) {
      return challenge(res, route, 'receipt_endpoint_mismatch')
    }

    const signedOver = receipt.kind === 'subscription' ? `sub:${receipt.tokenId}` : String(receipt.invoiceHash)
    if (receipt.sig !== expectedSignature(receipt.payer, signedOver, route.id)) {
      return res.status(401).json({ error: 'invalid_receipt_signature' })
    }

    if (receipt.kind === 'subscription') {
      if (!route.subscription) return res.status(403).json({ error: 'subscriptions_not_enabled' })
      const valid = await isSubscriptionValid(receipt.tokenId)
      if (!valid) return challenge(res, route, 'subscription_invalid_or_expired')
    } else {
      let inv = invoices.get(receipt.invoiceHash)
      if (!inv) {
        // The invoice may have expired from memory; verify the receipt's tx directly.
        if (receipt.txHash && (await verifyPaymentTx(receipt.txHash, receipt.invoiceHash))) {
          inv = {
            endpointId: route.id,
            amount: route.price,
            payer: String(receipt.payer).toLowerCase(),
            status: 'paid',
            txHash: receipt.txHash,
            expiresAt: Date.now() + config.invoiceTtlSeconds * 1000,
          }
          invoices.set(receipt.invoiceHash, inv)
        } else {
          return challenge(res, route, 'unknown_invoice')
        }
      }
      if (inv.status === 'consumed') return challenge(res, route, 'receipt_already_consumed')
      if (inv.status !== 'paid') {
        if (receipt.txHash && (await verifyPaymentTx(receipt.txHash, receipt.invoiceHash))) {
          inv.status = 'paid'
          inv.payer = String(receipt.payer).toLowerCase()
          inv.txHash = receipt.txHash
        } else {
          return challenge(res, route, `invoice_${inv.status}`)
        }
      }
      if (inv.payer !== String(receipt.payer).toLowerCase()) return challenge(res, route, 'payer_mismatch')
      if (inv.endpointId !== route.id) return challenge(res, route, 'invoice_endpoint_mismatch')
      inv.status = 'consumed'
    }

    // ------------------------------------------------------------ proxy
    const suffix = route.stripPrefix ? req.originalUrl.slice(route.route.length) : req.originalUrl
    const target = route.upstream + (suffix || '')
    const headers = {
      'x-forwarded-by': 'x402-gateway/1.0',
      'x-402-payer': String(receipt.payer),
    }
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
    for (const h of route.forwardHeaders) if (req.headers[h.toLowerCase()]) headers[h] = req.headers[h.toLowerCase()]

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), route.timeoutMs)
    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
        signal: ac.signal,
      })
      const buf = Buffer.from(await upstream.arrayBuffer())
      res
        .status(upstream.status)
        .set({
          'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
          'X-402-Settled': 'true',
          'X-402-Mode': receipt.kind === 'subscription' ? 'subscription' : 'per-call',
          'X-402-Cost': receipt.kind === 'subscription' ? '0' : String(route.price),
          'X-402-Upstream-Latency': String(Date.now() - started),
        })
        .send(buf)
    } catch (err) {
      log('upstream error', target, err.message)
      res.status(502).json({ error: 'upstream_unreachable', upstream: target })
    } finally {
      clearTimeout(timer)
    }
  })
}

async function verifyPaymentTx(txHash, invoiceHash) {
  try {
    const res = await fetch(config.chain.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'syn_getTransaction', params: [txHash] }),
    })
    const json = await res.json()
    const tx = json?.result?.value
    if (!tx) return false
    if (tx.status?.toLowerCase() !== 'confirmed') return false
    if (tx.to !== config.contracts.ServiceRegistry) return false
    const args = tx.args || []
    const invoiceArg = args.find((a) => a.String)
    return invoiceArg?.String === invoiceHash
  } catch (err) {
    log('verifyPaymentTx failed', err.message)
    return false
  }
}

async function isSubscriptionValid(tokenId) {
  try {
    const res = await fetch(config.chain.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'syn_callContractV2',
        params: [
          config.contracts.SubscriptionNFT,
          'is_valid',
          [toNodeArg({ type: 'u64', value: Number(tokenId) })],
          'syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql7a7sh',
          500_000,
        ],
      }),
    })
    const json = await res.json()
    const result = json?.result?.result
    if (result != null && typeof result === 'object') {
      if ('Bool' in result) return !!result.Bool
      if ('U64' in result) return Number(result.U64) !== 0
    }
    return !!result
  } catch (err) {
    log('is_valid lookup failed', err.message)
    return false
  }
}

app.use((_req, res) => res.status(404).json({ error: 'no_route_configured' }))

app.listen(config.server.port, async () => {
  log(`gateway listening on :${config.server.port}`)
  for (const r of routes.values()) log(`  ${r.route} -> ${r.upstream}  (${r.price} ${config.chain.currency}/call)`)

  // Try live WebSocket subscription first...
  connectChain()

  // ...and validate configured prices against on-chain ServiceRegistry state.
  await validateEndpointsAgainstChain()

  // WebSocket event subscriptions are not stable on this node, so we always
  // poll recent transactions for PaymentProcessed settlements.
  pollChain()
})
