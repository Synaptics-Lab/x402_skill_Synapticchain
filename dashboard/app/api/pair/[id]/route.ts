/**
 * Read or confirm a QR pairing session.
 *
 *   GET /api/pair/pair_abc123
 *     { id, status, label, address, walletKey }
 *
 *   POST /api/pair/pair_abc123
 *     { address, walletKey, publicKey }
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = loadStore()
  const record = store[id]
  if (!record) {
    return NextResponse.json({ error: 'pairing not found' }, { status: 404, headers: corsHeaders() })
  }
  if (Date.now() - record.createdAt > TTL_MS && record.status !== 'confirmed') {
    return NextResponse.json({ error: 'pairing expired' }, { status: 410, headers: corsHeaders() })
  }
  return NextResponse.json(record, { headers: corsHeaders() })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = loadStore()
  const record = store[id]
  if (!record) {
    return NextResponse.json({ error: 'pairing not found' }, { status: 404, headers: corsHeaders() })
  }
  if (Date.now() - record.createdAt > TTL_MS) {
    return NextResponse.json({ error: 'pairing expired' }, { status: 410, headers: corsHeaders() })
  }
  if (record.status === 'confirmed') {
    return NextResponse.json(record, { headers: corsHeaders() })
  }

  try {
    const { address, walletKey, publicKey } = (await req.json()) as {
      address?: string
      walletKey?: string
      publicKey?: string
    }

    record.address = address ?? record.address
    record.walletKey = walletKey ?? publicKey ?? record.walletKey
    record.status = 'confirmed'
    record.confirmedAt = Date.now()
    saveStore(store)

    return NextResponse.json(record, { headers: corsHeaders() })
  } catch (err: any) {
    console.error('pair confirm error:', err)
    return NextResponse.json({ error: err.message ?? 'internal error' }, { status: 500, headers: corsHeaders() })
  }
}
