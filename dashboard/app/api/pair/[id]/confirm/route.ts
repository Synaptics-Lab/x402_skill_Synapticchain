/**
 * Legacy convenience endpoint to confirm a pairing.
 *
 *   POST /api/pair/[id]/confirm
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Forward to the canonical confirm route in /api/pair/[id]/route.ts
  const url = new URL(_req.url)
  const canonical = url.origin + `/api/pair/${id}`
  const body = await _req.text()
  const res = await fetch(canonical, { method: 'POST', body })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
