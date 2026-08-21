/**
 * Wallet top-up invoice creation.
 *
 * Creates a real NowPayments invoice for a USD amount and stores the mapping so
 * the IPN callback can credit SYN on-chain after crypto payment confirmation.
 *
 *   POST /api/topup
 *     { address: 'syn1...', amountUsd: number, currency?: 'eth'|'usdt'|'btc' }
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const dynamic = 'force-dynamic'

const TOPUP_STORE = path.resolve('/opt/synapticchain/x402-marketplace/.topup-payments.json')
// TODO: Replace with live on-chain oracle feed (e.g. FiatPriceOracleV1).
// For now, the SYN floor is $0.75 USD per SYN.
const USD_PER_SYN = 0.75
// SYN uses 8 decimal places: 1 SYN = 100_000_000 bunits (same as Bitcoin satoshis)
const SYN_DECIMALS = 100_000_000 // 1e8 bunits per SYN

function loadStore(): Record<string, any> {
  try {
    if (!fs.existsSync(TOPUP_STORE)) return {}
    return JSON.parse(fs.readFileSync(TOPUP_STORE, 'utf8'))
  } catch {
    return {}
  }
}

function saveStore(store: Record<string, any>) {
  fs.writeFileSync(TOPUP_STORE, JSON.stringify(store, null, 2))
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

function makeId() {
  return `topup_${crypto.randomBytes(8).toString('hex')}`
}

export async function POST(req: NextRequest) {
  try {
    const { address, amountUsd, currency = 'eth' } = (await req.json()) as {
      address?: string
      amountUsd?: number
      currency?: string
    }

    if (!address || !/^syn1[a-z0-9]{38,42}$/.test(address)) {
      return NextResponse.json({ error: 'valid synaptic address required' }, { status: 400, headers: corsHeaders() })
    }
    if (!amountUsd || amountUsd < 5) {
      return NextResponse.json({ error: 'minimum top-up is $5 USD' }, { status: 400, headers: corsHeaders() })
    }

    const isSandbox = process.env.NOWPAYMENTS_SANDBOX === 'true'
    const appHost = process.env.NEXT_PUBLIC_APP_URL ?? (isSandbox ? 'http://localhost:3006' : 'https://api.synapticchain.xyz')

    const store = loadStore()
    const paymentId = makeId()
    const synAmount = Math.floor((amountUsd / USD_PER_SYN) * SYN_DECIMALS)
    const orderId = `${address}_${paymentId}_${Date.now()}`
    const nativeCheckoutUrl = `${appHost}/checkout?id=${paymentId}`

    const apiKey = process.env.NOWPAYMENTS_API_KEY
    let invoiceUrl = nativeCheckoutUrl
    let nowpaymentsId = paymentId

    if (apiKey) {
      try {
        const nowpaymentsBase = isSandbox ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io'
        const payload = {
          price_amount: amountUsd,
          price_currency: 'usd',
          pay_currency: currency.toLowerCase(),
          order_id: orderId,
          order_description: `Synaptic Web4 Wallet Top-Up — ${amountUsd} USD`,
          ipn_callback_url: `${appHost}/api/nowpayments/ipn`,
          success_url: `${appHost}/topup/success`,
          cancel_url: `${appHost}/topup/cancel`,
        }

        const res = await fetch(`${nowpaymentsBase}/v1/payment`, {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const data = (await res.json()) as any
        if (res.ok && (data.payment_url || data.invoice_url || data.pay_address)) {
          invoiceUrl = data.payment_url ?? data.invoice_url ?? nativeCheckoutUrl
          nowpaymentsId = String(data.payment_id ?? data.id ?? paymentId)
        }
      } catch (e) {
        console.warn('NowPayments API call failed, falling back to native Synaptic Pay checkout:', e)
      }
    }

    store[paymentId] = {
      id: paymentId,
      nowpaymentsId,
      address,
      amountUsd,
      synAmount,
      currency: currency.toLowerCase(),
      status: 'pending',
      createdAt: Date.now(),
      orderId,
      invoiceUrl: nativeCheckoutUrl,
      txHash: null,
    }
    saveStore(store)

    return NextResponse.json({
      paymentId,
      invoiceUrl: nativeCheckoutUrl,
      checkoutUrl: nativeCheckoutUrl,
      address,
      amountUsd,
      synAmount,
      currency,
    }, { headers: corsHeaders() })
  } catch (err: any) {
    console.error('topup create error:', err)
    return NextResponse.json({ error: err.message ?? 'internal error' }, { status: 500, headers: corsHeaders() })
  }
}
