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
import { fetchFedBarsWithCache, attachFedData } from '../_shared/fed.ts'
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
  transactTime?: number
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

async function binanceGet(path: string, params: Record<string, string | number> = {}, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}?${signed}`, {
    headers: proxyHeaders(apiKey),
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`Binance GET ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

async function binancePost(path: string, params: Record<string, string | number> = {}, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}`, {
    method: 'POST',
    headers: { ...proxyHeaders(apiKey), 'Content-Type': 'application/x-www-form-urlencoded' },
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
    headers: proxyHeaders(apiKey),
  })
  const body = await resp.text()
  if (!resp.ok && resp.status !== 400) throw new Error(`Binance DELETE ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

async function getBinanceBalance(apiKey: string, apiSecret: string, isTestnet: boolean): Promise<number> {
  const account = await binanceGet('/fapi/v2/account', {}, apiKey, apiSecret, isTestnet) as { assets: { asset: string; walletBalance: string }[] }
  const usdt = account.assets?.find(a => a.asset === 'USDT')
  return usdt ? parseFloat(usdt.walletBalance) : 0
}

// Binance 실제 포지션 상태로 DB 동기화 — 바이낸스가 source of truth
async function reconcileOpenPositions(
  supabase: ReturnType<typeof createClient>,
  positions: Record<string, unknown>[],
  symbol: string,
  apiKey: string,
  apiSecret: string,
  isTestnet: boolean,
): Promise<Set<string>> {
  const reconciled = new Set<string>()
  if (positions.length === 0) return reconciled

  const iso = (ts: number) => new Date(ts).toISOString()

  let risks: { positionAmt: string; entryPrice: string; markPrice: string; positionSide: string }[] = []
  try {
    risks = await binanceGet('/fapi/v2/positionRisk', { symbol: `${symbol}USDT` }, apiKey, apiSecret, isTestnet) as typeof risks
  } catch (err) {
    console.warn(`[reconcile][${symbol}] positionRisk 실패:`, err)
    return reconciled
  }

  for (const pos of positions) {
    const direction = pos.direction as string
    const risk = risks.find(r => {
      const amt = parseFloat(r.positionAmt)
      if (r.positionSide !== 'BOTH') return r.positionSide === direction
      return direction === 'LONG' ? amt > 0 : amt < 0
    })
    const binanceAmt = risk ? Math.abs(parseFloat(risk.positionAmt)) : 0

    // 바이낸스에 포지션이 없는데 DB는 OPEN → 청산된 것
    if (binanceAmt < 0.000001) {
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
        console.warn(`[reconcile][${symbol}] userTrades 실패:`, err)
      }

      // 남은 TP/SL 알고 주문 취소 (찌꺼기 방지)
      const tpId = pos.binance_tp_order_id as string | null
      const slId = pos.binance_sl_order_id as string | null
      await Promise.allSettled([
        tpId ? binanceDelete('/fapi/v1/algoOrder', { symbol: `${symbol}USDT`, algoOrderId: Number(tpId) }, apiKey, apiSecret, isTestnet) : Promise.resolve(),
        slId ? binanceDelete('/fapi/v1/algoOrder', { symbol: `${symbol}USDT`, algoOrderId: Number(slId) }, apiKey, apiSecret, isTestnet) : Promise.resolve(),
      ])

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

        reconciled.add(pos.id as string)
        console.log(`[reconcile][${symbol}] CLOSED ${pos.id} @ ${exitPrice} (${exitReason})`)
      }
    } else if (risk?.entryPrice) {
      // 포지션은 살아있지만 실제 체결가 보정
      const binanceEntry = parseFloat(risk.entryPrice)
      if (Math.abs(binanceEntry - (pos.entry_price as number)) > 0.0001) {
        await supabase.from('live_positions').update({
          entry_price:     Math.round(binanceEntry * 1e6) / 1e6,
          avg_entry_price: Math.round(binanceEntry * 1e6) / 1e6,
        }).eq('id', pos.id as string)
      }
    }
  }

  return reconciled
}

