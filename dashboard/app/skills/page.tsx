import type { Metadata } from 'next'
import { SkillsMarket } from '@/components/skills-market'

export const metadata: Metadata = {
  title: 'Skill tokens — SYNAPSE',
  description: 'Trade tokenized x402 skills on a bonding curve. Skill creators earn from every call and every trade.',
}

export default function Page() {
  return (
    <div className="mx-auto max-w-[1400px] lg:border-x border-foreground">
      <SkillsMarket />
    </div>
  )
}
