// Paper Trade — Supabase Edge Function (Deno)
// Deploy: supabase functions deploy paper-trade
// 크론으로 매 15분 호출 → 최근 마감 캔들 기준 신호 감지 후 paper_positions 관리

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── 상수 ─────────────────────────────────────────────────────

const COMMISSION_TAKER    = 0.0005  // 시장가 (진입 / SCORE_EXIT / 강제청산)
const COMMISSION_MAKER    = 0.0002  // 지정가 (TP / SL)
const CAPITAL_PER_TRADE   = 0.20    // 포지션 1개당 사용 자본 비율 (마진 기준 20%)
const SWING_LOOKBACK      = 4
const WARMUP_CANDLES      = 200     // 지표 계산용 워밍업 (168봉 이상)
const SIGNAL_COOLDOWN     = 4       // 동일 신호 재발생 억제 기간 (캔들 수)
const DAILY_LOSS_LIMIT    = 0.06    // 하루 최대 손실 비율 (초기 자본 대비)

// ── 타입 ─────────────────────────────────────────────────────

interface Candle {
  timestamp: number
  open: number; high: number; low: number; close: number; volume: number
  ma20?: number | null; ma60?: number | null; ma120?: number | null
  bb_upper?: number | null; bb_lower?: number | null
  rsi14?: number | null; atr14?: number | null; adx14?: number | null
  mfi14?: number | null; macd_hist?: number | null
  vol_ma20?: number | null; vol_rvol168?: number
  ichimoku_a?: number | null; ichimoku_b?: number | null
  cci20?: number | null; vwma20?: number | null
  swing_low?: number; swing_high?: number
  fed_state?: number | null
}

interface PaperConfig {
  id: string
  symbol: string
  interval: string
  leverage: number
  min_rr: number
  rsi_oversold: number
  rsi_overbought: number
  min_score: number
  initial_capital: number
  score_use_adx: boolean
  score_use_rsi: boolean
  score_use_macd: boolean
  score_use_rvol: boolean
  score_use_bb: boolean
  score_use_ichi: boolean
  score_use_golden_cross: boolean
  score_use_fed_liquidity: boolean
  score_use_cci: boolean
  score_use_vwma: boolean
  fed_liquidity_ma_period: number
  cci_oversold: number
  cci_overbought: number
  adx_threshold: number
  rvol_threshold: number
  rvol_skip: number
  fixed_tp: number
  fixed_sl: number
  score_exit_threshold: number
  use_daily_trend: boolean
}

// ── 인터벌 → ms 변환 ─────────────────────────────────────────

function intervalToMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
    '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000,
    '1d': 86_400_000, '1w': 604_800_000,
  }
  return map[interval] ?? 3_600_000
}

// ── Binance 캔들 fetch ────────────────────────────────────────

async function fetchKlines(symbol: string, interval: string, startMs: number, endMs: number): Promise<Candle[]> {
  const rows: Candle[] = []
  let cursor = startMs

  while (cursor < endMs) {
    const url = new URL('https://api.binance.com/api/v3/klines')
    url.searchParams.set('symbol', `${symbol}USDT`)
    url.searchParams.set('interval', interval)
    url.searchParams.set('startTime', String(cursor))
    url.searchParams.set('endTime', String(endMs))
    url.searchParams.set('limit', '1000')

    const resp = await fetch(url.toString())
    if (!resp.ok) throw new Error(`Binance ${resp.status}`)
    const data: unknown[][] = await resp.json() as unknown[][]
    if (!data.length) break

    for (const k of data) {
      rows.push({
        timestamp: Number(k[0]),
        open: +k[1]!, high: +k[2]!, low: +k[3]!, close: +k[4]!, volume: +k[5]!,
      })
    }
    cursor = Number(data[data.length - 1]![0]) + 1
    if (data.length < 1000) break
    await new Promise(r => setTimeout(r, 120))
  }
  return rows
}

// ── 지표 계산 ────────────────────────────────────────────────

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += values[j]!
    result[i] = sum / period
  }
  return result
}

