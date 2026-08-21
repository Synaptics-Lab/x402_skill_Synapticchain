'use client'

import { useEffect } from 'react'
import { Btn, Mono } from '@/components/kit'

/** Embedded MoltMarket trading terminal for a service token. */
export function TradeModal({
  token,
  symbol,
  onClose,
}: {
  token: string
  symbol: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const src = `https://moltmarket.com/trade?token=${token}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Trade ${symbol} on MoltMarket`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      <button
        type="button"
        aria-label="Close trading terminal"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/70"
      />
      <div className="relative flex h-[min(78vh,720px)] w-full max-w-4xl flex-col border-2 border-foreground bg-card shadow-[8px_8px_0_0_var(--accent)]">
        <header className="flex items-center justify-between gap-3 border-b-2 border-foreground bg-foreground px-3 py-2 text-background">
          <div className="flex items-baseline gap-2">
            <span className="display text-lg">{symbol}</span>
            <Mono className="opacity-70">moltmarket.com/trade</Mono>
          </div>
          <Btn variant="accent" size="sm" onClick={onClose}>
            Close
          </Btn>
        </header>
        <div className="flex items-center gap-2 border-b border-hairline px-3 py-1.5">
          <Mono className="text-muted-foreground">token</Mono>
          <Mono className="break-all">{token}</Mono>
        </div>
        <iframe
          src={src}
          title={`MoltMarket trading terminal for ${symbol}`}
          className="min-h-0 flex-1 bg-background"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
        />
        <footer className="border-t border-hairline px-3 py-2">
          <Mono className="text-muted-foreground">
            External venue. Bonding-curve mints settle on SynapticChain; secondary flow routes through MoltMarket.
          </Mono>
        </footer>
      </div>
    </div>
  )
}
