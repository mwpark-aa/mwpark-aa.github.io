// sync-positions — Supabase Edge Function (Deno)
// Deploy: supabase functions deploy sync-positions
//
// 14분마다 cron으로 실행되어 바이낸스의 실제 포지션 상태를
// live_positions / live_accounts DB와 동기화한다.
// live-trade(15분)가 실행되기 전에 TP/SL 청산 여부를 반영해두는 것이 목적.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { binanceGet, binanceDelete, getBinanceBalance } from '../_shared/binance.ts'
import { COMMISSION_TAKER } from '../_shared/constants.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const iso = (ts: number) => new Date(ts).toISOString()

async function reconcileSymbol(
  supabase: ReturnType<typeof createClient>,
  positions: Record<string, unknown>[],
  symbol: string,
  apiKey: string,
  apiSecret: string,
  isTestnet: boolean,
): Promise<string[]> {
  const closedIds: string[] = []
  if (positions.length === 0) return closedIds

  let risks: { positionAmt: string; entryPrice: string; markPrice: string; positionSide: string }[] = []
  try {
    risks = await binanceGet('/fapi/v2/positionRisk', { symbol: `${symbol}USDT` }, apiKey, apiSecret, isTestnet) as typeof risks
  } catch (err) {
    console.warn(`[sync-positions][${symbol}] positionRisk 실패:`, err)
    return closedIds
  }

  for (const pos of positions) {
    const direction = pos.direction as string
    const risk = risks.find(r => {
      const amt = parseFloat(r.positionAmt)
      if (r.positionSide !== 'BOTH') return r.positionSide === direction
      return direction === 'LONG' ? amt > 0 : amt < 0
    })
    const binanceAmt = risk ? Math.abs(parseFloat(risk.positionAmt)) : 0

    if (binanceAmt < 0.000001) {
      // 바이낸스에 포지션 없음 → TP/SL 등으로 청산된 것
      const entryTs = new Date(pos.entry_time as string).getTime()
      let exitPrice = risk?.markPrice ? parseFloat(risk.markPrice) : 0
      let exitTime  = Date.now()
      let exitReason = 'BINANCE_CLOSED'

      try {
        const trades = await binanceGet('/fapi/v1/userTrades', {
          symbol: `${symbol}USDT`, startTime: entryTs, limit: 50,
        }, apiKey, apiSecret, isTestnet) as { orderId: number; side: string; price: string; qty: string; time: number; maker: boolean }[]

        const closeSide = direction === 'LONG' ? 'SELL' : 'BUY'
        const closing = trades.filter(t => t.side === closeSide && t.time > entryTs).sort((a, b) => b.time - a.time)

        if (closing.length > 0) {
          const totalQty = closing.reduce((s, t) => s + parseFloat(t.qty), 0)
          const totalVal = closing.reduce((s, t) => s + parseFloat(t.price) * parseFloat(t.qty), 0)
          exitPrice = totalVal / totalQty
          exitTime  = closing[0]!.time

          const tpId = pos.binance_tp_order_id ? Number(pos.binance_tp_order_id) : null
          const slId = pos.binance_sl_order_id ? Number(pos.binance_sl_order_id) : null
          const lastId = closing[0]!.orderId
          if (tpId && lastId === tpId)      exitReason = 'TP'
          else if (slId && lastId === slId) exitReason = 'SL'
          else if (closing[0]!.maker)       exitReason = 'TP'
          else                              exitReason = 'MANUAL_OR_SL'
        }
      } catch (err) {
        console.warn(`[sync-positions][${symbol}] userTrades 실패:`, err)
      }

      // 남은 TP/SL 알고 주문 취소
      const tpId = pos.binance_tp_order_id as string | null
      const slId = pos.binance_sl_order_id as string | null
      if (tpId) try { await binanceDelete('/fapi/v1/algoOrder', { symbol: `${symbol}USDT`, algoOrderId: Number(tpId) }, apiKey, apiSecret, isTestnet) } catch { }
      if (slId) try { await binanceDelete('/fapi/v1/algoOrder', { symbol: `${symbol}USDT`, algoOrderId: Number(slId) }, apiKey, apiSecret, isTestnet) } catch { }

      if (exitPrice > 0) {
        const qty      = pos.quantity as number
        const isShort  = direction === 'SHORT'
        const grossPnl = isShort ? qty * ((pos.entry_price as number) - exitPrice) : qty * (exitPrice - (pos.entry_price as number))
        const netPnl   = grossPnl - (pos.entry_price as number) * qty * COMMISSION_TAKER - exitPrice * qty * COMMISSION_TAKER
        const pnlPct   = (pos.capital_used as number) > 0 ? (netPnl / (pos.capital_used as number)) * 100 : 0

        await supabase.from('live_positions').update({
          status:      'CLOSED',
          exit_price:  Math.round(exitPrice * 1e6) / 1e6,
          exit_time:   iso(exitTime),
          exit_reason: exitReason,
          net_pnl:     Math.round(netPnl  * 10000) / 10000,
          pnl_pct:     Math.round(pnlPct  * 10000) / 10000,
        }).eq('id', pos.id as string)

        closedIds.push(pos.id as string)
        console.log(`[sync-positions][${symbol}] CLOSED ${pos.id} @ ${exitPrice} (${exitReason})`)
      }
    } else if (risk?.entryPrice) {
      // 포지션 살아있음 — 실제 체결가 보정
      const binanceEntry = parseFloat(risk.entryPrice)
      if (Math.abs(binanceEntry - (pos.entry_price as number)) > 0.0001) {
        await supabase.from('live_positions').update({
          entry_price:     Math.round(binanceEntry * 1e6) / 1e6,
          avg_entry_price: Math.round(binanceEntry * 1e6) / 1e6,
        }).eq('id', pos.id as string)
      }
    }
  }

  return closedIds
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // active_run_id 가 있는 키만 대상
    const { data: activeKeys, error: keyListErr } = await supabase
      .from('user_api_keys')
      .select('id, user_id, active_run_id')
      .not('active_run_id', 'is', null)
    if (keyListErr) throw keyListErr
    if (!activeKeys || activeKeys.length === 0) {
      return new Response(JSON.stringify({ message: '활성 실거래 없음' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: Record<string, unknown>[] = []

    for (const key of activeKeys) {
      const { data: keyRows, error: keyErr } = await supabase.rpc('get_binance_keys', { p_api_key_id: key.id })
      if (keyErr || !keyRows || keyRows.length === 0) {
        results.push({ api_key_id: key.id, skipped: true, reason: 'API 키 조회 실패' })
        continue
      }
      const { api_key, api_secret, is_testnet } = keyRows[0] as { api_key: string; api_secret: string; is_testnet: boolean }

      // 해당 키의 OPEN 포지션 조회
      const { data: openPositions } = await supabase
        .from('live_positions')
        .select('*')
        .eq('api_key_id', key.id)
        .eq('status', 'OPEN')

      const positions = openPositions ?? []
      let totalClosed = 0

      if (positions.length > 0) {
        // 심볼별 그룹화 후 reconcile
        const bySymbol = new Map<string, Record<string, unknown>[]>()
        for (const p of positions) {
          const sym = p.symbol as string
          if (!bySymbol.has(sym)) bySymbol.set(sym, [])
          bySymbol.get(sym)!.push(p)
        }
        for (const [sym, sysPosArr] of bySymbol) {
          const closed = await reconcileSymbol(supabase, sysPosArr, sym, api_key, api_secret, is_testnet)
          totalClosed += closed.length
        }
      } else {
        // 포지션 없음 → active_run 심볼의 잔여 알고 주문 전체 취소
        try {
          const { data: run } = await supabase
            .from('backtest_runs')
            .select('symbol')
            .eq('id', key.active_run_id)
            .maybeSingle()
          if (run?.symbol) {
            await binanceDelete(
              '/fapi/v1/algoOrders',
              { symbol: `${run.symbol}USDT` },
              api_key, api_secret, is_testnet,
            )
            console.log(`[sync-positions] 잔여 알고 주문 취소 — ${run.symbol}`)
          }
        } catch (err) {
          console.warn(`[sync-positions] 알고 주문 취소 실패 (${key.id}):`, err)
        }
      }

      // live_accounts 잔고 동기화
      try {
        const balance = await getBinanceBalance(api_key, api_secret, is_testnet)
        await supabase.from('live_accounts').upsert({
          api_key_id: key.id,
          user_id:    key.user_id,
          balance:    Math.round(balance * 100) / 100,
          updated_at: new Date().toISOString(),
          is_testnet,
        }, { onConflict: 'api_key_id' })
      } catch (err) {
        console.warn(`[sync-positions] 잔고 동기화 실패 (${key.id}):`, err)
      }

      results.push({ api_key_id: key.id, open: positions.length, closed: totalClosed })
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[sync-positions]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})