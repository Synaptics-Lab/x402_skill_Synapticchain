'use client'

import Link from 'next/link'
import { Btn, Mono, fmt } from '@/components/kit'
import { EventLog } from '@/components/event-log'
import { useWallet } from '@/components/wallet-provider'
import { CHAIN } from '@/lib/chain/contracts'

const FLOW = [
  ['GET', 'agent hits a gated endpoint'],
  ['402', 'gateway mints an invoice hash'],
  ['TX', 'pay_per_call settles in <500ms'],
  ['200', 'request replays with a signed receipt'],
]

export function Hero() {
  const { state } = useWallet()
  const t = state?.totals

  return (
    <section className="relative overflow-hidden border-b-2 border-foreground">
      <div className="grid-paper pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-6 border-hairline p-5 sm:p-8 lg:border-r">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label border border-foreground bg-accent px-2 py-1 text-accent-foreground">
              HTTP 402 · live
            </span>
            <Mono className="text-muted-foreground">
              chainId {CHAIN.chainId} · finality {state?.head.finalityMs ?? CHAIN.finalityMs}ms
            </Mono>
          </div>

          <h1 className="display text-[clamp(2.75rem,9vw,7rem)] text-balance">
            APIs that
            <br />
            invoice
            <br />
            <span className="text-accent">machines.</span>
          </h1>

          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
            Wrap any HTTP service in the x402 gateway. Bots receive a payment-required invoice, settle it on
            SynapticChain, and replay the call with a signed receipt — no keys, no accounts, no invoices to chase.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link href="#market">
              <Btn variant="accent">Browse registry</Btn>
            </Link>
            <Link href="/provider">
              <Btn variant="solid">List an API</Btn>
            </Link>
            <Link href="/login">
              <Btn variant="ghost">Connect Web4</Btn>
            </Link>
          </div>

          <dl className="grid grid-cols-2 border-t border-foreground sm:grid-cols-4">
            {[
              ['Endpoints (seeded)', t ? String(t.endpoints) : '—'],
              ['Calls metered (seeded)', t ? fmt(t.calls, 0) : '—'],
              ['SYN settled (seeded)', t ? fmt(t.settled) : '—'],
              ['Providers (seeded)', t ? String(t.providers) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="border-b border-r border-hairline px-3 py-3 last:border-r-0">
                <dt className="label text-muted-foreground">{k}</dt>
                <dd className="font-mono text-xl font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col">
          <ol className="border-b border-foreground">
            {FLOW.map(([code, text], i) => (
              <li key={code} className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
                <span
                  className={`label flex size-9 shrink-0 items-center justify-center border ${
                    i === 1 ? 'border-accent bg-accent text-accent-foreground' : 'border-foreground'
                  }`}
                >
                  {code}
                </span>
                <span className="text-sm leading-snug">{text}</span>
              </li>
            ))}
          </ol>
          <div className="min-h-0 flex-1 bg-card">
            <EventLog limit={9} />
          </div>
        </div>
      </div>
    </section>
  )
}