async function getOrder(symbol: string, orderId: string, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<BinanceOrder | null> {
  try {
    return await binanceGet('/fapi/v1/algoOrder', { symbol: `${symbol}USDT`, algoOrderId: Number(orderId) }, apiKey, apiSecret, isTestnet) as BinanceOrder
  } catch { return null }
}

// positionRisk 기반 체결 확인 — order API 대신 실제 포지션이 잡혔는지를 source of truth로 사용
async function waitForPosition(
  symbol: string,
  signalType: string,
  apiKey: string,
  apiSecret: string,
  isTestnet: boolean,
  retries = 8,
  delayMs = 400,
): Promise<{ entryPrice: number; quantity: number } | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const risks = await binanceGet('/fapi/v2/positionRisk', { symbol: `${symbol}USDT` }, apiKey, apiSecret, isTestnet) as { positionAmt: string; entryPrice: string; positionSide: string }[]
      const risk = risks.find(r => {
        const amt = parseFloat(r.positionAmt)
        if (r.positionSide !== 'BOTH') return r.positionSide === signalType
        return signalType === 'LONG' ? amt > 0 : amt < 0
      })
      const qty = risk ? Math.abs(parseFloat(risk.positionAmt)) : 0
      if (qty > 0.000001) {
        return { entryPrice: parseFloat(risk!.entryPrice), quantity: qty }
      }
    } catch { /* 재시도 */ }
    await new Promise(r => setTimeout(r, delayMs))
  }
  return null
}

