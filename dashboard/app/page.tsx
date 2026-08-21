import { Hero } from '@/components/hero'
import { Marketplace } from '@/components/marketplace'

export default function Page() {
  return (
    <div className="mx-auto max-w-[1400px] lg:border-x border-foreground">
      <Hero />
      <Marketplace />
    </div>
  )
}