function std(values: number[], period: number): (number | null)[] {
  const means = sma(values, period)
  const result: (number | null)[] = Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (values[j]! - means[i]!) ** 2
    result[i] = Math.sqrt(variance / period)
  }
  return result
}

function ema(values: number[], span: number): (number | null)[] {
  const result: (number | null)[] = Array(values.length).fill(null)
  const alpha = 2 / (span + 1)
  let current: number | null = null
  let warmupSum = 0

  for (let i = 0; i < values.length; i++) {
    if (i < span - 1) {
      warmupSum += values[i]!
    } else if (i === span - 1) {
      warmupSum += values[i]!
      current = warmupSum / span
      result[i] = current
    } else {
      current = current! * (1 - alpha) + values[i]! * alpha
      result[i] = current
    }
  }
  return result
}

function calcRSI14(closes: number[]): (number | null)[] {
  const result: (number | null)[] = Array(closes.length).fill(null)
  const alpha = 1 / 14
  let avgGain = 0, avgLoss = 0

  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i]! - closes[i - 1]!
    const gain = Math.max(delta, 0), loss = Math.max(-delta, 0)
    if (i < 14) {
      avgGain = (avgGain * (i - 1) + gain) / i
      avgLoss = (avgLoss * (i - 1) + loss) / i
    } else {
      avgGain = avgGain * (1 - alpha) + gain * alpha
      avgLoss = avgLoss * (1 - alpha) + loss * alpha
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    }
  }
  return result
}

function calcATR14(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const result: (number | null)[] = Array(n).fill(null)
  const trs: number[] = []

  for (let i = 1; i < n; i++) {
    const { high, low } = rows[i]!
    const pc = rows[i - 1]!.close
    trs.push(Math.max(high - low, Math.abs(high - pc), Math.abs(low - pc)))
  }

  let atr: number | null = null
  for (let i = 0; i < trs.length; i++) {
    if (i < 13) continue
    atr = i === 13
      ? trs.slice(0, 14).reduce((a, b) => a + b) / 14
      : (atr! * 13 + trs[i]!) / 14
    result[i + 1] = atr
  }
  return result
}

function calcADX14(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const output: (number | null)[] = Array(n).fill(null)
  const plusDM: number[] = [], minusDM: number[] = [], trValues: number[] = []

  for (let i = 1; i < n; i++) {
    const { high: h, low: l } = rows[i]!
    const { high: ph, low: pl, close: pc } = rows[i - 1]!
    const up = h - ph, dn = pl - l
    plusDM.push(up > dn && up > 0 ? up : 0)
    minusDM.push(dn > up && dn > 0 ? dn : 0)
    trValues.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }

  const wilderSmooth = (lst: number[]): (number | null)[] => {
    const smoothed: (number | null)[] = Array(lst.length).fill(null)
    let current: number | null = null
    for (let i = 0; i < lst.length; i++) {
      if (i < 13) continue
      current = i === 13
        ? lst.slice(0, 14).reduce((a, b) => a + b) / 14
        : (current! * 13 + lst[i]!) / 14
      smoothed[i] = current
    }
    return smoothed
  }

  const sp = wilderSmooth(plusDM), sm = wilderSmooth(minusDM), st = wilderSmooth(trValues)
  const dx: (number | null)[] = Array(trValues.length).fill(null)

  for (let i = 0; i < trValues.length; i++) {
    if (!st[i] || st[i] === 0) continue
    const pdi = 100 * sp[i]! / st[i]!
    const mdi = 100 * sm[i]! / st[i]!
    const sum = pdi + mdi
    dx[i] = sum ? 100 * Math.abs(pdi - mdi) / sum : 0
  }

  const dxValues = dx.filter(x => x != null) as number[]
  let avgDX: number | null = null, count = 0

  for (let i = 0; i < dx.length; i++) {
    if (dx[i] == null) continue
    count++
    if (count < 14) continue
    avgDX = count === 14
      ? dxValues.slice(0, 14).reduce((a, b) => a + b) / 14
      : (avgDX! * 13 + dx[i]!) / 14
    output[i + 1] = avgDX
  }
  return output
}

