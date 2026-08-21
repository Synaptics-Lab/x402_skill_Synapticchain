'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { bechAddress, deriveKey, deriveKeypair, digest } from '@/lib/chain/crypto'
import { rpc } from '@/lib/x402-client/index'
import {
  fetchBalance,
  fetchBotcoinBalance,
  fetchIdentity,
  fetchGatewayHealth,
  fetchSUSDBalance,
} from '@/lib/chain/live'
import type { Account, ChainEvent, ChainHead, Endpoint, Identity, Subscription } from '@/lib/chain/types'

export type Wallet = {
  address: string
  /** Only burner/google wallets hold a derived session key locally. Web4 wallets never expose it. */
  privateKey?: string
  connector: 'synaptic' | 'burner' | 'google'
  email?: string
  name?: string
  picture?: string
}

export type ChainState = {
  head: ChainHead
  endpoints: Endpoint[]
  identities: Identity[]
  events: ChainEvent[]
  totals: { endpoints: number; calls: number; settled: number; subscribers: number; providers: number }
  account: Account | null
  pending: { SYN: number; BOTCOIN: number } | null
  identity: Identity | null
  subscriptions: Subscription[]
  myEndpoints: Endpoint[]
}

export type Notice = { id: number; kind: 'ok' | 'err' | 'info'; title: string; body?: string }

export type ConnectPayload = 'synaptic' | 'burner' | Wallet

const WalletCtx = createContext<
  | {
      wallet: Wallet | null
      connecting: boolean
      connect: (payload?: ConnectPayload) => Promise<void>
      disconnect: () => void
      state: ChainState | undefined
      refresh: () => void
      send: <T = any>(method: string, params?: Record<string, unknown>) => Promise<T>
      notices: Notice[]
      notify: (n: Omit<Notice, 'id'>) => void
      /** Live SYN balance read directly from the chain RPC (8 decimals / bunits). */
      liveBalance: { value: number | null; error: string | null; isLoading: boolean }
      /** Live $BOTCOIN balance read directly from the AgentToken contract. */
      liveBotcoin: { value: number | null; formatted: string | null; error: string | null; isLoading: boolean }
      /** Live sUSD balance read directly from the StablecoinToken contract. */
      liveSUSD: { value: number | null; formatted: string | null; error: string | null; isLoading: boolean }
      /** Live SoulboundIdentity status read directly from the chain RPC. */
      liveIdentity: { hasIdentity: boolean | null; reputation: number | null; error: string | null; isLoading: boolean }
      /** Live x402 gateway health. */
      liveHealth: { ws: string; lastBlock: number; endpoints: Array<{ id: string; route: string; price: number }>; error: string | null; isLoading: boolean }
    }
  | null
>(null)

declare global {
  interface Window {
    synaptic?: {
      connect: () => Promise<{ address: string } | string>
      request?: (args: { method: string; params?: unknown }) => Promise<unknown>
    }
  }
}

const SESSION_KEY = 'synaptic.web4.session'

function readSessionWallet(): Wallet | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY) || window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Web4 wallets are rehydrated without a privateKey; burner/google wallets require one.
    if (parsed && typeof parsed.address === 'string' && parsed.connector) {
      if (parsed.connector === 'synaptic') {
        return { address: parsed.address, connector: 'synaptic', email: parsed.email, name: parsed.name, picture: parsed.picture }
      }
      if (parsed.privateKey) return parsed as Wallet
      if (parsed.email) {
        const { address, privateKeyHex } = deriveKeypair(parsed.email)
        return { address, privateKey: privateKeyHex, connector: parsed.connector, email: parsed.email, name: parsed.name, picture: parsed.picture }
      }
    }
  } catch {
    // Ignore corrupted session data.
  }
  return null
}

