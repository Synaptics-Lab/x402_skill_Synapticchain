/**
 * Initiate a QR-pairing session for cross-device Web4 onboarding.
 *
 * Dashboard/wallet creates a pairing request and polls `/api/pair/[id]` for the
 * wallet that scanned the QR code.
 *
 *   POST /api/pair/init
 *     { label: 'dashboard', publicKey?: string }
 *
 *   Response: { pairingId: 'pair_...', qrUrl: 'wallet.synapticchain.xyz/pair?id=...' }
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const dynamic = 'force-dynamic'

// Use a writable path that exists on the deployed server (alpha) as well as
// the build box. Fall back to /tmp if neither custom path is available.
const PAIR_STORE =
  process.env.PAIR_STORE_PATH ??
  path.resolve(process.cwd(), '.pairings.json')
const TTL_MS = 5 * 60 * 1000

function loadStore(): Record<string, any> {
  try {
    if (!fs.existsSync(PAIR_STORE)) return {}
    return JSON.parse(fs.readFileSync(PAIR_STORE, 'utf8'))
  } catch {
    return {}
  }
}

function saveStore(store: Record<string, any>) {
  fs.writeFileSync(PAIR_STORE, JSON.stringify(store, null, 2))
}

export async function POST(req: NextRequest) {
  try {
    const { label = 'device', publicKey } = (await req.json()) as {
      label?: string
      publicKey?: string
    }

    const id = `pair_${crypto.randomBytes(8).toString('hex')}`
    const store = loadStore()

    store[id] = {
      id,
      label,
      initiatorKey: publicKey ?? null,
      walletKey: null,
      address: null,
      status: 'pending',
      createdAt: Date.now(),
      confirmedAt: null,
    }
    saveStore(store)

    const host = req.headers.get('host') ?? 'api.synapticchain.xyz'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const qrUrl = `${protocol}://${host.replace(/^api\./, 'wallet.')}/pair?id=${id}`

    return NextResponse.json({ pairingId: id, qrUrl, status: 'pending' })
  } catch (err: any) {
    console.error('pair init error:', err)
    return NextResponse.json({ error: err.message ?? 'internal error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ usage: 'POST { label, publicKey? }' })
}
