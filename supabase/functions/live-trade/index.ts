// Live Trade — Supabase Edge Function (Deno)
// Deploy: supabase functions deploy live-trade
//
// 필요한 Supabase Secrets:
//   BINANCE_API_KEY    — 바이낸스 Futures API 키
//   BINANCE_API_SECRET — 바이낸스 Futures API 시크릿
//   FRED_API_KEY       — (선택) 연준 유동성 데이터

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import type { Candle, BaseConfig, DailyBar } from '../_shared/types.ts'
import { COMMISSION_TAKER, COMMISSION_MAKER, CAPITAL_PER_TRADE, WARMUP_CANDLES, SIGNAL_COOLDOWN } from '../_shared/constants.ts'
import { intervalToMs, fetchKlines } from '../_shared/klines.ts'
import { computeIndicators } from '../_shared/indicators.ts'
import { fetchFedBars, attachFedData } from '../_shared/fed.ts'
import { scoreLong, scoreShort, getDailyBar, detectSignal } from '../_shared/scoring.ts'
import { buildSignalDetails, buildExitDetails } from '../_shared/details.ts'
import { calcTPSL, calcPositionSize } from '../_shared/position.ts'

type LiveConfig = BaseConfig

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── 바이낸스 Futures API ──────────────────────────────────────

const FAPI_BASE   = "https://fapi.binance.com"
const BAPI_KEY    = Deno.env.get("BINANCE_API_KEY")    ?? ""
const BAPI_SECRET = Deno.env.get("BINANCE_API_SECRET") ?? ""

interface BinanceOrder {
  orderId: number
  clientOrderId: string
  symbol: string
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'EXPIRED' | 'REJECTED'
  avgPrice: string
  executedQty: string
  origQty: string
  side: string
  type: string
}

async function binanceSign(params: Record<string, string | number>): Promise<string> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(BAPI_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(qs))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${qs}&signature=${hex}`
}

async function binanceGet(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() })
  const resp = await fetch(`${FAPI_BASE}${path}?${signed}`, {
    headers: { 'X-MBX-APIKEY': BAPI_KEY },
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`Binance GET ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

