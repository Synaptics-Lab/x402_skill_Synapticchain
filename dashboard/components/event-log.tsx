'use client'

import { useEffect, useState, useRef } from 'react'
import { Mono, Tag, short } from '@/components/kit'

type FakeTone = 'ink' | 'accent' | 'signal' | 'muted'

interface RealEvent {
  seq: string
  contract: string
  name: string
  block: number
  args: Record<string, string | number>
  tone: FakeTone
}

const KNOWN_CONTRACTS: Record<string, string> = {
  'syn1dejphz2hjetjqva9fg39c7hg8gpr7muapqyvq7': 'SynIdentityNFT',
  'syn1wylxn8370m27nv59rgkqlsw9fvwgel3n3r5lac': 'AgentRegistry (TAP)',
  'syn109zfmgqafzy963jjkdd9lf5fm8e9tqhnfz95rx': 'CarbonCreditToken',
  'syn1dj2a3nlrc44lqtwzeg9ws0d6plzeayrmxy98m2': 'CarbonMarketplace',
  'syn1dw2td3s089a5n498mskfeq499rh0y2xmz2xzjr': 'TerrariumEngine',
  'syn15wcyqdzktwwgn0j76cau74hgcav68hxn7tzrpv': 'CorridorRouter (ODL)',
  'syn1p6eklyftwjkewu736t5jxk2sh59220wfglrzvp': 'sUSD Stablecoin',
  'syn1ym53kw67kzuxt6xerz25f6yn7p26znskml8uuu': 'cTZS Stablecoin',
  'syn1sadk95yk36n5ugw6apflam3gn9g8cjxq8cgstq': 'cKES Stablecoin',
  'syn1qusnaskqm8pvpddmdjamf62xhx5xwmthwxn3fz': 'cNGN Stablecoin',
  'syn1740gd3f32fym7qvj8dzkx604zmtp9vuh0j5nh7': 'cZAR Stablecoin',
  'syn1vktw65hkg7fa9n5uje78zurzy9ws76l6urp6vl': 'SwapEngineV3b (sUSD/cTZS)',
  'syn168ujxx4f4w9y5x6s4ut2smkg7lr73gu446v4ph': 'AgentToken ($BOTCOIN)',
  'syn18vc404rpwd2sg4n2379x45mwg95tftdcjq9ah6': 'BotMiningRegistry',
  'syn1wqfwkz0jz95fxat9qelz5wu6w6tv86qamzsk3j': 'x402_ServiceRegistry',
  'syn1eq6mrl9a7pjtujvj3edkjcj6x0crfzar2szax9': 'x402_SoulboundIdentity',
  'syn178xa78d46ar93v0d8hvh0jzhgvl2ewe9c4nnw9': 'x402_RewardDistributor',
  'syn1wd9wn2vq3q9q3ydmn59e703w28cxpq8h8fz352': 'x402_SubscriptionNFT',
  'syn1q3ksvtwu8azp2jyfl35p8weuajx5gvgremd6tz': 'x402_BondingCurveToken',
}

function parseChainTx(tx: any, headBlock: number): RealEvent {
  const hash = tx.hash || tx.id || '0x' + Math.random().toString(16).slice(2, 10)
  const block = Number(tx.checkpoint_height || tx.checkpoint || headBlock || 1)
  const from = tx.from || tx.from_address || ''
  const to = tx.to || tx.to_address || ''
  const rawType = (tx.type || (to && KNOWN_CONTRACTS[to] ? 'call' : 'transfer')).toLowerCase()

  let contract = 'Native'
  let name = 'Transfer'
  let tone: FakeTone = 'ink'
  const args: Record<string, string | number> = {}

  let amountSyn = '0.0000 SYN'
  if (tx.amount) {
    try {
      const val = Number(BigInt(tx.amount)) / 1e18
      amountSyn = `${val >= 0.0001 ? val.toFixed(4) : val.toPrecision(3)} SYN`
    } catch {
      amountSyn = `${tx.amount} SYN`
    }
  }

  if (rawType === 'deploy') {
    contract = 'L1 System'
    name = 'ContractDeploy'
    tone = 'accent'
    args.deployer = short(from, 8, 4)
    args.txHash = short(hash, 8, 4)
    if (tx.gas_limit) args.gas = tx.gas_limit
  } else if (to && KNOWN_CONTRACTS[to]) {
    contract = KNOWN_CONTRACTS[to]
    name = 'ContractCall'
    tone = 'signal'
    args.caller = short(from, 8, 4)
    args.target = short(to, 8, 4)
    if (tx.amount && tx.amount !== '0') args.value = amountSyn
  } else if (rawType === 'call') {
    contract = 'SmartContract'
    name = 'ContractCall'
    tone = 'signal'
    args.caller = short(from, 8, 4)
    args.target = short(to, 8, 4)
  } else {
    contract = 'Native'
    name = 'Transfer'
    tone = 'ink'
    args.from = short(from, 8, 4)
    args.to = short(to, 8, 4)
    args.amount = amountSyn
  }

  return {
    seq: hash,
    contract,
    name,
    block,
    args,
    tone,
  }
}

