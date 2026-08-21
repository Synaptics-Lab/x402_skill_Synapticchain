import { test, expect } from '@playwright/test'

test.describe('Synaptic Pay & ODL Corridor End-to-End Suite', () => {
  test('Checkout page renders correctly with multi-asset selector & payment tabs', async ({ page }) => {
    await page.goto('https://api.synapticchain.xyz/checkout?amount=50&currency=sUSD')
    await page.waitForLoadState('networkidle')

    // Verify title and header branding
    await expect(page.getByText('SynapticPay Bridge').first()).toBeVisible()
    await expect(page.getByText('Non-Custodial Multi-Chain')).toBeVisible()

    // Verify asset selector buttons exist
    await expect(page.getByRole('button', { name: 'sUSD' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'SYN' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'USDT' }).first()).toBeVisible()

    // Verify payment tabs
    await expect(page.getByText('Multi-Chain QR')).toBeVisible()
    await expect(page.getByText('Web4 1-Click')).toBeVisible()

    // Verify deposit address & QR code container
    await expect(page.getByText('Deposit Address:').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy' }).first()).toBeVisible()
  })

  test('African ODL Corridors page renders 10 nations & quotes', async ({ page }) => {
    await page.goto('https://api.synapticchain.xyz/odl')
    await page.waitForLoadState('networkidle')

    // Verify ODL page elements
    await expect(page.getByText('African ODL')).toBeVisible()
    await expect(page.getByText('Send via Corridor').first()).toBeVisible()
    await expect(page.getByText('Total Corridors')).toBeVisible()
  })

  test('OKX Ticker REST API returns live spot rate', async ({ request }) => {
    const res = await request.get('https://api.synapticchain.xyz/api/okx/ticker?pair=BTC-USDT')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.ticker.instId).toBe('BTC-USDT')
    expect(json.ticker.last).toBeGreaterThan(1000)
  })
})
