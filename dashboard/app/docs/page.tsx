import type { Metadata } from 'next'
import { CONTRACTS, CHAIN, ASSETS } from '@/lib/chain/contracts'
import { CopyBlock } from '@/components/copy-block'

export const metadata: Metadata = {
  title: 'x402 Documentation — SYNAPSE',
  description:
    'HTTP 402 payment-required API protocol on SynapticChain. Challenge/receipt flow, ServiceRegistry contracts, and programmatic examples.',
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="label text-muted-foreground">{label}</span>
      <code className="font-mono text-xs break-all">{address || 'not configured'}</code>
    </div>
  )
}

export default function DocsPage() {
  const serviceRegistry = CONTRACTS.ServiceRegistry.address
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://api.synapticchain.xyz/x402'
  const rpcUrl = CHAIN.rpcUrl
  const sampleEndpoint = '/sentiment'
  const sampleEndpointId = '0x8f31a4c7d9021be5'

  const curlChallenge = `curl -i "${gatewayUrl}${sampleEndpoint}"`
  const curlPay = `# After paying ServiceRegistry.pay_per_call(endpointId, invoiceHash) on-chain,
# retry with a signed base64 receipt:
export RECEIPT=$(node -e "console.log(Buffer.from(JSON.stringify({
  v:1, kind:'payment', endpointId:'${sampleEndpointId}',
  invoiceHash:'<invoice-hash-from-402>', payer:'<your-address>',
  txHash:'<tx-hash>', sig:'<signature>'
})).toString('base64'))")
curl -H "Authorization: Bearer \$RECEIPT" "${gatewayUrl}${sampleEndpoint}"`

  const jsExample = `import { x402fetch } from '@/lib/x402-client'

const wallet = {
  address: 'syn1...',
  connector: 'synaptic' // or 'burner'
}

const res = await x402fetch('${gatewayUrl}${sampleEndpoint}', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ticker: 'SYN', window: '60s' }),
  wallet,
  endpointId: '${sampleEndpointId}',
  maxPrice: 0.05,
})

const data = await res.json()
console.log(res.x402) // { paid, amount, invoiceHash, txHash, block }`

  const identityJs = `import { mintIdentity } from '@/lib/chain/live'

// Agents and bots must hold a SoulboundIdentity NFT before calling paid endpoints
// or registering their own endpoints.
const result = await mintIdentity('synaptic', wallet.address, 'orbital-labs')
console.log(result.txHash)`

  return (
    <div className="mx-auto max-w-[1400px] lg:border-x border-foreground">
      <header className="border-b-2 border-foreground bg-foreground p-6 text-background sm:p-10">
        <h1 className="display text-[clamp(2rem,5vw,3.5rem)]">x402 Protocol Docs</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-80">
          HTTP 402 Payment Required made programmable. The SynapticChain x402 gateway issues signed invoices,
          clients settle them on-chain through the ServiceRegistry, then replay the request with a bearer receipt.
        </p>
      </header>

      <div className="grid gap-0 lg:grid-cols-[1fr_0.4fr]">
        <main className="p-6 sm:p-10">
          <section className="mb-10 max-w-prose">
            <h2 className="display mb-3 text-2xl">Challenge / receipt flow</h2>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>
                <strong className="text-foreground">Request</strong> the upstream endpoint through the x402 gateway.
              </li>
              <li>
                <strong className="text-foreground">402 challenge</strong>: gateway returns
                <code className="mx-1 rounded bg-secondary px-1 py-0.5 font-mono text-xs">x402Version: 1</code>
                with an invoice hash, amount in SYN, and the ServiceRegistry contract to pay.
              </li>
              <li>
                <strong className="text-foreground">Pay on-chain</strong> by calling
                <code className="mx-1 rounded bg-secondary px-1 py-0.5 font-mono text-xs">ServiceRegistry.pay_per_call(uint64 endpointId, string invoiceHash)</code>
                . For Web4 wallets this is signed inside the wallet; for session/burner wallets the app server forwards the signed tx.
              </li>
              <li>
                <strong className="text-foreground">Wait for settlement</strong>. The gateway observes
                <code className="mx-1 rounded bg-secondary px-1 py-0.5 font-mono text-xs">PaymentProcessed</code>
                on-chain, or the client polls <code className="font-mono text-xs">syn_getTransaction</code>.
              </li>
              <li>
                <strong className="text-foreground">Replay</strong> the original request with an
                <code className="mx-1 rounded bg-secondary px-1 py-0.5 font-mono text-xs">Authorization: Bearer &lt;receipt&gt;</code>
                header. The receipt is base64-encoded JSON signed with the payer key.
              </li>
            </ol>
          </section>

          <section className="mb-10 max-w-prose">
            <h2 className="display mb-3 text-2xl">Programmatic examples</h2>
            <h3 className="label mb-2 mt-6">1. Fetch a 402 challenge with curl</h3>
            <CopyBlock label="curl" code={curlChallenge} />

            <h3 className="label mb-2 mt-6">2. Pay and retry with curl</h3>
            <CopyBlock label="curl + receipt" code={curlPay} />

            <h3 className="label mb-2 mt-6">3. Use the consumer SDK</h3>
            <CopyBlock label="TypeScript SDK" code={jsExample} />

            <h3 className="label mb-2 mt-6">4. Mint a Soulbound Identity NFT for an agent</h3>
            <p className="mb-2 text-sm text-muted-foreground">
              Agents and bot wallets must hold a SoulboundIdentity token before registering endpoints or being trusted by providers.
            </p>
            <CopyBlock label="Mint identity" code={identityJs} />
          </section>

          <section className="mb-10 max-w-prose">
            <h2 className="display mb-3 text-2xl">Agent / bot authentication</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Each paid endpoint checks the payer address against
              <code className="mx-1 rounded bg-secondary px-1 py-0.5 font-mono text-xs">SoulboundIdentity.check_identity(address)</code>
              . Providers can additionally require a minimum reputation score. The token is non-transferable (soulbound);
              minting ties a real-world handle to an on-chain address. Call
              <code className="mx-1 rounded bg-secondary px-1 py-0.5 font-mono text-xs">SoulboundIdentity.mint_identity(address, hash)</code>
              to create it.
            </p>
          </section>
        </main>

        <aside className="border-t border-foreground bg-secondary p-6 lg:border-t-0 lg:border-l">
          <h3 className="label mb-4">Deployed contracts</h3>
          <div className="space-y-4 text-xs">
            <AddressRow label="ServiceRegistry" address={serviceRegistry} />
            <AddressRow label="SoulboundIdentity" address={CONTRACTS.SoulboundIdentity.address} />
            <AddressRow label="SubscriptionNFT" address={CONTRACTS.SubscriptionNFT.address} />
            <AddressRow label="RewardDistributor" address={CONTRACTS.RewardDistributor.address} />
            <AddressRow label="BondingCurveToken" address={CONTRACTS.BondingCurveToken.address} />
            <AddressRow label="sUSD Stablecoin" address={ASSETS.sUSD.address} />
            <AddressRow label="AgentToken ($BOTCOIN)" address={ASSETS.BOTCOIN.address} />
          </div>

          <h3 className="label mb-3 mt-8">Network</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              <span className="label text-foreground">Name:</span> {CHAIN.name}
            </p>
            <p>
              <span className="label text-foreground">Chain ID:</span> {CHAIN.chainId}
            </p>
            <p>
              <span className="label text-foreground">Currency:</span> {CHAIN.currency}
            </p>
            <p className="break-all">
              <span className="label text-foreground">RPC:</span> {rpcUrl}
            </p>
            <p className="break-all">
              <span className="label text-foreground">Gateway:</span> {gatewayUrl}
            </p>
          </div>

          <h3 className="label mb-3 mt-8">Payment routing</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Web4 wallets route <code className="font-mono">syn_sendTransaction</code> through{' '}
            <code className="font-mono">window.synaptic.request</code>. Burner wallets fall back to the app server signer at{' '}
            <code className="font-mono">/api/chain/send</code>.
          </p>
        </aside>
      </div>
    </div>
  )
}
