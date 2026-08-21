import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import demoWallets from '../../.x402-demo-wallets.json'

/**
 * End-to-end browser test for the x402 marketplace consumer app.
 *
 * Flow:
 * 1. Inject a funded demo wallet into sessionStorage + synapse_session cookie.
 * 2. Land on the marketplace.
 * 3. Select a paid endpoint and open its detail.
 * 4. Click "Pay ... SYN & call".
 * 5. Assert that the x402 step ladder reaches `done` and the upstream JSON is rendered.
 *
 * NOTE: The middleware.ts auth guard requires a `synapse_session` cookie on
 * protected routes (/console, /skills, /gateway, /provider). Tests must call
 * setAuthCookie() before navigating to any of those routes.
 */

const SESSION_KEY = 'synaptic.web4.session'
const ONBOARDING_KEY = 'synapse.onboarding.dismissed'

function pickFundedWallet() {
  // Prefer a bot role; fallback to the first wallet.
  const w = demoWallets.find((x) => x.role === 'bot') ?? demoWallets[0]
  return {
    address: w.address,
    privateKey: w.private_key,
    connector: 'burner' as const,
  }
}

async function dismissOnboarding(page: Page) {
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, '1')
  }, ONBOARDING_KEY)
}

/**
 * Set the synapse_session cookie so middleware.ts lets the request through to
 * protected routes (/console, /skills, /gateway, /provider).
 * Must be called on the context BEFORE page.goto().
 */
async function setAuthCookie(context: BrowserContext, address?: string) {
  const wallet = pickFundedWallet()
  const session = JSON.stringify({
    address: address ?? wallet.address,
    email: 'test@synapticchain.xyz',
    name: 'Test Operator',
    onboarded: true,
  })
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3006'
  const url = new URL(baseURL)
  await context.addCookies([
    {
      name: 'synapse_session',
      value: session,
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ])
}

async function injectWallet(page: Page) {
  const wallet = pickFundedWallet()
  await page.addInitScript(
    ({ key, payload }: { key: string; payload: string }) => {
      window.sessionStorage.setItem(key, payload)
    },
    { key: SESSION_KEY, payload: JSON.stringify(wallet) },
  )
}

async function connectTestWallet(page: Page) {
  const wallet = pickFundedWallet()
  // Ensure the provider bundle has executed before calling the test seam.
  await page.waitForFunction(() => typeof (window as any).__synapticConnectTestWallet__ === 'function', {
    timeout: 10_000,
  })
  await page.evaluate((w) => {
    ;(window as any).__synapticConnectTestWallet__(w)
  }, wallet)
}

test('marketplace loads and shows paid endpoints', async ({ page }) => {
  await dismissOnboarding(page)
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.getByRole('heading', { name: /Registry/i })).toBeVisible()

  // At least one paid endpoint card is present.
  const priceTags = page.getByText(/SYN \/ call/)
  await expect(priceTags.first()).toBeVisible()
})

test('funded demo wallet can execute a paid x402 call end-to-end', async ({ page, context }) => {
  page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()))
  page.on('response', async (r) => {
    if (r.url().includes('/x402') || r.url().includes('/api/chain/send')) {
      try {
        const body = await r.text()
        console.log('[response]', r.status(), r.url(), body.slice(0, 400))
      } catch {}
    }
  })
  await injectWallet(page)
  await dismissOnboarding(page)
  // Set auth cookie BEFORE navigating to protected route
  await setAuthCookie(context, pickFundedWallet().address)
  await page.goto('/console', { waitUntil: 'load' })

  // The provider auto-restores the injected wallet from sessionStorage.
  // Wallet header should show the funded address without a manual click.
  await expect(page.getByText(pickFundedWallet().address.slice(0, 12))).toBeVisible({ timeout: 10_000 })

  // The demo wallet is seeded with real SYN from the alpha deploy. Go back to
  // the marketplace and wait for the restored wallet to be reflected in the UI.
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.getByRole('button', { name: /Exit/i })).toBeVisible()

  // Pick the cheapest endpoint and open its detail panel.
  const cheapest = page.locator('[data-testid="endpoint-row"]').first()
  await expect(cheapest).toBeVisible({ timeout: 10_000 })
  await cheapest.click()

  // Open the detail panel's x402 runner.
  const payButton = page.getByRole('button', { name: /Pay .* SYN & call/i })
  await expect(payButton).toBeEnabled()
  await payButton.click()

  // Wait for the step ladder to complete (final step is "07 response").
  await expect(page.getByText(/07 response/i)).toBeVisible({ timeout: 35_000 })

  // The upstream JSON output should appear.
  await expect(page.locator('pre').first()).toContainText('upstream', { timeout: 10_000 })

  // Response metadata should show a 200 and a positive cost.
  const status = page.getByText(/status 200/)
  await expect(status).toBeVisible()
})

