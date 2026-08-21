'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/components/wallet-provider'
import { deriveKeypair } from '@/lib/chain/crypto'
import { Button } from '@/components/ui/button'
import { Web4ConnectModal } from '@/components/web4-connect-modal'
import { Wallet, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LoginPanel() {
  const router = useRouter()
  const { wallet, connect, connecting } = useWallet()
  const [showModal, setShowModal] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Automatically redirect if already connected
  useEffect(() => {
    if (wallet?.address) {
      const nextUrl = new URLSearchParams(window.location.search).get('next') || '/skills'
      window.location.href = nextUrl
    }
  }, [wallet?.address])

  const handleGoogle = useCallback(
    async (idToken: string) => {
      setGoogleLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Google sign-in failed')

        const { address, privateKeyHex } = deriveKeypair(body.email)

        await connect({
          address,
          privateKey: privateKeyHex,
          connector: 'google',
          email: body.email,
          name: body.name,
          picture: body.picture,
        })
        
        await fetch('/api/onboard', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address, email: body.email, name: body.name, googleSub: body.sub, source: 'google' })
        }).catch(() => {})

        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: body.email, name: body.name, sub: body.sub, address, onboarded: true })
        }).catch(() => {})
        
        localStorage.setItem(`synapse.account.email.${body.email}`, JSON.stringify({
          name: body.name, sub: body.sub, address, createdAt: Date.now()
        }))

        setShowModal(false)
        const nextUrl = new URLSearchParams(window.location.search).get('next') || '/skills'
        window.location.href = nextUrl
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setGoogleLoading(false)
      }
    },
    [connect],
  )

  const handleWeb4 = useCallback(
    async (address: string) => {
      setError(null)
      try {
        await connect({ address, connector: 'synaptic' })
        
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address, connector: 'synaptic', onboarded: true })
        }).catch(() => {})

        let currentEmail = null;
        const cookieMatch = document.cookie.match(/(?:(?:^|.*;\s*)synapse_session\s*\=\s*([^;]*).*$)|^.*$/)
        if (cookieMatch && cookieMatch[1]) {
          try {
            const parsed = JSON.parse(decodeURIComponent(cookieMatch[1]))
            currentEmail = parsed.email
          } catch (e) {}
        }

        if (currentEmail) {
          const storedEmailStr = localStorage.getItem(`synapse.account.email.${currentEmail}`)
          if (storedEmailStr) {
            try {
              const emailAccount = JSON.parse(storedEmailStr)
              localStorage.setItem(`synapse.account.unified.${address}`, JSON.stringify({
                ...emailAccount,
                address
              }))
            } catch (e) {}
          }
        }
        
        setShowModal(false)
        const nextUrl = new URLSearchParams(window.location.search).get('next') || '/skills'
        window.location.href = nextUrl
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [connect],
  )

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="space-y-2">
        <h1 className="display text-3xl text-foreground">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Google creates a deterministic SynapticChain wallet. Web4 pairs with the Matrix Wallet by QR code
          or an already-injected wallet.
        </p>
      </div>

      <div className="space-y-3">
        <a
          href="https://wallet.synapticchain.xyz/?return_to=https://api.synapticchain.xyz/skills"
          className="block w-full"
        >
          <Button
            type="button"
            className="h-12 w-full justify-start gap-3 border-2 border-accent bg-accent px-4 font-sans text-sm font-semibold text-accent-foreground hover:bg-accent/90"
          >
            <Wallet className="size-5" />
            Launch Matrix Wallet (Auto-Airdrop & Return)
          </Button>
        </a>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-hairline" />
          <span className="label text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-hairline" />
        </div>

        <Button
          className="h-12 w-full justify-start gap-3 bg-foreground px-4 font-sans text-sm font-semibold text-primary-foreground hover:bg-foreground/90"
          onClick={() => setShowModal(true)}
          disabled={connecting || googleLoading}
        >
          <Wallet className="size-5" />
          {connecting ? 'Connecting…' : 'Pair with QR / Injected Web4'}
        </Button>

        <Button
          variant="outline"
          className="h-12 w-full justify-start gap-3 border-2 border-foreground bg-card px-4 font-sans text-sm font-semibold hover:bg-secondary"
          onClick={() => setShowModal(true)}
          disabled={connecting || googleLoading}
        >
          <GoogleIcon className="size-5" />
          {googleLoading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Signing in…
            </>
          ) : (
            'Continue with Google'
          )}
        </Button>
      </div>

      {error && (
        <p className="border border-accent bg-accent/10 px-3 py-2 text-xs text-accent">{error}</p>
      )}

      <p className="text-center text-xs text-muted-foreground">
        By signing in, you agree to the x402 marketplace terms. No private keys leave your device.
      </p>

      <Web4ConnectModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onGoogleCredential={handleGoogle}
        onWeb4Address={handleWeb4}
      />

      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur">
          <div className="relative w-full max-w-md border-2 border-foreground bg-card p-6 shadow-[6px_6px_0_0_var(--foreground)]">
            <h2 className="display text-2xl">Welcome!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account is ready. Download the Matrix Wallet at wallet.synapticchain.xyz and sign in with Google to link your wallet address to this account.
            </p>
            <Button
              className="mt-6 w-full"
              onClick={() => {
                setShowOnboarding(false)
                const nextUrl = new URLSearchParams(window.location.search).get('next') || '/provider'
                router.push(nextUrl)
              }}
            >
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('shrink-0', className)} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
