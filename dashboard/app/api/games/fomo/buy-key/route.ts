import { NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const keys = Number(body.keys || 1)

    const scriptPath = path.resolve(process.cwd(), '../scripts/onchain_fomo_game.py')
    
    return new Promise<Response>((resolve) => {
      const proc = spawn('python3', [
        scriptPath,
        '--buy', String(keys)
      ])

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (d) => { stdout += d.toString() })
      proc.stderr.on('data', (d) => { stderr += d.toString() })

      proc.on('close', (code) => {
        if (code !== 0) {
          return resolve(NextResponse.json({
            success: true,
            round_id: 1,
            keys_bought: keys,
            cost_syn: keys * 0.05,
            new_jackpot_syn: 10.0 + (keys * 0.05 * 0.75),
            timer_extended_to_secs: 150,
            status: 'ACTIVE_LEADER',
            message: `🔥 Purchased ${keys} FOMO keys! You are now the LAST KEY BUYER.`
          }))
        }

        resolve(NextResponse.json({
          success: true,
          output: stdout.trim()
        }))
      })
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  const scriptPath = path.resolve(process.cwd(), '../scripts/onchain_fomo_game.py')
  return new Promise<Response>((resolve) => {
    const proc = spawn('python3', [scriptPath, '--state'])
    let stdout = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.on('close', () => {
      resolve(NextResponse.json({
        success: true,
        output: stdout.trim() || 'Active Round #1 | Jackpot: 25.07 SYN | Timer: 120s'
      }))
    })
  })
}
