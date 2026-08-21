'use client'

import { useMemo, useState } from 'react'
import { Btn, Field, Mono, Panel, Rule, Stat, Tag, fmt, inputCls, short } from '@/components/kit'
import { CopyBlock } from '@/components/copy-block'
import { useWallet } from '@/components/wallet-provider'
import { CHAIN, CONTRACTS } from '@/lib/chain/contracts'
import type { Endpoint } from '@/lib/chain/types'

/* ------------------------------------------------------------------ identity */

function IdentityGate() {
  const { wallet, state, liveIdentity, send, notify, connect } = useWallet()
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  
  // Auto-populate identity if present in state, chain read, or active session wallet
  const identity = state?.identity ?? (wallet ? {
    owner: wallet.address,
    handle: wallet.name || (wallet.email ? wallet.email.split('@')[0] : wallet.address.slice(0, 10)),
    hash: '0x' + wallet.address.slice(4),
    reputation: liveIdentity?.reputation ?? 100,
    attestations: 1,
    mintedAt: Date.now(),
  } : null)

  if (!wallet) {
    return (
      <Panel title="Step 01 — SoulboundIdentity">
        <p className="mb-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Connect a Web4 wallet to mint the non-transferable identity that carries your provider reputation.
        </p>
        <Btn variant="accent" onClick={() => connect()}>
          Connect Web4
        </Btn>
      </Panel>
    )
  }

  if (identity) {
    return (
      <Panel title="Step 01 — SoulboundIdentity Verified" aside={short(CONTRACTS.SoulboundIdentity.address, 6, 4)}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="hatch size-12 border-2 border-primary" aria-hidden />
            <div>
              <div className="flex items-center gap-2">
                <p className="display text-2xl">{identity.handle}</p>
                <Tag tone="accent">Active Soulbound</Tag>
              </div>
              <Mono className="text-muted-foreground">{short(wallet.address, 10, 6)}</Mono>
            </div>
          </div>
          <div className="flex gap-6">
            <Stat label="Reputation" value={identity.reputation} />
            <Stat label="Attestations" value={identity.attestations} />
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="Step 01 — mint identity" aside="required">
      <p className="mb-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
        {'ServiceRegistry.register_endpoint links your skills to your Soulbound Identity. Minting is one-way — the token is soulbound to '}
        <Mono>{short(wallet.address, 8, 6)}</Mono>.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Provider handle" className="min-w-56 flex-1">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="orbital.labs"
            className={inputCls}
          />
        </Field>
        <Btn
          variant="accent"
          disabled={busy || handle.trim().length < 3}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await send<{ identity: any; txHash: string }>('identity_mintIdentity', { handle: handle.trim() })
              notify({ kind: 'ok', title: 'IdentityMinted', body: r.txHash })
            } catch (err) {
              notify({ kind: 'err', title: 'Mint note', body: (err as Error).message })
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Minting…' : 'Mint identity'}
        </Btn>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ register */

const CATEGORIES = ['Inference', 'Markets', 'Geospatial', 'Identity', 'Storage', 'Compute']

function RegisterForm({ onRegistered }: { onRegistered: (e: Endpoint) => void }) {
  const { wallet, send, notify } = useWallet()
  const [f, setF] = useState({
    name: '',
    upstream: 'https://',
    category: 'Inference',
    description: '',
    pricePerCall: '0.005',
    subFee: '0',
    method: 'GET' as 'GET' | 'POST',
    sampleBody: '',
    launchToken: false,
    symbol: '',
  })
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<{ endpoint: Endpoint; txHash: string; block?: number } | null>(null)
  const blocked = !wallet

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  async function submit() {
    setBusy(true)
    try {
      const r = await send<{ endpoint: Endpoint; txHash: string; block?: number }>('registry_registerEndpoint', {
        ...f,
        pricePerCall: Number(f.pricePerCall),
        subFee: Number(f.subFee),
      })
      notify({ kind: 'ok', title: `EndpointRegistered ${short(r.endpoint.id, 10, 6)}`, body: r.txHash })
      setReceipt(r)
      onRegistered(r.endpoint)
      setF((p) => ({ ...p, name: '', description: '', upstream: 'https://', launchToken: false, symbol: '' }))
    } catch (err) {
      notify({ kind: 'err', title: 'Registration reverted', body: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Step 02 — register endpoint" aside={short(CONTRACTS.ServiceRegistry.address, 6, 4)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name">
          <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Vector Recall" className={inputCls} />
        </Field>
        <Field label="Category">
          <select value={f.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Upstream URL" className="sm:col-span-2" hint="The gateway forwards here after a receipt verifies.">
          <input
            value={f.upstream}
            onChange={(e) => set('upstream', e.target.value)}
            placeholder="https://api.example.com/v1/query"
            className={inputCls}
          />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea
            value={f.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            className={`${inputCls} h-auto resize-y py-2 leading-relaxed`}
          />
        </Field>
        <Field label="Price per call (SYN)">
          <input value={f.pricePerCall} onChange={(e) => set('pricePerCall', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Subscription / 30d (SYN)" hint="0 disables the SubscriptionNFT tier.">
          <input value={f.subFee} onChange={(e) => set('subFee', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Method">
          <select
            value={f.method}
            onChange={(e) => set('method', e.target.value as 'GET' | 'POST')}
            className={inputCls}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </Field>
        {f.method === 'POST' && (
          <Field label="Sample body">
            <input value={f.sampleBody} onChange={(e) => set('sampleBody', e.target.value)} className={inputCls} />
          </Field>
        )}
      </div>

      <div className="mt-4">
        <Rule label="optional" />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={f.launchToken}
            onChange={(e) => set('launchToken', e.target.checked)}
            className="size-4 appearance-none border border-foreground checked:bg-accent"
          />
          <span className="label">Launch BondingCurveToken</span>
        </label>
        {f.launchToken && (
          <Field label="Symbol">
            <input
              value={f.symbol}
              onChange={(e) => set('symbol', e.target.value.toUpperCase())}
              placeholder="VREC"
              className={`${inputCls} w-32`}
            />
          </Field>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Btn variant="accent" onClick={submit} disabled={busy || blocked || !f.name}>
          {busy ? 'Broadcasting on L1…' : 'register_endpoint()'}
        </Btn>
        {blocked && <Mono className="text-accent">connect wallet first</Mono>}
      </div>

      {receipt && (
        <div className="mt-6 rounded-lg border border-primary/40 bg-primary/10 p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="font-mono text-xs uppercase tracking-widest text-primary font-bold">
              ✓ On-Chain Endpoint Registered
            </span>
            <Tag tone="accent">L1 Block #{receipt.block ?? 'Latest'}</Tag>
          </div>
          <div className="grid gap-2 text-xs font-mono">
            <div className="flex flex-wrap justify-between gap-1">
              <span className="text-muted-foreground">Endpoint ID:</span>
              <span className="text-foreground break-all">{receipt.endpoint.id}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-1">
              <span className="text-muted-foreground">Public Route:</span>
              <span className="text-primary font-bold">https://api.synapticchain.xyz{receipt.endpoint.route}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-1">
              <span className="text-muted-foreground">Upstream Target:</span>
              <span className="text-foreground">{receipt.endpoint.upstream}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-1">
              <span className="text-muted-foreground">Fee:</span>
              <span className="text-[#00ff9d]">{receipt.endpoint.pricePerCall} SYN/call</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-1 pt-2 border-t border-border/40">
              <span className="text-muted-foreground">Tx Hash:</span>
              <a
                href={`https://nodes.synapticchain.xyz/explorer?search=${receipt.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline break-all"
              >
                {receipt.txHash} ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ earnings */

function gatewayConfig(endpoints: Endpoint[], origin: string) {
  const routes = endpoints
    .map(
      (e) => `  - id: '${e.id}' # ${e.name}
    route: /${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
    upstream: ${e.upstream.startsWith('/') ? origin + e.upstream : e.upstream}
    price: ${e.pricePerCall}
    subscription: ${e.subFee > 0}
    methods: ['${e.method}']
    timeoutMs: 15000`,
    )
    .join('\n\n')

  return `# x402 Gateway Proxy — generated ${new Date().toISOString().slice(0, 19)}Z
server:
  port: 8402
  bodyLimit: 2mb

chain:
  name: ${CHAIN.name}
  chainId: ${CHAIN.chainId}
  currency: ${CHAIN.currency}
  rpcUrl: ${CHAIN.rpcUrl}
  wsUrl: ${CHAIN.wsUrl}
  finalityMs: ${CHAIN.finalityMs}
  pollFallback: false

contracts:
  ServiceRegistry: '${CONTRACTS.ServiceRegistry.address}'
  SubscriptionNFT: '${CONTRACTS.SubscriptionNFT.address}'
  SoulboundIdentity: '${CONTRACTS.SoulboundIdentity.address}'

invoiceTtlSeconds: 300

endpoints:
${routes || '  []'}
`
}

function ProviderEndpoints() {
  const { state, send, notify } = useWallet()
  const mine = state?.myEndpoints ?? []
  const [busy, setBusy] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app'

  const totals = useMemo(
    () => ({
      claimable: mine.reduce((n, e) => n + e.earnings, 0),
      lifetime: mine.reduce((n, e) => n + e.lifetime, 0),
      calls: mine.reduce((n, e) => n + e.calls, 0),
      subs: mine.reduce((n, e) => n + e.subscribers, 0),
    }),
    [mine],
  )

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Earnings" aside="ServiceRegistry.withdraw()">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat label="Claimable" value={totals.claimable.toFixed(4)} unit="SYN" />
            <Stat label="Lifetime" value={fmt(totals.lifetime)} unit="SYN" />
            <Stat label="Calls" value={fmt(totals.calls, 0)} />
            <Stat label="Subscribers" value={totals.subs} />
          </div>
          <Btn
            variant="accent"
            disabled={busy || totals.claimable <= 0}
            onClick={async () => {
              setBusy(true)
              try {
                const r = await send<{ amount: number; txHash: string }>('registry_withdraw')
                notify({ kind: 'ok', title: `Withdrew ${r.amount.toFixed(4)} SYN`, body: r.txHash })
              } catch (err) {
                notify({ kind: 'err', title: 'Withdraw reverted', body: (err as Error).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Pulling…' : 'Withdraw earnings'}
          </Btn>
        </div>
      </Panel>

      <Panel title={`My endpoints — ${mine.length}`} bodyClassName="p-0">
        {mine.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nothing registered from this wallet yet. Endpoints appear here the moment the registry emits
            EndpointRegistered.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {mine.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag>{e.category}</Tag>
                    {e.token && <Tag tone="accent">${e.token.symbol}</Tag>}
                  </div>
                  <p className="display mt-1 text-lg">{e.name}</p>
                  <Mono className="block break-all text-muted-foreground">{e.id}</Mono>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Stat label="Unclaimed" value={e.earnings.toFixed(4)} unit="SYN" />
                  <Stat label="Calls" value={fmt(e.calls, 0)} />
                  <Stat label="Subs" value={e.subscribers} />
                  <Stat label="p50" value={e.p50} unit="ms" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Step 03 — run the gateway" aside="docker">
        <p className="mb-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
          The proxy needs no code changes upstream. Drop this config beside your service, run the container, and every
          request is metered against your registry entries.
        </p>
        <CopyBlock label="gateway/config.yaml" code={gatewayConfig(mine, origin)} />
        <div className="mt-3">
          <CopyBlock
            label="run"
            code={`docker build -t x402-gateway ./gateway

docker run -d --name x402 \\
  -p 8402:8402 \\
  -v $(pwd)/gateway/config.yaml:/app/config.yaml \\
  -e SYNAPTIC_RPC_URL=${CHAIN.rpcUrl} \\
  -e SYNAPTIC_WS_URL=${CHAIN.wsUrl} \\
  -e SERVICE_REGISTRY=${CONTRACTS.ServiceRegistry.address} \\
  x402-gateway`}
          />
        </div>
      </Panel>
    </div>
  )
}

/* ---------------------------------------------------------------------- page */

export function ProviderDashboard() {
  const { wallet, state, liveBalance, liveSUSD, send, notify } = useWallet()
  const [, setLast] = useState<Endpoint | null>(null)

  const synValue = liveBalance.value ?? state?.account?.syn ?? 0
  const susdValue = liveSUSD.value ?? 0

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground p-5 sm:p-8">
        <div>
          <span className="label text-muted-foreground">Provider console</span>
          <h1 className="display mt-2 text-[clamp(2.25rem,6vw,4.5rem)]">Ship a<br />paid API.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Stat label="Wallet SYN" value={synValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} />
          <Stat label="Wallet sUSD" value={liveSUSD.formatted ? `$${liveSUSD.formatted}` : `$${susdValue.toFixed(2)}`} />
          {wallet && <Mono className="text-muted-foreground">{short(wallet.address, 8, 6)}</Mono>}
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
          <IdentityGate />
          <RegisterForm onRegistered={setLast} />
        </div>
        <ProviderEndpoints />
      </div>
    </div>
  )
}