function calcMACDHist(closes: number[]): (number | null)[] {
  const n = closes.length
  const e12 = ema(closes, 12), e26 = ema(closes, 26)
  const macdLine: (number | null)[] = closes.map((_, i) =>
    e12[i] != null && e26[i] != null ? e12[i]! - e26[i]! : null
  )
  const signalLine = ema(macdLine.map(x => x ?? 0), 9)
  const result: (number | null)[] = Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (macdLine[i] != null && signalLine[i] != null) {
      result[i] = macdLine[i]! - signalLine[i]!
    }
  }
  for (let i = 0; i < Math.min(34, n); i++) result[i] = null
  return result
}

function calcCCI20(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const result: (number | null)[] = Array(n).fill(null)
  const period = 20
  for (let i = period - 1; i < n; i++) {
    const window = rows.slice(i - period + 1, i + 1)
    const tps = window.map(r => (r.high + r.low + r.close) / 3)
    const tpMean = tps.reduce((a, b) => a + b, 0) / period
    const meanDev = tps.reduce((a, b) => a + Math.abs(b - tpMean), 0) / period
    if (meanDev === 0) continue
    const currTP = (rows[i]!.high + rows[i]!.low + rows[i]!.close) / 3
    result[i] = (currTP - tpMean) / (0.015 * meanDev)
  }
  return result
}

function calcVWMA20(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const result: (number | null)[] = Array(n).fill(null)
  const period = 20
  for (let i = period - 1; i < n; i++) {
    let sumPV = 0, sumV = 0
    for (let j = i - period + 1; j <= i; j++) {
      sumPV += rows[j]!.close * rows[j]!.volume
      sumV  += rows[j]!.volume
    }
    if (sumV > 0) result[i] = sumPV / sumV
  }
  return result
}

function computeIndicators(rows: Candle[]): void {
  const closes  = rows.map(r => r.close)
  const volumes = rows.map(r => r.volume)

  const ma20  = sma(closes, 20)
  const ma60  = sma(closes, 60)
  const ma120 = sma(closes, 120)
  const bbMid = sma(closes, 20)
  const bbStd = std(closes, 20)
  const rsi   = calcRSI14(closes)
  const atr   = calcATR14(rows)
  const adx   = calcADX14(rows)
  const macd  = calcMACDHist(closes)
  const cci   = calcCCI20(rows)
  const vwma  = calcVWMA20(rows)
  const volMA20  = sma(volumes, 20)
  const volMA168 = sma(volumes, 168)

  const hl2    = rows.map(r => (r.high + r.low) / 2)
  const tenkan = sma(hl2, 9)
  const kijun  = sma(hl2, 26)
  const span52 = sma(hl2, 52)
  const SHIFT  = 26

  for (let i = 0; i < rows.length; i++) {
    const row   = rows[i]!
    const vol168 = volMA168[i]

    row.ma20  = ma20[i]; row.ma60 = ma60[i]; row.ma120 = ma120[i]
    row.bb_upper = bbMid[i] != null && bbStd[i] != null ? bbMid[i]! + 2 * bbStd[i]! : null
    row.bb_lower = bbMid[i] != null && bbStd[i] != null ? bbMid[i]! - 2 * bbStd[i]! : null
    row.rsi14    = rsi[i]; row.atr14 = atr[i]; row.adx14 = adx[i]
    row.macd_hist = macd[i]; row.cci20 = cci[i]; row.vwma20 = vwma[i]
    row.vol_ma20    = volMA20[i]
    row.vol_rvol168 = vol168 ? Math.round(volumes[i]! / vol168 * 1000) / 1000 : 1.0

    if (i >= SHIFT) {
      const t = tenkan[i - SHIFT], k = kijun[i - SHIFT], s = span52[i - SHIFT]
      row.ichimoku_a = t != null && k != null ? (t + k) / 2 : null
      row.ichimoku_b = s ?? null
    } else {
      row.ichimoku_a = null; row.ichimoku_b = null
    }
  }
}

