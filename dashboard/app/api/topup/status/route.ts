/**
 * Poll top-up payment status.
 *
 *   GET /api/topup/status?id=topup_...
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

const TOPUP_STORE = path.resolve(process.env.TOPUP_STORE_PATH || './.topup-payments.json')

function loadStore(): Record<string, any> {
  try {
    if (!fs.existsSync(TOPUP_STORE)) return {}
    return JSON.parse(fs.readFileSync(TOPUP_STORE, 'utf8'))
  } catch {
    return {}
  }
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

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400, headers: corsHeaders() })
  }

  const store = loadStore()
  const record = store[id]
  if (!record) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: corsHeaders() })
  }

  return NextResponse.json(record, { headers: corsHeaders() })
}
