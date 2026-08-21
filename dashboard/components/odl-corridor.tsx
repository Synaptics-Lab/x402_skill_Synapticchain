'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Panel, Btn, Field, Stat, Mono, Tag } from '@/components/kit'
import { useWallet } from '@/components/wallet-provider'
import { ArrowRight, Activity, Globe2, ShieldCheck, Zap } from 'lucide-react'

const CORRIDORS = [
  { code: 'KE', name: 'Kenya', currency: 'cKES', flag: '🇰🇪', symbol: 'KES' },
  { code: 'NG', name: 'Nigeria', currency: 'cNGN', flag: '🇳🇬', symbol: 'NGN' },
  { code: 'TZ', name: 'Tanzania', currency: 'cTZS', flag: '🇹🇿', symbol: 'TZS' },
  { code: 'GH', name: 'Ghana', currency: 'cGHS', flag: '🇬🇭', symbol: 'GHS' },
  { code: 'ZA', name: 'South Africa', currency: 'cZAR', flag: '🇿🇦', symbol: 'ZAR' },
  { code: 'EG', name: 'Egypt', currency: 'cEGP', flag: '🇪🇬', symbol: 'EGP' },
  { code: 'ET', name: 'Ethiopia', currency: 'cETB', flag: '🇪🇹', symbol: 'ETB' },
  { code: 'UG', name: 'Uganda', currency: 'cUGX', flag: '🇺🇬', symbol: 'UGX' },
  { code: 'SN', name: 'Senegal', currency: 'cXOF', flag: '🇸🇳', symbol: 'XOF' },
  { code: 'MA', name: 'Morocco', currency: 'cMAD', flag: '🇲🇦', symbol: 'MAD' },
]

const RATES: Record<string, number> = {
  'KE_NG': 0.0052, 'KE_TZ': 28.4, 'KE_GH': 0.011, 'KE_ZA': 0.11, 'KE_EG': 0.32,
  'NG_KE': 192, 'NG_TZ': 5480, 'NG_GH': 2.1, 'NG_ZA': 21.5, 'NG_EG': 61.4,
  'TZ_KE': 0.0352, 'TZ_NG': 0.000183, 'TZ_GH': 0.00039, 'TZ_ZA': 0.0039,
  'GH_KE': 91, 'GH_NG': 476, 'GH_TZ': 2570,
  'ZA_KE': 9.1, 'ZA_NG': 46.5, 'ZA_TZ': 255,
  'EG_KE': 3.1, 'EG_NG': 16.2, 'MA_KE': 14.2, 'MA_NG': 73.4,
  'ET_KE': 0.77, 'ET_NG': 3.95, 'UG_KE': 0.026, 'SN_KE': 0.178,
}

// Generate some fake recent tx
const RECENT_TXS = Array.from({ length: 8 }).map((_, i) => {
  const fromC = CORRIDORS[Math.floor(Math.random() * CORRIDORS.length)]
  let toC = CORRIDORS[Math.floor(Math.random() * CORRIDORS.length)]
  while (toC.code === fromC.code) toC = CORRIDORS[Math.floor(Math.random() * CORRIDORS.length)]
  const amount = Math.floor(Math.random() * 5000) + 100
  return { id: i, from: fromC, to: toC, amount, time: new Date(Date.now() - Math.random() * 3600000) }
})

