// stop-live-trade — 활성 run 종료: 포지션 시장가 청산 + DB 정리
// Deploy: supabase functions deploy stop-live-trade
//
// Body: { api_key_id: string, run_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { COMMISSION_TAKER } from '../_shared/constants.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const PROXY_URL = Deno.env.get('BINANCE_PROXY_URL') ?? ''
const PROXY_SECRET = Deno.env.get('PROXY_SECRET') ?? ''

function getFapiBase(isTestnet: boolean) {
  if (!isTestnet && PROXY_URL) return PROXY_URL
  return isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com"
}

function proxyHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'X-MBX-APIKEY': apiKey }
  if (PROXY_SECRET) h['X-Proxy-Secret'] = PROXY_SECRET
  return h
}

async function binanceSign(params: Record<string, string | number>, apiSecret: string): Promise<string> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(qs))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${qs}&signature=${hex}`
}

async function binancePost(path: string, params: Record<string, string | number>, apiKey: string, apiSecret: string, isTestnet: boolean) {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}`, {
    method: 'POST',
    headers: { ...proxyHeaders(apiKey), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: signed,
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`Binance POST ${path} ${resp.status}: ${body}`)
  return JSON.parse(body) as Record<string, unknown>
}

async function binanceGet(path: string, params: Record<string, string | number>, apiKey: string, apiSecret: string, isTestnet: boolean) {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}?${signed}`, {
    headers: proxyHeaders(apiKey),
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`Binance GET ${path} ${resp.status}: ${body}`)
  return JSON.parse(body) as Record<string, unknown>
}

async function binanceDelete(path: string, params: Record<string, string | number>, apiKey: string, apiSecret: string, isTestnet: boolean) {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}?${signed}`, {
    method: 'DELETE',
    headers: proxyHeaders(apiKey),
  })
  const body = await resp.text()
  if (!resp.ok && resp.status !== 400) throw new Error(`Binance DELETE ${path} ${resp.status}: ${body}`)
  return JSON.parse(body) as Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '인증 필요' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: '인증 실패' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { api_key_id, run_id } = await req.json() as { api_key_id: string; run_id: string }
    if (!api_key_id || !run_id) {
      return new Response(JSON.stringify({ error: 'api_key_id, run_id 필요' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 소유권 확인
    const { data: keyRow } = await supabase
      .from('user_api_keys')
      .select('id, user_id, active_run_id')
      .eq('id', api_key_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!keyRow) {
      return new Response(JSON.stringify({ error: 'API 키 권한 없음' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Binance 자격증명 조회
    const { data: keyRows, error: keyErr } = await supabase.rpc('get_binance_keys', { p_api_key_id: api_key_id })
    if (keyErr || !keyRows || keyRows.length === 0) {
      return new Response(JSON.stringify({ error: 'API 키 조회 실패' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { api_key, api_secret, is_testnet } = keyRows[0] as { api_key: string; api_secret: string; is_testnet: boolean }

    // 1. active_run_id 먼저 해제 — cron이 새 포지션 못 열게
    await supabase.from('user_api_keys')
      .update({ active_run_id: null })
      .eq('id', api_key_id)

    // run의 심볼 조회 (포지션 없어도 알고 주문 취소에 사용)
    const { data: runRow } = await supabase
      .from('backtest_runs')
      .select('symbol')
      .eq('id', run_id)
      .maybeSingle()
    const runSymbol = runRow?.symbol as string | null

    // run 심볼 조회 — positions 없을 때도 알고 주문 취소에 필요
    const { data: runRow } = await supabase
      .from('backtest_runs')
      .select('symbol')
      .eq('id', run_id)
      .maybeSingle()
    const runSymbol = runRow?.symbol as string | null

    // OPEN 포지션 조회
    const { data: openPositions } = await supabase
      .from('live_positions')
      .select('*')
      .eq('backtest_run_id', run_id)
      .eq('status', 'OPEN')
    const positions = openPositions ?? []

    const iso = (ts: number) => new Date(ts).toISOString()
    const closed: string[] = []
    const errors: string[] = []

    // 포지션별: 시장가 청산 먼저 → 성공시에만 TP/SL 취소
    // (반대 순서로 하면 청산 실패 시 TP/SL 없는 무방비 포지션이 됨)
    for (const pos of positions) {
      const isShort   = pos.direction === 'SHORT'
      const closeSide = isShort ? 'BUY' : 'SELL'
      const qty       = pos.quantity as number
      const tpId      = pos.binance_tp_order_id as string | null
      const slId      = pos.binance_sl_order_id as string | null

      // 1. 시장가 청산 — 실패하면 TP/SL 건드리지 않고 다음 포지션으로
      let exitPrice = 0
      try {
        const closeOrder = await binancePost('/fapi/v1/order', {
          symbol: `${pos.symbol}USDT`, side: closeSide,
          type: 'MARKET', reduceOnly: 'true', quantity: String(qty),
        }, api_key, api_secret, is_testnet) as { avgPrice?: string; price?: string }
        exitPrice = parseFloat(closeOrder.avgPrice ?? closeOrder.price ?? '0')

        // avgPrice가 0이면 positionRisk mark price로 fallback
        if (exitPrice <= 0) {
          try {
            const risks = await binanceGet('/fapi/v2/positionRisk', { symbol: `${pos.symbol}USDT` }, api_key, api_secret, is_testnet) as unknown as { markPrice: string }[]
            const mark = parseFloat(risks[0]?.markPrice ?? '0')
            if (mark > 0) exitPrice = mark
          } catch { /* 무시 */ }
        }
      } catch (err) {
        errors.push(`${pos.id}: ${String(err)}`)
        continue // TP/SL 유지 — 포지션이 여전히 바이낸스에서 보호됨
      }

      // exitPrice 확보 실패 시 DB 오염 방지
      if (exitPrice <= 0) {
        errors.push(`${pos.id}: exitPrice 확보 실패, DB 미업데이트`)
        continue
      }

      // 2. 청산 성공 → 개별 TP/SL 주문 취소 (체결됐을 수 있으므로 실패 무시)
      if (tpId) try { await binanceDelete('/fapi/v1/algoOrder', { symbol: `${pos.symbol}USDT`, algoOrderId: Number(tpId) }, api_key, api_secret, is_testnet) } catch { }
      if (slId) try { await binanceDelete('/fapi/v1/algoOrder', { symbol: `${pos.symbol}USDT`, algoOrderId: Number(slId) }, api_key, api_secret, is_testnet) } catch { }

      const grossPnl = isShort
        ? qty * ((pos.entry_price as number) - exitPrice)
        : qty * (exitPrice - (pos.entry_price as number))
      const netPnl = grossPnl
        - (pos.entry_price as number) * qty * COMMISSION_TAKER
        - exitPrice * qty * COMMISSION_TAKER
      const pnlPct = (netPnl / (pos.capital_used as number)) * 100

      await supabase.from('live_positions').update({
        status:      'CLOSED',
        exit_price:  Math.round(exitPrice * 1e6) / 1e6,
        exit_time:   iso(Date.now()),
        exit_reason: 'MANUAL',
        net_pnl:     Math.round(netPnl  * 10000) / 10000,
        pnl_pct:     Math.round(pnlPct  * 10000) / 10000,
      }).eq('id', pos.id)

      closed.push(pos.id)
    }

    // 잔여 알고 주문 일괄 취소 — positions가 없어도 runSymbol로 처리
    const symbols = [...new Set([
      ...(runSymbol ? [runSymbol] : []),
      ...positions.map(p => p.symbol as string),
    ])]
    await Promise.allSettled(
      symbols.map(sym =>
        binanceDelete('/fapi/v1/algoOrders', { symbol: `${sym}USDT` }, api_key, api_secret, is_testnet)
      )
    )

    return new Response(JSON.stringify({ ok: true, closed: closed.length, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[stop-live-trade]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})