// ── 점수 계산 ────────────────────────────────────────────────

function scoreLong(row: Candle, c: PaperConfig): number {
  let score = 0
  const rvol = row.vol_rvol168 ?? 1.0

  if (c.score_use_adx  && row.adx14 != null && row.adx14 > c.adx_threshold) score++
  if (c.score_use_rsi  && row.rsi14 != null && row.rsi14 < c.rsi_oversold)  score++
  if (c.score_use_macd && row.macd_hist != null && row.macd_hist > 0)        score++
  if (c.score_use_rvol && rvol >= c.rvol_threshold)                           score++
  if (c.score_use_bb   && row.bb_lower != null && row.close <= row.bb_lower)  score++
  if (c.score_use_ichi && row.ichimoku_a != null && row.ichimoku_b != null
    && row.close > row.ichimoku_a && row.close > row.ichimoku_b)              score++
  if (c.score_use_golden_cross && row.ma20 != null && row.ma60 != null && row.ma20 > row.ma60) score++
  if (c.score_use_fed_liquidity && row.fed_state === 1)                        score++
  if (c.score_use_cci  && row.cci20  != null && row.cci20 < (c.cci_oversold  ?? -100)) score++
  if (c.score_use_vwma && row.vwma20 != null && row.close > row.vwma20)        score++
  return score
}

function scoreShort(row: Candle, c: PaperConfig): number {
  let score = 0
  const rvol = row.vol_rvol168 ?? 1.0

  if (c.score_use_adx  && row.adx14 != null && row.adx14 > c.adx_threshold) score++
  if (c.score_use_rsi  && row.rsi14 != null && row.rsi14 > c.rsi_overbought) score++
  if (c.score_use_macd && row.macd_hist != null && row.macd_hist < 0)         score++
  if (c.score_use_rvol && rvol >= c.rvol_threshold)                            score++
  if (c.score_use_bb   && row.bb_upper != null && row.close >= row.bb_upper)   score++
  if (c.score_use_ichi && row.ichimoku_a != null && row.ichimoku_b != null
    && row.close < row.ichimoku_a && row.close < row.ichimoku_b)               score++
  if (c.score_use_golden_cross && row.ma20 != null && row.ma60 != null && row.ma20 < row.ma60) score++
  if (c.score_use_fed_liquidity && row.fed_state === -1)                        score++
  if (c.score_use_cci  && row.cci20  != null && row.cci20 > (c.cci_overbought ?? 100)) score++
  if (c.score_use_vwma && row.vwma20 != null && row.close < row.vwma20)        score++
  return score
}

// ── TP/SL 계산 ───────────────────────────────────────────────

// lib/backtest/scoring.ts의 calcTPSL과 동일하게 유지
function calcTPSL(direction: string, price: number, c: PaperConfig) {
  const isLong  = direction === 'LONG'
  const isShort = direction === 'SHORT'
  const round = (v: number) => Math.round(v * 1e6) / 1e6
  let tp: number | null = null, sl: number | null = null

  if (c.fixed_tp > 0 && c.fixed_sl > 0) {
    if (isLong) {
      sl = round(price * (1 - c.fixed_sl / 100))
      tp = round(price * (1 + c.fixed_tp / 100))
    } else if (isShort) {
      sl = round(price * (1 + c.fixed_sl / 100))
      tp = round(price * (1 - c.fixed_tp / 100))
    }
  }
  return { tp, sl }
}

// ── 포지션 크기 계산 ─────────────────────────────────────────

function calcPositionSize(capital: number, entry: number, _sl: number, leverage: number) {
  if (entry <= 0 || capital <= 0 || leverage <= 0) return { quantity: 0, capitalUsed: 0 }
  const capitalUsed = capital * CAPITAL_PER_TRADE
  const quantity    = (capitalUsed * leverage) / entry
  return { quantity, capitalUsed }
}

// ── 신호 감지 ────────────────────────────────────────────────

