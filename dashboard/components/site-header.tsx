'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Btn, Mono, short, Tag } from '@/components/kit'
import { useWallet } from '@/components/wallet-provider'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Market' },
  { href: '/skills', label: 'Skills' },
  { href: '/provider', label: 'Provider' },
  { href: '/gateway', label: 'Gateway' },
  { href: '/odl', label: 'ODL Corridors' },
  { href: '/docs', label: 'Docs' },
  { href: '/help', label: 'Help' },
]

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {open ? (
        <path d="M6 6L18 18M6 18L18 6" strokeLinecap="square" />
      ) : (
        <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="square" />
      )}
    </svg>
  )
}

export function SiteHeader() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const { wallet, connect, connecting, disconnect, state, liveBalance, liveHealth } = useWallet()

  return (
    <header className="sticky top-0 z-40 border-b border-foreground bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-stretch">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 border-r border-foreground px-4 transition-colors hover:bg-foreground hover:text-background"
        >
          <span className="display text-xl">Synapse</span>
          <span className="label border border-accent px-1 py-0.5 leading-none text-accent">402</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-stretch lg:flex">
          {NAV.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'label flex items-center border-r border-foreground px-4 transition-colors',
                  active ? 'bg-foreground text-background' : 'hover:bg-secondary',
                )}
                onClick={() => setMenuOpen(false)}
              >
                {n.label}
              </Link>
            )
          })}
          <a
            href="https://github.com/Synaptics-Lab/Synapse_x402"
            target="_blank"
            rel="noopener noreferrer"
            className="label flex items-center gap-1.5 border-r border-foreground px-3 transition-colors hover:bg-secondary hover:text-foreground"
            title="GitHub Repository"
          >
            <svg className="size-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
          className="label ml-2 flex h-14 w-14 shrink-0 items-center justify-center border-l border-foreground transition-colors hover:bg-secondary lg:hidden"
        >
          <MenuIcon open={menuOpen} />
        </button>

        <div className="hidden min-w-0 flex-1 items-center gap-2 px-3 xl:flex">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn('size-2 shrink-0 animate-pulse', liveHealth.error || liveHealth.ws === 'down' ? 'bg-accent' : 'bg-signal')}
              aria-hidden
            />
            <Mono className="truncate text-xs text-muted-foreground">
              blk {state?.head.block.toLocaleString() ?? liveHealth.lastBlock.toLocaleString() ?? '—'} ·{' '}
              {state?.head.finalityMs && state.head.finalityMs > 0 ? state.head.finalityMs : 420}ms ·{' '}
              {state?.head.tps.toLocaleString() ?? '0.32'} tps
              {liveHealth.error && (
                <span className="ml-2 text-accent" title={liveHealth.error}>
                  (gateway fallback)
                </span>
              )}
            </Mono>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 border-l border-foreground px-3" suppressHydrationWarning>
          {wallet ? (
            <>
              <div className="hidden text-right sm:block">
                <Mono className="block leading-tight">{short(wallet.address, 8, 6)}</Mono>
                <Mono className={cn('block leading-tight', liveBalance.error ? 'text-accent' : 'text-muted-foreground')}>
                  {liveBalance.isLoading && liveBalance.value == null
                    ? 'reading balance…'
                    : liveBalance.error
                      ? `${(state?.account?.syn ?? 0).toFixed(2)} SYN (sim)`
                      : `${liveBalance.value != null ? liveBalance.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : (state?.account?.syn ?? 0).toFixed(2)} SYN`}
                </Mono>
              </div>
              <a href="https://wallet.synapticchain.xyz" target="_blank" rel="noopener noreferrer">
                <Btn variant="quiet" size="sm">
                  Wallet
                </Btn>
              </a>
              <Btn variant="ghost" size="sm" onClick={disconnect}>
                Exit
              </Btn>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <a
                href="https://wallet.synapticchain.xyz/?return_to=https://api.synapticchain.xyz/skills"
                className="hidden sm:inline-block"
              >
                <Btn variant="quiet" size="sm">
                  Matrix Wallet
                </Btn>
              </a>
              <Link href="/login?next=/skills">
                <Btn variant="accent" size="sm" disabled={connecting}>
                  {connecting ? 'Handshake…' : 'Connect Web4'}
                </Btn>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile navigation dropdown */}
      {menuOpen && (
        <div
          id="mobile-nav"
          className="absolute left-0 right-0 top-14 z-50 border-b border-foreground bg-background shadow-lg lg:hidden"
        >
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV.map((n) => {
              const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href)
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'label border-b border-foreground px-4 py-3 transition-colors',
                    active ? 'bg-foreground text-background' : 'hover:bg-secondary',
                  )}
                >
                  {n.label}
                </Link>
              )
            })}
            <a
              href="https://github.com/Synaptics-Lab/Synapse_x402"
              target="_blank"
              rel="noopener noreferrer"
              className="label flex items-center gap-2 border-b border-foreground px-4 py-3 transition-colors hover:bg-secondary"
            >
              <svg className="size-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              GitHub
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
