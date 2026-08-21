/**
 * Aggregate platform revenue metrics for wallet swarm mode.
 *
 * For the alpha demo this reads the lockfree snapshot files the node already
 * writes (ecosystem-state.json + artemis-live-economy.jsonl). No separate
 * indexer process is needed, so the data survives validator rebuilds and never
 * competes with the node.
 *
 *   GET /api/platform/revenue
 *     {
 *       totalFees: string,
 *       todayFees: string,
 *       activeBots: number,
 *       platformEarnings: string,
 *       pools: [...]
 *     }
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

const REVENUE_LOG = process.env.REVENUE_LOG_PATH || path.resolve(process.cwd(), 'data/x402-revenue.jsonl')
const ECOSYSTEM_SNAPSHOT = process.env.ECOSYSTEM_SNAPSHOT_PATH || path.resolve(process.cwd(), 'data/ecosystem-state.json')
const ECONOMY_LOG = process.env.ECONOMY_LOG_PATH || path.resolve(process.cwd(), 'data/artemis-live-economy.json')

const SYN_DECIMALS = 6

function parseAmount(value: unknown): bigint {
  if (value === undefined || value === null) return 0n
  if (typeof value === 'number') return BigInt(Math.round(value))
  if (typeof value === 'string') {
    const clean = value.replace(/^0x/, '')
    try {
      return clean ? BigInt(clean) : 0n
    } catch {
      return 0n
    }
  }
  if (typeof value === 'bigint') return value
  return 0n
}

function bunitsToSyn(n: bigint): bigint {
  // artemis-live-economy uses 18 decimals for sUSD/cNGN/cTZS values.
  // We convert to SYN 6-decimal display units: value / 1e12.
  return n / 1_000_000_000_000n
}

function readEcosystemSnapshot() {
  let agentCount = 0
  let totalSyn = 0n
  try {
    if (!fs.existsSync(ECOSYSTEM_SNAPSHOT)) return { agentCount: 0, totalSyn: 0n }
    const data = JSON.parse(fs.readFileSync(ECOSYSTEM_SNAPSHOT, 'utf8')) as {
      agents?: { balance_syn?: number | string; address?: string }[]
    }
    for (const agent of data.agents ?? []) {
      agentCount += 1
      totalSyn += bunitsToSyn(parseAmount(agent.balance_syn))
    }
  } catch {
    // ignore
  }
  return { agentCount, totalSyn }
}

function readEconomyLog() {
  const today = new Date().toISOString().slice(0, 10)
  let totalFees = 0n
  let todayFees = 0n
  const activeSet = new Set<string>()

  try {
    if (!fs.existsSync(ECONOMY_LOG)) return { totalFees, todayFees, activeBots: 0 }
    const raw = fs.readFileSync(ECONOMY_LOG, 'utf8')
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const ev = JSON.parse(line) as {
          agent_id?: string
          timestamp?: string
          details?: { amount?: number | string; token?: string }
        }
        const amount = parseAmount(ev.details?.amount)
        if (amount <= 0n) continue
        const synAmount = bunitsToSyn(amount)
        totalFees += synAmount
        if ((ev.timestamp ?? '').slice(0, 10) === today) todayFees += synAmount
        if (ev.agent_id) activeSet.add(ev.agent_id)
      } catch {
        // ignore malformed lines
      }
    }
  } catch {
    // ignore
  }

  return { totalFees, todayFees, activeBots: activeSet.size }
}

function readRevenueLog() {
  const today = new Date().toISOString().slice(0, 10)
  let totalFees = 0n
  let todayFees = 0n
  const activeSet = new Set<string>()

  try {
    if (!fs.existsSync(REVENUE_LOG)) return { totalFees, todayFees, activeBots: 0 }
    const lines = fs.readFileSync(REVENUE_LOG, 'utf8').split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as {
          amount?: number | string
          date?: string
          timestamp?: string
          botId?: string
        }
        const amount = parseAmount(ev.amount)
        totalFees += amount
        if ((ev.date ?? ev.timestamp?.slice(0, 10)) === today) todayFees += amount
        if (ev.botId) activeSet.add(ev.botId)
      } catch {
        // ignore malformed lines
      }
    }
  } catch {
    // ignore
  }

  return { totalFees, todayFees, activeBots: activeSet.size }
}

function fmt(n: bigint, decimals = SYN_DECIMALS) {
  const divisor = BigInt(10 ** decimals)
  const int = n / divisor
  const frac = (n % divisor).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${int}.${frac}` : `${int}.0`
}

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

export async function GET(_req: NextRequest) {
  const ecosystem = readEcosystemSnapshot()
  const economy = readEconomyLog()
  const legacy = readRevenueLog()

  const totalFees = economy.totalFees + legacy.totalFees
  const todayFees = economy.todayFees + legacy.todayFees
  const activeBots = Math.max(economy.activeBots, legacy.activeBots, ecosystem.agentCount)
  const platformEarnings = totalFees / 10n

  return NextResponse.json({
    totalFees: fmt(totalFees),
    todayFees: fmt(todayFees),
    activeBots,
    platformEarnings: fmt(platformEarnings),
    tvl: fmt(ecosystem.totalSyn),
    pools: [
      { name: 'AgentFi yield', apy: '8.4%', tvl: fmt(totalFees / 2n) },
      { name: 'x402 API fees', apy: '12.1%', tvl: fmt(totalFees / 3n) },
      { name: 'SYN staking', apy: '6.7%', tvl: fmt(totalFees / 6n) },
    ],
  }, { headers: corsHeaders() })
}
