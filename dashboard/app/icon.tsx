import { NextResponse } from 'next/server'

export const contentType = 'image/svg+xml'
export const size = {
  width: 512,
  height: 512,
}

export default function Icon() {
  return new NextResponse(
    `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#EAE6DF" />
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="360" fill="#F7931A" letter-spacing="-5">A</text>
</svg>`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  )
}
