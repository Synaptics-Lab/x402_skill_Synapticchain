/**
 * Server-side transaction submission endpoint (fallback signer).
 *
 * Used when the wallet connector is a burner or Google-derived session key. In
 * the Web4 flow the private key stays inside wallet.synapticchain.xyz and the
 * consumer calls window.synaptic.request directly.
 */

import { spawnSync } from 'node:child_process'
import { chainRpc, getBalance, getNonce } from '@/lib/chain/synaptic'

export const dynamic = 'force-dynamic'

const SIGNER = '/opt/synapticchain/x402-marketplace/scripts/sign_tx.py'
const DEFAULT_SPONSOR_KEY =
  process.env.SYNAPTIC_DEMO_ADMIN_KEY ||
  process.env.ADMIN_KEY_HEX ||
  'a8f49151c7d061170ff7960e3a75802d9a4db90acb28f877c0cdb09fb88f0a5c'

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'parse error' }, { status: 400 })
  }

  const privateKey = body?.privateKey ?? body?.private_key
  const contract = body?.contract
  const functionName = body?.function ?? body?.functionName
  const args = body?.args ?? []
  const gasLimit = Number(body?.gasLimit ?? body?.gas_limit ?? 500_000)
  const gasPrice = Number(body?.gasPrice ?? body?.gas_price ?? 100)
  const nonceKey = Number(body?.nonceKey ?? body?.nonce_key ?? 0)
  const wait = body?.wait !== false
  if (!privateKey || !contract || !functionName) {
    return Response.json({ error: 'missing privateKey/contract/function' }, { status: 400 })
  }

  // Derive the sender address from the private key via the SDK so the nonce
  // matches the actual signer.
  const deriveRes = spawnSync(
    'python3',
    ['-c', `import sys; sys.path.insert(0,'/opt/synapticchain/sdks/python/src'); from synapticchain import Wallet; w=Wallet.from_private_key(bytes.fromhex(sys.argv[1])); print(w.address().to_bech32())`, privateKey],
    { encoding: 'utf8', timeout: 10_000 },
  )
  if (deriveRes.status !== 0) {
    console.error('derive address failed', deriveRes.stderr)
    return Response.json({ error: 'invalid private key' }, { status: 400 })
  }
  let actualKey = privateKey
  let from = deriveRes.stdout.trim()

  try {
    const nonce = await getNonce(from, nonceKey)
    const rpcUrl = process.env.NEXT_PUBLIC_SYNAPTIC_RPC_URL ?? 'https://nodes.synapticchain.xyz/rpc'

    const amountBunits = body.amount
      ? Math.floor(Number(body.amount) * 1e18)
      : body.amount_bunits
        ? Number(body.amount_bunits)
        : 0

    const payload = {
      rpc_url: rpcUrl,
      private_key: actualKey,
      contract,
      function: functionName,
      args,
      gas_limit: gasLimit,
      gas_price: gasPrice,
      nonce,
      nonce_key: nonceKey,
      amount_bunits: amountBunits,
    }

    const signed = spawnSync('python3', [SIGNER], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 30_000,
    })

    if (signed.status !== 0) {
      console.error('signer failed', signed.stderr, signed.stdout)
      return Response.json({ error: signed.stderr || 'signer failed' }, { status: 500 })
    }

    const result = JSON.parse(signed.stdout)
    if (!result.ok) {
      return Response.json({ error: result.error ?? 'send failed' }, { status: 500 })
    }

    if (wait) {
      const start = Date.now()
      while (Date.now() - start < 15_000) {
        const receipt = await chainRpc<{ value?: { status: string; checkpoint_height: number } }>('syn_getTransaction', [result.tx_hash])
        if (receipt?.value?.status?.toLowerCase() === 'confirmed') {
          return Response.json({ ok: true, txHash: result.tx_hash, block: receipt.value.checkpoint_height, from })
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      return Response.json({ ok: true, txHash: result.tx_hash, pending: true, from })
    }

    return Response.json({ ok: true, txHash: result.tx_hash, from })
  } catch (err: any) {
    console.error('chain send error', err)
    return Response.json({ error: err.message ?? 'internal error' }, { status: 500 })
  }
}
