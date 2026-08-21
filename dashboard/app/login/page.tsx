import type { Metadata } from 'next'
import { LoginPanel } from '@/components/login-panel'

export const metadata: Metadata = {
  title: 'Sign in — SYNAPSE',
  description: 'Sign in to the x402 Agentic API Marketplace with Google or your SynapticChain Web4 wallet.',
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-background">
      {/* Left brand panel */}
      <section className="relative hidden w-[55%] flex-col justify-between lg:flex">
        <div className="absolute inset-0 bg-accent" />
        <div className="grid-paper absolute inset-0 opacity-20" />

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* Orbital rings */}
          <svg
            className="absolute -right-1/4 top-1/2 h-[120%] w-[120%] -translate-y-1/2 text-accent-foreground/10"
            viewBox="0 0 800 800"
            fill="none"
          >
            <circle cx="400" cy="400" r="280" stroke="currentColor" strokeWidth="1" />
            <circle cx="400" cy="400" r="360" stroke="currentColor" strokeWidth="1" strokeDasharray="8 8" />
            <circle cx="400" cy="400" r="440" stroke="currentColor" strokeWidth="1" />
            <ellipse
              cx="400"
              cy="400"
              rx="520"
              ry="180"
              stroke="currentColor"
              strokeWidth="1"
              transform="rotate(-22 400 400)"
            />
          </svg>

          {/* Connected nodes */}
          {[...Array(24)].map((_, i) => {
            const angle = (i / 24) * Math.PI * 2
            const radius = 140 + Math.random() * 220
            const x = 50 + Math.cos(angle) * radius * 0.35
            const y = 50 + Math.sin(angle) * radius * 0.55
            return (
              <span
                key={i}
                className="absolute h-1.5 w-1.5 rounded-full bg-accent-foreground/40"
                style={{ left: `${x}%`, top: `${y}%` }}
              />
            )
          })}
        </div>

        <div className="relative z-10 p-10">
          <div className="flex items-center gap-3">
            <span className="display text-2xl text-accent-foreground">SYNAPSE</span>
            <span className="label border border-accent-foreground/40 px-2 py-0.5 text-accent-foreground">
              x402
            </span>
          </div>
        </div>

        <div className="relative z-10 max-w-xl p-10">
          <p className="display text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.9] text-accent-foreground">
            APIs that invoice machines.
          </p>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-accent-foreground/80">
            Wrap any HTTP service in a payment-required proxy. Bots settle per-call charges on
            SynapticChain and replay with a signed receipt — no API keys, no accounts.
          </p>
        </div>

        <div className="relative z-10 p-10">
          <p className="label text-accent-foreground/60">
            SynapticChain · sub-500ms finality · HTTP 402 protocol
          </p>
        </div>
      </section>

      {/* Right login panel */}
      <section className="relative z-10 flex flex-1 items-center justify-center p-6">
        <LoginPanel />
      </section>
    </div>
  )
}
