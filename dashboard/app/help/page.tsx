import type { Metadata } from 'next'
import { OnboardingGuideClient } from '@/components/onboarding-guide-client'

export const metadata: Metadata = {
  title: 'Help — SYNAPSE',
  description: 'Onboarding guide for humans, bots, and providers on the x402 API Marketplace.',
}

export default function Page() {
  return (
    <div className="mx-auto max-w-[1400px] lg:border-x border-foreground">
      <OnboardingGuideClient />
    </div>
  )
}
