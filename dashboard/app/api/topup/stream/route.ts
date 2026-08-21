import { NextRequest } from 'next/server'
import { loadStore } from '../../../../lib/nowpayments'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return new Response('Payment ID required', { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let active = true

      const checkStatus = () => {
        try {
          const store = loadStore()
          const record = store[id]
          if (record) {
            const data = JSON.stringify({
              id: record.id,
              status: record.status,
              txHash: record.txHash,
              currency: record.currency,
              amountUsd: record.amountUsd,
              synAmount: record.synAmount,
              completedAt: record.completedAt,
            })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))

            if (record.status === 'finished') {
              active = false
              controller.close()
              return
            }
          }
        } catch {}
      }

      // Initial check
      checkStatus()

      // Poll interval every 2 seconds
      const interval = setInterval(() => {
        if (!active) {
          clearInterval(interval)
          return
        }
        checkStatus()
      }, 2000)

      req.signal.addEventListener('abort', () => {
        active = false
        clearInterval(interval)
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
