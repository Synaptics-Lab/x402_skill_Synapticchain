/**
 * Proxy onboarding requests to the Terrarium auto-onboard backend.
 *
 * The wallet (wallet.synapticchain.xyz) posts here after Google login or
 * QR pairing so the user receives their soulbound identity + starter SYN.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ONBOARD_URL = process.env.TERRARIUM_ONBOARD_URL || 'http://127.0.0.1:8090/api/onboard'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET() {
  try {
    const upstream = await fetch(ONBOARD_URL, { method: 'GET' })
    const text = await upstream.text()
    let json: any
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { raw: text }
    }
    return NextResponse.json(json, { status: upstream.status, headers: CORS_HEADERS })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'onboard_backend_unreachable', detail: err.message },
      { status: 502, headers: CORS_HEADERS },
    )
  }
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    const text = await req.text()
    if (text && text.trim().length > 0) {
      body = JSON.parse(text)
    }
  } catch {
    body = {}
  }

  try {
    const upstream = await fetch(ONBOARD_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    const text = await upstream.text()
    let json: any
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { raw: text }
    }

    return NextResponse.json(json, { status: upstream.status, headers: CORS_HEADERS })
  } catch (err: any) {
    console.error('[onboard proxy] error:', err.message)
    return NextResponse.json(
      { success: false, error: 'onboard_backend_unreachable', detail: err.message },
      { status: 502, headers: CORS_HEADERS },
    )
  }
}