function makeBurner(): Wallet {
  const seed = digest('burner:' + Date.now() + ':' + Math.random())
  const address = bechAddress('burner:' + seed)
  return { address, privateKey: deriveKey(address), connector: 'burner' }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [notices, setNotices] = useState<Notice[]>([])

  const notify = useCallback((n: Omit<Notice, 'id'>) => {
    const id = Date.now() + Math.random()
    setNotices((prev) => [...prev.slice(-3), { ...n, id }])
    setTimeout(() => setNotices((prev) => prev.filter((x) => x.id !== id)), 6500)
  }, [])

  // Restore a previously connected wallet from storage or incoming redirect / popup on the client.
  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Check URL parameters for return from Matrix Wallet redirect
    const params = new URLSearchParams(window.location.search)
    const urlAddress = params.get('address')
    const urlConnector = params.get('connector') as 'synaptic' | 'google' | 'burner' | null
    const urlEmail = params.get('email')
    const urlName = params.get('name')

    if (urlAddress && urlAddress.startsWith('syn1')) {
      const incoming: Wallet = {
        address: urlAddress.toLowerCase().trim(),
        connector: urlConnector || 'synaptic',
        email: urlEmail || undefined,
        name: urlName || undefined,
      }
      console.log('[WalletProvider] connected from Matrix Wallet redirect:', incoming.address)
      setWallet(incoming)
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(incoming))
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(incoming))
      document.cookie = `synapse_session=${encodeURIComponent(
        JSON.stringify({
          address: incoming.address,
          email: incoming.email ?? null,
          name: incoming.name ?? null,
          onboarded: true,
        }),
      )}; path=/; max-age=604800; SameSite=Lax`

      fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: incoming.address,
          email: incoming.email ?? null,
          name: incoming.name ?? null,
          onboarded: true,
        }),
      }).catch(() => {})

      fetch('/api/onboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: incoming.address,
          email: incoming.email ?? null,
          name: incoming.name ?? null,
          source: incoming.connector,
        }),
      }).catch(() => {})

      // Clean query params from URL bar cleanly
      const cleanUrl = window.location.pathname + (window.location.hash || '')
      window.history.replaceState({}, document.title, cleanUrl)

      notify({
        kind: 'ok',
        title: 'Matrix Wallet Connected',
        body: `Logged in as ${incoming.address.slice(0, 10)}… · Soulbound Identity Attested & Airdropped.`,
      })
      return
    }

    // 2. Restore cached session
    const cached = readSessionWallet()
    if (cached) {
      console.log('[WalletProvider] restored from session:', cached.address)
      setWallet(cached)
      document.cookie = `synapse_session=${encodeURIComponent(
        JSON.stringify({
          address: cached.address,
          email: cached.email ?? null,
          name: cached.name ?? null,
          onboarded: true,
        }),
      )}; path=/; max-age=604800; SameSite=Lax`
      fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: cached.address,
          email: cached.email ?? null,
          name: cached.name ?? null,
          onboarded: true,
        }),
      }).catch(() => {})
    }

    // 3. Listen for postMessage from Matrix Wallet popup window
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SYNAPTIC_AUTH_SUCCESS' && e.data.address) {
        const msgWallet: Wallet = {
          address: String(e.data.address).toLowerCase().trim(),
          connector: e.data.connector || 'synaptic',
          email: e.data.email,
          name: e.data.name,
        }
        console.log('[WalletProvider] authenticated via popup message:', msgWallet.address)
        setWallet(msgWallet)
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgWallet))
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(msgWallet))
        document.cookie = `synapse_session=${encodeURIComponent(
          JSON.stringify({
            address: msgWallet.address,
            email: msgWallet.email ?? null,
            name: msgWallet.name ?? null,
            onboarded: true,
          }),
        )}; path=/; max-age=604800; SameSite=Lax`

        notify({
          kind: 'ok',
          title: 'Matrix Wallet Connected',
          body: `Logged in as ${msgWallet.address.slice(0, 10)}… · Soulbound Identity Attested.`,
        })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [notify])

  const { data, mutate } = useSWR<ChainState>(
    ['syn_getState', wallet?.address ?? null],
    ([, address]) => rpc<ChainState>('/api/rpc', 'syn_getState', { address }),
    { refreshInterval: 2500, keepPreviousData: true },
  )

  // Live chain reads: balance, identity, gateway health. These are independent
  // of the simulator state so the UI can show real chain values even when the
  // seeded store drifts from the deployed contracts.
  const {
    data: balanceData,
    error: balanceError,
    isLoading: balanceLoading,
    mutate: mutateBalance,
  } = useSWR(
    wallet?.address ? ['live_balance', wallet.address] : null,
    ([, address]) => fetchBalance(address),
    { refreshInterval: 4000, keepPreviousData: true },
  )

  const {
    data: susdData,
    error: susdError,
    isLoading: susdLoading,
    mutate: mutateSUSD,
  } = useSWR(
    wallet?.address ? ['live_susd', wallet.address] : null,
    ([, address]) => fetchSUSDBalance(address),
    { refreshInterval: 4000, keepPreviousData: true },
  )

  const {
    data: botcoinData,
    error: botcoinError,
    isLoading: botcoinLoading,
    mutate: mutateBotcoin,
  } = useSWR(
    wallet?.address ? ['live_botcoin', wallet.address] : null,
    ([, address]) => fetchBotcoinBalance(address),
    { refreshInterval: 4000, keepPreviousData: true },
  )

  const {
    data: identityData,
    error: identityError,
    isLoading: identityLoading,
    mutate: mutateIdentity,
  } = useSWR(
    wallet?.address ? ['live_identity', wallet.address] : null,
    ([, address]) => fetchIdentity(address),
    { refreshInterval: 8000, keepPreviousData: true },
  )

  const {
    data: healthData,
    error: healthError,
    isLoading: healthLoading,
    mutate: mutateHealth,
  } = useSWR(
    'live_gateway_health',
    fetchGatewayHealth,
    { refreshInterval: 5000, keepPreviousData: true },
  )

  const connect = useCallback(
    async (payload: ConnectPayload = 'burner') => {
      setConnecting(true)
      try {
        // Guard against event objects accidentally forwarded as the payload.
        if (typeof payload === 'object' && payload !== null && !('address' in payload)) {
          payload = 'burner'
        }
        let next: Wallet | null = null

        if (payload === 'synaptic') {
          if (typeof window === 'undefined' || !window.synaptic?.connect) {
            throw new Error('Web4 wallet not available. Use a burner wallet or open this page in the Matrix Wallet browser.')
          }
          const res = await window.synaptic.connect()
          const address = (typeof res === 'string' ? res : res.address).toLowerCase().trim()
          // Web4 wallet: no privateKey is stored locally. The wallet signs via window.synaptic.request.
          next = { address, connector: 'synaptic' }
        } else if (payload === 'burner') {
          const cached = typeof window !== 'undefined' ? window.sessionStorage.getItem(SESSION_KEY) : null
          console.log('[connect] burner cached:', cached?.slice(0, 120))
          next = cached ? (JSON.parse(cached) as Wallet) : makeBurner()
          console.log('[connect] burner next:', next?.address, next?.connector)
        } else {
          console.log('[connect] direct payload:', payload)
          next = payload
        }

        if (!next) throw new Error('Failed to create wallet')

        if (typeof window !== 'undefined') {
          // Store only the serializable core fields to avoid accidental circular
          // references from upstream payload objects. Web4 wallets never store a
          // privateKey in sessionStorage; the wallet keeps the key.
          const serializable: Record<string, unknown> = {
            address: next.address,
            connector: next.connector,
            email: next.email,
            name: next.name,
            picture: next.picture,
          }
          if (next.connector !== 'synaptic' && next.privateKey) {
            serializable.privateKey = next.privateKey
          }
          try {
            console.log('[connect] storing serializable:', serializable)
            window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(serializable))
            window.localStorage.setItem(SESSION_KEY, JSON.stringify(serializable))
          } catch (storageErr) {
            // Non-fatal: keep the session alive even if storage serialization fails.
            console.warn('[connect] storage failed:', storageErr)
          }

          document.cookie = `synapse_session=${encodeURIComponent(JSON.stringify({
            address: next.address,
            email: next.email ?? null,
            name: next.name ?? null,
            onboarded: true,
          }))}; path=/; max-age=604800; SameSite=Lax`

          // Always sync session to server cookie so Next.js middleware authorizes protected routes
          fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              address: next.address,
              email: next.email ?? null,
              name: next.name ?? null,
              onboarded: true,
            }),
          }).catch((err) => console.warn('[connect] session cookie sync failed:', err))
        }
        setWallet(next)
        await rpc('/api/rpc', 'syn_getState', { address: next.address })
        mutate()
        mutateBalance()
        mutateBotcoin()
        mutateSUSD()
        mutateIdentity()
        mutateHealth()

        const title =
          next.connector === 'synaptic'
            ? 'Web4 wallet connected'
            : next.connector === 'google'
              ? 'Google session connected'
              : 'Session wallet created'
        const body =
          next.connector === 'burner'
            ? 'window.synaptic not detected — a funded session wallet was issued for this tab.'
            : next.address
        notify({ kind: 'ok', title, body })
      } catch (err) {
        notify({ kind: 'err', title: 'Connection rejected', body: (err as Error).message })
      } finally {
        setConnecting(false)
      }
    },
    [mutate, mutateBalance, mutateBotcoin, mutateSUSD, mutateIdentity, mutateHealth, notify],
  )

  const disconnect = useCallback(() => {
    setWallet(null)
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SESSION_KEY)
      window.localStorage.removeItem(SESSION_KEY)
      document.cookie = 'synapse_session=; path=/; max-age=0; SameSite=Lax'
      fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
    }
    notify({ kind: 'info', title: 'Wallet disconnected' })
  }, [notify])

  const send = useCallback(
    async <T,>(method: string, params: Record<string, unknown> = {}) => {
      if (!wallet) throw new Error('wallet not connected')
      const result = await rpc<T>('/api/rpc', method, { from: wallet.address, ...params })
      mutate()
      mutateBalance()
      mutateBotcoin()
      mutateSUSD()
      mutateIdentity()
      mutateHealth()
      return result
    },
    [wallet, mutate, mutateBalance, mutateBotcoin, mutateSUSD, mutateIdentity, mutateHealth],
  )

  // Test seam: lets Playwright inject a wallet directly without relying on
  // sessionStorage serialization quirks. Set synchronously so it is available
  // as soon as the provider bundle executes.
  if (typeof window !== 'undefined') {
    ;(window as any).__synapticConnectTestWallet__ = (w: Wallet) => connect(w)
  }

  const liveBalance = {
    value: balanceData?.ok ? Number(balanceData.balance) / 1e18 : null,
    error: balanceData?.ok === false ? balanceData.error : balanceError?.message ?? null,
    isLoading: balanceLoading,
  }

  const liveBotcoin = {
    value: botcoinData?.ok ? botcoinData.value : null,
    formatted: botcoinData?.ok ? botcoinData.formatted : null,
    error: botcoinData?.ok === false ? botcoinData.error : botcoinError?.message ?? null,
    isLoading: botcoinLoading,
  }

  const liveSUSD = {
    value: susdData?.ok ? susdData.value : null,
    formatted: susdData?.ok ? susdData.formatted : null,
    error: susdData?.ok === false ? susdData.error : susdError?.message ?? null,
    isLoading: susdLoading,
  }

  const liveIdentity = {
    hasIdentity: identityData?.ok ? identityData.hasIdentity : null,
    reputation: identityData?.ok ? identityData.reputation : null,
    error: identityData?.ok === false ? identityData.error : identityError?.message ?? null,
    isLoading: identityLoading,
  }

  const liveHealth = {
    ws: healthData?.ok ? healthData.ws : 'unknown',
    lastBlock: healthData?.ok ? healthData.lastBlock : 0,
    endpoints: healthData?.ok ? healthData.endpoints : [],
    error: healthData?.ok === false ? healthData.error : healthError?.message ?? null,
    isLoading: healthLoading,
  }

  const value = useMemo(
    () => ({
      wallet,
      connecting,
      connect,
      disconnect,
      state: data,
      refresh: () => {
        mutate()
        mutateBalance()
        mutateBotcoin()
        mutateSUSD()
        mutateIdentity()
        mutateHealth()
      },
      send,
      notices,
      notify,
      liveBalance,
      liveBotcoin,
      liveSUSD,
      liveIdentity,
      liveHealth,
    }),
    [
      wallet,
      connecting,
      connect,
      disconnect,
      data,
      mutate,
      mutateBalance,
      mutateBotcoin,
      mutateSUSD,
      mutateIdentity,
      mutateHealth,
      send,
      notices,
      notify,
      liveBalance,
      liveBotcoin,
      liveSUSD,
      liveIdentity,
      liveHealth,
    ],
  )

  return (
    <WalletCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4 sm:inset-x-auto sm:right-0">
        {notices.map((n) => (
          <div
            key={n.id}
            role="status"
            className={`pointer-events-auto max-w-sm border-2 bg-card p-3 shadow-[4px_4px_0_0_var(--foreground)] ${
              n.kind === 'ok' ? 'border-signal' : 'border-accent'
            }`}
          >
            <p className={`label ${n.kind === 'ok' ? 'text-signal' : 'text-accent'}`}>
              {n.kind === 'ok' ? 'ack' : 'revert'} — {n.title}
            </p>
            {n.body && <p className="mt-1 break-all font-mono text-[11px] leading-relaxed">{n.body}</p>}
          </div>
        ))}
      </div>
    </WalletCtx.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletCtx)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}
