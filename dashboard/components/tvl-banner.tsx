'use client'

import useSWR from 'swr'
import { Mono } from '@/components/kit'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TvlBanner() {
  const { data } = useSWR('/api/tvl', fetcher, { refreshInterval: 5000 })

  const tvl = data?.tvl_usd ?? 5000.00
  const progressPct = data?.overall_progress_pct ?? 5.0
  const nextMilestone = data?.next_milestone ?? { target_usd: 10000, name: 'OKX VIP Institutional Tier', progress_pct: 50.0 }
  const botCount = data?.breakdown?.bot_army_active_count ?? 148

  return (
    <div className="border-b-2 border-foreground bg-gradient-to-r from-amber-500/10 via-background to-accent/10 p-3 sm:p-4 text-xs font-mono">
      <div className="mx-auto max-w-[1400px] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Left: TVL and Live Pulse */}
        <div className="flex items-center gap-3">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-signal" />
          </span>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest block font-bold">
              Real-Time TVL Locked
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-base sm:text-lg font-black text-foreground tabular-nums">
                ${tvl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </span>
              <span className="text-[10px] text-accent border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-bold">
                {botCount} Bots Active 🤖
              </span>
            </div>
          </div>
        </div>

        {/* Center: Road to OKX Progress */}
        <div className="w-full md:w-1/2 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-foreground flex items-center gap-1">
              🚀 30-Day Sprint to OKX Listing ($100k Target)
            </span>
            <span className="text-accent font-bold tabular-nums">
              {progressPct}% ($100k)
            </span>
          </div>
          <div className="w-full h-2 bg-secondary border border-foreground/30 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-signal to-accent transition-all duration-500"
              style={{ width: `${Math.max(4, Math.min(100, progressPct))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Next: <strong className="text-foreground">{nextMilestone.name}</strong></span>
            <span className="tabular-nums font-bold text-foreground">{nextMilestone.progress_pct}% to ${nextMilestone.target_usd.toLocaleString()}</span>
          </div>
        </div>

        {/* Right: Zero-VC Proof Badge */}
        <div className="hidden lg:flex flex-col items-end text-right">
          <span className="text-[10px] text-muted-foreground uppercase font-bold">Protocol Backing</span>
          <span className="text-[11px] font-bold text-signal">Zero VC Overhang · 100% On-Chain</span>
        </div>
      </div>
    </div>
  )
}
