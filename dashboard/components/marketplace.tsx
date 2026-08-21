'use client'

import { useMemo, useState } from 'react'
import { Btn, Mono, Tag, fmt, short } from '@/components/kit'
import { EndpointDetail } from '@/components/endpoint-detail'
import { useWallet } from '@/components/wallet-provider'
import { cn } from '@/lib/utils'
import type { Endpoint } from '@/lib/chain/types'

type Sort = 'volume' | 'cheapest' | 'fastest' | 'newest'

const SORTS: { key: Sort; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'cheapest', label: 'Cheapest' },
  { key: 'fastest', label: 'Fastest' },
  { key: 'newest', label: 'Newest' },
]

function Row({
  endpoint,
  active,
  handle,
  onSelect,
  live,
  'data-testid': testId,
}: {
  endpoint: Endpoint
  active: boolean
  handle: string | null
  live: boolean
  onSelect: () => void
  'data-testid'?: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        'group flex w-full flex-col gap-2 border-b border-hairline p-4 text-left transition-colors',
        active ? 'bg-foreground text-background' : 'hover:bg-secondary',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag className={active ? 'border-background text-background' : undefined}>{endpoint.category}</Tag>
            <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>{endpoint.method}</Mono>
            {endpoint.token && (
              <Mono className={active ? 'opacity-70' : 'text-accent'}>${endpoint.token.symbol}</Mono>
            )}
            {!live && (
              <Tag tone={active ? 'muted' : 'accent'} className="text-[10px]">offchain</Tag>
            )}
          </div>
          <h3 className="display mt-1.5 text-xl">{endpoint.name}</h3>
          <Mono className={cn('mt-1 block', active ? 'opacity-70' : 'text-muted-foreground')}>
            {handle ?? short(endpoint.provider, 8, 4)}
          </Mono>
        </div>
        <div className="shrink-0 text-right">
          <span className="block font-mono text-lg font-semibold tabular-nums">{endpoint.pricePerCall}</span>
          <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>SYN / call</Mono>
        </div>
      </div>
      <p className={cn('line-clamp-2 text-sm leading-relaxed', active ? 'opacity-80' : 'text-muted-foreground')}>
        {endpoint.description}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>p50 {endpoint.p50}ms</Mono>
        <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>{fmt(endpoint.calls, 0)} calls</Mono>
        <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>{fmt(endpoint.lifetime)} SYN settled</Mono>
        {endpoint.subFee > 0 && (
          <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>sub {endpoint.subFee} SYN</Mono>
        )}
      </div>
    </button>
  )
}

export function Marketplace() {
  const { state, liveHealth } = useWallet()
  const [sort, setSort] = useState<Sort>('volume')
  const [cat, setCat] = useState<string>('All')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const gatewayPriceMap = useMemo(() => {
    const map = new Map<string, { price: number; route: string; onGateway: true }>()
    for (const ep of liveHealth.endpoints) {
      map.set(ep.id.toLowerCase(), { price: ep.price, route: ep.route, onGateway: true })
    }
    return map
  }, [liveHealth.endpoints])

  const liveIds = useMemo(() => new Set(gatewayPriceMap.keys()), [gatewayPriceMap])

  const endpoints = useMemo(() => {
    return (state?.endpoints ?? []).map((e) => {
      const gw = gatewayPriceMap.get(e.id.toLowerCase())
      return {
        ...e,
        pricePerCall: gw?.price ?? e.pricePerCall,
        // uptime heuristic: if gateway lists it, treat as online
        uptime: gw ? Math.max(e.uptime, 99) : e.uptime,
      }
    })
  }, [state?.endpoints, gatewayPriceMap])
  const cats = useMemo(() => ['All', ...new Set(endpoints.map((e) => e.category))], [endpoints])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = endpoints.filter(
      (e) =>
        (cat === 'All' || e.category === cat) &&
        (!needle || `${e.name} ${e.description} ${e.category}`.toLowerCase().includes(needle)),
    )
    const sorted = [...filtered]
    if (sort === 'volume') sorted.sort((a, b) => b.lifetime - a.lifetime)
    if (sort === 'cheapest') sorted.sort((a, b) => a.pricePerCall - b.pricePerCall)
    if (sort === 'fastest') sorted.sort((a, b) => (a.p50 || 9999) - (b.p50 || 9999))
    if (sort === 'newest') sorted.sort((a, b) => b.createdAt - a.createdAt)
    return sorted
  }, [endpoints, cat, q, sort])

  const current = list.find((e) => e.id === selected) ?? null

  return (
    <section id="market" className="border-t-2 border-foreground">
      <div className="flex flex-wrap items-center gap-3 border-b border-foreground px-4 py-3">
        <h2 className="display mr-auto text-2xl">Registry</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search endpoints"
          aria-label="Search endpoints"
          className="h-9 w-full max-w-52 border border-foreground bg-background px-3 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-accent"
        />
        <div className="flex flex-wrap items-stretch border border-foreground">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={cn(
                'label px-3 py-2 transition-colors',
                sort === s.key ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-hairline bg-secondary px-4 py-2">
        <Mono className="text-muted-foreground">
          {liveHealth.error
            ? `Gateway unreachable — showing cached registry. ${liveHealth.error}`
            : liveIds.size > 0
              ? `Alpha testnet: ${liveIds.size} live endpoint${liveIds.size === 1 ? '' : 's'} discovered from gateway.`
              : 'Alpha testnet: gateway reachable but no live endpoints reported.'}
        </Mono>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-hairline px-4 py-2 no-scrollbar">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cn(
              'label shrink-0 border px-2.5 py-1 transition-colors',
              cat === c ? 'border-foreground bg-foreground text-background' : 'border-hairline hover:border-foreground',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {current && (
        <div className="border-b-2 border-foreground p-4">
          <EndpointDetail endpoint={current} onClose={() => setSelected(null)} />
        </div>
      )}

      <div className="grid lg:grid-cols-2">
        {list.map((e) => (
          <Row
            key={e.id}
            endpoint={e}
            active={e.id === selected}
            handle={state?.identities.find((i) => i.owner === e.provider)?.handle ?? null}
            live={liveIds.has(e.id.toLowerCase())}
            onSelect={() => setSelected(e.id === selected ? null : e.id)}
            data-testid="endpoint-row"
          />
        ))}
        {list.length === 0 && (
          <div className="col-span-full flex flex-col items-start gap-3 p-8">
            <p className="display text-2xl">No endpoints match</p>
            <Btn
              variant="quiet"
              size="sm"
              onClick={() => {
                setQ('')
                setCat('All')
              }}
            >
              Reset filters
            </Btn>
          </div>
        )}
      </div>
    </section>
  )
}
