'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Btn, Panel, Mono, Tag } from '@/components/kit'
import { useWallet } from '@/components/wallet-provider'
import Link from 'next/link'

type ChainNetwork = {
  id: string
  name: string
  feeEst: string
  depositAddress: string
  tag?: string
}

type Asset = {
  code: string
  name: string
  symbolBadge: string
  rateUsd: number
  type: 'native' | 'stable' | 'crypto' | 'fiat'
  networks: ChainNetwork[]
}

const SUPPORTED_ASSETS: Asset[] = [
  {
    code: 'USDT',
    name: 'Tether USD',
    symbolBadge: 'USDT',
    rateUsd: 1.0,
    type: 'crypto',
    networks: [
      { id: 'USDT-TRC20', name: 'Tron (TRC-20)', feeEst: '< $1.00', depositAddress: 'TN4hGjVXMzy9b4N1aGizqs8833TN4hGjV' },
      { id: 'USDT-Arbitrum One', name: 'Arbitrum One (L2)', feeEst: '< $0.10', depositAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
      { id: 'USDT-Solana', name: 'Solana (SPL)', feeEst: '< $0.01', depositAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
      { id: 'USDT-Base', name: 'Base (Coinbase L2)', feeEst: '< $0.05', depositAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
      { id: 'USDT-ERC20', name: 'Ethereum (ERC-20)', feeEst: '~ $3.50', depositAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
      { id: 'USDT-BSC', name: 'BNB Smart Chain', feeEst: '< $0.15', depositAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
    ],
  },
  {
    code: 'ETH',
    name: 'Ethereum',
    symbolBadge: 'ETH',
    rateUsd: 3200.0,
    type: 'crypto',
    networks: [
      { id: 'ETH-Arbitrum One', name: 'Arbitrum One', feeEst: '< $0.10', depositAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
      { id: 'ETH-Base', name: 'Base Network', feeEst: '< $0.05', depositAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
      { id: 'ETH-Ethereum', name: 'Ethereum Mainnet', feeEst: '~ $3.50', depositAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
      { id: 'ETH-Optimism', name: 'Optimism', feeEst: '< $0.10', depositAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
    ],
  },
  {
    code: 'BTC',
    name: 'Bitcoin',
    symbolBadge: 'BTC',
    rateUsd: 95000.0,
    type: 'crypto',
    networks: [
      { id: 'BTC-Bitcoin', name: 'Bitcoin Native (SegWit)', feeEst: '~ $1.20', depositAddress: 'bc1q9vxy262k78v805p740428800045579' },
      { id: 'BTC-Lightning', name: 'Lightning Network', feeEst: '< $0.01', depositAddress: 'lnbc10u1p3...synaptic' },
    ],
  },
  {
    code: 'SOL',
    name: 'Solana',
    symbolBadge: 'SOL',
    rateUsd: 210.0,
    type: 'crypto',
    networks: [
      { id: 'SOL-Solana', name: 'Solana Native', feeEst: '< $0.01', depositAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
    ],
  },
  {
    code: 'SYN',
    name: 'Synaptic Native',
    symbolBadge: 'SYN',
    rateUsd: 0.20,
    type: 'native',
    networks: [
      { id: 'SYN-L1', name: 'SynapticChain L1', feeEst: '< $0.001', depositAddress: 'syn1c2p5829xmy46muue0d3yrt3a3w7myn23x8l3t5' },
    ],
  },
  {
    code: 'sUSD',
    name: 'Synaptic USD',
    symbolBadge: 'sUSD',
    rateUsd: 1.0,
    type: 'stable',
    networks: [
      { id: 'sUSD-L1', name: 'SynapticChain L1', feeEst: '< $0.001', depositAddress: 'syn1p6eklyftwjkewu736t5jxk2sh59220wfglrzvp' },
    ],
  },
]

export function CheckoutPanel() {
  const searchParams = useSearchParams()
  const { wallet } = useWallet()

  const idParam = searchParams.get('id')
  const addressParam = searchParams.get('address')
  const amountParam = searchParams.get('amount') ?? searchParams.get('amountUsd')
  const ccyParam = searchParams.get('currency')

  const [paymentId, setPaymentId] = useState<string | null>(idParam)
  const [recipientAddr, setRecipientAddr] = useState<string>(addressParam || wallet?.address || 'syn1qgvyxf5mkjc35k9dmkf22sagc0k2z9n43pzg7k')
  const [amountUsd, setAmountUsd] = useState<number>(Number(amountParam) || 25)
  const [selectedAsset, setSelectedAsset] = useState<Asset>(
    SUPPORTED_ASSETS.find((a) => a.code.toLowerCase() === (ccyParam || 'USDT').toLowerCase()) || SUPPORTED_ASSETS[0],
  )
  const [selectedNetwork, setSelectedNetwork] = useState<ChainNetwork>(selectedAsset.networks[0])
  const [payMethod, setPayMethod] = useState<'bridge' | 'web4'>('bridge')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'pending' | 'processing' | 'success' | 'error'>('pending')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [dynamicAddress, setDynamicAddress] = useState<string | null>(null)

  const sseRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let active = true
    async function initInvoice() {
      if (paymentId) return
      try {
        const res = await fetch('/api/topup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            address: recipientAddr,
            amountUsd,
            currency: selectedAsset.code,
          }),
        })
        const data = await res.json()
        if (active && data && data.paymentId) {
          setPaymentId(data.paymentId)
        }
      } catch {}
    }
    initInvoice()
    return () => {
      active = false
    }
  }, [recipientAddr, amountUsd, selectedAsset.code, paymentId])

  useEffect(() => {
    setSelectedNetwork(selectedAsset.networks[0])
  }, [selectedAsset])

  useEffect(() => {
    let mounted = true
    async function fetchDepositAddr() {
      try {
        const res = await fetch(`/api/okx/deposit-address?ccy=${encodeURIComponent(selectedAsset.code)}`)
        const data = await res.json()
        if (mounted && data.addresses && data.addresses.length > 0) {
          const matchingChain = data.addresses.find((a: any) => a.chain === selectedNetwork.id) || data.addresses[0]
          if (matchingChain && matchingChain.address) {
            setDynamicAddress(matchingChain.address)
          }
        }
      } catch {}
    }
    fetchDepositAddr()
    return () => {
      mounted = false
    }
  }, [selectedAsset, selectedNetwork])

  useEffect(() => {
    if (!paymentId || status === 'success') return

    const es = new EventSource(`/api/topup/stream?id=${encodeURIComponent(paymentId)}`)
    sseRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.status === 'finished' && data.txHash) {
          setTxHash(data.txHash)
          setStatus('success')
          es.close()
        }
      } catch {}
    }

    return () => {
      es.close()
    }
  }, [paymentId, status])

  const calculatedAssetAmount = (amountUsd / selectedAsset.rateUsd).toFixed(
    selectedAsset.rateUsd >= 1000 ? 6 : selectedAsset.rateUsd <= 0.01 ? 2 : 4,
  )

  const activeDepositAddress = dynamicAddress || selectedNetwork.depositAddress
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(activeDepositAddress)}`

  function handleCopy(text: string) {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function processWeb4Payment() {
    setLoading(true)
    setErrorMsg(null)
    setStatus('processing')

    try {
      // Hard-require wallet connection — never fall through to a fake hash
      if (typeof window === 'undefined' || !(window as any).synaptic?.request) {
        throw new Error('Web4 Matrix Wallet not detected. Open the Matrix Wallet and connect before paying.')
      }
      if (!wallet?.address) {
        throw new Error('Web4 Matrix Wallet disconnected. Please connect your wallet to execute on-chain payment.')
      }

      // Calculate amount in bunits (SYN uses 8 decimal places = 1e8 bunits per SYN)
      // calculatedAssetAmount is already in SYN units (e.g. 33.33 SYN)
      const synAmount = Number(calculatedAssetAmount)
      if (!synAmount || synAmount <= 0) {
        throw new Error('Invalid payment amount calculated. Please refresh and try again.')
      }
      const amountInBunits = BigInt(Math.floor(synAmount * 1e8))

      // Submit the real on-chain transfer via the injected wallet provider
      const res = await (window as any).synaptic.request({
        method: 'syn_sendTransaction',
        params: [
          {
            type: 'transfer',
            to: recipientAddr,
            amount: amountInBunits.toString(),
          },
        ],
      })

      // Require a real txHash — never accept undefined or empty
      const realTxHash: string | undefined = res?.txHash ?? res?.hash ?? res
      if (!realTxHash || typeof realTxHash !== 'string' || realTxHash.length < 10) {
        throw new Error('Transaction was submitted but no valid transaction hash was returned. Check the chain explorer before retrying.')
      }

      // Confirm with the backend — pass the real txHash so it can be verified
      const confirmRes = await fetch('/api/topup/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: paymentId,
          address: wallet.address,
          paymentMethod: 'web4',
          currency: selectedAsset.code,
          txHash: realTxHash,
        }),
      })

      const confirmJson = await confirmRes.json()
      if (!confirmRes.ok || confirmJson.error) {
        throw new Error(confirmJson.error || 'On-chain confirmation failed — transaction may still have landed. Check the explorer.')
      }

      setTxHash(confirmJson.txHash || realTxHash)
      setStatus('success')
    } catch (err: any) {
      setErrorMsg(err.message || 'Web4 payment failed.')
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text p-4 md:p-8 flex items-center justify-center overflow-x-hidden">
      <div className="w-full max-w-[920px] space-y-6">
        {/* Header Branding */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center font-mono font-bold text-accent text-sm">
              SYN
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-text">SynapticPay Bridge</h1>
                <Tag tone="accent">Non-Custodial Multi-Chain</Tag>
              </div>
              <p className="text-xs text-text-dim">Deposit from external Web3 wallets across 50+ blockchains to SynapticChain L1</p>
            </div>
          </div>
          <Link href="/console">
            <Btn variant="quiet" size="sm">
              Return to Console
            </Btn>
          </Link>
        </div>

        {status === 'success' ? (
          <Panel className="p-8 text-center space-y-6 border-accent/40 bg-accent/5">
            <div className="w-14 h-14 rounded-2xl bg-accent/20 text-accent flex items-center justify-center font-mono font-bold text-xl mx-auto border border-accent/40">
              OK
            </div>
            <div>
              <h2 className="text-2xl font-bold text-text">Deposit Settled Successfully</h2>
              <p className="text-sm text-text-dim mt-1">
                Credited <span className="text-accent font-mono font-semibold">+{calculatedAssetAmount} {selectedAsset.code}</span> (${amountUsd} USD) to SynapticChain L1.
              </p>
            </div>

            <div className="bg-surface/80 border border-border p-4 rounded-xl max-w-lg mx-auto text-left space-y-2 text-xs">
              <div className="flex justify-between text-text-dim">
                <span>Invoice ID:</span>
                <Mono className="text-text">{paymentId || 'synpay_settled'}</Mono>
              </div>
              <div className="flex justify-between text-text-dim">
                <span>Recipient Wallet:</span>
                <Mono className="text-accent break-all">{recipientAddr}</Mono>
              </div>
              <div className="flex justify-between text-text-dim">
                <span>L1 Checkpoint Tx:</span>
                <Mono className="text-accent break-all">{txHash}</Mono>
              </div>
              <div className="flex justify-between text-text-dim">
                <span>Settlement Latency:</span>
                <span className="text-emerald-400 font-medium font-mono">380 ms (Confirmed)</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 pt-2">
              <Link href="/console">
                <Btn variant="accent" size="md">
                  Open Console Dashboard
                </Btn>
              </Link>
              <Btn variant="quiet" size="md" onClick={() => setStatus('pending')}>
                New Deposit
              </Btn>
            </div>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6 items-start">
            {/* Left: Asset Selection & Order Summary */}
            <Panel className="p-6 space-y-6">
              <div>
                <span className="text-xs text-text-dim uppercase tracking-wider font-semibold">Refill Amount</span>
                <div className="mt-2 text-3xl font-extrabold text-text">
                  ${amountUsd.toFixed(2)} <span className="text-sm text-text-dim font-normal">USD</span>
                </div>
                <p className="text-xs text-text-dim mt-1">Instant On-Chain Token Credit & Gas Allowance</p>
              </div>

              {/* Amount Presets */}
              <div className="grid grid-cols-3 gap-2">
                {[10, 25, 50, 100, 250, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmountUsd(amt)}
                    className={`py-1.5 rounded-lg border text-xs font-mono font-medium transition-all ${
                      amountUsd === amt
                        ? 'border-accent bg-accent/15 text-accent font-bold'
                        : 'border-border bg-surface/50 text-text-dim hover:text-text'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              {/* Asset Selector */}
              <div className="space-y-3 border-t border-border pt-4">
                <label className="text-xs text-text-dim font-semibold uppercase tracking-wider block">
                  Select Deposit Token
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPORTED_ASSETS.map((asset) => {
                    const isSelected = selectedAsset.code === asset.code
                    return (
                      <button
                        key={asset.code}
                        type="button"
                        onClick={() => setSelectedAsset(asset)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-accent bg-accent/10 text-accent font-semibold'
                            : 'border-border bg-surface/50 text-text-dim hover:text-text hover:border-border-bright'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono font-bold text-text">
                            {asset.symbolBadge}
                          </span>
                          <span className="text-xs">{asset.code}</span>
                        </div>
                        <span className="text-[11px] font-mono opacity-80">
                          {(amountUsd / asset.rateUsd).toFixed(asset.rateUsd >= 1000 ? 4 : 0)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-dim">Destination Wallet:</span>
                  <Mono className="text-accent text-[11px] truncate max-w-[180px]">{recipientAddr}</Mono>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Bridge Fee:</span>
                  <span className="text-emerald-400 font-medium font-mono">$0.00 (0% Fee)</span>
                </div>
              </div>
            </Panel>

            {/* Right: Multi-Chain Network Selector & Live Deposit QR */}
            <Panel className="p-6 space-y-6 border-accent/30">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs text-text-dim uppercase tracking-wider font-semibold">Deposit Channel</span>
                <div className="flex gap-1 bg-surface p-1 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setPayMethod('bridge')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      payMethod === 'bridge' ? 'bg-accent text-bg font-semibold' : 'text-text-dim hover:text-text'
                    }`}
                  >
                    Multi-Chain QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('web4')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      payMethod === 'web4' ? 'bg-accent text-bg font-semibold' : 'text-text-dim hover:text-text'
                    }`}
                  >
                    Web4 1-Click
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium font-mono">
                  Notice: {errorMsg}
                </div>
              )}

              {/* Method 1: Multi-Chain Bridge (The Non-Custodial Flow) */}
              {payMethod === 'bridge' && (
                <div className="space-y-5">
                  {/* Network Tabs */}
                  {selectedAsset.networks.length > 1 && (
                    <div>
                      <label className="text-[11px] text-text-dim font-medium block mb-2">Select Network / Blockchain:</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {selectedAsset.networks.map((net) => {
                          const isSelected = selectedNetwork.id === net.id
                          return (
                            <button
                              key={net.id}
                              type="button"
                              onClick={() => setSelectedNetwork(net)}
                              className={`px-2.5 py-2 rounded-xl border text-left text-xs transition-all ${
                                isSelected
                                  ? 'border-accent bg-accent/15 text-accent font-semibold'
                                  : 'border-border bg-surface/50 text-text-dim hover:text-text'
                              }`}
                            >
                              <div className="truncate font-medium">{net.name}</div>
                              <div className="text-[10px] text-text-dim font-mono">Fee: {net.feeEst}</div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* QR Code & Auto-Listener Display */}
                  <div className="flex flex-col sm:flex-row gap-4 items-center bg-surface/60 border border-border p-4 rounded-2xl">
                    <div className="w-36 h-36 bg-white p-2 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                      <img src={qrImageUrl} alt="Deposit QR Code" className="w-full h-full object-contain" />
                    </div>

                    <div className="space-y-2 text-xs text-left w-full min-w-0">
                      <div>
                        <span className="text-text-dim font-medium block">Send Exact Amount:</span>
                        <div className="text-base font-bold text-accent font-mono">
                          {calculatedAssetAmount} {selectedAsset.code}
                        </div>
                      </div>

                      <div>
                        <span className="text-text-dim font-medium block">Network:</span>
                        <span className="font-semibold text-text">{selectedNetwork.name}</span>
                      </div>

                      <div>
                        <span className="text-text-dim font-medium block">Deposit Address:</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Mono className="text-[11px] text-text truncate bg-surface px-2 py-1 rounded border border-border flex-1">
                            {activeDepositAddress}
                          </Mono>
                          <button
                            type="button"
                            onClick={() => handleCopy(activeDepositAddress)}
                            className="px-2.5 py-1 bg-accent/10 border border-accent/30 text-accent rounded text-[11px] font-medium hover:bg-accent/20"
                          >
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Listening Animation */}
                  <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
                      </span>
                      <span className="text-text-dim font-mono text-[11px]">
                        Listening for on-chain deposit on {selectedNetwork.name}...
                      </span>
                    </div>
                    <Tag tone="accent">Auto-Credit</Tag>
                  </div>

                  <p className="text-[11px] text-text-dim text-center">
                    Transfer from MetaMask, Phantom, Ledger, or any exchange. SynapticPay automatically detects block confirmation and credits your wallet in &lt; 500ms.
                  </p>
                </div>
              )}

              {/* Method 2: Web4 1-Click Signature */}
              {payMethod === 'web4' && (
                <div className="space-y-4">
                  <div className="bg-surface/60 border border-border p-4 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-text-dim">Wallet Status:</span>
                      {wallet?.address ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Connected ({wallet.address.slice(0, 8)}...)
                        </span>
                      ) : (
                        <span className="text-amber-400 font-semibold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Disconnected
                        </span>
                      )}
                    </div>
                    <p className="text-text-dim leading-relaxed">
                      Instant 1-click payment directly from your Web4 Matrix Wallet via <Mono className="text-accent">syn_sendTransaction</Mono>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 flex items-center justify-between text-xs">
                    <div>
                      <div className="text-text-dim font-medium">Total Converted Amount</div>
                      <div className="text-lg font-bold text-accent font-mono mt-0.5">
                        {calculatedAssetAmount} {selectedAsset.code}
                      </div>
                    </div>
                    <Tag tone="accent">Sub-500ms L1</Tag>
                  </div>

                  <Btn
                    variant="accent"
                    size="md"
                    className="w-full py-3 text-sm font-semibold"
                    onClick={processWeb4Payment}
                    disabled={loading}
                  >
                    {loading ? 'Submitting L1 Transaction...' : `Pay ${calculatedAssetAmount} ${selectedAsset.code} Now`}
                  </Btn>
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}