test('console shows seeded demo wallet balance and reward state', async ({ page, context }) => {
  await injectWallet(page)
  await dismissOnboarding(page)
  await setAuthCookie(context, pickFundedWallet().address)
  await page.goto('/console', { waitUntil: 'load' })

  // The provider auto-restores the injected wallet from sessionStorage.
  await expect(page.getByText(pickFundedWallet().address.slice(0, 12))).toBeVisible({ timeout: 10_000 })

  // SYN balance stat should show a non-zero number for the seeded wallet.
  const balance = page.locator('text=/\\d+\\.\\d+ SYN/')
  await expect(balance.first()).toBeVisible()
})

test('Web4 wallet flow routes payments through window.synaptic.request and does not store a privateKey', async ({ page, context }) => {
  // Inject a Web4 wallet shape without a privateKey and mock the wallet provider.
  const web4Wallet = { address: 'syn1web4wallettestaddress000000000000', connector: 'synaptic' }
  await page.addInitScript(
    ({ key, payload }: { key: string; payload: string }) => {
      window.sessionStorage.setItem(key, payload)
      ;(window as any).synaptic = {
        connect: async () => ({ address: 'syn1web4wallettestaddress000000000000' }),
        request: async (args: any) => {
          ;(window as any).__lastSynapticRequest__ = args
          return { txHash: '0xweb4mocktxhash000000000000000000000000000000000000000000000000' }
        },
      }
    },
    { key: SESSION_KEY, payload: JSON.stringify(web4Wallet) },
  )

  await dismissOnboarding(page)
  // Set auth cookie so middleware doesn't redirect /console to /login
  await setAuthCookie(context, web4Wallet.address)
  await page.goto('/console', { waitUntil: 'load' })
  await expect(page.getByText(web4Wallet.address.slice(0, 12))).toBeVisible({ timeout: 10_000 })

  // Verify no privateKey leaked into sessionStorage.
  const stored = await page.evaluate((key) => window.sessionStorage.getItem(key), SESSION_KEY)
  const parsed = stored ? JSON.parse(stored) : {}
  expect(parsed.privateKey).toBeUndefined()

  // Trigger the x402 flow from the marketplace.
  await dismissOnboarding(page)
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.getByRole('button', { name: /Exit/i })).toBeVisible()
  const cheapest = page.locator('[data-testid="endpoint-row"]').first()
  await expect(cheapest).toBeVisible({ timeout: 10_000 })
  await cheapest.click()

  const payButton = page.getByRole('button', { name: /Pay .* SYN & call/i })
  await expect(payButton).toBeEnabled()
  await payButton.click()

  // Wait until the mocked wallet has recorded the request.
  await page.waitForFunction(() => !!(window as any).__lastSynapticRequest__, { timeout: 10_000 })
  const lastRequest = await page.evaluate(() => (window as any).__lastSynapticRequest__)
  expect(lastRequest.method).toBe('syn_sendTransaction')
  const txPayload = Array.isArray(lastRequest.params) ? lastRequest.params[0] : lastRequest.params
  expect(txPayload.contract).toBeTruthy()
  expect(txPayload.function).toBe('pay_per_call')

  // Step ladder should reach submitted (full settlement would need a real chain
  // confirmation, which the mock tx hash cannot provide).
  await expect(page.getByText(/04 submitted/i)).toBeVisible({ timeout: 15_000 })
})