interface SignalResult {
  type: string
  score: number
  swingLow: number
  swingHigh: number
}

function detectSignal(
  rows: Candle[], i: number, c: PaperConfig,
  longReady = true, shortReady = true,
): SignalResult | null {
  if (i < 1) return null
  const curr = rows[i]!
  const rvol = curr.vol_rvol168 ?? 1.0

  if (c.score_use_rvol && rvol < c.rvol_skip) return null

  // 스윙 고저
  const lookback = Math.min(SWING_LOOKBACK, i)
  const window   = rows.slice(i - lookback, i + 1)
  const swingLow  = Math.min(...window.map(r => r.low))
  const swingHigh = Math.max(...window.map(r => r.high))

  const rowL: Candle = { ...curr, swing_low:  swingLow  }
  const rowS: Candle = { ...curr, swing_high: swingHigh }

  // MA 추세 필터
  const hasMA     = curr.ma20 != null && curr.ma60 != null
  const useMA     = c.score_use_golden_cross && hasMA
  const isUptrend   = !useMA || (curr.ma20! > curr.ma60! && curr.close > curr.ma60!)
  const isDowntrend = !useMA || (curr.ma20! < curr.ma60! && curr.close < curr.ma60!)

  if (isUptrend && longReady) {
    const score = scoreLong(rowL, c)
    if (score >= c.min_score) return { type: 'LONG', score, swingLow, swingHigh }
  }
  if (isDowntrend && shortReady) {
    const score = scoreShort(rowS, c)
    if (score >= c.min_score) return { type: 'SHORT', score, swingLow, swingHigh }
  }
  return null
}

// ── 지표 값 문자열 요약 ───────────────────────────────────────

function buildSignalDetails(row: Candle, c: PaperConfig, direction: string): string {
  const isLong = direction === 'LONG'
  const s = (label: string, scored: boolean) => scored ? `${label}✓` : label
  const parts: string[] = []

  if (c.score_use_golden_cross && row.ma20 != null && row.ma60 != null) {
    const maUp = row.ma20 > row.ma60
    parts.push(s(`MA: ${maUp ? '상승' : '하락'}`, isLong ? maUp : !maUp))
  }
  if (c.score_use_rsi && row.rsi14 != null) {
    const scored = isLong ? row.rsi14 < c.rsi_oversold : row.rsi14 > c.rsi_overbought
    parts.push(s(`RSI: ${Math.round(row.rsi14)}`, scored))
  }
  if (c.score_use_adx && row.adx14 != null)
    parts.push(s(`ADX: ${Math.round(row.adx14 * 10) / 10}`, row.adx14 > c.adx_threshold))
  if (c.score_use_macd && row.macd_hist != null) {
    const v = Math.round(row.macd_hist * 1000) / 1000
    parts.push(s(`MACD: ${v > 0 ? '+' : ''}${v}`, isLong ? row.macd_hist > 0 : row.macd_hist < 0))
  }
  if (c.score_use_rvol && row.vol_rvol168 != null)
    parts.push(s(`RVOL: ${Math.round(row.vol_rvol168 * 10) / 10}x`, row.vol_rvol168 >= c.rvol_threshold))
  if (c.score_use_bb && row.bb_upper != null && row.bb_lower != null) {
    const bbPct = ((row.close - row.bb_lower) / (row.bb_upper - row.bb_lower) * 100).toFixed(0)
    const scored = isLong ? row.close <= row.bb_lower : row.close >= row.bb_upper
    parts.push(s(`BB: ${bbPct}%`, scored))
  }
  if (c.score_use_ichi && row.ichimoku_a != null && row.ichimoku_b != null) {
    const above = row.close > row.ichimoku_a && row.close > row.ichimoku_b
    const below = row.close < row.ichimoku_a && row.close < row.ichimoku_b
    parts.push(s(`일목: 구름${above ? '위' : '아래'}`, isLong ? above : below))
  }
  if (c.score_use_fed_liquidity && row.fed_state != null) {
    const label = row.fed_state === 1 ? '확장' : row.fed_state === -1 ? '수축' : '혼재'
    parts.push(s(`연준: ${label}`, isLong ? row.fed_state === 1 : row.fed_state === -1))
  }
  if (c.score_use_cci && row.cci20 != null) {
    const v = Math.round(row.cci20)
    const scored = isLong ? row.cci20 < (c.cci_oversold ?? -100) : row.cci20 > (c.cci_overbought ?? 100)
    parts.push(s(`CCI: ${v > 0 ? '+' : ''}${v}`, scored))
  }
  if (c.score_use_vwma && row.vwma20 != null) {
    const above = row.close > row.vwma20
    parts.push(s(`VWMA: ${above ? '위' : '아래'}`, isLong ? above : !above))
  }
  return parts.join(' | ')
}