async function binancePost(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() })
  const resp = await fetch(`${FAPI_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': BAPI_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: signed,
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`Binance POST ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

async function binanceDelete(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() })
  const resp = await fetch(`${FAPI_BASE}${path}?${signed}`, {
    method: 'DELETE',
    headers: { 'X-MBX-APIKEY': BAPI_KEY },
  })
  const body = await resp.text()
  if (!resp.ok && resp.status !== 400) throw new Error(`Binance DELETE ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

async function getBinanceBalance(): Promise<number> {
  const account = await binanceGet('/fapi/v2/account') as { assets: { asset: string; availableBalance: string }[] }
  const usdt = account.assets?.find(a => a.asset === 'USDT')
  return usdt ? parseFloat(usdt.availableBalance) : 0
}

async function getOrder(symbol: string, orderId: string): Promise<BinanceOrder | null> {
  try {
    return await binanceGet('/fapi/v1/order', { symbol: `${symbol}USDT`, orderId: Number(orderId) }) as BinanceOrder
  } catch { return null }
}

async function cancelOrder(symbol: string, orderId: string): Promise<void> {
  try {
    await binanceDelete('/fapi/v1/order', { symbol: `${symbol}USDT`, orderId: Number(orderId) })
  } catch { /* 이미 체결됐거나 없는 주문 */ }
}

async function getQuantityPrecision(symbol: string): Promise<number> {
  try {
    const info = await fetch(`${FAPI_BASE}/fapi/v1/exchangeInfo?symbol=${symbol}USDT`)
    const { symbols } = await info.json() as { symbols: { symbol: string; filters: { filterType: string; stepSize: string }[] }[] }
    const sym  = symbols.find(s => s.symbol === `${symbol}USDT`)
    const lot  = sym?.filters.find(f => f.filterType === 'LOT_SIZE')
    const step = parseFloat(lot?.stepSize ?? '0.001')
    return step >= 1 ? 0 : Math.round(-Math.log10(step))
  } catch { return 3 }
}

function floorToPrecision(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.floor(value * factor) / factor
}

// ── 메인 핸들러 ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    if (!BAPI_KEY || !BAPI_SECRET) {
      return new Response(JSON.stringify({ error: 'BINANCE_API_KEY / BINANCE_API_SECRET 환경변수 미설정' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 1. 활성 설정 로드 ─────────────────────────────────────
    const { data: config, error: cfgErr } = await supabase
      .from('backtest_runs').select('*').eq('live_trading_enabled', true).maybeSingle()
    if (cfgErr) throw cfgErr
    if (!config) {
      return new Response(JSON.stringify({ message: '활성 실거래 설정 없음' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const c = config as LiveConfig

    // ── 2. 인터벌 계산 ────────────────────────────────────────
    const intervalMs      = intervalToMs(c.interval)
    const now             = Date.now()
    const lastCandleEnd   = Math.floor(now / intervalMs) * intervalMs
    const warmupStartTime = lastCandleEnd - WARMUP_CANDLES * intervalMs

    // ── 3. 이미 처리한 캔들인지 확인 ─────────────────────────
    const { data: liveAccount } = await supabase.from('live_account').select('*').eq('id', 1).single()
    if (liveAccount?.last_processed_ts) {
      const lastProcessed = new Date(liveAccount.last_processed_ts).getTime()
      if (lastProcessed >= lastCandleEnd) {
        return new Response(JSON.stringify({ message: '이미 처리됨', last_processed: liveAccount.last_processed_ts }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ── 4. 캔들 + 지표 계산 ──────────────────────────────────
    const rows = await fetchKlines(c.symbol, c.interval, warmupStartTime, lastCandleEnd - 1)
    if (rows.length < 50) {
      return new Response(JSON.stringify({ message: '캔들 데이터 부족', count: rows.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    computeIndicators(rows)

    // ── 4.5. 연준 유동성 ──────────────────────────────────────
    if (c.score_use_fed_liquidity) {
      const fedStartDate = new Date(lastCandleEnd - 30 * 86_400_000).toISOString().slice(0, 10)
      const endDate      = new Date(lastCandleEnd).toISOString().slice(0, 10)
      try {
        const fedBars = await fetchFedBars(fedStartDate, endDate, c.fed_liquidity_ma_period ?? 13)
        if (fedBars.length > 0) attachFedData(rows, fedBars)
      } catch (err) { console.error('[live-trade] Fed liquidity error:', err) }
    }

    // ── 4.7. 일봉 추세 맵 (MTF) ──────────────────────────────
    let dailyMap: Map<number, DailyBar> | null = null
    if (c.use_daily_trend) {
      const dailyRows = await fetchKlines(c.symbol, '1d', warmupStartTime - 220 * 86_400_000, lastCandleEnd)
      computeIndicators(dailyRows)
      dailyMap = new Map(dailyRows.map(r => [r.timestamp, { close: r.close, ma120: r.ma120 ?? null }]))
    }

    const n         = rows.length
    const latestRow = rows[n - 1]!
    const iso       = (ts: number) => new Date(ts).toISOString()

    // ── 5. 오픈 포지션 로드 ───────────────────────────────────
    const { data: openPositions } = await supabase
      .from('live_positions').select('*').eq('status', 'OPEN').eq('backtest_run_id', c.id)
    const positions       = openPositions ?? []
    const closedThisCycle: string[] = []
    const debugInfo: Record<string, unknown> = { candle_count: n, open_before: positions.length }

    // ── 6. 오픈 포지션: 바이낸스 TP/SL 체결 확인 + SCORE_EXIT ─
    for (const pos of positions) {
      // 진입 캔들에서는 exit 체크 없음
      if (new Date(pos.entry_time).getTime() === latestRow.timestamp) continue

      const isShort = pos.direction === 'SHORT'
      const tpId    = pos.binance_tp_order_id as string | null
      const slId    = pos.binance_sl_order_id as string | null

      let exitPrice:  number | null = null
      let exitReason: string        = ''
      let cancelId:   string | null = null

      // TP 체결 확인
      if (tpId) {
        const tpOrder = await getOrder(c.symbol, tpId)
        if (tpOrder?.status === 'FILLED') {
          exitPrice  = parseFloat(tpOrder.avgPrice) || pos.target_price
          exitReason = 'TP'
          cancelId   = slId
        }
      }

      // SL 체결 확인
      if (!exitPrice && slId) {
        const slOrder = await getOrder(c.symbol, slId)
        if (slOrder?.status === 'FILLED') {
          exitPrice  = parseFloat(slOrder.avgPrice) || pos.stop_loss
          exitReason = 'SL'
          cancelId   = tpId
        }
        // 두 주문 모두 취소됨 → 강제청산
        if (slOrder?.status === 'CANCELED' || slOrder?.status === 'EXPIRED') {
          if (!tpId || (await getOrder(c.symbol, tpId))?.status !== 'NEW') {
            exitPrice  = latestRow.close
            exitReason = 'LIQUIDATED'
          }
        }
      }

      // SCORE_EXIT: TP/SL/LIQ 없을 때 점수 재계산
      if (!exitPrice && c.score_exit_threshold > 0) {
        const currentScore = isShort ? scoreShort(latestRow, c) : scoreLong(latestRow, c)
        if (currentScore <= c.score_exit_threshold) {
          // 1) 기존 TP/SL 주문 먼저 취소
          if (tpId) await cancelOrder(c.symbol, tpId)
          if (slId) await cancelOrder(c.symbol, slId)
          // 2) 시장가 청산
          try {
            const closeSide  = isShort ? 'BUY' : 'SELL'
            const closeOrder = await binancePost('/fapi/v1/order', {
              symbol:     `${c.symbol}USDT`,
              side:       closeSide,
              type:       'MARKET',
              reduceOnly: 'true',
              quantity:   String(pos.quantity),
            }) as BinanceOrder
            exitPrice = parseFloat(closeOrder.avgPrice) || latestRow.close
          } catch (err) {
            console.error('[live-trade] SCORE_EXIT market close error:', err)
            exitPrice = latestRow.close
          }
          exitReason = 'SCORE_EXIT'
        }
      }

      if (exitPrice != null) {
        if (cancelId) await cancelOrder(c.symbol, cancelId)

        const qty      = pos.quantity as number
        const grossPnl = exitReason === 'LIQUIDATED'
          ? -pos.capital_used
          : isShort ? qty * (pos.entry_price - exitPrice) : qty * (exitPrice - pos.entry_price)
        const exitCommRate = (exitReason === 'TP' || exitReason === 'SL') ? COMMISSION_MAKER : COMMISSION_TAKER
        const entryComm    = (pos.entry_price as number) * qty * COMMISSION_TAKER
        const exitComm     = exitPrice * qty * exitCommRate
        const netPnl       = exitReason === 'LIQUIDATED' ? -(pos.capital_used as number) : grossPnl - entryComm - exitComm
        const pnlPct       = (netPnl / (pos.capital_used as number)) * 100

        let exitDetails: string | undefined = undefined
        if (exitReason === 'SCORE_EXIT' && pos.entry_row) {
          try {
            const entryRow = JSON.parse(pos.entry_row as string) as Candle
            exitDetails = buildExitDetails(pos.direction, entryRow, latestRow, c)
          } catch { /* entry_row 파싱 실패 시 무시 */ }
        }

        await supabase.from('live_positions').update({
          status:       'CLOSED',
          exit_price:   Math.round(exitPrice * 1e6)  / 1e6,
          exit_time:    iso(lastCandleEnd),
          exit_reason:  exitReason,
          exit_details: exitDetails,
          net_pnl:      Math.round(netPnl  * 10000) / 10000,
          pnl_pct:      Math.round(pnlPct  * 10000) / 10000,
        }).eq('id', pos.id)

        closedThisCycle.push(pos.id)
      }
    }

    debugInfo.closed_this_cycle = closedThisCycle.length

    // ── 7. 진입 조건 확인 ─────────────────────────────────────
    const stillOpen = positions.filter(p => !closedThisCycle.includes(p.id))
    let newPosition: Record<string, unknown> | null = null

    if (stillOpen.length === 0 && closedThisCycle.length === 0) {
      // ── 8. 쿨다운 확인 ──────────────────────────────────
      const cooldownMs = SIGNAL_COOLDOWN * intervalMs
      const [{ data: lastLongEntry }, { data: lastShortEntry }] = await Promise.all([
        supabase.from('live_positions').select('entry_time').eq('backtest_run_id', c.id).eq('direction', 'LONG')
          .order('entry_time', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('live_positions').select('entry_time').eq('backtest_run_id', c.id).eq('direction', 'SHORT')
          .order('entry_time', { ascending: false }).limit(1).maybeSingle(),
      ])
      const longReady  = !lastLongEntry  || (lastCandleEnd - new Date(lastLongEntry.entry_time).getTime())  >= cooldownMs
      const shortReady = !lastShortEntry || (lastCandleEnd - new Date(lastShortEntry.entry_time).getTime()) >= cooldownMs

      // ── 9. 신호 감지 ──────────────────────────────────
      const signal = detectSignal(rows, n - 1, c, longReady, shortReady)
      debugInfo.signal = signal ? { type: signal.type, score: signal.score } : null

      if (signal) {
        const { type: signalType, score } = signal
        const isShort = signalType === 'SHORT'

        // MA120 / 일봉 추세 필터
        const ma120Blocked = latestRow.ma120 != null && (
          ( isShort && latestRow.close > latestRow.ma120) ||
          (!isShort && latestRow.close < latestRow.ma120)
        )
        let mtfBlocked = false
        if (dailyMap) {
          const daily = getDailyBar(dailyMap, latestRow.timestamp)
          if (daily?.ma120 != null) {
            if (!isShort && daily.close < daily.ma120) mtfBlocked = true
            if ( isShort && daily.close > daily.ma120) mtfBlocked = true
          }
        }
        debugInfo.ma120_blocked = ma120Blocked; debugInfo.mtf_blocked = mtfBlocked

        if (!ma120Blocked && !mtfBlocked) {
          // ── 10. 진입가: 다음 캔들 시가 ───────────────────
          let entryPrice = latestRow.close
          try {
            const nextRows = await fetchKlines(c.symbol, c.interval, lastCandleEnd, lastCandleEnd + intervalMs)
            if (nextRows.length > 0) entryPrice = nextRows[0]!.open
          } catch { /* fallback to close */ }

          const { tp, sl } = calcTPSL(signalType, entryPrice, c)
          if (tp != null && sl != null) {
            // ── 11. 바이낸스 잔액 조회 ────────────────────
            const balance      = await getBinanceBalance()
            const { quantity: rawQty, capitalUsed } = calcPositionSize(balance, entryPrice, c.leverage)
            const qtyPrecision = await getQuantityPrecision(c.symbol)
            const quantity     = floorToPrecision(rawQty, qtyPrecision)
            debugInfo.balance = balance; debugInfo.quantity = quantity

            if (quantity > 0) {
              // ── 12. 레버리지 설정 ────────────────────────
              try {
                await binancePost('/fapi/v1/leverage', { symbol: `${c.symbol}USDT`, leverage: c.leverage })
              } catch (err) { console.warn('[live-trade] leverage set error:', err) }

              // ── 13. 시장가 진입 주문 ──────────────────────
              const entrySide  = isShort ? 'SELL' : 'BUY'
              const entryOrder = await binancePost('/fapi/v1/order', {
                symbol:   `${c.symbol}USDT`,
                side:     entrySide,
                type:     'MARKET',
                quantity: String(quantity),
              }) as BinanceOrder

              const actualEntryPrice = parseFloat(entryOrder.avgPrice) || entryPrice
              const actualQty        = parseFloat(entryOrder.executedQty) || quantity
              debugInfo.entry_order_id     = entryOrder.orderId
              debugInfo.actual_entry_price = actualEntryPrice

              // TP/SL 재계산 (실제 체결가 기준)
              const { tp: actualTP, sl: actualSL } = calcTPSL(signalType, actualEntryPrice, c)
              if (actualTP == null || actualSL == null) throw new Error('TP/SL 계산 실패')

              const closeSide = isShort ? 'BUY' : 'SELL'

              // ── 14. TP 주문 (TAKE_PROFIT_MARKET) ─────────
              const tpOrder = await binancePost('/fapi/v1/order', {
                symbol:        `${c.symbol}USDT`,
                side:          closeSide,
                type:          'TAKE_PROFIT_MARKET',
                stopPrice:     String(actualTP),
                closePosition: 'true',
                timeInForce:   'GTE_GTC',
                workingType:   'MARK_PRICE',
              }) as BinanceOrder

              // ── 15. SL 주문 (STOP_MARKET) ─────────────────
              const slOrder = await binancePost('/fapi/v1/order', {
                symbol:        `${c.symbol}USDT`,
                side:          closeSide,
                type:          'STOP_MARKET',
                stopPrice:     String(actualSL),
                closePosition: 'true',
                timeInForce:   'GTE_GTC',
                workingType:   'MARK_PRICE',
              }) as BinanceOrder

              debugInfo.tp_order_id = tpOrder.orderId; debugInfo.sl_order_id = slOrder.orderId

              const signalDetails = buildSignalDetails(latestRow, c, signalType)
              newPosition = {
                backtest_run_id:        c.id,
                symbol:                 c.symbol,
                direction:              signalType,
                entry_price:            Math.round(actualEntryPrice * 1e6) / 1e6,
                avg_entry_price:        Math.round(actualEntryPrice * 1e6) / 1e6,
                target_price:           actualTP,
                stop_loss:              actualSL,
                quantity:               Math.round(actualQty    * 1e8) / 1e8,
                capital_used:           Math.round(capitalUsed  * 1e4) / 1e4,
                entry_time:             iso(lastCandleEnd),
                signal_details:         signalDetails,
                entry_row:              JSON.stringify(latestRow),
                score,
                status:                 'OPEN',
                binance_entry_order_id: String(entryOrder.orderId),
                binance_tp_order_id:    String(tpOrder.orderId),
                binance_sl_order_id:    String(slOrder.orderId),
                last_candle_ts:         iso(lastCandleEnd),
              }

              const { error: insertErr } = await supabase.from('live_positions').insert(newPosition)
              if (insertErr) {
                // 진입 완료됐으나 DB 저장 실패 → TP/SL 주문 취소
                console.error('[live-trade] DB insert error:', insertErr.message)
                await cancelOrder(c.symbol, String(tpOrder.orderId))
                await cancelOrder(c.symbol, String(slOrder.orderId))
                debugInfo.insert_error = insertErr.message
                newPosition = null
              }
            }
          }
        }
      }
    }

    // ── 16. 바이낸스 잔액 업데이트 ───────────────────────────
    let currentBalance = liveAccount?.balance ?? 0
    try { currentBalance = await getBinanceBalance() } catch { /* 잔액 조회 실패 시 기존값 유지 */ }

    await supabase.from('live_account').upsert({
      id:                1,
      balance:           Math.round(currentBalance * 100) / 100,
      updated_at:        iso(Date.now()),
      last_processed_ts: iso(lastCandleEnd),
    }, { onConflict: 'id' })

    return new Response(JSON.stringify({
      ok:          true,
      candle_time: iso(latestRow.timestamp),
      closed:      closedThisCycle.length,
      opened:      newPosition ? 1 : 0,
      balance:     Math.round(currentBalance * 100) / 100,
      debug:       debugInfo,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[live-trade]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})