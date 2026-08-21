'use client'

import { useState } from 'react'
import { Btn, Mono, Rule, Tag, fmt, inputCls, short } from '@/components/kit'
import { TradeModal } from '@/components/trade-modal'
import { X402Runner } from '@/components/x402-runner'
import { useWallet } from '@/components/wallet-provider'
import { CONTRACTS } from '@/lib/chain/contracts'
import type { Endpoint, Identity } from '@/lib/chain/types'

function curvePrice(t: NonNullable<Endpoint['token']>) {
  return t.basePrice + t.slope * t.supply
}

export function EndpointDetail({ endpoint, onClose }: { endpoint: Endpoint; onClose?: () => void }) {
  const { wallet, state, send, notify, connect, liveHealth } = useWallet()
  const gatewayEp = liveHealth.endpoints.find((e) => e.id.toLowerCase() === endpoint.id.toLowerCase())
  const [trading, setTrading] = useState(false)
  const [amount, setAmount] = useState('250')
  const [busy, setBusy] = useState<string | null>(null)
  const [subReceipt, setSubReceipt] = useState<{
    tokenId: number
    txHash: string
    block?: number
    cost: number
    payer: string
  } | null>(null)

  const provider: Identity | undefined = state?.identities.find((i) => i.owner === endpoint.provider)
  const sub = state?.subscriptions.find((s) => s.endpointId === endpoint.id && s.expiresAt > Date.now())

  async function act(key: string, fn: () => Promise<void>) {
    if (!wallet) return connect()
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      notify({ kind: 'err', title: 'Reverted', body: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const subscribe = () =>
    act('sub', async () => {
      const r = await send<{ subscription: { tokenId: number }; txHash: string; block?: number }>('subscription_mint', {
        endpointId: endpoint.id,
      })
      setSubReceipt({
        tokenId: r.subscription.tokenId,
        txHash: r.txHash,
        block: r.block ?? 7175,
        cost: endpoint.subFee,
        payer: wallet?.address ?? '',
      })
      notify({
        kind: 'ok',
        title: `SubscriptionNFT #${r.subscription.tokenId} minted — 30 day term`,
        body: r.txHash,
      })
    })

  const trade = (side: 'buy' | 'sell') =>
    act(side, async () => {
      const r = await send<{ cost: number; price: number }>('curve_trade', {
        endpointId: endpoint.id,
        side,
        amount: Number(amount),
      })
      notify({
        kind: 'ok',
        title: `${side === 'buy' ? 'Minted' : 'Burned'} ${amount} ${endpoint.token?.symbol}`,
        body: `${side === 'buy' ? 'cost' : 'proceeds'} ${r.cost.toFixed(4)} SYN · spot ${r.price.toFixed(6)}`,
      })
    })

  return (
    <div className="border-2 border-foreground bg-card shadow-[6px_6px_0_0_var(--foreground)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-foreground bg-foreground px-4 py-3 text-background">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="border-background text-background">{endpoint.category}</Tag>
            <Mono className="opacity-70">{endpoint.method}</Mono>
            {gatewayEp ? (
              <Tag tone="signal">gateway online · {gatewayEp.price} SYN</Tag>
            ) : liveHealth.error ? (
              <Tag tone="muted">status unknown</Tag>
            ) : (
              <Tag tone="accent">not in gateway config</Tag>
            )}
          </div>
          <h2 className="display mt-1.5 text-2xl">{endpoint.name}</h2>
        </div>
        {onClose && (
          <Btn variant="accent" size="sm" onClick={onClose}>
            Close
          </Btn>
        )}
      </header>

      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        {/* ------------------------------------------------------------- left */}
        <div className="flex flex-col gap-4 border-hairline p-4 lg:border-r">
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{endpoint.description}</p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {[
              ['Per call', `${endpoint.pricePerCall} SYN`],
              ['Sub / 30d', endpoint.subFee > 0 ? `${endpoint.subFee} SYN` : '—'],
              ['p50', `${endpoint.p50}ms`],
              ['Uptime', `${endpoint.uptime}%`],
              ['Calls', fmt(endpoint.calls, 0)],
              ['Settled', `${fmt(endpoint.lifetime)} SYN`],
              ['Subscribers', String(endpoint.subscribers)],
              ['Registered', new Date(endpoint.createdAt).toISOString().slice(0, 10)],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <dt className="label text-muted-foreground">{k}</dt>
                <dd className="font-mono text-sm font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          <Rule label="provider identity" />

          <div className="flex flex-wrap items-center justify-between gap-3 border border-hairline bg-background p-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2">
                <span className="hatch size-6 border border-foreground" aria-hidden />
                <span className="font-mono text-sm font-semibold">{provider?.handle ?? 'unattested'}</span>
              </span>
              <Mono className="text-muted-foreground">{short(endpoint.provider, 10, 6)}</Mono>
            </div>
            <div className="flex items-end gap-4">
              <div className="text-right">
                <Mono className="block text-muted-foreground">reputation</Mono>
                <span className="font-mono text-xl font-semibold tabular-nums">{provider?.reputation ?? 0}</span>
              </div>
              <div className="text-right">
                <Mono className="block text-muted-foreground">attest</Mono>
                <span className="font-mono text-xl font-semibold tabular-nums">{provider?.attestations ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {endpoint.subFee > 0 &&
              (sub ? (
                <Tag tone="signal">
                  NFT #{sub.tokenId} valid · {Math.ceil((sub.expiresAt - Date.now()) / 86400000)}d left
                </Tag>
              ) : (
                <Btn size="sm" onClick={subscribe} disabled={busy === 'sub'}>
                  {busy === 'sub' ? 'Minting…' : `Subscribe · ${endpoint.subFee} SYN`}
                </Btn>
              ))}
            {endpoint.token && (
              <Btn variant="quiet" size="sm" onClick={() => setTrading(true)}>
                Trade {endpoint.token.symbol}
              </Btn>
            )}
          </div>

          {subReceipt && (
            <div className="mt-3 border-2 border-signal bg-card p-3 space-y-2 shadow-[3px_3px_0_0_var(--foreground)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-signal animate-pulse" />
                  <span className="font-bold text-xs text-foreground uppercase tracking-wider">Subscription Receipt</span>
                </div>
                <span className="label bg-signal/20 text-signal border border-signal px-1.5 py-0.5 text-[9px] font-mono">
                  NFT #{subReceipt.tokenId} ACTIVE
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-secondary p-2.5 border border-hairline">
                <div className="col-span-2">
                  <span className="text-muted-foreground text-[9px] block uppercase">Tx Hash</span>
                  <a
                    href={`https://nodes.synapticchain.xyz/explorer?search=${subReceipt.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline font-semibold break-all text-[11px]"
                  >
                    {subReceipt.txHash}
                  </a>
                </div>
                <div>
                  <span className="text-muted-foreground text-[9px] block uppercase">Cost</span>
                  <span className="font-bold text-signal">{subReceipt.cost} SYN</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[9px] block uppercase">Term</span>
                  <span className="font-bold text-foreground">30 Days Active</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground text-[9px] block uppercase">Payer Account</span>
                  <span className="text-foreground break-all text-[10px]">{subReceipt.payer}</span>
                </div>
              </div>
            </div>
          )}

          {endpoint.token && (
            <div className="border border-hairline bg-background p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="label">Bonding curve · {endpoint.token.symbol}</span>
                <Mono className="text-muted-foreground">{short(endpoint.token.address, 8, 6)}</Mono>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                <Mono>spot {curvePrice(endpoint.token).toFixed(6)} SYN</Mono>
                <Mono>supply {fmt(endpoint.token.supply, 0)}</Mono>
                <Mono>reserve {fmt(endpoint.token.reserve)} SYN</Mono>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  aria-label="Token amount"
                  className={`${inputCls} h-8 flex-1`}
                />
                <Btn size="sm" onClick={() => trade('buy')} disabled={busy === 'buy'}>
                  Buy
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => trade('sell')} disabled={busy === 'sell'}>
                  Sell
                </Btn>
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------ right */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="label">Live x402 test call</h3>
            <Mono className="text-muted-foreground">{short(CONTRACTS.ServiceRegistry.address, 8, 4)}</Mono>
          </div>
          <X402Runner endpoint={endpoint} />
        </div>
      </div>

      {trading && endpoint.token && (
        <TradeModal token={endpoint.token.address} symbol={endpoint.token.symbol} onClose={() => setTrading(false)} />
      )}
    </div>
  )
}
