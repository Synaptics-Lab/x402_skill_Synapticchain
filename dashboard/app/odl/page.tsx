import { Metadata } from 'next'
import { OdlCorridor } from '@/components/odl-corridor'

export const metadata: Metadata = {
  title: 'ODL Corridors | SynapticChain',
  description: 'On-Demand Liquidity across African Corridors via SynapticChain',
}

export default function OdlPage() {
  return (
    <main className="min-h-screen">
      <OdlCorridor />
    </main>
  )
}
