import { Suspense } from 'react'
import { CheckoutPanel } from '@/components/checkout-panel'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Synaptic Pay · Web4 Native Checkout',
  description: 'Native Machine-to-Machine & Web4 Crypto / Card Checkout for SynapticChain',
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg text-text p-8 text-center text-sm font-mono">Loading Synaptic Pay Checkout...</div>}>
      <CheckoutPanel />
    </Suspense>
  )
}
