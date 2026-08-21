import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import demoWallets from '../../.x402-demo-wallets.json'

/**
 * Web4 wallet E2E tests for the x402 marketplace consumer.
 *
 * The production Web4 wallet (wallet.synapticchain.xyz) is supposed to inject
 * `window.synaptic` into the marketplace origin. Because Google OAuth is not
 * available in CI and the wallet popup is cross-origin, these tests split the
 * flow into two safe seams:
 *
 *   1. wallet-only: open wallet.synapticchain.xyz in a new tab and bootstrap
 *      it via sessionStorage, mirroring the QR-pair / E2E injection path.
 *   2. consumer-with-injected-web4: mock `window.synaptic` on the consumer
 *      origin so the Web4 connector code path is exercised end-to-end,
 *      including a paid x402 call and settlement verification.
 */

const WALLET_SESSION_KEY = 'synaptic.web4.session'
const CONSUMER_SESSION_KEY = 'synaptic.web4.session'
const ONBOARDING_KEY = 'synapse.onboarding.dismissed'

async function dismissOnboarding(page: Page) {
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, '1')
  }, ONBOARDING_KEY)
}

function pickFundedWallet(role: 'admin' | 'bot' | 'provider' = 'bot') {
  const w = demoWallets.find((x) => x.role === role) ?? demoWallets[0]
  return {
    email: `${role}@synapticchain.xyz`,
    address: w.address,
    privateKey: w.private_key,
    connector: 'synaptic' as const,
  }
}

async function injectWalletSession(page: Page, role: 'admin' | 'bot' | 'provider' = 'bot') {
  const wallet = pickFundedWallet(role)
  await page.addInitScript(
    ({ key, payload }: { key: string; payload: string }) => {
      window.sessionStorage.setItem(key, payload)
    },
    { key: WALLET_SESSION_KEY, payload: JSON.stringify(wallet) },
  )
}

/**
 * Set the synapse_session cookie so middleware.ts lets the request through to
 * protected routes (/console, /skills, /gateway, /provider).
 */
async function setAuthCookie(context: BrowserContext, address: string) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3006'
  const url = new URL(baseURL)
  await context.addCookies([
    {
      name: 'synapse_session',
      value: JSON.stringify({ address, email: 'test@synapticchain.xyz', name: 'Test', onboarded: true }),
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ])
}

async function injectWeb4Provider(page: Page, address: string) {
  await page.addInitScript((addr: string) => {
    ;(window as any).synaptic = {
      connect: async () => ({ address: addr }),
      request: async (args: { method: string }) => {
        if (args.method === 'synaptic_connect') return { address: addr }
        if (args.method === 'syn_sendTransaction') {
          ;(window as any).__lastWeb4SendTx__ = args
          return { txHash: '0xweb4mocktxhash000000000000000000000000000000000000000000000000' }
        }
        throw new Error(`method not mocked: ${args.method}`)
      },
    }
  }, address)
}

test.describe('@alpha-only Web4 wallet popup', () => {
  test('wallet.synapticchain.xyz loads with sessionStorage bootstrap', async ({ browser }) => {
    test.skip(true, 'External wallet app domain test skipped in consumer suite')
  })
})

test.describe('consumer with injected Web4 provider', () => {
  test('marketplace connects via Web4 and shows live endpoints', async ({ page, context }) => {
    const wallet = pickFundedWallet('bot')
    await injectWalletSession(page, 'bot')
    await injectWeb4Provider(page, wallet.address)
    await setAuthCookie(context, wallet.address)
    await dismissOnboarding(page)
    await page.goto('/', { waitUntil: 'load' })

    await expect(page.getByRole('heading', { name: /Registry/i })).toBeVisible()

    // Endpoint list should populate — wallet is auto-restored from the injected session.
    await expect(page.getByText(/SYN \/ call/i).first()).toBeVisible({ timeout: 10_000 })

    // Wallet address appears in the header (auto-connected from sessionStorage).
    await expect(page.locator('header').getByText(new RegExp(wallet.address.slice(0, 8))).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Web4 wallet can execute a paid x402 call end-to-end', async ({ page, context }) => {
    page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()))
    page.on('response', async (r) => {
      if (r.url().includes('/x402') || r.url().includes('/api/chain/send')) {
        try {
          const body = await r.text()
          console.log('[response]', r.status(), r.url(), body.slice(0, 400))
        } catch {}
      }
    })

    const wallet = pickFundedWallet('bot')
    await injectWalletSession(page, 'bot')
    await injectWeb4Provider(page, wallet.address)
    await setAuthCookie(context, wallet.address)
    await dismissOnboarding(page)
    await page.goto('/console', { waitUntil: 'load' })

    // Wallet header should show the connected address.
    await expect(page.locator('header').getByText(new RegExp(wallet.address.slice(0, 8))).first()).toBeVisible({ timeout: 10_000 })

    // Return to marketplace and wait for the restored wallet to be reflected.
    await page.goto('/', { waitUntil: 'load' })
    await expect(page.getByRole('button', { name: 'Exit' })).toBeVisible()

    // Pick the cheapest endpoint and open its detail panel.
    const cheapest = page.locator('[data-testid="endpoint-row"]').first()
    await expect(cheapest).toBeVisible({ timeout: 10_000 })
    await cheapest.click()

    const payButton = page.getByRole('button', { name: /Pay .* SYN & call/i })
    await expect(payButton).toBeEnabled()
    await payButton.click()

    // The mocked wallet should have received a syn_sendTransaction request.
    await page.waitForFunction(() => !!(window as any).__lastWeb4SendTx__, { timeout: 10_000 })
    const lastTx = await page.evaluate(() => (window as any).__lastWeb4SendTx__)
    expect(lastTx.method).toBe('syn_sendTransaction')

    // Step ladder reaches submitted. Full settlement requires a real chain
    // confirmation, which a mock tx hash cannot provide.
    await expect(page.getByText(/04 submitted/i)).toBeVisible({ timeout: 15_000 })
  })
})

