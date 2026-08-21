/**
 * Agent trading positions for the Web4 wallet trades screen.
 *
 * Reads real positions from the dashboard polymarket snapshot filtered by the
 * provided address (as trader or bot owner). Falls back to an empty list if no
 * positions are found.
 *
 *   GET /api/trades?address=syn1...
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR ?? '/opt/synapticchain/dashboard/data'

function readSnapshot(): { markets?: any[] } {
  try {
    const p = path.join(SNAPSHOT_DIR, 'polymarket_markets.json')
    if (!fs.existsSync(p)) return {}
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ p, 'utf8'))
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address') ?? ''
  if (!address || !/^syn1[a-z0-9]{38,42}$/.test(address)) {
    return NextResponse.json({ error: 'valid address required' }, { status: 400 })
  }

  const snapshot = readSnapshot()
  const trades: {
    id: string
    pair: string
    side: 'buy' | 'sell'
    amount: number
    price: number
    pnl: number
    status: 'open' | 'closed'
    openedAt: string
  }[] = []

  const lower = address.toLowerCase()
  for (const market of snapshot.markets ?? []) {
    for (const pos of market.positions ?? []) {
      const bot = String(pos.bot ?? '').toLowerCase()
      if (bot !== lower) continue
      const current = Number(pos.currentValue ?? 0)
      const entry = Number(pos.size ?? 0) * Number(pos.entryOdds ?? 0)
      const pnl = entry > 0 ? ((current - entry) / entry) * 100 : 0
      trades.push({
        id: pos.id,
        pair: `${market.type ?? 'SYN'}/${market.category ?? 'USD'}`,
        side: (pos.side?.toLowerCase() === 'no' ? 'sell' : 'buy') as 'buy' | 'sell',
        amount: Number(pos.size ?? 0),
        price: Number(pos.currentValue ?? 0),
        pnl: Number(pnl.toFixed(2)),
        status: market.status?.toLowerCase() === 'closed' ? 'closed' : 'open',
        openedAt: pos.placedAt ?? market.createdAt ?? new Date().toISOString(),
      })
    }
  }

  return NextResponse.json({ trades })
}
