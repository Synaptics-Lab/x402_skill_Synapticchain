/**
 * x402 gateway proxy mounted at /x402 on the consumer origin.
 *
 * Production serves the marketplace UI from api.synapticchain.xyz and exposes
 * the payment gateway under /x402 so browsers and bots use a single origin and
 * CORS is not required. Locally this forwards to the gateway process on :8402.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Server-side proxy to the co-located x402 gateway. We deliberately do NOT use
 * NEXT_PUBLIC_GATEWAY_URL here: that env var is public and may point back at the
 * public origin (https://api.synapticchain.xyz/x402), which would create a
 * Cloudflare loop. The gateway always runs on the same host as the consumer app.
 */
const GATEWAY_BASE =
  process.env.INTERNAL_GATEWAY_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8402'

export async function GET(req: NextRequest) {
  return proxy(req)
}
export async function POST(req: NextRequest) {
  return proxy(req)
}
export async function PUT(req: NextRequest) {
  return proxy(req)
}
export async function DELETE(req: NextRequest) {
  return proxy(req)
}
export async function OPTIONS(req: NextRequest) {
  return proxy(req)
}

async function proxy(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/x402/, '')
  const target = new URL(`${GATEWAY_BASE}${path}${url.search}`)

  const headers = new Headers(req.headers)
  // Strip host-related headers so the gateway sees its own host.
  headers.delete('host')
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''))

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.arrayBuffer() : undefined,
      // @ts-ignore — duplex is required by Node fetch for streaming bodies.
      duplex: 'half',
    })

    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.set('x-402-proxied', 'true')
    responseHeaders.set('x-402-gateway', GATEWAY_BASE)

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error('[x402 proxy] upstream error:', err.message, target.toString())
    return NextResponse.json(
      { error: 'gateway_unreachable', gateway: GATEWAY_BASE, message: err.message },
      { status: 502 },
    )
  }
}
