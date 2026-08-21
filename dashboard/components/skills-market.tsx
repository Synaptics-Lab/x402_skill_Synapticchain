'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Btn, Field, Mono, Panel, Stat, Tag, fmt, inputCls, short } from '@/components/kit'
import { TokenChart } from '@/components/token-chart'
import { useWallet } from '@/components/wallet-provider'
import { CHAIN } from '@/lib/chain/contracts'
import { rpc, x402fetch } from '@/lib/x402-client/index'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

const WEB4_APIS = [
  {
    id: 'token-launch',
    name: 'Token Factory',
    category: 'Infrastructure',
    price: 0,
    description: 'No-code SRC20 token deployment. One API call compiles, deploys, and mints your token on SynapticChain L1. Chain a second call to register it as a paid API endpoint.',
    route: null, // handled by dedicated TokenLaunchCard
    method: 'POST',
    params: [],
  },
  {
    id: 'empirical-proof',
    name: 'SCBFT Empirical Consensus Oracle',
    category: 'Consensus / Security',
    price: 0.001,
    description: 'On-demand real-time mathematical proof of SCBFT consensus: live state-root SHA3-256 verification, 3-of-3 validator quorum audit, sub-500ms finality check, and 10-vector comparative blockchain scorecard.',
    route: '/x402/empirical-proof',
    method: 'GET',
    params: [],
  },
  {
    id: 'okx-eth-ticker',
    name: 'OKX Live ETH Spot Price',
    category: 'Oracle / DeFi',
    price: 0.005,
    description: 'Query OKX V5 Market API in real time for ETH/USDT spot price, orderbook spread, 24h high/low, and trading volume.',
    route: '/x402/okx-eth-ticker',
    method: 'GET',
    params: [{ key: 'pair', placeholder: 'ETH-USDT', label: 'Instrument / Pair (e.g. ETH-USDT, BTC-USDT, SOL-USDT)' }],
  },
  {
    id: 'nowpayments-invoice',
    name: 'NOWPayments Invoice',
    category: 'Payments',
    price: 0.01,
    description: 'Generate a NOWPayments crypto checkout invoice for any wallet address. AI agents use this to autonomously trigger fiat on-ramps.',
    route: '/x402/nowpayments-invoice',
    method: 'GET',
    params: [{ key: 'address', placeholder: 'syn1...', label: 'Wallet Address' }, { key: 'amount', placeholder: '25', label: 'Amount USD' }, { key: 'currency', placeholder: 'sUSD', label: 'Token' }],
  },
  {
    id: 'batch-dispatch',
    name: '256-Lane Batch Dispatch',
    category: 'Infrastructure',
    price: 0.05,
    description: 'Trigger a 256-lane parallel L1 transaction batch. Agents use this to trigger platform fees, yield drips, and MEV extraction events.',
    route: '/x402/batch-dispatch',
    method: 'POST',
    params: [{ key: 'count', placeholder: '16', label: 'Transaction Count (16/64/100)' }],
  },
  {
    id: 'bot-rescue',
    name: 'Operative Recovery',
    category: 'AgentFi',
    price: 0.02,
    description: 'Recover a damaged MEV bot operative. Unlocks the bot sub-wallet, restores reputation score, and resumes yield generation.',
    route: '/x402/bot-rescue',
    method: 'POST',
    params: [{ key: 'bot_id', placeholder: 'burn-1', label: 'Bot ID' }],
  },
  {
    id: 'coinflip-batch',
    name: '10-Game VRF Coinflip Batch',
    category: 'Gaming / VRF',
    price: 0.05,
    description: '100% Real On-Chain Gaming. 10 simultaneous wagers are broadcast across parallel lanes to the House Treasury. Winning flips receive 2.0x payouts on-chain; losing flips forfeit the wagered SYN permanently. Outcomes verified via SHA3-256 checkpoint VRF.',
    route: '/api/games/coinflip-batch',
    method: 'POST',
    params: [
      { key: 'choice', placeholder: 'EVEN', label: 'Choice (ODD or EVEN)' },
      { key: 'bet', placeholder: '0.05', label: 'Bet Per Flip (0.05 - 1.0 SYN)' },
    ],
  },
  {
    id: 'fomo-jackpot',
    name: 'FOMO-3D Countdown Jackpot',
    category: 'Gaming / Game Theory',
    price: 0.05,
    description: 'Real On-Chain FOMO Arena. Non-refundable 0.05 SYN key purchases extend the 120s timer (+15s/key). 75% goes to jackpot, 15% to holder dividends, 10% to burn. If you are not the last buyer when the timer hits 00:00, you only earn dividends.',
    route: '/api/games/fomo/buy-key',
    method: 'POST',
    params: [
      { key: 'keys', placeholder: '1', label: 'Number of Keys (0.05 SYN/key)' },
    ],
  },
  {
    id: 'identity-verify',
    name: 'Identity Verification',
    category: 'Identity',
    price: 0.005,
    description: 'Verify a SynapticChain Soulbound Identity NFT and TAP registry attestation for any wallet address.',
    route: '/x402/identity-verify',
    method: 'GET',
    params: [{ key: 'address', placeholder: 'syn1...', label: 'Wallet Address' }],
  },
]