// ── 메인 핸들러 ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // ── 1. 활성 설정 로드 ─────────────────────────────────────
    const { data: config, error: cfgErr } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('paper_trading_enabled', true)
      .maybeSingle()

    if (cfgErr) throw cfgErr
    if (!config) {
      return new Response(JSON.stringify({ message: '활성 페이퍼 설정 없음' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const c = config as PaperConfig

    // ── 2. 인터벌 계산 및 최신 마감 캔들 시간 ────────────────
    const intervalMs      = intervalToMs(c.interval)
    const now             = Date.now()
    const lastCandleEnd   = Math.floor(now / intervalMs) * intervalMs
    const warmupStartTime = lastCandleEnd - WARMUP_CANDLES * intervalMs

    // ── 3. 이미 처리한 캔들인지 확인 ─────────────────────────
    const { data: account } = await supabase
      .from('paper_account')
      .select('*')
      .eq('id', 1)
      .single()

    if (account?.last_processed_ts) {
      const lastProcessed = new Date(account.last_processed_ts).getTime()
      if (lastProcessed >= lastCandleEnd) {
        return new Response(JSON.stringify({
          message: '이미 처리됨',
          last_processed: account.last_processed_ts,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // ── 4. 캔들 데이터 fetch ──────────────────────────────────
    const rows = await fetchKlines(c.symbol, c.interval, warmupStartTime, lastCandleEnd)
    if (rows.length < 50) {
      return new Response(JSON.stringify({ message: '캔들 데이터 부족', count: rows.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    computeIndicators(rows)

    const n         = rows.length
    const latestRow = rows[n - 1]!
    const iso       = (ts: number) => new Date(ts).toISOString()

    // ── 5. 자본 및 오픈 포지션 로드 ──────────────────────────
    let capital = account?.capital ?? 10000

    const { data: openPositions } = await supabase
      .from('paper_positions')
      .select('*')
      .eq('status', 'OPEN')
      .eq('backtest_run_id', c.id)

    const positions       = openPositions ?? []
    const closedThisCycle: string[] = []

    // ── 6. 오픈 포지션 SL / TP / SCORE_EXIT 체크 ─────────────
    for (const pos of positions) {
      const isShort    = pos.direction === 'SHORT'
      const tp: number = pos.target_price
      const sl: number = pos.stop_loss

      const liqPrice = isShort
        ? pos.entry_price * (1 + 1 / c.leverage)
        : pos.entry_price * (1 - 1 / c.leverage)
      const liqHit = isShort ? latestRow.high >= liqPrice : latestRow.low <= liqPrice

      const currentScore = isShort ? scoreShort(latestRow, c) : scoreLong(latestRow, c)
      const scoreExitHit = c.score_exit_threshold > 0 && currentScore <= c.score_exit_threshold

      const slHit = isShort ? latestRow.high >= sl : latestRow.low  <= sl
      const tpHit = isShort ? latestRow.low  <= tp : latestRow.high >= tp

      let exitPrice: number | null = null
      let exitReason = ''

      if      (liqHit)       { exitPrice = liqPrice;        exitReason = 'LIQUIDATED' }
      else if (slHit)        { exitPrice = sl;               exitReason = 'SL'         }
      else if (scoreExitHit) { exitPrice = latestRow.close;  exitReason = 'SCORE_EXIT' }
      else if (tpHit)        { exitPrice = tp;               exitReason = 'TP'         }

      if (exitPrice != null) {
        const qty      = pos.quantity as number
        const grossPnl = exitReason === 'LIQUIDATED'
          ? -pos.capital_used
          : isShort
            ? qty * (pos.entry_price - exitPrice)
            : qty * (exitPrice - pos.entry_price)

        const notionalQty  = qty / c.leverage
        const exitCommRate = (exitReason === 'TP' || exitReason === 'SL') ? COMMISSION_MAKER : COMMISSION_TAKER
        const entryComm    = (pos.entry_price as number) * notionalQty * COMMISSION_TAKER
        const exitComm     = exitPrice * notionalQty * exitCommRate
        const totalComm    = entryComm + exitComm
        const netCapital   = exitReason === 'LIQUIDATED' ? -(pos.capital_used as number) : grossPnl - totalComm
        capital += netCapital

        const pnlPct = (grossPnl / (pos.capital_used as number)) * 100

        await supabase
          .from('paper_positions')
          .update({
            status:      'CLOSED',
            exit_price:  Math.round(exitPrice * 1e6) / 1e6,
            exit_time:   iso(latestRow.timestamp),
            exit_reason: exitReason,
            net_pnl:     Math.round(grossPnl * 10000) / 10000,
            pnl_pct:     Math.round(pnlPct   * 10000) / 10000,
          })
          .eq('id', pos.id)

        closedThisCycle.push(pos.id)
      }
    }

    // ── 7. 오픈 포지션 없고 이번 사이클에 청산 없을 때만 진입 체크 ──
    // (백테스트와 동일: 청산한 캔들에서 재진입 금지)
    const stillOpen = positions.filter(p => !closedThisCycle.includes(p.id))

    let newPosition: Record<string, unknown> | null = null
    const debugInfo: Record<string, unknown> = {
      candle_count:      n,
      open_before:       positions.length,
      closed_this_cycle: closedThisCycle.length,
      still_open:        stillOpen.length,
    }

    if (stillOpen.length === 0 && closedThisCycle.length === 0) {
      // ── 8. 일일 손실 한도 확인 ────────────────────────────
      const todayStart = new Date(lastCandleEnd)
      todayStart.setUTCHours(0, 0, 0, 0)
      const { data: todayTrades } = await supabase
        .from('paper_positions')
        .select('net_pnl')
        .eq('backtest_run_id', c.id)
        .eq('status', 'CLOSED')
        .gte('exit_time', todayStart.toISOString())

      const dailyLoss = (todayTrades ?? []).reduce((s, t) => s + (t.net_pnl ?? 0), 0)
      debugInfo.daily_loss = dailyLoss

      if (dailyLoss < -(account?.initial_capital ?? 10000) * DAILY_LOSS_LIMIT) {
        debugInfo.skipped = 'daily_loss_limit'
      } else {
        // ── 9. 쿨다운 확인 (백테스트와 동일: 신호별 4캔들) ──
        const cooldownMs = SIGNAL_COOLDOWN * intervalMs
        const { data: lastEntries } = await supabase
          .from('paper_positions')
          .select('entry_time, direction')
          .eq('backtest_run_id', c.id)
          .order('entry_time', { ascending: false })
          .limit(2)

        const lastLong  = lastEntries?.find(p => p.direction === 'LONG')
        const lastShort = lastEntries?.find(p => p.direction === 'SHORT')
        const longReady  = !lastLong  || (lastCandleEnd - new Date(lastLong.entry_time).getTime())  >= cooldownMs
        const shortReady = !lastShort || (lastCandleEnd - new Date(lastShort.entry_time).getTime()) >= cooldownMs
        debugInfo.long_ready = longReady; debugInfo.short_ready = shortReady

        // ── 10. 신호 감지 ─────────────────────────────────
        const signalIdx = n - 1   // 방금 마감한 캔들 (백테스트의 i-1)
        const signal    = detectSignal(rows, signalIdx, c, longReady, shortReady)

        debugInfo.signal = signal ? { type: signal.type, score: signal.score } : null
        debugInfo.latest_indicators = {
          close: latestRow.close, rsi: latestRow.rsi14, adx: latestRow.adx14,
          macd: latestRow.macd_hist, rvol: latestRow.vol_rvol168,
          ma20: latestRow.ma20, ma60: latestRow.ma60, ma120: latestRow.ma120, atr: latestRow.atr14,
        }

        if (signal) {
          const { type: signalType, score } = signal
          const isShort = signalType === 'SHORT'

          // MA120 추세 필터 (백테스트 simulate.ts line 350-353과 동일)
          const ma120Blocked =
            latestRow.ma120 != null && (
              ( isShort && latestRow.close > latestRow.ma120) ||
              (!isShort && latestRow.close < latestRow.ma120)
            )
          debugInfo.ma120_blocked = ma120Blocked

          // ── 11. 진입가: 다음 캔들 시가 (백테스트와 동일) ─
          // 백테스트: rows[i].open (신호 캔들 다음 봉 시가)
          // 페이퍼: lastCandleEnd 시작 캔들의 시가
          let entryPrice = latestRow.close  // 기본값 (fallback)
          try {
            const nextRows = await fetchKlines(c.symbol, c.interval, lastCandleEnd, lastCandleEnd + intervalMs)
            if (nextRows.length > 0) entryPrice = nextRows[0]!.open
          } catch { /* fallback to close */ }
          debugInfo.entry_price = entryPrice

          const { tp, sl } = ma120Blocked
            ? { tp: null, sl: null }
            : calcTPSL(signalType, entryPrice, c)

          if (tp != null && sl != null) {
            const { quantity, capitalUsed } = calcPositionSize(capital, entryPrice, sl, c.leverage)
            debugInfo.quantity = quantity; debugInfo.capital_used = capitalUsed

            if (quantity > 0) {
              const signalDetails = buildSignalDetails(latestRow, c, signalType)
              newPosition = {
                backtest_run_id:       c.id,
                symbol:                c.symbol,
                signal_type:           signalType,
                direction:             signalType,
                entry_price:           Math.round(entryPrice * 1e6) / 1e6,
                avg_entry_price:       Math.round(entryPrice * 1e6) / 1e6,
                target_price:          tp,
                stop_loss:             sl,
                quantity:              Math.round(quantity    * 1e8) / 1e8,
                capital_used:          Math.round(capitalUsed * 1e4) / 1e4,
                original_quantity:     Math.round(quantity    * 1e8) / 1e8,
                original_capital_used: Math.round(capitalUsed * 1e4) / 1e4,
                // 백테스트와 동일: 진입 시각 = 다음 캔들 시작 시각
                entry_time:            iso(lastCandleEnd),
                signal_details:        signalDetails,
                score,
                status:                'OPEN',
                peak_price:            Math.round(entryPrice * 1e6) / 1e6,
                last_candle_ts:        iso(lastCandleEnd),
              }
              const { error: insertErr } = await supabase.from('paper_positions').insert(newPosition)
              if (insertErr) {
                debugInfo.insert_error = insertErr.message
                newPosition = null
              }
            }
          }
        }
      }
    }

    // ── 9. 자본 및 처리 시각 업데이트 ────────────────────────
    await supabase
      .from('paper_account')
      .upsert({
        id:                1,
        capital:           Math.round(capital * 100) / 100,
        updated_at:        iso(latestRow.timestamp),
        last_processed_ts: iso(lastCandleEnd),
      }, { onConflict: 'id' })

    return new Response(JSON.stringify({
      ok:          true,
      candle_time: iso(latestRow.timestamp),
      closed:      closedThisCycle.length,
      opened:      newPosition ? 1 : 0,
      capital:     Math.round(capital * 100) / 100,
      debug:       debugInfo,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[paper-trade]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
