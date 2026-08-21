import { call, RpcError, rpcMethods } from '@/lib/chain/rpc'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ chain: 'SynapticChain', transport: 'http-json-rpc', methods: rpcMethods })
}

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: { code: -32700, message: 'parse error' } }, { status: 400 })
  }

  const batch = Array.isArray(body) ? body : [body]
  const out = await Promise.all(
    batch.map(async (entry) => {
      const id = entry?.id ?? null
      try {
        const result = await call(String(entry?.method), entry?.params ?? {})
        return { jsonrpc: '2.0', id, result }
      } catch (err) {
        const e = err as RpcError
        console.log('[v0] rpc error', entry?.method, e.message)
        return {
          jsonrpc: '2.0',
          id,
          error: { code: e.code ?? -32603, message: e.message ?? 'internal error' },
        }
      }
    }),
  )

  return Response.json(Array.isArray(body) ? out : out[0])
}
