import { okxClient } from '@/lib/okx'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const ccy = url.searchParams.get('ccy') || 'USDT'

  try {
    const addresses = await okxClient.getDepositAddress(ccy)
    return Response.json({ ccy, addresses })
  } catch (err: any) {
    return Response.json(
      {
        ccy,
        error: err.message || 'Failed to fetch deposit address from OKX',
        addresses: [],
      },
      { status: 400 },
    )
  }
}
