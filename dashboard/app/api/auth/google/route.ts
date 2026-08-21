import { NextResponse } from 'next/server'
import { deriveKeypair } from '@/lib/chain/crypto'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'dev-secret-change-me'

/**
 * Lightweight Google OAuth callback handler.
 *
 * Accepts a Google ID token, verifies it via Google's public keys endpoint,
 * and returns a deterministic session payload with the canonical Matrix Wallet
 * Ed25519 address.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { idToken?: string }
    const idToken = body.idToken

    if (!idToken) {
      return NextResponse.json({ error: 'idToken required' }, { status: 400 })
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
    }

    const googleRes = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
      cache: 'no-store',
    })
    if (!googleRes.ok) {
      return NextResponse.json({ error: 'Invalid Google idToken' }, { status: 401 })
    }
    const payload = (await googleRes.json()) as {
      sub: string
      email: string
      name?: string
      picture?: string
      aud: string
    }

    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return NextResponse.json({ error: 'Token audience mismatch' }, { status: 401 })
    }

    const { address } = deriveKeypair(payload.email)
    const name = payload.name || payload.email.split('@')[0]
    const session = { email: payload.email, name, sub: payload.sub, address, onboarded: true }
    const res = NextResponse.json({
      sub: payload.sub,
      email: payload.email,
      name,
      address,
      picture: payload.picture || '',
    })

    const isHttps = req.headers.get('x-forwarded-proto') === 'https'
    res.cookies.set('synapse_session', JSON.stringify(session), {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })

    return res
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