async function cancelOrder(symbol: string, orderId: string, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<void> {
  try {
    await binanceDelete('/fapi/v1/algoOrder', { symbol: `${symbol}USDT`, algoOrderId: Number(orderId) }, apiKey, apiSecret, isTestnet)
  } catch { /* 이미 체결됐거나 없는 주문 */ }
}


type SymbolFilters = { filterType: string; stepSize?: string; tickSize?: string }[]
const precisionCache = new Map<string, { qty: number; price: number }>()

async function getSymbolPrecisions(symbol: string, isTestnet: boolean): Promise<{ qty: number; price: number }> {
  const cacheKey = `${symbol}-${isTestnet}`
  if (precisionCache.has(cacheKey)) return precisionCache.get(cacheKey)!
  try {
    const base = getFapiBase(isTestnet)
    const info = await fetch(`${base}/fapi/v1/exchangeInfo?symbol=${symbol}USDT`, {
      headers: PROXY_SECRET ? { 'X-Proxy-Secret': PROXY_SECRET } : {},
    })
    const { symbols } = await info.json() as { symbols: { symbol: string; filters: SymbolFilters }[] }
    const sym      = symbols.find(s => s.symbol === `${symbol}USDT`)
    const lot      = sym?.filters.find(f => f.filterType === 'LOT_SIZE')
    const priceFlt = sym?.filters.find(f => f.filterType === 'PRICE_FILTER')
    const step = parseFloat(lot?.stepSize  ?? '0.001')
    const tick = parseFloat(priceFlt?.tickSize ?? '0.01')
    const result = {
      qty:   step >= 1 ? 0 : Math.round(-Math.log10(step)),
      price: tick >= 1 ? 0 : Math.round(-Math.log10(tick)),
    }
    precisionCache.set(cacheKey, result)
    return result
  } catch { return { qty: 3, price: 2 } }
}

async function getQuantityPrecision(symbol: string, isTestnet: boolean): Promise<number> {
  return (await getSymbolPrecisions(symbol, isTestnet)).qty
}

function floorToPrecision(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.floor(value * factor) / factor
}

// ── symbol:interval 그룹 공유 데이터 ─────────────────────────

interface SymbolGroupData {
  rows: Candle[]
  lastCandleEnd: number
  intervalMs: number
  dailyMap: Map<number, DailyBar> | null
  fetchTimingMs: { klines_ms: number; fed_ms?: number; daily_ms?: number }
}

async function fetchGroupData(
  symbol: string,
  interval: string,
  configs: LiveConfig[],
  supabase: ReturnType<typeof createClient>,
): Promise<SymbolGroupData | null> {
  const intervalMs    = intervalToMs(interval)
  const now           = Date.now()
  const lastCandleEnd = Math.floor(now / intervalMs) * intervalMs
  const warmupStart   = lastCandleEnd - WARMUP_CANDLES * intervalMs

  const fetchTimingMs: SymbolGroupData['fetchTimingMs'] = { klines_ms: 0 }

  let t = Date.now()
  const rows = await fetchKlines(symbol, interval, warmupStart, lastCandleEnd - 1)
  fetchTimingMs.klines_ms = Date.now() - t
  console.log(`[timing][${symbol}:${interval}] klines: ${fetchTimingMs.klines_ms}ms (${rows.length} candles)`)
  if (rows.length < 50) return null
  computeIndicators(rows)

  // 연준 유동성 — 같은 그룹 중 첫 번째 사용 config의 period 적용
  const fedConfig = configs.find(c => c.score_use_fed_liquidity)
  if (fedConfig) {
    const fedStart = new Date(lastCandleEnd - 30 * 86_400_000).toISOString().slice(0, 10)
    const fedEnd   = new Date(lastCandleEnd).toISOString().slice(0, 10)
    t = Date.now()
    try {
      const fedBars = await fetchFedBarsWithCache(fedStart, fedEnd, fedConfig.fed_liquidity_ma_period ?? 13, supabase)
      if (fedBars.length > 0) attachFedData(rows, fedBars)
    } catch (err) { console.error(`[live-trade][${symbol}:${interval}] Fed error:`, err) }
    fetchTimingMs.fed_ms = Date.now() - t
  }

  // 일봉 추세 — 그룹 내 어느 config라도 사용 시 한 번만 fetch
  let dailyMap: Map<number, DailyBar> | null = null
  if (configs.some(c => c.use_daily_trend)) {
    t = Date.now()
    try {
      const dailyRows = await fetchKlines(symbol, '1d', warmupStart - 220 * 86_400_000, lastCandleEnd)
      computeIndicators(dailyRows)
      dailyMap = new Map(dailyRows.map(r => [r.timestamp, { close: r.close, ma120: r.ma120 ?? null }]))
    } catch (err) { console.error(`[live-trade][${symbol}:${interval}] daily klines error:`, err) }
    fetchTimingMs.daily_ms = Date.now() - t
  }

  return { rows, lastCandleEnd, intervalMs, dailyMap, fetchTimingMs }
}

// ── 단일 config 처리 ─────────────────────────────────────────

async function processConfig(
  supabase: ReturnType<typeof createClient>,
  c: LiveConfig,
  apiKey: string,
  apiSecret: string,
  isTestnet: boolean,
  groupData: SymbolGroupData,
): Promise<Record<string, unknown>> {
  const iso = (ts: number) => new Date(ts).toISOString()
  const { rows, lastCandleEnd, intervalMs, dailyMap } = groupData

  const timing: Record<string, number> = { ...groupData.fetchTimingMs }
  const T = { start: Date.now() }
  const elapsed = (label: string) => {
    const ms = Date.now() - T.start
    timing[label] = ms
    console.log(`[timing][${c.id}] ${label}: ${ms}ms`)
    T.start = Date.now()
  }

  // 이미 처리한 캔들인지 확인
  const { data: liveAccount } = await supabase
    .from('live_accounts')
    .select('*')
    .eq('api_key_id', c.api_key_id)
    .maybeSingle()
  elapsed('live_accounts query')

  if (liveAccount?.last_processed_ts) {
    const lastProcessed = new Date(liveAccount.last_processed_ts).getTime()
    if (lastProcessed >= lastCandleEnd) {
      return { skipped: true, reason: '이미 처리됨', config_id: c.id }
    }
  }

  if (rows.length < 50) return { skipped: true, reason: '캔들 부족', config_id: c.id }

  const n         = rows.length
  const latestRow = rows[n - 1]!
  const debugInfo: Record<string, unknown> = { candle_count: n, config_id: c.id }

  // 오픈 포지션
  const { data: openPositions } = await supabase
    .from('live_positions').select('*').eq('status', 'OPEN').eq('backtest_run_id', c.id)
  elapsed('open_positions query')
  const positions          = openPositions ?? []
  const closedThisCycle: string[] = []
  debugInfo.open_before = positions.length

  // 포지션 없으면 바이낸스 잔여 알고 주문 전부 취소
  if (positions.length === 0) {
    try {
      await binanceDelete('/fapi/v1/algoOrders', { symbol: `${c.symbol}USDT` }, apiKey, apiSecret, isTestnet)
    } catch { /* 취소할 알고 주문 없음 */ }
  }

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
        await Promise.all([
          tpId ? cancelOrder(c.symbol, tpId, apiKey, apiSecret, isTestnet) : Promise.resolve(),
          slId ? cancelOrder(c.symbol, slId, apiKey, apiSecret, isTestnet) : Promise.resolve(),
        ])
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
    // 같은 API 키로 다른 config에 이미 포지션이 있으면 진입 차단
    if (c.api_key_id) {
      const { data: keyOpenPos } = await supabase
        .from('live_positions')
        .select('id')
        .eq('api_key_id', c.api_key_id)
        .eq('status', 'OPEN')
        .limit(1)
      if (keyOpenPos && keyOpenPos.length > 0) {
        debugInfo.blocked = 'api_key_already_has_open_position'
        return { ...debugInfo }
      }
    }

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
          const [balance, { qty: qtyPrecision, price: pricePrecision }] = await Promise.all([
            getBinanceBalance(apiKey, apiSecret, isTestnet),
            getSymbolPrecisions(c.symbol, isTestnet),
          ])
          elapsed('balance_ms')
          const { quantity: rawQty, capitalUsed } = calcPositionSize(balance, entryPrice, c.leverage)
          const quantity     = floorToPrecision(rawQty, qtyPrecision)
          debugInfo.balance = balance; debugInfo.quantity = quantity

          if (quantity > 0) {
            await Promise.allSettled([
              binancePost('/fapi/v1/marginType', { symbol: `${c.symbol}USDT`, marginType: 'ISOLATED' }, apiKey, apiSecret, isTestnet),
              binancePost('/fapi/v1/leverage', { symbol: `${c.symbol}USDT`, leverage: c.leverage }, apiKey, apiSecret, isTestnet),
            ])
            elapsed('setup_ms')

            const entrySide  = isShort ? 'SELL' : 'BUY'
            const entryOrder = await binancePost('/fapi/v1/order', {
              symbol: `${c.symbol}USDT`, side: entrySide, type: 'MARKET', quantity: String(quantity),
            }, apiKey, apiSecret, isTestnet) as BinanceOrder
            elapsed('order_ms')

            const actualEntryPrice = parseFloat(entryOrder.avgPrice) || entryPrice
            const actualQty        = parseFloat(entryOrder.executedQty) || quantity
            const actualEntryTime  = entryOrder.transactTime ?? Date.now()
            const { tp: rawTP, sl: rawSL } = calcTPSL(signalType, actualEntryPrice, c)
            if (!rawTP || !rawSL) throw new Error('TP/SL 계산 실패')
            const actualTP = floorToPrecision(rawTP, pricePrecision)
            const actualSL = floorToPrecision(rawSL, pricePrecision)

            const closeSide   = isShort ? 'BUY' : 'SELL'
            const closeQtyStr = String(floorToPrecision(actualQty, qtyPrecision))
            const [tpOrder, slOrder] = await Promise.all([
              binancePost('/fapi/v1/algoOrder', {
                algoType: 'CONDITIONAL', symbol: `${c.symbol}USDT`, side: closeSide, type: 'TAKE_PROFIT_MARKET',
                triggerPrice: String(actualTP), quantity: closeQtyStr, reduceOnly: 'true', workingType: 'MARK_PRICE',
              }, apiKey, apiSecret, isTestnet) as Promise<BinanceOrder>,
              binancePost('/fapi/v1/algoOrder', {
                algoType: 'CONDITIONAL', symbol: `${c.symbol}USDT`, side: closeSide, type: 'STOP_MARKET',
                triggerPrice: String(actualSL), quantity: closeQtyStr, reduceOnly: 'true', workingType: 'MARK_PRICE',
              }, apiKey, apiSecret, isTestnet) as Promise<BinanceOrder>,
            ])
            elapsed('tp_sl_ms')
            timing.total_ms = Object.values(timing).reduce((s, v) => s + v, 0)

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
              entry_time:             iso(actualEntryTime),
              signal_details:         buildSignalDetails(latestRow, c, signalType),
              entry_row:              JSON.stringify(latestRow),
              score,
              status:                 'OPEN',
              binance_entry_order_id: String(entryOrder.orderId),
              binance_tp_order_id:    String(tpOrder.orderId),
              binance_sl_order_id:    String(slOrder.orderId),
              last_candle_ts:         iso(lastCandleEnd),
              timing_ms:              timing,
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

  // initial_balance는 최초 생성 시에만 설정 (이후 덮어쓰지 않음)
  const accountPayload: Record<string, unknown> = {
    user_id:           c.user_id,
    api_key_id:        c.api_key_id,
    balance:           Math.round(currentBalance * 100) / 100,
    updated_at:        iso(Date.now()),
    last_processed_ts: iso(lastCandleEnd),
  }
  if (!liveAccount?.initial_balance) {
    accountPayload.initial_balance = Math.round(currentBalance * 100) / 100
  }
  accountPayload.is_testnet = isTestnet
  await supabase.from('live_accounts').upsert(accountPayload, { onConflict: 'api_key_id' })

  // ── 트레이딩 완료 후 Binance 실제 상태 동기화 (api_key_id 기준 전체) ───
  // 고아 포지션(다른 backtest_run_id)까지 포함해서 정리
  if (c.api_key_id) {
    const { data: allOpenForKey } = await supabase
      .from('live_positions')
      .select('*')
      .eq('api_key_id', c.api_key_id)
      .eq('status', 'OPEN')

    const toReconcile = (allOpenForKey ?? []).filter((p: Record<string, unknown>) => !closedThisCycle.includes(p.id as string))
    if (toReconcile.length > 0) {
      // 심볼별로 그룹화해서 각각 reconcile
      const bySymbol = new Map<string, Record<string, unknown>[]>()
      for (const p of toReconcile) {
        const sym = p.symbol as string
        if (!bySymbol.has(sym)) bySymbol.set(sym, [])
        bySymbol.get(sym)!.push(p)
      }
      for (const [sym, sysPosArr] of bySymbol) {
        await reconcileOpenPositions(supabase, sysPosArr, sym, apiKey, apiSecret, isTestnet)
      }
      elapsed('reconcile')
    }
  }

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
    // active_run_id 가 설정된 키 목록 조회
    const { data: activeKeys, error: keyListErr } = await supabase
      .from('user_api_keys')
      .select('id, user_id, active_run_id')
      .not('active_run_id', 'is', null)
    if (keyListErr) throw keyListErr
    if (!activeKeys || activeKeys.length === 0) {
      return new Response(JSON.stringify({ message: '활성 실거래 설정 없음' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const runIds = activeKeys.map(k => k.active_run_id as string)
    const { data: runs, error: cfgErr } = await supabase
      .from('backtest_runs')
      .select('*')
      .in('id', runIds)
    if (cfgErr) throw cfgErr

    const runMap = new Map((runs ?? []).map((r: Record<string, unknown>) => [r.id as string, r]))
    const configs: LiveConfig[] = activeKeys
      .map((key: { id: string; user_id: string; active_run_id: string }) => {
        const run = runMap.get(key.active_run_id)
        if (!run) return null
        return { ...run, api_key_id: key.id, user_id: key.user_id } as LiveConfig
      })
      .filter((c: LiveConfig | null): c is LiveConfig => c !== null)

    if (configs.length === 0) {
      return new Response(JSON.stringify({ message: '활성 실거래 설정 없음' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // symbol:interval 그룹별 캔들/지표 사전 계산 + API 키 조회를 동시에 실행
    const groups = new Map<string, LiveConfig[]>()
    for (const config of configs) {
      const key = `${config.symbol}:${config.interval}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(config)
    }

    const [groupDataMap, keyResults] = await Promise.all([
      (async () => {
        const map = new Map<string, SymbolGroupData | null>()
        await Promise.all(
          Array.from(groups.entries()).map(async ([key, cfgs]) => {
            const [symbol, interval] = key.split(':') as [string, string]
            map.set(key, await fetchGroupData(symbol, interval, cfgs, supabase))
          })
        )
        return map
      })(),
      Promise.all(
        configs.map(config =>
          config.api_key_id
            ? supabase.rpc('get_binance_keys', { p_api_key_id: config.api_key_id })
            : Promise.resolve({ data: null, error: null })
        )
      ),
    ])

    // 모든 config 병렬 처리
    const results = await Promise.all(
      configs.map(async (config, i) => {
        if (!config.api_key_id) return { config_id: config.id, skipped: true, reason: 'api_key_id 없음' }
        const groupData = groupDataMap.get(`${config.symbol}:${config.interval}`)
        if (!groupData) return { config_id: config.id, skipped: true, reason: '캔들 부족' }
        const { data: keyRows, error: keyErr } = keyResults[i]!
        if (keyErr || !keyRows || keyRows.length === 0) return { config_id: config.id, skipped: true, reason: 'API 키 조회 실패' }
        const { api_key, api_secret, is_testnet } = keyRows[0] as { api_key: string; api_secret: string; is_testnet: boolean }
        try {
          return await processConfig(supabase, config, api_key, api_secret, is_testnet, groupData)
        } catch (err) {
          console.error(`[live-trade][${config.id}] error:`, err)
          return { config_id: config.id, error: String(err) }
        }
      })
    )

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
