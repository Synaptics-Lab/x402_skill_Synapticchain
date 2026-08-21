'use client'

import { useCallback, useEffect, useState } from 'react'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { X, Wallet, ScanLine, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toDataURL } from 'qrcode'

const API_HOST = process.env.NEXT_PUBLIC_APP_URL ?? 'https://api.synapticchain.xyz'

export function Web4ConnectModal({
  open,
  onClose,
  onGoogleCredential,
  onWeb4Address,
}: {
  open: boolean
  onClose: () => void
  onGoogleCredential: (idToken: string) => void
  onWeb4Address: (address: string) => void
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [pairingId, setPairingId] = useState<string | null>(null)
  const [pairError, setPairError] = useState<string | null>(null)
  const [pairing, setPairing] = useState(false)
  const [checkingWallet, setCheckingWallet] = useState(false)

  const startPairing = useCallback(async () => {
    setPairing(true)
    setPairError(null)
    try {
      const res = await fetch('/api/pair/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'api.synapticchain.xyz' }),
      })
      if (!res.ok) throw new Error('pairing init failed')
      const { qrUrl, pairingId } = (await res.json()) as { qrUrl: string; pairingId: string }
      setPairingId(pairingId)
      setQrUrl(await toDataURL(qrUrl, { width: 240, margin: 2 }))
    } catch (err: any) {
      setPairError(err.message ?? 'pairing failed')
    } finally {
      setPairing(false)
    }
  }, [])

  // Poll the pairing session until the wallet confirms it.
  useEffect(() => {
    if (!pairingId || !open) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/pair/${pairingId}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { status: string; address?: string }
        if (!cancelled && data.status === 'confirmed' && data.address) {
          onWeb4Address(data.address)
          onClose()
          setPairingId(null)
          setQrUrl(null)
        }
      } catch {
        // ignore poll failures; next tick will retry
      }
    }
    const interval = setInterval(poll, 1200)
    poll()
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [pairingId, open, onWeb4Address])

  const connectInjected = useCallback(async () => {
    if (typeof window === 'undefined' || !window.synaptic?.connect) return
    setCheckingWallet(true)
    try {
      const res = await window.synaptic.connect()
      const address = typeof res === 'string' ? res : res.address
      onWeb4Address(address)
    } catch (err: any) {
      setPairError(err.message ?? 'wallet connection failed')
    } finally {
      setCheckingWallet(false)
    }
  }, [onWeb4Address])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur">
      <div className="relative w-full max-w-md border-2 border-foreground bg-card p-6 shadow-[6px_6px_0_0_var(--foreground)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>

        <h2 className="display text-2xl">Connect to SYNAPSE</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose the path that matches your device. Your keys never leave your wallet.
        </p>

        <div className="mt-6 space-y-4">
          <div className="space-y-3">
            <h3 className="label flex items-center gap-2 text-muted-foreground">
              <Wallet className="size-4" /> Web4 wallet
            </h3>
            {typeof window !== 'undefined' && window.synaptic?.connect ? (
              <Button className="w-full" onClick={connectInjected} disabled={checkingWallet}>
                {checkingWallet ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Connect injected wallet
              </Button>
            ) : (
              <div className="space-y-3">
                {!qrUrl && !pairing && (
                  <Button variant="outline" className="w-full" onClick={startPairing}>
                    <ScanLine className="mr-2 size-4" /> Pair with QR code
                  </Button>
                )}
                {pairing && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="size-6 animate-spin text-accent" />
                  </div>
                )}
                {qrUrl && pairingId && (
                  <div className="flex flex-col items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrUrl} alt="Wallet pairing QR code" className="border border-foreground p-1" />
                    <p className="text-center text-xs text-muted-foreground">
                      Scan with the Matrix Wallet at wallet.synapticchain.xyz
                    </p>
                    <div className="flex flex-col gap-1 text-center">
                      <a
                        href={`https://wallet.synapticchain.xyz/pair?id=${pairingId}&return_to=https://api.synapticchain.xyz/skills`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent underline font-semibold"
                      >
                        Open Matrix Wallet in new tab & pair
                      </a>
                      <a
                        href="https://wallet.synapticchain.xyz/?return_to=https://api.synapticchain.xyz/skills"
                        className="text-[11px] text-muted-foreground hover:underline"
                      >
                        Or login directly on Matrix Wallet (Google / Seedless)
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-hairline" />
            <span className="label text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-hairline" />
          </div>

          <div className="space-y-3">
            <h3 className="label text-muted-foreground">Sign in with Google</h3>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={(credentialResponse: CredentialResponse) => {
                  if (credentialResponse.credential) {
                    onGoogleCredential(credentialResponse.credential)
                  }
                }}
                onError={() => {
                  setPairError('Google sign-in failed')
                }}
                useOneTap={false}
                shape="rectangular"
                width="260"
              />
            </div>
          </div>

          {pairError && (
            <p className="border border-accent bg-accent/10 px-3 py-2 text-xs text-accent">{pairError}</p>
          )}
        </div>
      </div>
    </div>
  )
}