export function EventLog({ limit = 20 }: { limit?: number }) {
  const [events, setEvents] = useState<RealEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [headBlock, setHeadBlock] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)

  // 1. Initial truthful hydrate from RPC
  useEffect(() => {
    async function loadRecent() {
      try {
        const res = await fetch('https://nodes.synapticchain.xyz/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'syn_getRecentTransactions', params: [limit] }),
        })
        const json = await res.json()
        if (json.result && Array.isArray(json.result) && json.result.length > 0) {
          const parsed = json.result.map((tx: any) => parseChainTx(tx, 0))
          setEvents(parsed.slice(0, limit))
          if (parsed[0]?.block) setHeadBlock(parsed[0].block)
        }
      } catch (err) {
        console.log('[EventLog] initial rpc load error', err)
      }
    }
    loadRecent()
  }, [limit])

  // 2. Real-time WebSocket streaming
  useEffect(() => {
    let ws: WebSocket | null = null
    try {
      ws = new WebSocket('wss://nodes.synapticchain.xyz/ws')
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        ws?.send(JSON.stringify({ jsonrpc: '2.0', method: 'syn_subscribe', params: ['newTransactions'], id: 1 }))
      }

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          if (data?.method === 'syn_subscription' && data.params?.result) {
            const rawTxs = Array.isArray(data.params.result) ? data.params.result : [data.params.result]
            const newEvents: RealEvent[] = []
            for (const tx of rawTxs) {
              if (tx && (tx.hash || tx.id || tx.from)) {
                const ev = parseChainTx(tx, headBlock)
                if (ev.block > headBlock) setHeadBlock(ev.block)
                newEvents.push(ev)
              }
            }
            if (newEvents.length > 0) {
              setEvents((prev) => [...newEvents, ...prev].slice(0, limit))
            }
          }
        } catch (e) {}
      }

      ws.onclose = () => setConnected(false)
      ws.onerror = () => setConnected(false)
    } catch {
      setConnected(false)
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [limit, headBlock])

  return (
    <div className="flex flex-col h-full border border-foreground">
      <div className="flex items-center justify-between border-b border-foreground bg-foreground px-3 py-2 text-background">
        <h2 className="label">Chain log · beta-mainnet firehose</h2>
        <span className="flex items-center gap-2">
          <span className={`size-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} aria-hidden />
          <Mono className="opacity-70">{headBlock > 0 ? headBlock.toLocaleString() : '—'}</Mono>
        </span>
      </div>
      <ul className="divide-y divide-hairline overflow-y-auto flex-1 max-h-[500px]">
        {events.length === 0 && (
          <li className="p-3">
            <Mono className="text-muted-foreground">{connected ? 'awaiting first on-chain event…' : 'connecting to mesh...'}</Mono>
          </li>
        )}
        {events.map((e) => (
          <li key={e.seq} className="flex flex-col gap-1 px-3 py-2 hover:bg-secondary">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Tag tone={e.tone}>{e.contract}</Tag>
                <Mono className="font-semibold">{e.name}</Mono>
              </span>
              <Mono className="text-muted-foreground">#{e.block.toLocaleString()}</Mono>
            </div>
            <Mono className="break-all text-muted-foreground">
              {Object.entries(e.args).map(([k, v]) => `${k}=${v}`).join('  ')}
            </Mono>
          </li>
        ))}
      </ul>
    </div>
  )
}
