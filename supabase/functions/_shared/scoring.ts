import type { Candle, BaseConfig, DailyBar, SignalResult } from './types.ts'
import { SWING_LOOKBACK } from './constants.ts'

export function scoreLong(row: Candle, c: BaseConfig): number {
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

export function scoreShort(row: Candle, c: BaseConfig): number {
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

export function getDailyBar(map: Map<number, DailyBar>, ts: number): DailyBar | null {
  const d = new Date(ts)
  const todayMs     = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const yesterdayMs = todayMs - 86_400_000
  for (let i = 0; i < 7; i++) {
    const bar = map.get(yesterdayMs - i * 86_400_000)
    if (bar) return bar
  }
  return null
}

export function detectSignal(
  rows: Candle[],
  i: number,
  c: BaseConfig,
  longReady  = true,
  shortReady = true,
): SignalResult | null {
  if (i < 1) return null
  const curr = rows[i]!
  const rvol = curr.vol_rvol168 ?? 1.0

  if (c.score_use_rvol && rvol < c.rvol_skip) return null

  const lookback  = Math.min(SWING_LOOKBACK, i)
  const window    = rows.slice(i - lookback, i + 1)
  const swingLow  = Math.min(...window.map(r => r.low))
  const swingHigh = Math.max(...window.map(r => r.high))

  const rowL: Candle = { ...curr, swing_low:  swingLow  }
  const rowS: Candle = { ...curr, swing_high: swingHigh }

  const hasMA       = curr.ma20 != null && curr.ma60 != null
  const useMA       = c.score_use_golden_cross && hasMA
  const isUptrend   = !useMA || (curr.ma20! > curr.ma60! && curr.close > curr.ma60!)
  const isDowntrend = !useMA || (curr.ma20! < curr.ma60! && curr.close < curr.ma60!)

  const cciCap       = (c.cci_max_entry ?? 0) > 0 && curr.cci20 != null
  const longBlocked  = cciCap && curr.cci20! < -(c.cci_max_entry ?? 0)
  const shortBlocked = cciCap && curr.cci20! >  (c.cci_max_entry ?? 0)

  if (isUptrend && longReady && !longBlocked) {
    const score = scoreLong(rowL, c)
    if (score >= c.min_score) return { type: 'LONG', score, swingLow, swingHigh }
  }
  if (isDowntrend && shortReady && !shortBlocked) {
    const score = scoreShort(rowS, c)
    if (score >= c.min_score) return { type: 'SHORT', score, swingLow, swingHigh }
  }
  return null
}