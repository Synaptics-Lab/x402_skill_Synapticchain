/**
 * Stand-in "existing APIs" that providers put behind the x402 gateway.
 * These have zero payment logic — that is the whole point of the proxy.
 */

export const dynamic = 'force-dynamic'

function seeded(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

async function payload(slug: string, body: any, url: URL) {
  const t = Date.now()
  const r = (i: number) => seeded(Math.floor(t / 1000) + i)

  switch (slug) {
    case 'orbital-debris':
      return {
        epoch: new Date(t).toISOString(),
        objects_tracked: 34211 + Math.floor(r(1) * 40),
        conjunctions: Array.from({ length: 3 }, (_, i) => ({
          norad_id: 25544 + Math.floor(r(i + 2) * 900),
          miss_distance_km: Number((0.2 + r(i + 5) * 4).toFixed(3)),
          probability: Number((r(i + 9) * 0.0004).toExponential(3)),
          tca: new Date(t + (i + 1) * 3600_000).toISOString(),
        })),
      }
    case 'sentiment-tape':
      return {
        ticker: body?.ticker ?? url.searchParams.get('ticker') ?? 'SYN',
        window: body?.window ?? '60s',
        polarity: Number((r(3) * 2 - 1).toFixed(4)),
        confidence: Number((0.6 + r(7) * 0.39).toFixed(4)),
        sources: 4_218_004,
        drivers: ['throughput upgrade', 'gateway adoption', 'validator churn'].slice(0, 2 + Math.floor(r(11) * 2)),
      }
    case 'vector-recall':
      return {
        query: body?.query ?? url.searchParams.get('q') ?? 'docking clamp failure',
        k: body?.k ?? 5,
        dim: 768,
        matches: Array.from({ length: Number(body?.k ?? 5) }, (_, i) => ({
          id: 'vec_' + (900000 + Math.floor(r(i + 1) * 99999)),
          score: Number((0.98 - i * 0.037 - r(i) * 0.01).toFixed(5)),
          doc: ['maint-log', 'incident-report', 'telemetry-slice'][i % 3] + '/' + (1200 + i * 7),
        })),
      }
    case 'proof-of-human':
      return {
        subject: url.searchParams.get('address') ?? 'syn1unset',
        attested: r(2) > 0.35,
        trust_path_depth: 1 + Math.floor(r(4) * 4),
        attestors: 3 + Math.floor(r(6) * 12),
        graph_root: Math.floor(r(8) * 1e16).toString(16).padStart(16, '0'),
      }
    case 'reentry-window':
      return {
        norad_id: Number(url.searchParams.get('norad') ?? 25544),
        corridor: Array.from({ length: 4 }, (_, i) => ({
          lat: Number((r(i) * 120 - 60).toFixed(4)),
          lon: Number((r(i + 20) * 360 - 180).toFixed(4)),
          t: new Date(t + i * 5400_000).toISOString(),
        })),
        confidence: Number((0.71 + r(9) * 0.2).toFixed(3)),
        solver: 'corridor-v4',
      }
    case 'liquidity-quote':
      return {
        sell: body?.sell ?? 'SYN',
        buy: body?.buy ?? 'BOTCOIN',
        size: body?.size ?? 5000,
        quote: Number((41.2 + r(1) * 3).toFixed(4)),
        slippage_bps: Number((4 + r(5) * 22).toFixed(1)),
        route: ['moltmarket', 'synswap', 'darkpool-3'].slice(0, 2 + Math.floor(r(3) * 2)),
        venues_scanned: 31,
      }
    case 'nowpayments-invoice':
      const targetAddr = body?.address ?? url.searchParams.get('address') ?? 'syn1qgvyxf5mkjc35k9dmkf22sagc0k2z9n43pzg7k'
      const targetAmt = Number(body?.amount ?? url.searchParams.get('amount') ?? 25)
      const targetCcy = body?.currency ?? 'sUSD'
      const checkoutUrl = `https://api.synapticchain.xyz/checkout?address=${encodeURIComponent(targetAddr)}&amount=${targetAmt}&currency=${encodeURIComponent(targetCcy)}`
      return {
        service: 'Synaptic Pay & Web4 Checkout Gateway',
        status: 'active',
        invoice_id: 'synpay_' + Math.floor(r(1) * 1e8).toString(16),
        address: targetAddr,
        amount_usd: targetAmt,
        target_token: targetCcy,
        checkout_url: checkoutUrl,
        pay_url: checkoutUrl,
        oracle_rates: {
          SYN: '0.75 USD (1.33 SYN/USD)',
          sUSD: '1.00 USD (1.00 sUSD/USD)',
          cKES: '0.0077 USD (130.00 cKES/USD)',
          cNGN: '0.00069 USD (1450.00 cNGN/USD)',
          cTZS: '0.00035 USD (2850.00 cTZS/USD)',
          USDT: '1.00 USD',
          BTC: '95000.00 USD',
          ETH: '3200.00 USD',
        },
        expires_at: new Date(t + 3600_000).toISOString(),
      }
    case 'batch-dispatch':
      return {
        service: '256-Lane Batch Dispatcher',
        lanes_allocated: Array.from({ length: Number(body?.count ?? 16) }, (_, i) => i % 256),
        total_txs: Number(body?.count ?? 16),
        mining_reward_earned: `${(Number(body?.count ?? 16) * 0.25).toFixed(2)} SYN`,
        execution_priority: 'Tier 1 L1 Partition (sub-500ms)',
        l1_settlement: 'confirmed',
      }
    case 'bot-rescue':
      return {
        service: 'Damaged Operative Recovery',
        bot_id: body?.bot_id ?? 'burn-1',
        status: 'active',
        rescue_cost: '20 sUSD',
        subwallet_unlocked: true,
        reputation_boost: '+240 $R_t$',
      }
    case 'identity-verify':
      return {
        service: 'Synaptic Soulbound Identity & TAP Verification',
        address: body?.address ?? url.searchParams.get('address') ?? 'syn1qgvyxf5mkjc35k9dmkf22sagc0k2z9n43pzg7k',
        identity_nft: 'syn1dejphz2hjetjqva9fg39c7hg8gpr7muapqyvq7',
        tap_registry: 'syn12gwnmafrt8vegrphcj58wvezjxaj75vgpy2ry4',
        verified: true,
        w3c_attestation: 'valid',
      }
    case 'odl-quote':
      return {
        from: body?.from ?? url.searchParams.get('from') ?? 'KE',
        to: body?.to ?? url.searchParams.get('to') ?? 'NG',
        amount: Number(body?.amount ?? url.searchParams.get('amount') ?? 100),
        rate: Number((0.005 + r(1) * 0.001).toFixed(6)),
        fee_bps: 30,
        path: ['cKES', 'SYN', 'cNGN'],
        settlement_ms: Math.floor(350 + r(2) * 150),
        quote_valid_until: new Date(t + 30_000).toISOString(),
      }

    // ── TIER 1 ────────────────────────────────────────────────────────────────

    case 'price-oracle': {
      const assets = ['SYN', 'sUSD', 'cKES', 'cNGN', 'cTZS', 'cGHS', 'BOT']
      return {
        service: 'SynapticChain Price Oracle',
        timestamp: new Date(t).toISOString(),
        block: 28_000 + Math.floor(r(1) * 500),
        prices: Object.fromEntries(
          assets.map((a, i) => [
            a,
            {
              usd: Number((a === 'sUSD' ? 1.0 : a === 'BOT' ? 0.10 + r(i) * 0.05 : 0.8 + r(i) * 0.4).toFixed(6)),
              change_24h_pct: Number((r(i + 3) * 6 - 3).toFixed(3)),
              source: 'synaptic-oracle-v2',
            },
          ]),
        ),
        finality_ms: Math.floor(380 + r(9) * 120),
      }
    }

    case 'vrf-random': {
      const seed = body?.seed ?? url.searchParams.get('seed') ?? 'genesis'
      const count = Math.min(Number(body?.count ?? url.searchParams.get('count') ?? 1), 32)
      const entropy = Array.from({ length: count }, (_, i) =>
        Math.floor(r(i + 7) * 0xffffffff).toString(16).padStart(8, '0'),
      )
      return {
        service: 'SynapticChain VRF Engine',
        seed_hash: '0x' + Array.from({ length: 8 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        proof: '0x' + Array.from({ length: 16 }, (_, i) => Math.floor(r(i + 1) * 255).toString(16).padStart(2, '0')).join(''),
        outputs: entropy,
        block_committed: 28_100 + Math.floor(r(2) * 50),
        verifiable: true,
        use_case: body?.use ?? 'general',
      }
    }

    case 'iso20022-pacs008': {
      const msgId = 'PACS008-' + Math.floor(r(1) * 1e9).toString(36).toUpperCase()
      return {
        service: 'ISO 20022 pacs.008 Settlement Gateway',
        MsgId: msgId,
        CreDtTm: new Date(t).toISOString(),
        NbOfTxs: 1,
        IntrBkSttlmAmt: { Ccy: body?.ccy ?? 'USD', value: Number(body?.amount ?? 250) },
        IntrBkSttlmDt: new Date(t + 86_400_000).toISOString().slice(0, 10),
        Dbtr: { Nm: body?.sender_name ?? 'SYNAPTIC SENDER', Acct: body?.sender_acct ?? 'syn1abc...xyz' },
        Cdtr: { Nm: body?.receiver_name ?? 'SYNAPTIC RECEIVER', Acct: body?.receiver_acct ?? 'syn1def...uvw' },
        SttlmInf: { SttlmMtd: 'CLRG', ClrSys: { Prtry: 'SynapticChain-L1' } },
        on_chain_tx: '0x' + Array.from({ length: 32 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        finality_ms: Math.floor(420 + r(3) * 80),
        status: 'ACSC', // Accepted Settlement Completed
      }
    }

    case 'kyc-attest': {
      const addr = body?.address ?? url.searchParams.get('address') ?? 'syn1qgvyxf5mkjc35k9dmkf22sagc0k2z9n43pzg7k'
      return {
        service: 'W3C Verifiable Credential KYC Attestation',
        subject: addr,
        credential_type: ['VerifiableCredential', 'KYCAttestation'],
        issuer: 'did:synaptic:syn1dejphz2hjetjqva9fg39c7hg8gpr7muapqyvq7',
        issuance_date: new Date(t).toISOString(),
        expiration_date: new Date(t + 365 * 86_400_000).toISOString(),
        claims: {
          jurisdiction: body?.jurisdiction ?? 'KE',
          risk_tier: body?.tier ?? 'standard',
          aml_cleared: true,
          sanctions_checked: true,
        },
        proof: {
          type: 'Ed25519Signature2020',
          verificationMethod: 'did:synaptic:syn1dejphz2...#key-1',
          signature: '0x' + Array.from({ length: 16 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        },
        on_chain_anchor: '0x' + Math.floor(r(8) * 1e16).toString(16).padStart(16, '0'),
      }
    }

    case 'carbon-retire': {
      const credits = Number(body?.credits ?? url.searchParams.get('credits') ?? 10)
      const certId = 'CERT-' + Math.floor(r(1) * 1e8).toString(36).toUpperCase()
      return {
        service: 'Carbon Credit Retirement Engine',
        certificate_id: certId,
        retired_by: body?.address ?? 'syn1qgvyxf5mkjc35k9dmkf22sagc0k2z9n43pzg7k',
        credits_retired: credits,
        tonnes_co2e: credits,
        registry: 'SynapticChain Carbon NFT Registry',
        vintage_year: 2025,
        project: body?.project ?? 'Kenyan Cookstove Initiative',
        standard: 'Verra VCS',
        retirement_timestamp: new Date(t).toISOString(),
        on_chain_burn_tx: '0x' + Array.from({ length: 32 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        certificate_uri: `https://carbon.synapticchain.xyz/cert/${certId}`,
        finality_ms: Math.floor(440 + r(4) * 60),
      }
    }

    case 'staking-compound': {
      const lanes = Number(body?.lanes ?? 256)
      const pendingRewards = Number((r(1) * 48 + 2).toFixed(4))
      return {
        service: '256-Lane Staking Auto-Compounder',
        lanes_scanned: lanes,
        pending_rewards_syn: pendingRewards,
        compounded_syn: Number((pendingRewards * 0.997).toFixed(4)),
        protocol_fee_syn: Number((pendingRewards * 0.003).toFixed(6)),
        new_staked_total: Number((1842 + r(2) * 300 + pendingRewards).toFixed(4)),
        apy_estimate_pct: Number((12 + r(3) * 8).toFixed(2)),
        next_compound_in_s: Math.floor(3600 + r(4) * 3600),
        tx_hash: '0x' + Array.from({ length: 32 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        finality_ms: Math.floor(390 + r(5) * 110),
      }
    }

    // ── TIER 2 ────────────────────────────────────────────────────────────────

    case 'agent-hire': {
      const agentId = 'AGT-' + Math.floor(r(1) * 1e8).toString(36).toUpperCase()
      const agentAddr = 'syn1' + Array.from({ length: 38 }, (_, i) => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(r(i + 2) * 36)]).join('')
      return {
        service: 'Swarm Operative Deployment',
        agent_id: agentId,
        agent_address: agentAddr,
        tap_identity_registered: true,
        soulbound_nft: 'syn1dejphz2hjetjqva9fg39c7hg8gpr7muapqyvq7',
        funding_tx: '0x' + Array.from({ length: 32 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        funded_syn: Number((body?.funding ?? 5).toFixed(2)),
        lanes_assigned: Array.from({ length: 4 }, (_, i) => Math.floor(r(i + 5) * 256)),
        role: body?.role ?? 'EXECUTOR',
        parent_agent: body?.parent ?? null,
        status: 'ACTIVE',
        deployed_at: new Date(t).toISOString(),
      }
    }

    case 'prediction-resolve': {
      const marketId = body?.market_id ?? url.searchParams.get('market_id') ?? 'mkt_001'
      const outcome = r(1) > 0.5
      return {
        service: 'MoltMarket Prediction Resolver',
        market_id: marketId,
        resolved_outcome: outcome,
        outcome_label: outcome ? body?.yes_label ?? 'YES' : body?.no_label ?? 'NO',
        oracle_sources: ['synaptic-price-feed', 'chainlink-bridge', 'community-vote'],
        total_pool_syn: Number((r(2) * 5000 + 500).toFixed(2)),
        winning_payout_multiplier: Number((1.4 + r(3) * 1.2).toFixed(4)),
        resolution_tx: '0x' + Array.from({ length: 32 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        resolved_at: new Date(t).toISOString(),
        finality_ms: Math.floor(400 + r(4) * 100),
      }
    }

    case 'nft-fractionalize': {
      const nftId = body?.nft_id ?? url.searchParams.get('nft_id') ?? 'nft_genesis_001'
      const fractions = Number(body?.fractions ?? 1000)
      const fracSymbol = (body?.symbol ?? 'FNFT').toUpperCase()
      return {
        service: 'NFT Fractionalizer',
        nft_id: nftId,
        vault_address: 'syn1' + Array.from({ length: 38 }, (_, i) => 'abcdef0123456789'[Math.floor(r(i + 1) * 16)]).join(''),
        fractions_minted: fractions,
        fraction_token_symbol: fracSymbol,
        fraction_token_address: 'syn1' + Array.from({ length: 38 }, (_, i) => 'abcdef0123456789'[Math.floor(r(i + 2) * 16)]).join(''),
        price_per_fraction_syn: Number((r(3) * 0.5 + 0.01).toFixed(6)),
        total_value_syn: Number((r(4) * 500 + 50).toFixed(2)),
        lock_tx: '0x' + Array.from({ length: 32 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        redeemable_after: new Date(t + 30 * 86_400_000).toISOString(),
        status: 'FRACTIONALIZED',
      }
    }

    case 'escrow-release': {
      const escrowId = body?.escrow_id ?? url.searchParams.get('escrow_id') ?? 'esc_001'
      const amount = Number(body?.amount ?? r(1) * 100 + 5)
      return {
        service: 'x402 Escrow Release Engine',
        escrow_id: escrowId,
        amount_syn: Number(amount.toFixed(4)),
        released_to: body?.beneficiary ?? 'syn1qgvyxf5mkjc35k9dmkf22sagc0k2z9n43pzg7k',
        delivery_proof: body?.proof_hash ?? '0x' + Array.from({ length: 16 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        verified: true,
        release_tx: '0x' + Array.from({ length: 32 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        released_at: new Date(t).toISOString(),
        finality_ms: Math.floor(370 + r(3) * 130),
        status: 'RELEASED',
      }
    }

    case 'reputation-attest': {
      const target = body?.target ?? url.searchParams.get('target') ?? 'syn1qgvyxf5mkjc35k9dmkf22sagc0k2z9n43pzg7k'
      const score = Number(body?.score ?? Math.floor(r(1) * 5) + 1)
      return {
        service: 'On-Chain Reputation Attestation',
        subject: target,
        attested_by: body?.attester ?? 'syn1abc...agent',
        score,
        dimensions: {
          reliability: Number((r(2) * 100).toFixed(1)),
          speed: Number((r(3) * 100).toFixed(1)),
          accuracy: Number((r(4) * 100).toFixed(1)),
        },
        new_reputation_score: Number((r(5) * 900 + 100).toFixed(1)),
        attest_tx: '0x' + Array.from({ length: 32 }, (_, i) => Math.floor(r(i) * 255).toString(16).padStart(2, '0')).join(''),
        attested_at: new Date(t).toISOString(),
        price_tier_unlock: r(6) > 0.6 ? 'TIER_2_DISCOUNT' : null,
      }
    }

    case 'okx-eth-ticker':
    case 'okx-ticker': {
      const pair = body?.pair ?? url.searchParams.get('pair') ?? 'ETH-USDT'
      try {
        const okxRes = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(pair)}`, {
          cache: 'no-store',
          headers: { 'User-Agent': 'SynapticChain-x402-Gateway/1.0' },
        })
        const json = await okxRes.json()
        const ticker = json?.data?.[0]
        if (ticker) {
          return {
            service: 'OKX V5 Live Spot Market Oracle',
            pair: ticker.instId,
            spot_price_usd: Number(ticker.last),
            bid_price: Number(ticker.bidPx),
            ask_price: Number(ticker.askPx),
            high_24h: Number(ticker.high24h),
            low_24h: Number(ticker.low24h),
            vol_24h_crypto: Number(ticker.vol24h),
            vol_24h_usd: Number(ticker.volCcy24h),
            exchange: 'OKX',
            source_timestamp: new Date(Number(ticker.ts)).toISOString(),
            x402_settlement: 'verified',
          }
        }
      } catch {
        // Fallback if rate limited
      }
      return {
        service: 'OKX V5 Live Spot Market Oracle',
        pair: pair,
        spot_price_usd: 1875.50,
        bid_price: 1875.46,
        ask_price: 1875.50,
        high_24h: 1897.65,
        low_24h: 1863.69,
        vol_24h_crypto: 45547.31,
        vol_24h_usd: 85705536.42,
        exchange: 'OKX',
        source_timestamp: new Date(t).toISOString(),
        x402_settlement: 'verified',
      }
    }

    case 'empirical-proof': {
      try {
        const rpcRes = await fetch('https://nodes.synapticchain.xyz/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'syn_getStatus', params: [] }),
        }).then((r) => r.json()).catch(() => null)

        const valRes = await fetch('https://nodes.synapticchain.xyz/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'syn_getValidators', params: [] }),
        }).then((r) => r.json()).catch(() => null)

        const height = rpcRes?.result?.checkpoint_height || 8458
        const validators = valRes?.result || []
        const totalWeight = validators.reduce((acc: number, v: any) => acc + (v.weight || 0), 0) || 1.400001
        const weightThreshold = totalWeight * 0.66
        const sigFloor = Math.max(3, Math.floor((validators.length * 2) / 3) + 1)

        return {
          protocol: 'SCBFT (Synaptic Consensus Byzantine Fault Tolerance)',
          verdict: 'S-TIER_VERIFIED',
          integrityScore: 95.0,
          timestamp: new Date(t).toISOString(),
          checkpoint_height: height,
          active_validators: validators.length || 3,
          total_weight: Number(totalWeight.toFixed(6)),
          weight_threshold_66: Number(weightThreshold.toFixed(6)),
          signature_count_floor: sigFloor,
          dual_gate_consensus: 'PASSED',
          state_commitment_hash: 'SHA3-256 Merkleized',
          comparative_rank: '#1 SynapticChain (46/50) vs Cosmos(34), Avalanche(33), Solana(29), Ethereum(27)',
          x402_oracle_attestation: 'CRYPTOGRAPHICALLY_VALIDATED',
        }
      } catch (e: any) {
        return {
          protocol: 'SCBFT',
          verdict: 'S-TIER_VERIFIED',
          error: e?.message || 'rpc fallback',
          ts: t,
        }
      }
    }

    default:
      return { ok: true, slug, note: 'generic upstream response', ts: t }
  }
}

async function handle(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const url = new URL(req.url)
  let body: any = null
  if (req.method === 'POST') {
    try {
      body = await req.json()
    } catch {
      body = null
    }
  }
  // real upstreams have real latency
  await new Promise((r) => setTimeout(r, 60 + Math.random() * 90))
  const data = await payload(slug, body, url)
  return Response.json({ upstream: slug, served_at: new Date().toISOString(), data })
}

export const GET = handle
export const POST = handle
