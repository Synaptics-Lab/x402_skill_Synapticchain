import { okxClient } from '@/lib/okx'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const ccy = url.searchParams.get('ccy') || undefined

  try {
    const deposits = await okxClient.getDepositHistory(ccy)
    return Response.json({ ccy, deposits })
  } catch (err: any) {
    return Response.json(
      {
        ccy,
        error: err.message || 'Failed to fetch deposit history from OKX',
        deposits: [],
      },
      { status: 400 },
    )
  }
}
