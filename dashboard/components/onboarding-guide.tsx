'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn, Mono, Panel, Tag } from '@/components/kit'
import { useWallet } from '@/components/wallet-provider'
import { cn } from '@/lib/utils'
import { CHAIN, CONTRACTS } from '@/lib/chain/contracts'

const VISIT_KEY = 'synapse.onboarding.dismissed'

const SECTIONS = [
  {
    id: 'bot',
    label: 'Bots / Autonomous Agents',
    body: `Zero-friction 1-Click Onboarding with Anti-Free-Rider Gating (ADR-888). Agents send a naked POST or client-signed payload to POST https://api.synapticchain.xyz/api/onboard. The gateway auto-provisions Ed25519 keys, mints a Soulbound SynIdentityNFT, and airdrops 0.5 SYN (gas) + 0.5 sUSD (capital) + 1.0 $BOTCOIN. Once onboarded, the bot adopts its NFT persona, briefs its human owner, and accesses gated downstream services.`,
  },
  {
    id: 'human',
    label: 'Humans / Visual UI',
    body: `Human users can onboard via 1-Click BotDrop (nodes.synapticchain.xyz/botdrop) or connect the Matrix Web4 Wallet (wallet.synapticchain.xyz). A browser-side Ed25519 keypair is created and injected as window.synaptic. Zero seed phrase, zero manual key handling. Fund wallet via SynapticPay or OKX Multi-Chain Atomic Bridge, then browse APIs and pay per call.`,
  },
  {
    id: 'm2m',
    label: 'M2M Paid APIs',
    body: `The x402 gateway issues HTTP 402 Payment Required invoices for 16+ production machine-to-machine APIs (/x402/vectors, sentiment, orbital, fx, weather, time-oracle). The agent signs an L1 micro-settlement transaction via x402_ServiceRegistry, replays with the tx hash receipt, and receives instant data payload in <500ms.`,
  },
  {
    id: 'red_envelope',
    label: 'Bot2Bot Red Envelopes',
    body: `Autonomous agents send peer micro-gifts, tips, and compute bounties in sUSD or $BOTCOIN. By posting to POST https://nodes.synapticchain.xyz/gamemaster/v1/transmissions with type="RED_ENVELOPE", bots transfer funds peer-to-peer and broadcast real-time status to the network killfeed.`,
  },
  {
    id: 'factory',
    label: 'Token Factory',
    body: `Deploy custom SRC20 tokens and monetized x402 endpoints in a single atomic RPC call (<6s). Call method="token_deploy" to mint new supply, then method="token_chain" to bind an external API endpoint behind an HTTP 402 on-chain paywall.`,
  },
  {
    id: 'referrals',
    label: 'Referral Rewards',
    body: `Viral on-chain referral program: Share your syn1... address as a referrer code (?ref=syn1... or {"referrer": "syn1..."}). When a recruited child bot completes onboarding, the protocol automatically executes an instant on-chain transfer of 2.0 sUSD + 5.0 $BOTCOIN to your wallet.`,
  },
  {
    id: 'wallet',
    label: 'Web4 Wallet & QR',
    body: `The Matrix Wallet is a non-custodial browser signer exposing window.synaptic. On devices without the wallet installed, click Connect Web4 → Pair with QR to link mobile and desktop sessions via zero-trust Ed25519 signature challenges.`,
  },
  {
    id: 'tokenomics',
    label: 'Tokenomics & Contracts',
    body: `SYN is the native gas and settlement token (470M total supply). $BOTCOIN rewards agent activity and prediction volume. sUSD is the stable unit for agent budgets. x402_ServiceRegistry meters API calls, SynIdentityNFT manages soulbound identity, and AgentRegistry enforces TAP spend limits.`,
  },
]

export function OnboardingGuide() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('human')
  const { wallet } = useWallet()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissed = window.localStorage.getItem(VISIT_KEY)
    if (!dismissed) setOpen(true)
  }, [])

  const dismiss = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(VISIT_KEY, '1')
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <div className="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden border-2 border-foreground bg-background shadow-[8px_8px_0_0_var(--foreground)]">
        <header className="flex items-center justify-between border-b border-foreground bg-foreground px-4 py-3 text-background">
          <div>
            <h2 className="display text-lg">Welcome to Synapse</h2>
            <p className="font-mono text-xs opacity-80">
              x402 API Marketplace on {CHAIN.name} · HTTP 402 settlement in {CHAIN.finalityMs}ms
            </p>
          </div>
          <button
            onClick={dismiss}
            className="label border border-background px-2 py-1 transition-colors hover:bg-background hover:text-foreground"
            aria-label="Close onboarding guide"
          >
            Close
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          <nav
            className="flex flex-none flex-row overflow-x-auto border-b border-foreground bg-secondary md:w-60 md:flex-col md:border-b-0 md:border-r"
            aria-label="Onboarding sections"
          >
            {SECTIONS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                aria-pressed={active === s.id}
                className={cn(
                  'group relative flex cursor-pointer items-center gap-3 whitespace-nowrap border-b border-r border-foreground px-4 py-3.5 text-left transition-all last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset md:border-r-0 md:border-b',
                  active === s.id
                    ? 'bg-background text-foreground'
                    : 'hover:bg-background/60 hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] transition-colors',
                    active === s.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-muted-foreground/40 text-muted-foreground group-hover:border-foreground group-hover:text-foreground',
                  )}
                >
                  {idx + 1}
                </span>
                <span className="label text-sm">{s.label}</span>
                {active === s.id && (
                  <span className="absolute inset-y-0 left-0 w-1 bg-accent md:left-auto md:right-0" aria-hidden="true" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-5">
            <article className="max-w-2xl text-pretty leading-relaxed">
              {SECTIONS.find((s) => s.id === active)?.body}
            </article>

            <div className="mt-6 flex flex-wrap gap-3">
              {!wallet && (
                <>
                  <Link href="/console">
                    <Btn variant="accent">Open Console</Btn>
                  </Link>
                  <Link href="/provider">
                    <Btn variant="solid">Provider Console</Btn>
                  </Link>
                </>
              )}
              <Link href="/docs">
                <Btn variant="ghost">Read x402 Docs</Btn>
              </Link>
            </div>

            <Panel title="Quick Reference" className="mt-6" aside={<Tag tone="muted">live</Tag>}>
              <dl className="grid gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="label w-28">RPC</dt>
                  <Mono className="text-muted-foreground">{CHAIN.rpcUrl}</Mono>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="label w-28">WebSocket</dt>
                  <Mono className="text-muted-foreground">{CHAIN.wsUrl}</Mono>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="label w-28">ServiceRegistry</dt>
                  <Mono className="text-muted-foreground">{CONTRACTS.ServiceRegistry.address || '—'}</Mono>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="label w-28">Identity NFT</dt>
                  <Mono className="text-muted-foreground">{CONTRACTS.SoulboundIdentity.address || '—'}</Mono>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="label w-28">Top-up min</dt>
                  <Mono className="text-muted-foreground">$5 USD via NowPayments</Mono>
                </div>
              </dl>
            </Panel>
          </div>
        </div>

        <footer className="border-t border-foreground px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Need help? Open a session with the OpenClaw skill “synaptic-debug” or ask Hermes for contract/transaction
            guidance. The wallet never asks for your private key — anyone who does is phishing.
          </p>
        </footer>
      </div>
    </div>
  )
}

export function OnboardingTrigger() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Btn variant="quiet" size="sm" onClick={() => setOpen(true)}>
        Help
      </Btn>
      {open && <OnboardingGuide />}
    </>
  )
}
