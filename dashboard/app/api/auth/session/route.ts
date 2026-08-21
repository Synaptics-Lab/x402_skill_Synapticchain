import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { address, email, name, sub, onboarded } = body ?? {}

    const session = {
      address: address ?? null,
      email: email ?? null,
      name: name ?? null,
      sub: sub ?? null,
      onboarded: !!onboarded,
      ts: Date.now(),
    }

    const res = NextResponse.json({ ok: true, session })
    const isHttps = req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:'

    res.cookies.set('synapse_session', JSON.stringify(session), {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return res
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'failed to set session' }, { status: 500 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('synapse_session', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  })
  return res
}
