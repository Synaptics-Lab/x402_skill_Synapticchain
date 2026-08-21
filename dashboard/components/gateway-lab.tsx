'use client'

import { useState } from 'react'
import { Btn, Mono, Panel, Tag, short } from '@/components/kit'
import { CopyBlock } from '@/components/copy-block'
import { useWallet } from '@/components/wallet-provider'
import { CHAIN, CONTRACTS } from '@/lib/chain/contracts'
import { cn } from '@/lib/utils'

const INSTALL = `npm i @synaptic/x402-client`

const USAGE = `import x402fetch from '@synaptic/x402-client'

const wallet = { address: '0xbot…', privateKey: process.env.BOT_KEY }

// pays the invoice, waits for PaymentProcessed, replays with a receipt
const res = await x402fetch('https://gw.example.com/sentiment', {
  method: 'POST',
  body: JSON.stringify({ ticker: 'SYN', window: '60s' }),
  wallet,
  maxPrice: 0.05,            // abort instead of overpaying
  onStep: (s) => console.log(s.phase, s.label),
})

console.log(res.x402)        // { paid, amount, invoiceHash, txHash, block }
const data = await res.json()`

const SUB_USAGE = `// hold a SubscriptionNFT? skip payment entirely
const res = await x402fetch(url, {
  wallet,
  endpointId: '0x8f31a4c7d9021be5',
  subscriptionTokenId: 41822,
})`

const SERVER_SNIPPET = `// gateway/server.js — the 402 challenge
res.status(402)
  .set('WWW-Authenticate',
    \`x402 realm="SynapticChain", invoice="\${invoice.hash}", amount="\${price}", asset="SYN"\`)
  .json({
    x402Version: 1,
    endpointId,
    payTo: registry.address,
    method: 'pay_per_call(bytes32,bytes32)',
    asset: 'SYN',
    amount: String(price),
    invoiceHash: invoice.hash,
    settlementEvent: 'PaymentProcessed',
    retry: { header: 'Authorization', scheme: 'Bearer', encoding: 'base64(json receipt)' },
  })`

export function GatewayLab() {
  const { state, notify } = useWallet()
  const endpoints = state?.endpoints ?? []
  const [target, setTarget] = useState<string | null>(null)
  const [probe, setProbe] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)

  const active = target ?? endpoints[0]?.id ?? null

  const activeEp = endpoints.find((e) => e.id === active)
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || '/x402'

  async function runProbe() {
    if (!active || !activeEp) return
    setProbing(true)
    setProbe(null)
    try {
      const url = `${gatewayUrl}${activeEp.route}`
      const res = await fetch(url, { cache: 'no-store' })
      const body = await res.json()
      const headers = ['www-authenticate', 'x-402-invoice', 'x-402-amount']
        .map((h) => `${h}: ${res.headers.get(h) ?? '—'}`)
        .join('\n')
      setProbe(`HTTP/1.1 ${res.status} ${res.statusText}\n${headers}\n\n${JSON.stringify(body, null, 2)}`)
    } catch (err) {
      notify({ kind: 'err', title: 'Probe failed', body: (err as Error).message })
    } finally {
      setProbing(false)
    }
  }

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-4 border-b-2 border-foreground p-5 sm:p-8">
        <span className="label text-muted-foreground">Protocol / gateway / client</span>
        <h1 className="display text-[clamp(2.25rem,7vw,5.5rem)] text-balance">
          One proxy.
          <br />
          <span className="text-accent">Zero</span> upstream changes.
        </h1>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Mono className="break-all text-muted-foreground">rpc {CHAIN.rpcUrl}</Mono>
          <Mono className="break-all text-muted-foreground">ws {CHAIN.wsUrl}</Mono>
          <Mono className="break-all text-muted-foreground">registry {short(CONTRACTS.ServiceRegistry.address, 10, 6)}</Mono>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <Panel title="Live 402 probe" aside="unauthenticated request">
          <p className="mb-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Hit a gated endpoint with no receipt. The gateway mints an invoice and answers with the challenge
            descriptor an agent needs to settle.
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {endpoints.slice(0, 6).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setTarget(e.id)}
                className={cn(
                  'label border px-2 py-1 transition-colors',
                  e.id === active ? 'border-foreground bg-foreground text-background' : 'border-hairline hover:border-foreground',
                )}
              >
                {e.name}
              </button>
            ))}
          </div>
          <Btn variant="accent" size="sm" onClick={runProbe} disabled={probing || !active}>
            {probing ? 'Probing…' : 'GET without receipt'}
          </Btn>
          {probe && (
            <pre className="mt-3 max-h-80 overflow-auto border border-foreground bg-foreground p-3 font-mono text-[11px] leading-relaxed text-background">
              {probe}
            </pre>
          )}
        </Panel>

        <Panel title="Receipt verification order" aside="gateway/server.js">
          <ol className="flex flex-col">
            {[
              'decode base64 receipt from Authorization: Bearer',
              'reject on endpointId mismatch',
              'recompute the domain-separated signature and compare',
              'subscription receipts → SubscriptionNFT.is_valid(token_id)',
              'payment receipts → invoice must be paid, unconsumed, same payer',
              'mark invoice consumed (single use), then forward upstream',
              'meter latency + call count back into the registry',
            ].map((line, i) => (
              <li key={line} className="flex gap-3 border-b border-hairline py-2 last:border-b-0">
                <Mono className="w-6 shrink-0 text-accent">{String(i + 1).padStart(2, '0')}</Mono>
                <span className="text-sm leading-snug">{line}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Tag tone="accent">402 challenge</Tag>
            <Tag tone="muted">401 bad signature</Tag>
            <Tag tone="muted">404 unregistered</Tag>
            <Tag tone="signal">200 settled</Tag>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="x402-client">
            <CopyBlock label="install" code={INSTALL} />
            <div className="mt-3">
              <CopyBlock label="pay per call" code={USAGE} />
            </div>
            <div className="mt-3">
              <CopyBlock label="subscription receipt" code={SUB_USAGE} />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Gateway challenge">
            <CopyBlock label="server.js" code={SERVER_SNIPPET} />
          </Panel>
          <Panel title="Self-host">
            <CopyBlock
              label="docker"
              code={`docker build -t synapse/x402-gateway ./gateway
docker run -p 8402:8402 \\
  -v $(pwd)/gateway/config.yaml:/app/config.yaml \\
  synapse/x402-gateway:1.0`}
            />
          </Panel>
        </div>
      </div>
    </div>
  )
}
