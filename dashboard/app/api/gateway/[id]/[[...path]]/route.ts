/**
 * x402 Gateway Proxy — hosted edition.
 *
 * Identical protocol logic to /gateway/server.js (the self-hosted Docker image),
 * so a provider can develop against this endpoint and then run the container.
 *
 *   GET /api/gateway/<endpointId>/<...path>
 *     no receipt   -> 402 + invoice descriptor
 *     receipt      -> verify against ServiceRegistry, then forward upstream
 */

import { CHAIN, CONTRACTS } from '@/lib/chain/contracts'
import {
  activeSubscription,
  createInvoice,
  deriveKey,
  getInvoice,
  head,
  hydrateState,
  signInvoice,
  state,
} from '@/lib/chain/store'

export const dynamic = 'force-dynamic'

type Receipt = {
  v: number
  kind?: 'payment' | 'subscription'
  endpointId: string
  invoiceHash?: string
  tokenId?: number
  payer: string
  txHash?: string
  sig: string
}

function decodeReceipt(header: string | null): Receipt | null {
  if (!header) return null
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const json = Buffer.from(token, 'base64').toString('utf8')
    return JSON.parse(json) as Receipt
  } catch {
    return null
  }
}

function challenge(endpointId: string, amount: number, origin: string, reason: string) {
  const invoice = createInvoice(endpointId, amount)
  const ep = state.endpoints.get(endpointId)!
  const body = {
    x402Version: 1,
    reason,
    chain: {
      name: CHAIN.name,
      chainId: CHAIN.chainId,
      rpcUrl: CHAIN.rpcUrl,
      wsUrl: CHAIN.wsUrl,
      currency: CHAIN.currency,
      finalityMs: CHAIN.finalityMs,
    },
    endpointId,
    endpointName: ep.name,
    payTo: CONTRACTS.ServiceRegistry.address,
    method: 'pay_per_call(bytes32,bytes32)',
    asset: 'SYN',
    amount: amount.toString(),
    invoiceHash: invoice.hash,
    expiresAt: new Date(invoice.expiresAt).toISOString(),
    settlementEvent: 'PaymentProcessed',
    retry: { header: 'Authorization', scheme: 'Bearer', encoding: 'base64(json receipt)' },
    // local dev convenience: the batch call the client should submit
    tx: {
      method: 'registry_payPerCall',
      params: { endpointId, invoiceHash: invoice.hash },
      rpc: `${origin}/api/rpc`,
    },
  }
  return Response.json(body, {
    status: 402,
    headers: {
      'WWW-Authenticate': `x402 realm="${CHAIN.name}", invoice="${invoice.hash}", amount="${amount}", asset="SYN"`,
      'X-402-Invoice': invoice.hash,
      'X-402-Amount': String(amount),
      'Cache-Control': 'no-store',
    },
  })
}

async function handle(req: Request, ctx: { params: Promise<{ id: string; path?: string[] }> }) {
  await hydrateState()
  const started = Date.now()
  const { id, path } = await ctx.params
  const url = new URL(req.url)
  const origin = url.origin

  const ep = state.endpoints.get(id)
  if (!ep) {
    return Response.json({ error: 'endpoint_not_registered', endpointId: id }, { status: 404 })
  }

  const receipt = decodeReceipt(req.headers.get('authorization'))

  /* ------------------------------------------------------------ verify */
  if (!receipt) {
    return challenge(id, ep.pricePerCall, origin, 'payment_required')
  }

  if (receipt.endpointId !== id) {
    return challenge(id, ep.pricePerCall, origin, 'receipt_endpoint_mismatch')
  }

  const expectedSig =
    receipt.kind === 'subscription'
      ? signInvoice(deriveKey(receipt.payer), receipt.payer, `sub:${receipt.tokenId}`, id)
      : signInvoice(deriveKey(receipt.payer), receipt.payer, String(receipt.invoiceHash), id)

  if (receipt.sig !== expectedSig) {
    return Response.json(
      { error: 'invalid_receipt_signature', expectedDomain: 'synapticchain/x402/v1' },
      { status: 401 },
    )
  }

  if (receipt.kind === 'subscription') {
    const sub = state.subscriptions.find((s) => s.tokenId === receipt.tokenId)
    if (!sub || sub.owner !== receipt.payer.toLowerCase() || sub.expiresAt < Date.now()) {
      return challenge(id, ep.pricePerCall, origin, 'subscription_invalid_or_expired')
    }
  } else {
    const inv = getInvoice(String(receipt.invoiceHash))
    if (!inv) return challenge(id, ep.pricePerCall, origin, 'unknown_invoice')
    if (inv.endpointId !== id) return challenge(id, ep.pricePerCall, origin, 'invoice_endpoint_mismatch')
    if (inv.status === 'consumed') return challenge(id, ep.pricePerCall, origin, 'receipt_already_consumed')
    if (inv.status !== 'paid') return challenge(id, ep.pricePerCall, origin, `invoice_${inv.status}`)
    if (inv.payer !== receipt.payer.toLowerCase()) {
      return challenge(id, ep.pricePerCall, origin, 'payer_mismatch')
    }
    inv.status = 'consumed'
  }

  /* ----------------------------------------------------------- forward */
  const target = ep.upstream.startsWith('/') ? origin + ep.upstream : ep.upstream
  const extra = path?.length ? '/' + path.join('/') : ''
  const forwardUrl = new URL(target + extra)
  url.searchParams.forEach((v, k) => forwardUrl.searchParams.set(k, v))

  const init: RequestInit = {
    method: req.method,
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
      'x-forwarded-by': 'x402-gateway/1.0',
      'x-402-payer': receipt.payer,
    },
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text()
  }

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(forwardUrl, init)
  } catch (err) {
    console.log('[v0] gateway upstream failure', forwardUrl.toString(), (err as Error).message)
    return Response.json({ error: 'upstream_unreachable', upstream: forwardUrl.toString() }, { status: 502 })
  }

  const text = await upstreamRes.text()
  const latency = Date.now() - started

  // meter the call
  ep.calls += 1
  ep.p50 = ep.p50 ? Math.round(ep.p50 * 0.8 + latency * 0.2) : latency

  return new Response(text, {
    status: upstreamRes.status,
    headers: {
      'content-type': upstreamRes.headers.get('content-type') ?? 'application/json',
      'X-402-Settled': 'true',
      'X-402-Mode': receipt.kind === 'subscription' ? 'subscription' : 'per-call',
      'X-402-Cost': receipt.kind === 'subscription' ? '0' : String(ep.pricePerCall),
      'X-402-Block': String(head().block),
      'X-402-Upstream-Latency': String(latency),
      'Cache-Control': 'no-store',
    },
  })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
