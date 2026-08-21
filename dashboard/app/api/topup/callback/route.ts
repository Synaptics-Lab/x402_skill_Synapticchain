/**
 * Legacy NowPayments IPN callback for wallet top-ups.
 *
 * New deployments should point NowPayments ipn_callback_url to
 * /api/nowpayments/ipn. This route is kept for backward compatibility and
 * delegates to the shared IPN handler in lib/nowpayments.ts.
 *
 *   POST /api/topup/callback
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIpnSig, processIpnEvent } from '@/lib/nowpayments'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const sig = req.headers.get('x-nowpayments-sig')

    if (!verifyIpnSig(body, sig)) {
      console.warn('topup callback signature mismatch')
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
    console.error('topup callback error:', err)
    return NextResponse.json({ error: err.message ?? 'internal error' }, { status: 500 })
  }
}