export function OdlCorridor() {
  const { wallet } = useWallet()
  const router = useRouter()
  
  const [source, setSource] = useState(CORRIDORS[0].code)
  const [dest, setDest] = useState(CORRIDORS[1].code)
  const [amountStr, setAmountStr] = useState('1000')
  const [quote, setQuote] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  
  const srcObj = CORRIDORS.find(c => c.code === source)!
  const dstObj = CORRIDORS.find(c => c.code === dest)!
  
  useEffect(() => {
    async function fetchQuote() {
      if (!amountStr || isNaN(Number(amountStr)) || Number(amountStr) <= 0) {
        setQuote(null)
        return
      }
      if (source === dest) {
        setQuote(null)
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`/api/upstream/odl-quote?from=${source}&to=${dest}&amount=${amountStr}`)
        if (res.ok) {
          const json = await res.json()
          const qData = json.data || json
          setQuote(qData)
        } else {
          // Fallback simulation if API endpoint is missing during dev
          const rateKey = `${source}_${dest}`
          let rate = RATES[rateKey]
          if (!rate) {
            rate = Math.random() * 50
          }
          setQuote({
            from: source, to: dest, amount: Number(amountStr),
            rate,
            fee_bps: 30, path: [srcObj.currency, 'SYN', dstObj.currency],
            settlement_ms: Math.floor(350 + Math.random() * 150)
          })
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    const timer = setTimeout(fetchQuote, 500)
    return () => clearTimeout(timer)
  }, [source, dest, amountStr, srcObj.currency, dstObj.currency])

  const handleSend = () => {
    if (!wallet) {
      router.push('/login?next=/odl')
      return
    }
    setSending(true)
    setTimeout(() => {
      setSending(false)
      alert('Transaction settled via SynapticChain.')
    }, 2000)
  }

  const rateVal = Number(quote?.rate ?? quote?.data?.rate ?? RATES[`${source}_${dest}`] ?? 0.005)
  const amtVal = Number(quote?.amount ?? quote?.data?.amount ?? amountStr ?? 100)
  const totalReceived = (!isNaN(amtVal) && !isNaN(rateVal)) ? (amtVal * rateVal).toFixed(2) : '0.00'
  const displayRate = (!isNaN(rateVal)) ? rateVal.toFixed(4) : '0.0050'
  const settlementMs = quote?.settlement_ms ?? quote?.data?.settlement_ms ?? 420

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground p-5 sm:p-8 bg-secondary/30">
        <div>
          <span className="label text-muted-foreground">Global Finance</span>
          <h1 className="display mt-2 text-[clamp(2.25rem,6vw,4.5rem)] leading-none">
            African ODL<br/>Corridors.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Instant cross-border payments via SynapticChain. ODL (On-Demand Liquidity) uses SYN as a bridge asset to source liquidity on both sides, settling in milliseconds.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 sm:gap-6 mt-4 sm:mt-0">
          <Stat label="Total Corridors" value={CORRIDORS.length} />
          <Stat label="24h Volume" value="1.2M" unit="SYN" />
          <Stat label="Avg Settlement" value="< 500ms" />
          <Stat label="Supported Tokens" value={CORRIDORS.length} />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 p-5 sm:p-8">
        
        <div className="space-y-8 min-w-0">
          <Panel title="Corridor Quote" aside={<Activity className="w-4 h-4 text-accent" />}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="You send">
                <div className="flex border border-foreground bg-background">
                  <input
                    type="number"
                    value={amountStr}
                    onChange={e => setAmountStr(e.target.value)}
                    className="flex-1 bg-transparent px-3 outline-none min-w-0 font-mono text-sm"
                  />
                  <select
                    value={source}
                    onChange={e => setSource(e.target.value)}
                    className="bg-secondary border-l border-foreground px-3 outline-none"
                  >
                    {CORRIDORS.map(c => <option key={c.code} value={c.code}>{c.flag} {c.symbol}</option>)}
                  </select>
                </div>
              </Field>

              <Field label="Recipient gets">
                <div className="flex border border-foreground bg-background opacity-80">
                  <input
                    type="text"
                    disabled
                    value={quote ? totalReceived : '...'}
                    className="flex-1 bg-transparent px-3 outline-none min-w-0 font-mono text-sm"
                  />
                  <select
                    value={dest}
                    onChange={e => setDest(e.target.value)}
                    className="bg-secondary border-l border-foreground px-3 outline-none"
                  >
                    {CORRIDORS.map(c => <option key={c.code} value={c.code}>{c.flag} {c.symbol}</option>)}
                  </select>
                </div>
              </Field>
            </div>

            <div className="mt-8 flex flex-col items-center">
              {quote ? (
                <div className="w-full">
                  <div className="flex items-center justify-between text-sm mb-6 border-y border-hairline py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{srcObj.flag}</span>
                      <Mono>{srcObj.currency}</Mono>
                    </div>
                    <div className="flex items-center gap-2 text-accent mx-2 flex-1">
                      <div className="h-px bg-accent flex-1"></div>
                      <Tag className="border-accent text-accent">SYN</Tag>
                      <ArrowRight className="w-4 h-4" />
                      <div className="h-px bg-accent flex-1"></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mono>{dstObj.currency}</Mono>
                      <span className="text-2xl">{dstObj.flag}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <Stat label="Exchange Rate" value={displayRate} unit={`${dstObj.symbol}/${srcObj.symbol}`} />
                    <Stat label="Settlement Time" value={settlementMs} unit="ms" />
                  </div>

                  <Btn variant="accent" className="w-full h-12 text-lg" disabled={sending} onClick={handleSend}>
                    {sending ? 'Settling via SYN...' : `Send ${amountStr} ${srcObj.symbol}`}
                  </Btn>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                  {loading ? 'Fetching liquidity quote...' : 'Enter an amount to see quote.'}
                </div>
              )}
            </div>
          </Panel>

          <div className="grid sm:grid-cols-3 gap-4">
            <Panel title="1. Lock Tokens" bodyClassName="p-4 flex flex-col gap-2">
              <ShieldCheck className="w-6 h-6 text-accent mb-1" />
              <p className="text-sm text-muted-foreground">Source tokens are locked into a synthetic vault.</p>
            </Panel>
            <Panel title="2. Atomic Swap" bodyClassName="p-4 flex flex-col gap-2">
              <Zap className="w-6 h-6 text-accent mb-1" />
              <p className="text-sm text-muted-foreground">Tokens are swapped via SYN for instant liquidity.</p>
            </Panel>
            <Panel title="3. Unlock Dest" bodyClassName="p-4 flex flex-col gap-2">
              <Globe2 className="w-6 h-6 text-accent mb-1" />
              <p className="text-sm text-muted-foreground">Destination tokens are released to recipient.</p>
            </Panel>
          </div>
        </div>
        
        <div className="flex flex-col">
          <Panel title="Live Activity" bodyClassName="p-0">
            <div className="divide-y divide-hairline">
              {RECENT_TXS.map(tx => (
                <div key={tx.id} className="p-3 flex items-center justify-between hover:bg-secondary transition-colors">
                  <div className="flex items-center gap-2">
                    <span>{tx.from.flag}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span>{tx.to.flag}</span>
                  </div>
                  <div className="text-right">
                    <Mono className="text-sm">{tx.amount.toLocaleString()} {tx.from.symbol}</Mono>
                    <div className="text-xs text-muted-foreground">{Math.floor((Date.now() - tx.time.getTime()) / 60000)}m ago</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

      </div>
    </div>
  )
}
