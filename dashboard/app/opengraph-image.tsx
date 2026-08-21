import { NextResponse } from 'next/server'

export const contentType = 'image/svg+xml'
export const size = {
  width: 1200,
  height: 630,
}

export default function Image() {
  return new NextResponse(
    `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#EAE6DF" />
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="650" fill="#F7931A" letter-spacing="-5">A</text>
</svg>`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  )
}
