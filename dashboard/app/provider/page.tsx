import type { Metadata } from 'next'
import { ProviderDashboard } from '@/components/provider-dashboard'

export const metadata: Metadata = {
  title: 'Provider console — SYNAPSE',
  description: 'Mint a SoulboundIdentity, register x402 endpoints, generate gateway config, and withdraw earnings.',
}

export default function Page() {
  return (
    <div className="mx-auto max-w-[1400px] lg:border-x border-foreground">
      <ProviderDashboard />
    </div>
  )
}