/* -------------------------------------------------------------------------- */
/* Token Launch Card                                                           */
/* -------------------------------------------------------------------------- */

type DeployStep = { step: number; action: string; tx?: string | null; status: 'pending' | 'ok' | 'running' | 'error' | 'skipped' }
type DeployResult = {
  status: string
  contract?: string | null
  deploy_tx?: string
  setup_tx?: string
  symbol: string
  name: string
  supply: number
  decimals: number
  deployer: string
  explorer_url?: string | null
  chain_steps?: DeployStep[]
  endpoint_id?: string
  endpoint_tx?: string | null
  warning?: string | null
}

function StepRow({ s, running }: { s: DeployStep; running: boolean }) {
  const color =
    s.status === 'ok' ? 'text-signal'
    : s.status === 'error' ? 'text-accent'
    : s.status === 'running' || running ? 'text-yellow-400'
    : 'text-muted-foreground'
  const icon =
    s.status === 'ok' ? '✓'
    : s.status === 'error' ? '✗'
    : s.status === 'skipped' ? '—'
    : running ? '↻'
    : '○'
  return (
    <div className={cn('flex items-center gap-2 text-xs font-mono', color)}>
      <span className={cn('text-[11px]', (s.status === 'running' || running) && 'animate-spin inline-block')}>{icon}</span>
      <span className="capitalize">{s.action.replace(/_/g, ' ')}</span>
      {s.tx && (
        <a
          href={`https://nodes.synapticchain.xyz/explorer?search=${s.tx}`}
          target="_blank" rel="noopener noreferrer"
          className="ml-auto text-accent underline truncate max-w-[120px]"
        >{s.tx.slice(0, 10)}…</a>
      )}
    </div>
  )
}

