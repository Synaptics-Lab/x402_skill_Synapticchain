'use client'

import { useCallback, useMemo, useState } from 'react'
import { Btn, Mono, Tag, inputCls } from '@/components/kit'
import { useWallet } from '@/components/wallet-provider'
import { x402fetch } from '@/lib/x402-client'
import type { X402Step } from '@/lib/x402-client'
import type { Endpoint } from '@/lib/chain/types'

const PHASE_LABEL: Record<X402Step['phase'], string> = {
  request: '01 request',
  challenge: '02 402 challenge',
  sign: '03 sign tx',
  submitted: '04 submitted',
  settled: '05 finalised',
  retry: '06 replay',
  done: '07 response',
}

export function X402Runner({ endpoint }: { endpoint: Endpoint }) {
  const { wallet, state, connect, refresh, notify } = useWallet()
  const [steps, setSteps] = useState<X402Step[]>([])
  const [body, setBody] = useState(endpoint.sampleBody ?? '')
  const [output, setOutput] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ status: number; mode: string; cost: string; latency: string } | null>(null)
  const [running, setRunning] = useState(false)

  const sub = useMemo(
    () => state?.subscriptions.find((s) => s.endpointId === endpoint.id && s.expiresAt > Date.now()) ?? null,
    [state?.subscriptions, endpoint.id],
  )

  const run = useCallback(
    async (useSub: boolean) => {
      if (!wallet) {
        await connect()
        return
      }
      setRunning(true)
      setSteps([])
      setOutput(null)
      setMeta(null)
      const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || '/x402'
      try {
        const res = await x402fetch(`${gatewayUrl}${endpoint.route}`, {
          method: endpoint.method,
          headers: endpoint.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
          body: endpoint.method === 'POST' ? body || '{}' : undefined,
          wallet: { ...wallet, connector: wallet.connector },
          endpointId: endpoint.id,
          subscriptionTokenId: useSub && sub ? sub.tokenId : undefined,
          maxPrice: 5,
          onStep: (s) => setSteps((prev) => [...prev, s]),
        })
        const text = await res.text()
        try {
          setOutput(JSON.stringify(JSON.parse(text), null, 2))
        } catch {
          setOutput(text)
        }
        setMeta({
          status: res.status,
          mode: res.headers.get('X-402-Mode') ?? 'n/a',
          cost: res.headers.get('X-402-Cost') ?? '0',
          latency: res.headers.get('X-402-Upstream-Latency') ?? '—',
        })
        refresh()
      } catch (err) {
        notify({ kind: 'err', title: 'x402 flow aborted', body: (err as Error).message })
        setOutput(`// ${(err as Error).message}`)
      } finally {
        setRunning(false)
      }
    },
    [wallet, connect, endpoint, body, sub, refresh, notify],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag>{endpoint.method}</Tag>
        <Mono className="break-all text-muted-foreground">/x402{endpoint.route}</Mono>
      </div>

      {endpoint.method === 'POST' && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          spellCheck={false}
          aria-label="Request body"
          className={`${inputCls} h-auto resize-y py-2 leading-relaxed`}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Btn variant="accent" size="sm" onClick={() => run(false)} disabled={running}>
          {running ? 'Settling…' : `Pay ${endpoint.pricePerCall} SYN & call`}
        </Btn>
        {sub && (
          <Btn variant="quiet" size="sm" onClick={() => run(true)} disabled={running}>
            Call via NFT #{sub.tokenId}
          </Btn>
        )}
      </div>

      {steps.length > 0 && (
        <ol className="border border-hairline">
          {steps.map((s, i) => (
            <li
              key={`${s.phase}-${i}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline px-2.5 py-1.5 last:border-b-0"
            >
              <Mono className="w-32 shrink-0 uppercase tracking-widest text-accent">{PHASE_LABEL[s.phase]}</Mono>
              <Mono className="min-w-0 flex-1 break-all">{s.label}</Mono>
            </li>
          ))}
        </ol>
      )}

      {meta && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border border-foreground bg-secondary px-2.5 py-2">
          <Mono>
            status <span className="font-semibold text-signal">{meta.status}</span>
          </Mono>
          <Mono>mode {meta.mode}</Mono>
          <Mono>cost {meta.cost} SYN</Mono>
          <Mono>upstream {meta.latency}ms</Mono>
        </div>
      )}

      {output && (
        <pre className="max-h-64 overflow-auto border border-foreground bg-foreground p-3 font-mono text-[11px] leading-relaxed text-background">
          {output}
        </pre>
      )}
    </div>
  )
}
