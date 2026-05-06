// Live Trade — Supabase Edge Function (Deno)
// Deploy: supabase functions deploy live-trade
//
// 필요한 Supabase Secrets:
//   FRED_API_KEY — (선택) 연준 유동성 데이터
//
// Binance API Key/Secret 은 user_api_keys 테이블에서 api_key_id로 조회

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import type { Candle, BaseConfig, DailyBar } from '../_shared/types.ts'
import { COMMISSION_TAKER, COMMISSION_MAKER, WARMUP_CANDLES, SIGNAL_COOLDOWN } from '../_shared/constants.ts'
import { intervalToMs, fetchKlines } from '../_shared/klines.ts'
import { computeIndicators } from '../_shared/indicators.ts'
import { fetchFedBars, attachFedData } from '../_shared/fed.ts'
import { scoreLong, scoreShort, getDailyBar, detectSignal } from '../_shared/scoring.ts'
import { buildSignalDetails, buildExitDetails } from '../_shared/details.ts'
import { calcTPSL, calcPositionSize } from '../_shared/position.ts'

type LiveConfig = BaseConfig & { api_key_id: string | null; user_id: string | null }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── 바이낸스 Futures API (키별 파라미터화) ───────────────────

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

function getFapiBase(isTestnet: boolean) {
  return isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com"
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

async function binanceGet(path: string, params: Record<string, string | number> = {}, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}?${signed}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`Binance GET ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

async function binancePost(path: string, params: Record<string, string | number> = {}, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}`, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: signed,
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`Binance POST ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

async function binanceDelete(path: string, params: Record<string, string | number> = {}, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}?${signed}`, {
    method: 'DELETE',
    headers: { 'X-MBX-APIKEY': apiKey },
  })
  const body = await resp.text()
  if (!resp.ok && resp.status !== 400) throw new Error(`Binance DELETE ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

async function getBinanceBalance(apiKey: string, apiSecret: string, isTestnet: boolean): Promise<number> {
  const account = await binanceGet('/fapi/v2/account', {}, apiKey, apiSecret, isTestnet) as { assets: { asset: string; availableBalance: string }[] }
  const usdt = account.assets?.find(a => a.asset === 'USDT')
  return usdt ? parseFloat(usdt.availableBalance) : 0
}

async function getOrder(symbol: string, orderId: string, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<BinanceOrder | null> {
  try {
    return await binanceGet('/fapi/v1/order', { symbol: `${symbol}USDT`, orderId: Number(orderId) }, apiKey, apiSecret, isTestnet) as BinanceOrder
  } catch { return null }
}

async function cancelOrder(symbol: string, orderId: string, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<void> {
  try {
    await binanceDelete('/fapi/v1/order', { symbol: `${symbol}USDT`, orderId: Number(orderId) }, apiKey, apiSecret, isTestnet)
  } catch { /* 이미 체결됐거나 없는 주문 */ }
}

async function getQuantityPrecision(symbol: string, isTestnet: boolean): Promise<number> {
  try {
    const base = getFapiBase(isTestnet)
    const info = await fetch(`${base}/fapi/v1/exchangeInfo?symbol=${symbol}USDT`)
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

// ── 단일 config 처리 ─────────────────────────────────────────

async function processConfig(
  supabase: ReturnType<typeof createClient>,
  c: LiveConfig,
  apiKey: string,
  apiSecret: string,
  isTestnet: boolean,
): Promise<Record<string, unknown>> {
  const iso = (ts: number) => new Date(ts).toISOString()

  const intervalMs    = intervalToMs(c.interval)
  const now           = Date.now()
  const lastCandleEnd = Math.floor(now / intervalMs) * intervalMs
  const warmupStart   = lastCandleEnd - WARMUP_CANDLES * intervalMs

  // 이미 처리한 캔들인지 확인
  const { data: liveAccount } = await supabase
    .from('live_accounts')
    .select('*')
    .eq('api_key_id', c.api_key_id)
    .maybeSingle()

  if (liveAccount?.last_processed_ts) {
    const lastProcessed = new Date(liveAccount.last_processed_ts).getTime()
    if (lastProcessed >= lastCandleEnd) {
      return { skipped: true, reason: '이미 처리됨', config_id: c.id }
    }
  }

  // 캔들 + 지표
  const rows = await fetchKlines(c.symbol, c.interval, warmupStart, lastCandleEnd - 1)
  if (rows.length < 50) return { skipped: true, reason: '캔들 부족', config_id: c.id }
  computeIndicators(rows)

  // 연준 유동성
  if (c.score_use_fed_liquidity) {
    const fedStart = new Date(lastCandleEnd - 30 * 86_400_000).toISOString().slice(0, 10)
    const fedEnd   = new Date(lastCandleEnd).toISOString().slice(0, 10)
    try {
      const fedBars = await fetchFedBars(fedStart, fedEnd, c.fed_liquidity_ma_period ?? 13)
      if (fedBars.length > 0) attachFedData(rows, fedBars)
    } catch (err) { console.error(`[live-trade][${c.id}] Fed error:`, err) }
  }

  // 일봉 추세
  let dailyMap: Map<number, DailyBar> | null = null
  if (c.use_daily_trend) {
    const dailyRows = await fetchKlines(c.symbol, '1d', warmupStart - 220 * 86_400_000, lastCandleEnd)
    computeIndicators(dailyRows)
    dailyMap = new Map(dailyRows.map(r => [r.timestamp, { close: r.close, ma120: r.ma120 ?? null }]))
  }

  const n         = rows.length
  const latestRow = rows[n - 1]!
  const debugInfo: Record<string, unknown> = { candle_count: n, config_id: c.id }

  // 오픈 포지션
  const { data: openPositions } = await supabase
    .from('live_positions').select('*').eq('status', 'OPEN').eq('backtest_run_id', c.id)
  const positions          = openPositions ?? []
  const closedThisCycle: string[] = []
  debugInfo.open_before = positions.length

  // ── 오픈 포지션: TP/SL 체결 확인 + SCORE_EXIT ────────────
  for (const pos of positions) {
    if (new Date(pos.entry_time).getTime() === latestRow.timestamp) continue

    const isShort = pos.direction === 'SHORT'
    const tpId    = pos.binance_tp_order_id as string | null
    const slId    = pos.binance_sl_order_id as string | null

    let exitPrice:  number | null = null
    let exitReason: string        = ''
    let cancelId:   string | null = null

    if (tpId) {
      const tpOrder = await getOrder(c.symbol, tpId, apiKey, apiSecret, isTestnet)
      if (tpOrder?.status === 'FILLED') {
        exitPrice = parseFloat(tpOrder.avgPrice) || pos.target_price
        exitReason = 'TP'; cancelId = slId
      }
    }
    if (!exitPrice && slId) {
      const slOrder = await getOrder(c.symbol, slId, apiKey, apiSecret, isTestnet)
      if (slOrder?.status === 'FILLED') {
        exitPrice = parseFloat(slOrder.avgPrice) || pos.stop_loss
        exitReason = 'SL'; cancelId = tpId
      }
      if (slOrder?.status === 'CANCELED' || slOrder?.status === 'EXPIRED') {
        if (!tpId || (await getOrder(c.symbol, tpId, apiKey, apiSecret, isTestnet))?.status !== 'NEW') {
          exitPrice = latestRow.close; exitReason = 'LIQUIDATED'
        }
      }
    }

    if (!exitPrice && c.score_exit_threshold > 0) {
      const currentScore = isShort ? scoreShort(latestRow, c) : scoreLong(latestRow, c)
      if (currentScore <= c.score_exit_threshold) {
        if (tpId) await cancelOrder(c.symbol, tpId, apiKey, apiSecret, isTestnet)
        if (slId) await cancelOrder(c.symbol, slId, apiKey, apiSecret, isTestnet)
        try {
          const closeOrder = await binancePost('/fapi/v1/order', {
            symbol: `${c.symbol}USDT`, side: isShort ? 'BUY' : 'SELL',
            type: 'MARKET', reduceOnly: 'true', quantity: String(pos.quantity),
          }, apiKey, apiSecret, isTestnet) as BinanceOrder
          exitPrice = parseFloat(closeOrder.avgPrice) || latestRow.close
        } catch (err) {
          console.error(`[live-trade][${c.id}] SCORE_EXIT error:`, err)
          exitPrice = latestRow.close
        }
        exitReason = 'SCORE_EXIT'
      }
    }

    if (exitPrice != null) {
      if (cancelId) await cancelOrder(c.symbol, cancelId, apiKey, apiSecret, isTestnet)

      const qty      = pos.quantity as number
      const grossPnl = exitReason === 'LIQUIDATED'
        ? -pos.capital_used
        : isShort ? qty * (pos.entry_price - exitPrice) : qty * (exitPrice - pos.entry_price)
      const exitCommRate = (exitReason === 'TP' || exitReason === 'SL') ? COMMISSION_MAKER : COMMISSION_TAKER
      const netPnl = exitReason === 'LIQUIDATED'
        ? -(pos.capital_used as number)
        : grossPnl - (pos.entry_price as number) * qty * COMMISSION_TAKER - exitPrice * qty * exitCommRate
      const pnlPct = (netPnl / (pos.capital_used as number)) * 100

      let exitDetails: string | undefined
      if (exitReason === 'SCORE_EXIT' && pos.entry_row) {
        try {
          exitDetails = buildExitDetails(pos.direction, JSON.parse(pos.entry_row as string) as Candle, latestRow, c)
        } catch { /* 무시 */ }
      }

      await supabase.from('live_positions').update({
        status: 'CLOSED',
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

  debugInfo.closed = closedThisCycle.length

  // ── 진입 조건 확인 ───────────────────────────────────────
  const stillOpen = positions.filter(p => !closedThisCycle.includes(p.id))
  let opened = 0

  if (stillOpen.length === 0 && closedThisCycle.length === 0) {
    const cooldownMs = SIGNAL_COOLDOWN * intervalMs
    const [{ data: lastLong }, { data: lastShort }] = await Promise.all([
      supabase.from('live_positions').select('entry_time').eq('backtest_run_id', c.id).eq('direction', 'LONG')
        .order('entry_time', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('live_positions').select('entry_time').eq('backtest_run_id', c.id).eq('direction', 'SHORT')
        .order('entry_time', { ascending: false }).limit(1).maybeSingle(),
    ])
    const longReady  = !lastLong  || (lastCandleEnd - new Date(lastLong.entry_time).getTime())  >= cooldownMs
    const shortReady = !lastShort || (lastCandleEnd - new Date(lastShort.entry_time).getTime()) >= cooldownMs

    const signal = detectSignal(rows, n - 1, c, longReady, shortReady)
    debugInfo.signal = signal ? { type: signal.type, score: signal.score } : null

    if (signal) {
      const { type: signalType, score } = signal
      const isShort = signalType === 'SHORT'

      const ma120Blocked = latestRow.ma120 != null && (
        (isShort && latestRow.close > latestRow.ma120) || (!isShort && latestRow.close < latestRow.ma120)
      )
      let mtfBlocked = false
      if (dailyMap) {
        const daily = getDailyBar(dailyMap, latestRow.timestamp)
        if (daily?.ma120 != null) {
          if (!isShort && daily.close < daily.ma120) mtfBlocked = true
          if ( isShort && daily.close > daily.ma120) mtfBlocked = true
        }
      }

      if (!ma120Blocked && !mtfBlocked) {
        let entryPrice = latestRow.close
        try {
          const nextRows = await fetchKlines(c.symbol, c.interval, lastCandleEnd, lastCandleEnd + intervalMs)
          if (nextRows.length > 0) entryPrice = nextRows[0]!.open
        } catch { /* fallback */ }

        const { tp, sl } = calcTPSL(signalType, entryPrice, c)
        if (tp != null && sl != null) {
          const balance      = await getBinanceBalance(apiKey, apiSecret, isTestnet)
          const { quantity: rawQty, capitalUsed } = calcPositionSize(balance, entryPrice, c.leverage)
          const qtyPrecision = await getQuantityPrecision(c.symbol, isTestnet)
          const quantity     = floorToPrecision(rawQty, qtyPrecision)
          debugInfo.balance = balance; debugInfo.quantity = quantity

          if (quantity > 0) {
            try {
              await binancePost('/fapi/v1/leverage', { symbol: `${c.symbol}USDT`, leverage: c.leverage }, apiKey, apiSecret, isTestnet)
            } catch { /* 레버리지 설정 실패 무시 */ }

            const entrySide  = isShort ? 'SELL' : 'BUY'
            const entryOrder = await binancePost('/fapi/v1/order', {
              symbol: `${c.symbol}USDT`, side: entrySide, type: 'MARKET', quantity: String(quantity),
            }, apiKey, apiSecret, isTestnet) as BinanceOrder

            const actualEntryPrice = parseFloat(entryOrder.avgPrice) || entryPrice
            const actualQty        = parseFloat(entryOrder.executedQty) || quantity
            const { tp: actualTP, sl: actualSL } = calcTPSL(signalType, actualEntryPrice, c)
            if (!actualTP || !actualSL) throw new Error('TP/SL 계산 실패')

            const closeSide = isShort ? 'BUY' : 'SELL'
            const tpOrder   = await binancePost('/fapi/v1/order', {
              symbol: `${c.symbol}USDT`, side: closeSide, type: 'TAKE_PROFIT_MARKET',
              stopPrice: String(actualTP), closePosition: 'true', timeInForce: 'GTE_GTC', workingType: 'MARK_PRICE',
            }, apiKey, apiSecret, isTestnet) as BinanceOrder

            const slOrder = await binancePost('/fapi/v1/order', {
              symbol: `${c.symbol}USDT`, side: closeSide, type: 'STOP_MARKET',
              stopPrice: String(actualSL), closePosition: 'true', timeInForce: 'GTE_GTC', workingType: 'MARK_PRICE',
            }, apiKey, apiSecret, isTestnet) as BinanceOrder

            const newPosition = {
              backtest_run_id:        c.id,
              user_id:                c.user_id,
              api_key_id:             c.api_key_id,
              symbol:                 c.symbol,
              direction:              signalType,
              entry_price:            Math.round(actualEntryPrice * 1e6) / 1e6,
              avg_entry_price:        Math.round(actualEntryPrice * 1e6) / 1e6,
              target_price:           actualTP,
              stop_loss:              actualSL,
              quantity:               Math.round(actualQty   * 1e8) / 1e8,
              capital_used:           Math.round(capitalUsed * 1e4) / 1e4,
              entry_time:             iso(lastCandleEnd),
              signal_details:         buildSignalDetails(latestRow, c, signalType),
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
              console.error(`[live-trade][${c.id}] insert error:`, insertErr.message)
              await cancelOrder(c.symbol, String(tpOrder.orderId), apiKey, apiSecret, isTestnet)
              await cancelOrder(c.symbol, String(slOrder.orderId), apiKey, apiSecret, isTestnet)
            } else {
              opened = 1
            }
          }
        }
      }
    }
  }

  // 잔액 업데이트 (live_accounts)
  let currentBalance = liveAccount?.balance ?? 0
  try { currentBalance = await getBinanceBalance(apiKey, apiSecret, isTestnet) } catch { /* 유지 */ }

  await supabase.from('live_accounts').upsert({
    user_id:           c.user_id,
    api_key_id:        c.api_key_id,
    balance:           Math.round(currentBalance * 100) / 100,
    updated_at:        iso(Date.now()),
    last_processed_ts: iso(lastCandleEnd),
  }, { onConflict: 'api_key_id' })

  return { ...debugInfo, opened, candle_time: iso(latestRow.timestamp), balance: Math.round(currentBalance * 100) / 100 }
}

// ── 메인 핸들러 ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // 모든 활성 config 로드
    const { data: configs, error: cfgErr } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('live_trading_enabled', true)
    if (cfgErr) throw cfgErr
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: '활성 실거래 설정 없음' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = []

    for (const config of configs as LiveConfig[]) {
      if (!config.api_key_id) {
        results.push({ config_id: config.id, skipped: true, reason: 'api_key_id 없음' })
        continue
      }

      // DB에서 암호화된 키 복호화 조회
      const { data: keyRows, error: keyErr } = await supabase.rpc('get_binance_keys', {
        p_api_key_id: config.api_key_id,
      })
      if (keyErr || !keyRows || keyRows.length === 0) {
        results.push({ config_id: config.id, skipped: true, reason: 'API 키 조회 실패' })
        continue
      }

      const { api_key, api_secret, is_testnet } = keyRows[0] as { api_key: string; api_secret: string; is_testnet: boolean }

      try {
        const result = await processConfig(supabase, config, api_key, api_secret, is_testnet)
        results.push(result)
      } catch (err) {
        console.error(`[live-trade][${config.id}] error:`, err)
        results.push({ config_id: config.id, error: String(err) })
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: configs.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[live-trade]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