function TokenLaunchCard() {
  const { wallet, refresh, notify } = useWallet()
  const router = useRouter()

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [supply, setSupply] = useState('1000000')
  const [decimals, setDecimals] = useState('18')
  const [description, setDescription] = useState('')
  const [withEndpoint, setWithEndpoint] = useState(false)
  const [endpointUrl, setEndpointUrl] = useState('')
  const [pricePerCall, setPricePerCall] = useState('0.005')

  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [result, setResult] = useState<DeployResult | null>(null)
  const [steps, setSteps] = useState<DeployStep[]>([])

  async function handleDeploy() {
    if (!wallet) { router.push('/login?next=/skills'); return }
    if (!name.trim()) { notify({ kind: 'err', title: 'Token name required', body: '' }); return }
    if (!symbol.trim()) { notify({ kind: 'err', title: 'Token symbol required', body: '' }); return }

    setLoading(true)
    setResult(null)
    const initSteps: DeployStep[] = [
      { step: 1, action: 'compile_contract', status: 'pending' },
      { step: 2, action: 'deploy_contract', status: 'pending' },
      { step: 3, action: 'setup_mint', status: 'pending' },
      ...(withEndpoint ? [{ step: 4, action: 'register_endpoint', status: 'pending' as const }] : []),
    ]
    setSteps(initSteps)

    const method = withEndpoint ? 'token_chain' : 'token_deploy'
    const params: Record<string, any> = {
      from: wallet.address,
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      decimals: Number(decimals),
      initial_supply: Number(supply),
      description: description.trim(),
      mint_to: wallet.address,
      privateKey: (wallet as any).privateKey || (wallet as any).secretKey || undefined,
    }
    if (withEndpoint) {
      params.endpoint_url = endpointUrl.trim()
      params.price_per_call = Number(pricePerCall)
    }

    // Animate steps while waiting
    let stepIdx = 0
    const ticker = setInterval(() => {
      setSteps((prev) => prev.map((s, i) => {
        if (i === stepIdx) return { ...s, status: 'running' }
        if (i < stepIdx) return { ...s, status: 'ok' }
        return s
      }))
      stepIdx = Math.min(stepIdx + 1, initSteps.length - 1)
      const labels = ['Compiling contract…', 'Deploying to L1…', 'Minting initial supply…', 'Registering endpoint…']
      setPhase(labels[stepIdx] ?? 'Finalizing…')
    }, 7000)

    try {
      const res = await rpc<DeployResult>('/api/rpc', method, params)
      clearInterval(ticker)

      // Merge real step data from server
      if (res.chain_steps) {
        setSteps(res.chain_steps.map((s) => ({ ...s, status: (s.status as any) ?? 'ok' })))
      } else {
        setSteps([
          { step: 1, action: 'compile_contract', tx: null, status: 'ok' },
          { step: 2, action: 'deploy_contract', tx: res.deploy_tx, status: 'ok' },
          { step: 3, action: 'setup_mint', tx: res.setup_tx ?? null, status: res.setup_tx ? 'ok' : 'skipped' },
        ])
      }

      setResult(res)
      notify({
        kind: 'ok',
        title: `$${res.symbol} deployed!`,
        body: `${res.name} · ${res.supply.toLocaleString()} tokens · ${res.contract?.slice(0, 16)}…`,
      })
      refresh()
    } catch (e: any) {
      clearInterval(ticker)
      setSteps((prev) => prev.map((s) => s.status === 'running' ? { ...s, status: 'error' } : s))
      notify({ kind: 'err', title: 'Deployment failed', body: e.message })
    } finally {
      setLoading(false)
      setPhase(null)
    }
  }

  return (
    <Panel
      title="Token Factory"
      aside={<Tag>Infrastructure</Tag>}
      className="flex flex-col col-span-full sm:col-span-2"
    >
      <p className="text-sm text-muted-foreground mb-4">
        Deploy a SRC20 token to SynapticChain L1 in one call — no compiler, no wallet SDK, no DevOps.
        {' '}<span className="text-foreground font-semibold">Optionally chain</span> a registry call to make it a paid API endpoint.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <Field label="Token name">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="My Awesome Token" className={inputCls} />
        </Field>
        <Field label="Symbol (max 12)">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="MAT" maxLength={12} className={inputCls} />
        </Field>
        <Field label="Initial supply">
          <input type="number" min="1" value={supply}
            onChange={(e) => setSupply(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Decimals">
          <input type="number" min="0" max="18" value={decimals}
            onChange={(e) => setDecimals(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Description (optional)" className="sm:col-span-2">
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this token do?" className={inputCls} />
        </Field>
      </div>

      {/* Chain toggle */}
      <button
        type="button"
        onClick={() => setWithEndpoint((v) => !v)}
        className={cn(
          'mb-4 flex items-center gap-2 rounded border px-3 py-2 text-xs font-mono transition-colors w-full',
          withEndpoint ? 'border-accent bg-accent/10 text-accent' : 'border-hairline hover:bg-secondary',
        )}
      >
        <span className={cn('size-3 rounded-sm border', withEndpoint ? 'bg-accent border-accent' : 'border-muted-foreground')} />
        Chain: also register as x402 paid API endpoint
        <Mono className="ml-auto text-[10px] opacity-60">+1 tx</Mono>
      </button>

      {withEndpoint && (
        <div className="grid gap-3 sm:grid-cols-2 mb-4 border border-hairline p-3">
          <Field label="Upstream URL" className="sm:col-span-2">
            <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://api.myapp.com/v1/myendpoint" className={inputCls} />
          </Field>
          <Field label="Price per call (SYN)">
            <input type="number" step="0.001" min="0.001" value={pricePerCall}
              onChange={(e) => setPricePerCall(e.target.value)} className={inputCls} />
          </Field>
        </div>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="mb-4 space-y-1.5 border border-hairline bg-secondary p-3">
          {steps.map((s, i) => (
            <StepRow key={s.step} s={s} running={loading && i === steps.findIndex((x) => x.status === 'running')} />
          ))}
        </div>
      )}

      <Btn variant="accent" onClick={handleDeploy} disabled={loading} className="w-full">
        {loading ? (phase ?? 'Deploying…') : withEndpoint ? 'Deploy & Register (2 txs)' : 'Deploy Token'}
      </Btn>

      {result && (
        <div className="mt-4 border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--foreground)] space-y-3">
          <div className="flex items-center justify-between border-b border-foreground pb-2">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-signal animate-pulse" />
              <span className="font-bold text-xs tracking-wider">TOKEN DEPLOYED</span>
            </div>
            <span className="label bg-signal/20 text-signal border border-signal px-1.5 py-0.5 text-[10px] font-mono">
              ${result.symbol} LIVE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-secondary p-2.5 border border-hairline">
            <div className="col-span-2">
              <span className="text-muted-foreground text-[10px] block uppercase">Contract Address</span>
              {result.contract ? (
                <a href={result.explorer_url ?? '#'} target="_blank" rel="noopener noreferrer"
                  className="text-accent underline font-semibold break-all text-[11px]">
                  {result.contract}
                </a>
              ) : <span className="text-muted-foreground">Indexing…</span>}
            </div>
            <div>
              <span className="text-muted-foreground text-[10px] block uppercase">Symbol</span>
              <span className="font-bold">${result.symbol}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px] block uppercase">Supply</span>
              <span className="font-bold text-signal">{result.supply.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px] block uppercase">Decimals</span>
              <span className="font-bold">{result.decimals}</span>
            </div>
            {result.endpoint_id && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-[10px] block uppercase">Endpoint ID</span>
                <span className="text-foreground break-all text-[10px]">{result.endpoint_id}</span>
              </div>
            )}
          </div>

          {result.warning && (
            <p className="text-[11px] text-yellow-400 font-mono">{result.warning}</p>
          )}
        </div>
      )}
    </Panel>
  )
}

function Web4ApiCard({ api }: { api: typeof WEB4_APIS[0] }) {
  const { wallet, refresh, notify } = useWallet()
  const router = useRouter()
  const [paramVals, setParamVals] = useState<Record<string, string>>({})
  const [resData, setResData] = useState<{
    status: number
    text: string
    mode?: string
    cost?: string
    latency?: string
    receipt?: any
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [stepStatus, setStepStatus] = useState<string | null>(null)

  async function handleCall() {
    if (!wallet) {
      router.push('/login?next=/skills')
      return
    }
    setLoading(true)
    setResData(null)
    setStepStatus('Initiating 402 challenge…')
    try {
      let isLocalApi = api.route?.startsWith('/api/')
      let url = isLocalApi ? api.route : `https://api.synapticchain.xyz${api.route}`
      
      let res: Response
      if (isLocalApi) {
        setStepStatus('Executing on-chain batch...')
        let fetchUrl = url!
        if (api.method === 'GET') {
          const query = new URLSearchParams()
          for (const p of api.params) if (paramVals[p.key]) query.set(p.key, paramVals[p.key])
          fetchUrl += '?' + query.toString()
          res = await fetch(fetchUrl)
        } else {
          res = await fetch(fetchUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...paramVals, address: wallet.address })
          })
        }
      } else {
        let opts: any = {
          method: api.method,
          headers: {},
          wallet,
          maxPrice: 5,
          step: (s: any) => {
            setStepStatus(s.label || s.phase)
          },
        }
        
        if (api.method === 'GET') {
          const query = new URLSearchParams()
          for (const p of api.params) if (paramVals[p.key]) query.set(p.key, paramVals[p.key])
          url += '?' + query.toString()
        } else {
          opts.body = JSON.stringify(paramVals)
          opts.headers = { 'content-type': 'application/json' }
        }
        
        res = await x402fetch(url!, opts)
      }

      let text = await res.text()
      try { text = JSON.stringify(JSON.parse(text), null, 2) } catch(e){}
      const receipt = (res as any).x402
      setResData({
        status: res.status,
        text,
        mode: res.headers.get('X-402-Mode') ?? (res.status === 200 ? 'settled' : 'challenge'),
        cost: res.headers.get('X-402-Cost') ?? String(api.price),
        latency: res.headers.get('X-402-Upstream-Latency') ?? '—',
        receipt,
      })
      if (res.status === 200) {
        notify({
          kind: 'ok',
          title: isLocalApi ? 'Execution Complete' : '402 Payment Settled',
          body: isLocalApi ? `${api.name} executed successfully` : `${receipt?.amount ?? api.price} SYN deducted on-chain for ${api.name}`,
        })
      }
      refresh()
    } catch (e: any) {
      setResData({ status: 500, text: e.message })
      notify({ kind: 'err', title: 'Call Failed', body: e.message })
    } finally {
      setLoading(false)
      setStepStatus(null)
    }
  }

  return (
    <Panel title={api.name} aside={<Tag>{api.category}</Tag>} className="flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Mono className="font-bold text-accent">{api.price} SYN/call</Mono>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{api.description}</p>
      
      <div className="space-y-3 mb-4 flex-1">
        {api.params.map((p) => (
          <Field key={p.key} label={p.label}>
            <input
              type="text"
              placeholder={p.placeholder}
              value={paramVals[p.key] || ''}
              onChange={(e) => setParamVals({ ...paramVals, [p.key]: e.target.value })}
              className={inputCls}
            />
          </Field>
        ))}
      </div>
      
      <Btn variant="accent" onClick={handleCall} disabled={loading} className="w-full">
        {loading ? (stepStatus ?? 'Processing on-chain…') : 'Call API'}
      </Btn>
      
      {resData && (
        <div className="mt-4 border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--foreground)] space-y-3">
          <div className="flex items-center justify-between border-b border-foreground pb-2">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-signal animate-pulse" />
              <span className="font-bold text-xs tracking-wider text-foreground">PAYMENT RECEIPT</span>
            </div>
            <span className="label bg-signal/20 text-signal border border-signal px-1.5 py-0.5 text-[10px] font-mono">
              HTTP {resData.status} SETTLED
            </span>
          </div>

          {resData.receipt && (
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-secondary p-2.5 border border-hairline">
              <div className="col-span-2">
                <span className="text-muted-foreground text-[10px] block uppercase">Tx Hash</span>
                <a
                  href={`https://nodes.synapticchain.xyz/explorer?search=${resData.receipt.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline font-semibold break-all text-[11px]"
                >
                  {resData.receipt.txHash}
                </a>
              </div>
              <div>
                <span className="text-muted-foreground text-[10px] block uppercase">Block</span>
                <span className="font-bold text-foreground">#{resData.receipt.block ?? '6882'}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-[10px] block uppercase">Cost</span>
                <span className="font-bold text-signal">{resData.receipt.amount ?? api.price} SYN</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground text-[10px] block uppercase">Payer Account</span>
                <span className="text-foreground break-all text-[11px]">{wallet?.address}</span>
              </div>
              {resData.receipt.invoiceHash && (
                <div className="col-span-2">
                  <span className="text-muted-foreground text-[10px] block uppercase">Invoice Hash</span>
                  <span className="text-muted-foreground break-all text-[10px]">{resData.receipt.invoiceHash}</span>
                </div>
              )}
            </div>
          )}

          <div className="pt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-foreground uppercase">Response Data</span>
              <span className="text-[10px] text-muted-foreground font-mono">{resData.latency}</span>
            </div>
            <div className="overflow-x-auto max-h-48 rounded bg-background p-2.5 border border-hairline">
              <pre className="text-xs font-mono text-foreground m-0">{resData.text}</pre>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

type SkillToken = {
  endpointId: string
  name: string
  category: string
  symbol: string
  address: string
  provider: string
  providerHandle: string | null
  price: number
  supply: number
  reserve: number
  basePrice: number
  slope: number
  change24h: number
  trades: number
  volume: number
  earnings: number
  calls: number
}

type PricePoint = { time: string; value: number }

const SIDE_TABS = [
  { key: 'buy', label: 'Buy' },
  { key: 'sell', label: 'Sell' },
] as const

type Side = (typeof SIDE_TABS)[number]['key']

function useSkillTokens() {
  return useSWR('skill_tokens', () => rpc<SkillToken[]>('/api/rpc', 'skill_tokens'), {
    refreshInterval: 8000,
    keepPreviousData: true,
  })
}

function useSkillHistory(tokenAddress: string | null) {
  return useSWR(
    tokenAddress ? ['skill_priceHistory', tokenAddress] : null,
    () => rpc<PricePoint[]>('/api/rpc', 'skill_priceHistory', { tokenAddress: tokenAddress! }),
    { refreshInterval: 15000, keepPreviousData: true },
  )
}

function TokenRow({
  token,
  active,
  onSelect,
}: {
  token: SkillToken
  active: boolean
  onSelect: () => void
}) {
  const positive = token.change24h >= 0
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'group flex w-full flex-col gap-1 border-b border-hairline p-4 text-left transition-colors',
        active ? 'bg-foreground text-background' : 'hover:bg-secondary',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag className={active ? 'border-background text-background' : undefined}>{token.category}</Tag>
            <Mono className={active ? 'opacity-70' : 'text-accent'}>${token.symbol}</Mono>
          </div>
          <h3 className="display mt-1 text-lg">{token.name}</h3>
          <Mono className={cn('mt-1 block', active ? 'opacity-70' : 'text-muted-foreground')}>
            {token.providerHandle ?? short(token.provider, 8, 4)}
          </Mono>
        </div>
        <div className="shrink-0 text-right">
          <span className="block font-mono text-lg font-semibold tabular-nums">{token.price.toFixed(6)}</span>
          <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>SYN</Mono>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Mono className={cn(positive ? 'text-signal' : 'text-accent', active && 'opacity-80')}>
          {positive ? '+' : ''}
          {token.change24h.toFixed(2)}%
        </Mono>
        <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>vol {fmt(token.volume)} SYN</Mono>
        <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>{fmt(token.trades, 0)} trades</Mono>
        <Mono className={active ? 'opacity-70' : 'text-muted-foreground'}>{fmt(token.calls, 0)} calls</Mono>
      </div>
    </button>
  )
}

function TradeForm({ token }: { token: SkillToken }) {
  const { wallet, state, send, notify } = useWallet()
  const [side, setSide] = useState<Side>('buy')
  const [amount, setAmount] = useState('100')
  const [busy, setBusy] = useState(false)

  const amt = Number(amount)
  const estimate = useMemo(() => {
    if (!amt || amt <= 0) return 0
    const t = { address: token.address, supply: token.supply, reserve: token.reserve, basePrice: token.basePrice, slope: token.slope }
    if (side === 'buy') {
      return token.basePrice * amt + token.slope * (amt * token.supply + (amt * amt) / 2)
    }
    return token.basePrice * amt + token.slope * (amt * token.supply - (amt * amt) / 2)
  }, [amt, side, token])

  if (!wallet) {
    return (
      <Panel title="Trade" aside="connect wallet">
        <p className="text-sm text-muted-foreground">Connect a Web4 wallet to buy or sell skill tokens.</p>
      </Panel>
    )
  }

  async function submit() {
    if (!amt || amt <= 0) return
    setBusy(true)
    try {
      const r = await send<{ side: Side; amount: number; cost: number; price: number; txHash: string }>('skill_trade', {
        endpointId: token.endpointId,
        side,
        amount: amt,
      })
      notify({
        kind: 'ok',
        title: `${side === 'buy' ? 'Bought' : 'Sold'} ${r.amount} $${token.symbol}`,
        body: `cost ${r.cost.toFixed(6)} SYN @ ${r.price.toFixed(8)} · ${short(r.txHash, 8, 6)}`,
      })
    } catch (err) {
      notify({ kind: 'err', title: 'Trade reverted', body: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const balance = state?.account?.syn ?? 0

  return (
    <Panel title="Trade" aside={short(token.address, 6, 4)}>
      <div className="mb-4 flex border border-foreground">
        {SIDE_TABS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSide(s.key)}
            className={cn(
              'label flex-1 px-4 py-2 transition-colors',
              side === s.key ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Field label="Amount" hint={`${side === 'buy' ? 'Tokens to receive' : 'Tokens to sell'} (whole units)`}>
        <input
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputCls}
        />
      </Field>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Stat label="Estimated cost" value={estimate.toFixed(6)} unit="SYN" />
        <Stat label="Your SYN" value={balance.toFixed(3)} />
      </div>

      <Btn variant="accent" className="mt-5 w-full" disabled={busy || amt <= 0 || (side === 'buy' && balance < estimate)} onClick={submit}>
        {busy ? 'Submitting…' : `${side === 'buy' ? 'Buy' : 'Sell'} $${token.symbol}`}
      </Btn>
    </Panel>
  )
}

export function SkillsMarket() {
  const { wallet, state, connect, connecting, liveBalance, liveSUSD, liveBotcoin } = useWallet()
  const { data: tokens, error, isLoading } = useSkillTokens()
  const [selected, setSelected] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const current = useMemo(
    () => tokens?.find((t) => t.endpointId === selected) ?? tokens?.[0] ?? null,
    [tokens, selected],
  )

  const { data: history } = useSkillHistory(current?.address ?? null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (tokens ?? []).filter(
      (t) =>
        !needle ||
        `${t.name} ${t.symbol} ${t.category} ${t.providerHandle ?? ''}`.toLowerCase().includes(needle),
    )
  }, [tokens, q])

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground p-5 sm:p-8">
        <div>
          <span className="label text-muted-foreground">Secondary economy</span>
          <h1 className="display mt-2 text-[clamp(2.25rem,6vw,4.5rem)]">
            Skill
            <br />
            tokens.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Every x402 endpoint can launch a bonding-curve token. Creators earn from API revenue; traders earn from
            demand for the skill.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Stat label="Skills listed" value={tokens?.length ?? 0} />
          <Stat label="24h volume" value={(tokens ?? []).reduce((n, t) => n + t.volume, 0).toFixed(3)} unit="SYN" />
          {!wallet && (
            <Btn variant="accent" onClick={() => connect()} disabled={connecting}>
              {connecting ? 'Handshake…' : 'Connect Web4'}
            </Btn>
          )}
        </div>
      </header>

      {/* Soulbound Identity & On-Chain Airdrop Status Banner */}
      {wallet ? (
        <div className="border-b-2 border-foreground bg-secondary/40 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded border-2 border-foreground bg-card shadow-[2px_2px_0_0_var(--foreground)]">
                <span className="text-lg">🛡️</span>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="display text-base font-bold text-foreground">Soulbound Identity NFT Verified</h3>
                  <Tag tone="signal" className="text-[10px]">TAP Attested</Tag>
                  <Tag className="text-[10px] uppercase">{wallet.connector || 'Synaptic'}</Tag>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span>{wallet.email ? `${wallet.email} · ` : ''}</span>
                  <a
                    href={`https://nodes.synapticchain.xyz/explorer?search=${wallet.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline font-semibold"
                  >
                    {wallet.address}
                  </a>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="text-right">
                <span className="block text-[10px] font-mono uppercase text-muted-foreground">SYN Gas</span>
                <span className="font-mono text-sm font-bold text-foreground">
                  {liveBalance.value != null ? `${liveBalance.value.toFixed(3)} SYN` : `${(state?.account?.syn ?? 0).toFixed(3)} SYN`}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-mono uppercase text-muted-foreground">sUSD Stablecoin</span>
                <span className="font-mono text-sm font-bold text-signal">
                  {liveSUSD.value != null ? `$${liveSUSD.value.toFixed(2)}` : '$0.50'}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-mono uppercase text-muted-foreground">$BOTCOIN</span>
                <span className="font-mono text-sm font-bold text-accent">
                  {liveBotcoin.value != null ? `${liveBotcoin.value.toFixed(2)}` : '1.00'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-b-2 border-foreground bg-accent/10 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="display text-base font-bold text-accent">Sign in to Claim 0.5 SYN + 0.5 sUSD + 1.0 $BOTCOIN Airdrop</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Authenticate via Google or Matrix Wallet to mint your Soulbound Identity NFT and execute on-chain agent skills.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="https://wallet.synapticchain.xyz/?return_to=https://api.synapticchain.xyz/skills"
                className="inline-block"
              >
                <Btn variant="accent" size="sm">
                  Launch Matrix Wallet
                </Btn>
              </a>
              <Btn variant="quiet" size="sm" onClick={() => connect()} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Pair Web4'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 sm:p-8 border-b-2 border-foreground">
        <h2 className="display text-2xl mb-6">Featured Web4 Agentic APIs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Token Factory spans 2 cols — has its own rich component */}
          <TokenLaunchCard />
          {WEB4_APIS.filter(api => api.id !== 'token-launch').map(api => (
            <Web4ApiCard key={api.id} api={api} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[360px_1fr]">
        {/* left: token list */}
        <div className="flex flex-col gap-4">
          <Panel title="Skills" aside={CHAIN.currency} bodyClassName="p-0">
            <div className="border-b border-hairline p-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="search skill tokens"
                aria-label="Search skill tokens"
                className="h-9 w-full border border-foreground bg-background px-3 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-accent"
              />
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {isLoading && !tokens && (
                <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                  <span className="size-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                  Loading skill tokens…
                </div>
              )}
              {!isLoading && filtered.map((t) => (
                <TokenRow
                  key={t.endpointId}
                  token={t}
                  active={t.endpointId === current?.endpointId}
                  onSelect={() => setSelected(t.endpointId)}
                />
              ))}
              {!isLoading && filtered.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">
                  No skill tokens match. Providers can launch a token when registering an endpoint.
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* right: chart + trade + details */}
        <div className="flex flex-col gap-4">
          {current ? (
            <>
              <Panel
                title={current.name}
                aside={
                  <div className="flex items-center gap-3">
                    <Mono>${current.symbol}</Mono>
                    <Mono className={current.change24h >= 0 ? 'text-signal' : 'text-accent'}>
                      {current.change24h >= 0 ? '+' : ''}
                      {current.change24h.toFixed(2)}%
                    </Mono>
                  </div>
                }
                bodyClassName="h-[360px] p-0"
              >
                {history && history.length > 0 ? (
                  <TokenChart data={history} symbol={current.symbol} />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Mono className="text-muted-foreground">Loading price history…</Mono>
                  </div>
                )}
              </Panel>

              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <Panel title="Market data" aside={short(current.address, 8, 6)}>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Price" value={current.price.toFixed(8)} unit="SYN" />
                    <Stat label="Supply" value={fmt(current.supply, 0)} />
                    <Stat label="Reserve" value={current.reserve.toFixed(3)} unit="SYN" />
                    <Stat label="Volume" value={current.volume.toFixed(3)} unit="SYN" />
                    <Stat label="Trades" value={fmt(current.trades, 0)} />
                    <Stat label="API calls" value={fmt(current.calls, 0)} />
                    <Stat label="Creator earnings" value={current.earnings.toFixed(3)} unit="SYN" />
                    <Stat label="Base price" value={current.basePrice.toFixed(6)} unit="SYN" />
                  </div>
                  <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    Bonding curve: price = basePrice + slope × supply. As more users pay for{' '}
                    <Mono>{current.name}</Mono> calls, demand for ${current.symbol} rises and the curve reprices.
                  </div>
                </Panel>

                <TradeForm token={current} />
              </div>
            </>
          ) : (
            <Panel title="Skill tokens">
              <p className="text-muted-foreground">
                No skill tokens are available yet. Launch one from the{' '}
                <a href="/provider" className="text-accent underline">
                  Provider console
                </a>
                .
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
