/**
 * Confirm and process a top-up payment via native checkout.
 *
 *   POST /api/topup/confirm
 *     { id: 'topup_...', address: 'syn1...', paymentMethod: 'card'|'web4'|'qr', currency: 'sUSD', txHash: '0x...' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadStore, saveStore, sendTopup, TopupRecord } from '../../../../lib/nowpayments'

export const dynamic = 'force-dynamic'

const RPC_URL = process.env.NEXT_PUBLIC_SYNAPTIC_RPC_URL ?? 'https://nodes.synapticchain.xyz/rpc'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

/**
 * Verify the txHash actually exists on-chain before crediting.
 * Polls the RPC once — if it returns a tx object the payment landed.
 */
async function verifyTxOnChain(txHash: string): Promise<boolean> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'syn_getTransaction',
        params: [txHash],
      }),
    })
    const json = await res.json()
    // If result is non-null and has a hash field, the tx landed
    return !!json?.result && typeof json.result === 'object' && !!json.result.hash
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, address, paymentMethod = 'web4', currency = 'sUSD', txHash } = (await req.json()) as {
      id?: string
      address?: string
      paymentMethod?: string
      currency?: string
      txHash?: string
    }

    if (!txHash || !id) {
      return NextResponse.json(
        { error: 'Payment verification failed: valid transaction hash and payment ID required.' },
        { status: 400, headers: corsHeaders() },
      )
    }

    // For Web4 payments: verify the txHash actually landed on-chain before crediting
    if (paymentMethod === 'web4') {
      const onChain = await verifyTxOnChain(txHash)
      if (!onChain) {
        return NextResponse.json(
          { error: `Transaction ${txHash.slice(0, 14)}... not found on-chain. It may still be confirming — wait 10 seconds and retry.` },
          { status: 402, headers: corsHeaders() },
        )
      }
    }

    const store = loadStore()
    const targetId = id

    let record: TopupRecord | undefined = store[targetId]
    if (!record) {
      return NextResponse.json(
        { error: `Payment record ${id} not found. Please create a new invoice.` },
        { status: 404, headers: corsHeaders() },
      )
    }

    // Idempotency guard — don't double-credit
    if (record.status === 'finished' || record.status === 'complete') {
      return NextResponse.json(
        {
          ok: true,
          status: record.status,
          txHash: record.txHash,
          record,
          note: 'Already processed.',
        },
        { headers: corsHeaders() },
      )
    }

    if (currency) record.currency = currency.toLowerCase()
    record.txHash = txHash

    // For NowPayments bridge flow: execute on-chain L1 transfer from admin wallet
    if (paymentMethod !== 'web4') {
      const sendResult = sendTopup(record)
      if (!sendResult.ok) {
        console.error('sendTopup failed:', sendResult.error)
        record.status = 'failed'
        saveStore(store)
        return NextResponse.json(
          { error: `On-chain credit failed: ${sendResult.error}. Contact support with your payment ID: ${id}` },
          { status: 500, headers: corsHeaders() },
        )
      }
      // Use the actual on-chain txHash from the credit transfer
      record.txHash = sendResult.txHash ?? txHash
    }

    record.status = 'finished'
    record.completedAt = Date.now()
    store[targetId] = record
    saveStore(store)

    return NextResponse.json(
      {
        ok: true,
        status: 'finished',
        paymentMethod,
        txHash: record.txHash,
        record,
      },
      { headers: corsHeaders() },
    )
  } catch (err: any) {
    console.error('topup confirm error:', err)
    return NextResponse.json({ error: err.message ?? 'internal error' }, { status: 500, headers: corsHeaders() })
  }
}
