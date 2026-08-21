import { okxClient } from '@/lib/okx'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const fiatCcy = url.searchParams.get('fiatCcy') || 'USD'
  const cryptoCcy = url.searchParams.get('cryptoCcy') || 'USDT'
  const fiatAmount = Number(url.searchParams.get('fiatAmount') || 25)

  try {
    const quote = await okxClient.getFiatChannelQuote({ fiatCcy, cryptoCcy, fiatAmount })
    return Response.json({ quote })
  } catch (err: any) {
    return Response.json(
      {
        error: err.message || 'Failed to fetch OKX fiat channel quote',
      },
      { status: 400 },
    )
  }
}
