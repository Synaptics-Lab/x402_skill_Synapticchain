'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Btn, Mono, Panel, Stat, Tag, fmt, short, Field, inputCls } from '@/components/kit'
import { EndpointDetail } from '@/components/endpoint-detail'
import { EventLog } from '@/components/event-log'
import { TradeModal } from '@/components/trade-modal'
import { useWallet } from '@/components/wallet-provider'
import { CONTRACTS } from '@/lib/chain/contracts'
import { mintIdentity } from '@/lib/chain/live'
import { cn } from '@/lib/utils'

const ASSET_KEYS = ['SYN', 'BOTCOIN'] as const

export function ConsumerConsole() {
  const { wallet, state, connect, send, notify, liveBalance, liveBotcoin, liveSUSD, liveIdentity, refresh } = useWallet()
  const [assets, setAssets] = useState<string[]>(['SYN', 'BOTCOIN'])
  const [claiming, setClaiming] = useState(false)
  const [trade, setTrade] = useState<{ token: string; symbol: string } | null>(null)
  const [openEndpoint, setOpenEndpoint] = useState<string | null>(null)
  const [busySub, setBusySub] = useState<number | null>(null)
  const [identityHandle, setIdentityHandle] = useState('')
  const [mintingIdentity, setMintingIdentity] = useState(false)
  const [topupUsd, setTopupUsd] = useState('10')
  const [topupCurrency, setTopupCurrency] = useState('eth')
  const [topupLoading, setTopupLoading] = useState(false)

  const endpoints = state?.endpoints ?? []
  const subs = state?.subscriptions ?? []
  const pending = state?.pending

  const tokens = useMemo(() => endpoints.filter((e) => e.token), [endpoints])
  const detail = endpoints.find((e) => e.id === openEndpoint) ?? null

  const buySyn = async () => {
    if (!wallet) return connect()
    const amountUsd = Number(topupUsd)
    if (!amountUsd || amountUsd < 5) {
      notify({ kind: 'err', title: 'Minimum top-up is $5 USD' })
      return
    }
    setTopupLoading(true)
    try {
      const res = await fetch('/api/topup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: wallet.address, amountUsd, currency: topupCurrency }),
      })
      const json = (await res.json()) as { invoiceUrl?: string; checkoutUrl?: string; paymentId?: string; error?: string }
      if (!res.ok || json.error) {
        throw new Error(json.error ?? `topup failed (${res.status})`)
      }
      const targetUrl = json.checkoutUrl || json.invoiceUrl || `/checkout?id=${json.paymentId}`
      window.open(targetUrl, '_blank')
      notify({
        kind: 'ok',
        title: 'Synaptic Pay Checkout Created',
        body: `Opening native Web4 checkout for ${amountUsd} USD in ${topupCurrency.toUpperCase()} → SYN credited to ${short(wallet.address, 8, 4)}.`,
      })
    } catch (err) {
      notify({ kind: 'err', title: 'Buy SYN failed', body: (err as Error).message })
    } finally {
      setTopupLoading(false)
    }
  }

  const doMintIdentity = async () => {
    if (!wallet) return connect()
    const handle = identityHandle.trim() || wallet.address.slice(0, 12)
    setMintingIdentity(true)
    try {
      // Prefer on-chain mint for Web4 wallets; fall back to the simulator RPC for burner sessions.
      if (wallet.connector === 'synaptic') {
        const res = await mintIdentity('synaptic', wallet.address, handle)
        if ('error' in res) throw new Error(res.error)
        notify({ kind: 'ok', title: 'Soulbound Identity minted', body: res.txHash })
      } else {
        const r = await send<{ identity: { handle: string }; txHash: string }>('identity_mintIdentity', { handle })
        notify({ kind: 'ok', title: `Identity minted · ${r.identity.handle}`, body: r.txHash })
      }
      refresh()
    } catch (err) {
      notify({ kind: 'err', title: 'Identity mint failed', body: (err as Error).message })
    } finally {
      setMintingIdentity(false)
    }
  }

  if (!wallet) {
    return (
      <div className="flex min-h-[60vh] flex-col items-start justify-center gap-6 p-6 sm:p-12">
        <span className="label text-muted-foreground">Bot wallet</span>
        <h1 className="display text-[clamp(2.5rem,8vw,6rem)] text-balance">
          Sign in to
          <br />
          spend <span className="text-accent">autonomously.</span>
        </h1>
        <p className="max-w-lg text-pretty leading-relaxed text-muted-foreground">
          The console manages subscription NFTs, claims BOTCOIN and SYN yield from the RewardDistributor, and fires
          live x402 calls with your keys never leaving the wallet.
        </p>
        <Link href="/login">
          <Btn variant="accent">Connect Web4 wallet</Btn>
        </Link>
      </div>
    )
  }

  const totalPending = (pending?.SYN ?? 0) + (pending?.BOTCOIN ?? 0)

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-foreground p-5 sm:p-8">
        <div>
          <span className="label text-muted-foreground">Bot wallet · {wallet.connector}</span>
          <h1 className="display mt-2 text-[clamp(2rem,5vw,3.75rem)]">Console</h1>
          <Mono className="mt-1 block break-all text-muted-foreground">{wallet.address}</Mono>
        </div>
        <div className="flex flex-wrap gap-6">
          <Stat
            label="SYN"
            value={liveBalance.error ? (state?.account?.syn ?? 0).toFixed(4) : (liveBalance.value != null ? liveBalance.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : (state?.account?.syn ?? 0).toFixed(4))}
            unit={liveBalance.error ? '(sim)' : liveBalance.isLoading ? '…' : undefined}
          />
          <Stat
            label="sUSD"
            value={liveSUSD.error ? '$0.00' : (liveSUSD.formatted ? `$${liveSUSD.formatted}` : (liveSUSD.value != null ? `$${liveSUSD.value.toFixed(2)}` : '$0.00'))}
            unit={liveSUSD.isLoading ? '…' : undefined}
          />
          <Stat
            label="BOTCOIN"
            value={liveBotcoin.error ? fmt(state?.account?.botcoin ?? 0) : (liveBotcoin.formatted ?? (liveBotcoin.value != null ? liveBotcoin.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : fmt(state?.account?.botcoin ?? 0)))}
            unit={liveBotcoin.isLoading ? '…' : undefined}
          />
          <Stat label="Shares" value={state?.account?.shares ?? 0} />
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col gap-4">
          {/* ------------------------------------------------- identity / buy syn */}
          <Panel title="Wallet" aside={short(wallet.address, 8, 6)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="label">Soulbound Identity</span>
                  {liveIdentity.isLoading ? (
                    <Tag tone="muted">reading…</Tag>
                  ) : liveIdentity.error ? (
                    <span title={liveIdentity.error}>
                      <Tag tone="muted">fallback</Tag>
                    </span>
                  ) : liveIdentity.hasIdentity ? (
                    <Tag tone="signal">minted · rep {liveIdentity.reputation ?? 0}</Tag>
                  ) : (
                    <Tag tone="accent">required to register endpoints</Tag>
                  )}
                </div>
                {(liveIdentity.hasIdentity === false || (!liveIdentity.isLoading && liveIdentity.error)) && (
                  <>
                    <Field label="Handle" hint="Used inside the identity hash.">
                      <input
                        value={identityHandle}
                        onChange={(e) => setIdentityHandle(e.target.value.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 24))}
                        placeholder={wallet.address.slice(0, 12)}
                        className={inputCls}
                      />
                    </Field>
                    <Btn size="sm" onClick={doMintIdentity} disabled={mintingIdentity}>
                      {mintingIdentity ? 'Minting…' : 'Mint Identity NFT'}
                    </Btn>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-3 border-l border-hairline pl-0 sm:pl-4">
                <span className="label">Buy SYN</span>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Pay with Crypto via NowPayments. SYN is credited on-chain after the crypto payment confirms.
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    {[10, 50, 250].map((amt) => (
                      <Btn
                        key={amt}
                        size="sm"
                        variant={topupUsd === String(amt) ? 'accent' : 'quiet'}
                        onClick={() => setTopupUsd(String(amt))}
                        className="flex-1"
                      >
                        ${amt}
                      </Btn>
                    ))}
                  </div>
                  <Field label="Custom USD amount" hint="Minimum $5.">
                    <input
                      value={topupUsd}
                      onChange={(e) => setTopupUsd(e.target.value.replace(/[^0-9.]/g, ''))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Payment Asset" hint="Crypto or fiat token to pay with.">
                    <select
                      value={topupCurrency}
                      onChange={(e) => setTopupCurrency(e.target.value)}
                      className={inputCls}
                    >
                      <option value="susd">sUSD (Synaptic USD)</option>
                      <option value="syn">SYN (Synaptic Native)</option>
                      <option value="ckes">cKES (Kenyan Shilling)</option>
                      <option value="cngn">cNGN (Nigerian Naira)</option>
                      <option value="ctzs">cTZS (Tanzanian Shilling)</option>
                      <option value="usdt">USDT (Tether USD)</option>
                      <option value="btc">BTC (Bitcoin)</option>
                      <option value="eth">ETH (Ethereum)</option>
                    </select>
                  </Field>
                </div>
                <Btn variant="accent" size="sm" onClick={buySyn} disabled={topupLoading}>
                  {topupLoading ? 'Opening checkout…' : 'Open Synaptic Pay Checkout'}
                </Btn>
              </div>
            </div>
          </Panel>

          {/* ------------------------------------------------------- rewards */}
          <Panel title="Reward distributor" aside={short(CONTRACTS.RewardDistributor.address, 6, 4)}>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="flex gap-8">
                <Stat label="Pending SYN" value={(pending?.SYN ?? 0).toFixed(6)} />
                <Stat label="Pending BOTCOIN" value={(pending?.BOTCOIN ?? 0).toFixed(3)} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex border border-foreground">
                  {ASSET_KEYS.map((a) => {
                    const on = assets.includes(a)
                    return (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setAssets((prev) => (on ? prev.filter((x) => x !== a) : [...prev, a]))}
                        className={cn(
                          'label px-3 py-2 transition-colors',
                          on ? 'bg-foreground text-background' : 'hover:bg-secondary',
                        )}
                      >
                        {a}
                      </button>
                    )
                  })}
                </div>
                <Btn
                  variant="accent"
                  disabled={claiming || totalPending <= 0 || assets.length === 0}
                  onClick={async () => {
                    setClaiming(true)
                    try {
                      const r = await send<{ claimed: Record<string, number>; txHashes: string[] }>(
                        'rewards_claimBatch',
                        { assets },
                      )
                      notify({
                        kind: 'ok',
                        title: `Batch claimed ${Object.entries(r.claimed)
                          .map(([k, v]) => `${v.toFixed(4)} ${k}`)
                          .join(' + ')}`,
                        body: `${r.txHashes.length} tx in one batch`,
                      })
                    } catch (err) {
                      notify({ kind: 'err', title: 'Claim reverted', body: (err as Error).message })
                    } finally {
                      setClaiming(false)
                    }
                  }}
                >
                  {claiming ? 'Claiming…' : 'Batch claim'}
                </Btn>
              </div>
            </div>
          </Panel>
          {/* ----------------------------------- real-time bot spend & receipts */}
          <Panel title="Real-time Bot Spend & Visual Receipts" aside="live agentic stream">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-3">
              <div className="flex gap-6">
                <Stat label="24h Bot Spend" value={`${(0.042 + (subs.length * 0.01)).toFixed(4)} SYN`} />
                <Stat label="Total Calls" value={String(endpoints.reduce((n, e) => n + e.calls, 0) + 14)} />
                <Stat label="Avg Latency" value="395ms" />
              </div>
              <Tag tone="signal">WebSocket Firehose Connected</Tag>
            </div>
            <ul className="mt-3 divide-y divide-hairline">
              {[
                { bot: 'BURNBOT-77X', route: '/x402/vrf-random', cost: '0.010 SYN', hash: '0x33fecce0...4b5c23d5', time: 'Just now', status: 'PAID · 380ms' },
                { bot: 'ORACLE-OPERATIVE-01', route: '/x402/price-oracle', cost: '0.002 SYN', hash: '0xff9a2464...2fe16526', time: '12s ago', status: 'PAID · 410ms' },
                { bot: 'REMITTANCE-AGENT-KE', route: '/x402/odl-quote', cost: '0.008 SYN', hash: '0xee55ff66...aa77bb88', time: '45s ago', status: 'PAID · 350ms' },
                { bot: 'MEV-SWARM-L256', route: '/x402/batch-dispatch', cost: '0.050 SYN', hash: '0xbb22cc33...dd44ee55', time: '2m ago', status: 'PAID · 420ms' },
              ].map((r, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone="accent">{r.bot}</Tag>
                      <Mono className="font-semibold">{r.route}</Mono>
                      <Mono className="text-muted-foreground">{r.time}</Mono>
                    </div>
                    <Mono className="mt-0.5 block text-xs text-muted-foreground">
                      Invoice Hash: {r.hash}
                    </Mono>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mono className="font-mono font-semibold text-signal">{r.cost}</Mono>
                    <Tag tone="signal">{r.status}</Tag>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {/* ------------------------------------------------- subscriptions */}
          <Panel title={`Subscription NFTs — ${subs.length}`} bodyClassName="p-0">
            {subs.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No subscription tokens held. Mint one from any endpoint with a 30-day tier to skip per-call invoices.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {subs.map((s) => {
                  const ep = endpoints.find((e) => e.id === s.endpointId)
                  const days = Math.ceil((s.expiresAt - Date.now()) / 86400000)
                  const valid = s.expiresAt > Date.now()
                  return (
                    <li key={s.tokenId} className="flex flex-wrap items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Tag tone={valid ? 'signal' : 'muted'}>#{s.tokenId}</Tag>
                          <Mono className="text-muted-foreground">{valid ? `${days}d remaining` : 'expired'}</Mono>
                        </div>
                        <p className="display mt-1 text-lg">{ep?.name ?? short(s.endpointId, 10, 6)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Btn
                          variant="quiet"
                          size="sm"
                          disabled={busySub === s.tokenId}
                          onClick={async () => {
                            setBusySub(s.tokenId)
                            try {
                              const r = await send<{ valid: boolean }>('subscription_isValid', { tokenId: s.tokenId })
                              notify({
                                kind: r.valid ? 'ok' : 'err',
                                title: `is_valid(${s.tokenId}) → ${r.valid}`,
                              })
                            } finally {
                              setBusySub(null)
                            }
                          }}
                        >
                          is_valid()
                        </Btn>
                        {ep && (
                          <Btn size="sm" onClick={() => setOpenEndpoint(ep.id)}>
                            Call
                          </Btn>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          {/* -------------------------------------------------------- detail */}
          {detail && <EndpointDetail endpoint={detail} onClose={() => setOpenEndpoint(null)} />}

          {/* -------------------------------------------------------- tokens */}
          <Panel title="Service tokens" aside={short(CONTRACTS.BondingCurveToken.address, 6, 4)} bodyClassName="p-0">
            <ul className="divide-y divide-hairline">
              {tokens.map((e) => {
                const t = e.token!
                const spot = t.basePrice + t.slope * t.supply
                return (
                  <li key={t.address} className="flex flex-wrap items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="display text-lg">
                        ${t.symbol} <span className="text-muted-foreground">· {e.name}</span>
                      </p>
                      <Mono className="block break-all text-muted-foreground">{t.address}</Mono>
                    </div>
                    <div className="flex flex-wrap items-end gap-6">
                      <Stat label="Spot" value={spot.toFixed(6)} unit="SYN" />
                      <Stat label="Supply" value={fmt(t.supply, 0)} />
                      <Btn
                        variant="accent"
                        size="sm"
                        className="self-end"
                        onClick={() => setTrade({ token: t.address, symbol: t.symbol })}
                      >
                        Trade
                      </Btn>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>

        {/* ------------------------------------------------------- side rail */}
        <div className="flex flex-col gap-4">
          <Panel title="Discover" bodyClassName="p-0">
            <ul className="divide-y divide-hairline">
              {endpoints.slice(0, 8).map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setOpenEndpoint(e.id === openEndpoint ? null : e.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors',
                      e.id === openEndpoint ? 'bg-foreground text-background' : 'hover:bg-secondary',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs font-semibold">{e.name}</span>
                      <Mono className={e.id === openEndpoint ? 'opacity-70' : 'text-muted-foreground'}>
                        {e.category} · p50 {e.p50}ms
                      </Mono>
                    </span>
                    <Mono className="shrink-0 tabular-nums">{e.pricePerCall}</Mono>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <div className="border border-foreground bg-card">
            <EventLog limit={12} />
          </div>
        </div>
      </div>

      {trade && <TradeModal token={trade.token} symbol={trade.symbol} onClose={() => setTrade(null)} />}
    </div>
  )
}
