import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const baseSeedUsd = 5000.00
    let settledInflowsUsd = 0.0

    // Read settled presale invoices
    const invoicesPath = path.resolve(process.cwd(), '../contracts/production/presale-invoices.json')
    if (fs.existsSync(invoicesPath)) {
      try {
        const raw = fs.readFileSync(invoicesPath, 'utf8')
        const invoices = JSON.parse(raw)
        for (const inv of Object.values(invoices) as any[]) {
          if (inv.status === 'SETTLED_CONFIRMED' || inv.status === 'SETTLED') {
            settledInflowsUsd += Number(inv.price_usd || 0)
          }
        }
      } catch (e) {}
    }

    // Read FOMO pot
    let fomoPotUsd = 0.0
    const fomoPath = path.resolve(process.cwd(), '../contracts/production/onchain-fomo-state.json')
    if (fs.existsSync(fomoPath)) {
      try {
        const raw = fs.readFileSync(fomoPath, 'utf8')
        const fomo = JSON.parse(raw)
        fomoPotUsd = Number(fomo.jackpot_pot_syn || 0) * 0.75
      } catch (e) {}
    }

    const totalTvlUsd = Number((baseSeedUsd + settledInflowsUsd + fomoPotUsd).toFixed(2))
    const targetListingUsd = 250000.00
    const overallProgressPct = Number(((totalTvlUsd / targetListingUsd) * 100).toFixed(2))

    const milestones = [
      { target_usd: 25000.00, name: 'Milestone 1: OKX VIP Institutional API & Account Manager', achieved: totalTvlUsd >= 25000.00 },
      { target_usd: 75000.00, name: 'Milestone 2: OKX Web3 Wallet & DEX Aggregator Integration', achieved: totalTvlUsd >= 75000.00 },
      { target_usd: 150000.00, name: 'Milestone 3: Fast-Track OKX Ventures Ecosystem Grant & AMM Seeding', achieved: totalTvlUsd >= 150000.00 },
      { target_usd: 250000.00, name: 'Milestone 4 (Day 30): Official OKX Spot Listing ($BOTCOIN/USDT & SYN/USDT)', achieved: totalTvlUsd >= 250000.00 },
    ]

    const nextMilestone = milestones.find((m) => !m.achieved) || milestones[milestones.length - 1]
    const nextProgressPct = Number((Math.min(100, (totalTvlUsd / nextMilestone.target_usd) * 100)).toFixed(2))

    return NextResponse.json({
      success: true,
      campaign: 'OKX March to $250,000 TVL Sprint',
      tvl_usd: totalTvlUsd,
      breakdown: {
        base_liquidity_reserve_usd: baseSeedUsd,
        settled_okx_inflows_usd: Number(settledInflowsUsd.toFixed(2)),
        fomo_jackpot_pot_usd: Number(fomoPotUsd.toFixed(2)),
        bot_army_active_count: 148
      },
      target_listing_usd: targetListingUsd,
      overall_progress_pct: overallProgressPct,
      days_remaining: 30,
      next_milestone: {
        target_usd: nextMilestone.target_usd,
        name: nextMilestone.name,
        progress_pct: nextProgressPct
      },
      milestones,
      manifesto: 'The first decentralized token in history launched, funded, and operated by an autonomous army of AI bots on SynapticChain L1. Zero VC overhead, pure mathematical liquidity.'
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
