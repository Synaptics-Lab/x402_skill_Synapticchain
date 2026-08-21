/**
 * OKX Market Ticker API Proxy Route.
 *
 *   GET /api/okx/ticker?pair=BTC-USDT
 */

import { NextRequest, NextResponse } from 'next/server'
import { okxClient } from '../../../../lib/okx'

export const dynamic = 'force-dynamic'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

export async function GET(req: NextRequest) {
  try {
    const pair = req.nextUrl.searchParams.get('pair') || 'BTC-USDT'
    const ticker = await okxClient.getTicker(pair)
    return NextResponse.json({ ok: true, ticker }, { headers: corsHeaders() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'okx ticker error' }, { status: 500, headers: corsHeaders() })
  }
}
