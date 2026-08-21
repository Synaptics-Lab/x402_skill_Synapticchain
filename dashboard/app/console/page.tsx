import type { Metadata } from 'next'
import { ConsumerConsole } from '@/components/consumer-console'

export const metadata: Metadata = {
  title: 'Bot console — SYNAPSE',
  description: 'Manage subscriptions, batch claim BOTCOIN and SYN yield, trade service tokens, and fire x402 calls.',
}

export default function Page() {
  return (
    <div className="mx-auto max-w-[1400px] lg:border-x border-foreground">
      <ConsumerConsole />
    </div>
  )
}
