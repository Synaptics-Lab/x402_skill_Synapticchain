import type { Metadata, Viewport } from 'next'
import { Archivo, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { WalletProvider } from '@/components/wallet-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { OnboardingGuide } from '@/components/onboarding-guide'
import { TvlBanner } from '@/components/tvl-banner'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''

const _archivo = Archivo({ subsets: ['latin'], display: 'swap' })
const _mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'SYNAPSE — x402 API Marketplace on SynapticChain',
  description:
    'Machine-payable APIs. HTTP 402 invoices settled on-chain in under 500ms. Register endpoints, meter calls, claim yield.',
  generator: 'v0.app',
  metadataBase: new URL('https://api.synapticchain.xyz'),
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  colorScheme: 'light',
  themeColor: '#d7d6cf',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="antialiased bg-background text-foreground overflow-x-hidden">
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <WalletProvider>
            <SiteHeader />
            <TvlBanner />
            <main className="min-h-[70vh]">{children}</main>
            <SiteFooter />
            <OnboardingGuide />
          </WalletProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  )
}
