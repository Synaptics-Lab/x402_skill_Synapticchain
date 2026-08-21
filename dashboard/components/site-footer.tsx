import Link from 'next/link'
import { CHAIN, CONTRACTS } from '@/lib/chain/contracts'
import { Mono, short } from '@/components/kit'

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-foreground">
      <div className="mx-auto grid max-w-[1400px] gap-0 md:grid-cols-4">
        <div className="border-b border-foreground p-6 md:border-b-0 md:border-r">
          <span className="display text-3xl">Synapse</span>
          <p className="mt-2 max-w-[24ch] font-mono text-[11px] leading-relaxed text-muted-foreground">
            Machine-payable APIs. HTTP 402 invoices, settled on {CHAIN.name} in {CHAIN.finalityMs}ms.
          </p>
        </div>

        <div className="border-b border-foreground p-6 md:border-b-0 md:border-r">
          <p className="label text-muted-foreground">Surfaces</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {[
              ['/', 'Marketplace'],
              ['/provider', 'Provider dashboard'],
              ['/console', 'Consumer console'],
              ['/gateway', 'Gateway + client lib'],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="font-mono text-xs underline-offset-4 hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-b border-foreground p-6 md:col-span-2 md:border-b-0">
          <p className="label text-muted-foreground">Deployed contracts</p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {Object.entries(CONTRACTS).map(([name, c]) => (
              <li key={name} className="flex items-baseline justify-between gap-2 border-b border-hairline pb-1">
                <Mono className="text-foreground">{name}</Mono>
                <Mono className="text-muted-foreground">{short(c.address, 10, 6)}</Mono>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-foreground bg-foreground px-6 py-3 text-background flex flex-col sm:flex-row items-center justify-between gap-2">
        <Mono className="text-background/80 text-xs">
          Made with <span className="text-amber-500">🧡</span> in Africa · © {new Date().getFullYear()} Synaptics Lab. All rights reserved.
        </Mono>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Synaptics-Lab/Synapse_x402"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono text-xs text-background/80 hover:text-background transition-colors underline decoration-dotted"
          >
            <svg className="size-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span>Synapse_x402</span>
          </a>
          <Mono className="text-background/50 text-[11px]">
            chainId {CHAIN.chainId} · {CHAIN.finalityMs}ms finality
          </Mono>
        </div>
      </div>
    </footer>
  )
}
