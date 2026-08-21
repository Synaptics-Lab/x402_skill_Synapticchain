/**
 * Canonical NowPayments IPN endpoint.
 *
 * Receives asynchronous payment notifications from NowPayments, verifies the
 * HMAC signature using NOWPAYMENTS_IPN_SECRET, and credits SYN for matching
 * wallet top-up records stored in .topup-payments.json.
 *
 *   POST /api/nowpayments/ipn
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIpnSig, processIpnEvent } from '@/lib/nowpayments'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const sig = req.headers.get('x-nowpayments-sig')

    if (!verifyIpnSig(body, sig)) {
      console.warn('NowPayments IPN signature mismatch')
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const event = JSON.parse(body)
    const result = processIpnEvent(event)

    if (result.error && !result.received) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      received: true,
      status: result.status,
      txHash: result.txHash ?? null,
    })
  } catch (err: any) {
    console.error('nowpayments ipn error:', err)
    return NextResponse.json({ error: err.message ?? 'internal error' }, { status: 500 })
  }
}
