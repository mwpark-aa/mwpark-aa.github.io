import type { Candle, BaseConfig } from './types.ts'

export function buildSignalDetails(row: Candle, c: BaseConfig, direction: string): string {
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

export function buildExitDetails(
  direction: string,
  entryRow: Candle,
  exitRow: Candle,
  c: BaseConfig,
): string | undefined {
  const isShort = direction === 'SHORT'
  const parts: string[] = []

  if (c.score_use_rsi && entryRow.rsi14 != null && exitRow.rsi14 != null) {
    const es = isShort ? (entryRow.rsi14 > c.rsi_overbought ? 1 : 0) : (entryRow.rsi14 < c.rsi_oversold ? 1 : 0)
    const cs = isShort ? (exitRow.rsi14  > c.rsi_overbought ? 1 : 0) : (exitRow.rsi14  < c.rsi_oversold ? 1 : 0)
    if (cs < es) parts.push(`RSI: ${Math.round(entryRow.rsi14)} → ${Math.round(exitRow.rsi14)}`)
  }
  if (c.score_use_adx && entryRow.adx14 != null && exitRow.adx14 != null) {
    if ((exitRow.adx14 >= c.adx_threshold ? 1 : 0) < (entryRow.adx14 >= c.adx_threshold ? 1 : 0))
      parts.push(`ADX: ${Math.round(entryRow.adx14 * 10) / 10} → ${Math.round(exitRow.adx14 * 10) / 10}`)
  }
  if (c.score_use_macd && entryRow.macd_hist != null && exitRow.macd_hist != null) {
    const es = isShort ? (entryRow.macd_hist < 0 ? 1 : 0) : (entryRow.macd_hist > 0 ? 1 : 0)
    const cs = isShort ? (exitRow.macd_hist  < 0 ? 1 : 0) : (exitRow.macd_hist  > 0 ? 1 : 0)
    if (cs < es) {
      const fmt = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 1000}`
      parts.push(`MACD: ${fmt(entryRow.macd_hist)} → ${fmt(exitRow.macd_hist)}`)
    }
  }
  if (c.score_use_rvol && entryRow.vol_rvol168 != null && exitRow.vol_rvol168 != null) {
    if ((exitRow.vol_rvol168 >= c.rvol_threshold ? 1 : 0) < (entryRow.vol_rvol168 >= c.rvol_threshold ? 1 : 0))
      parts.push(`RVOL: ${Math.round(entryRow.vol_rvol168 * 10) / 10}x → ${Math.round(exitRow.vol_rvol168 * 10) / 10}x`)
  }
  if (c.score_use_golden_cross
    && entryRow.ma20 != null && entryRow.ma60 != null
    && exitRow.ma20  != null && exitRow.ma60  != null) {
    const eT = entryRow.ma20 > entryRow.ma60 ? '상승' : '하락'
    const cT = exitRow.ma20  > exitRow.ma60  ? '상승' : '하락'
    const es = isShort ? (eT === '하락' ? 1 : 0) : (eT === '상승' ? 1 : 0)
    const cs = isShort ? (cT === '하락' ? 1 : 0) : (cT === '상승' ? 1 : 0)
    if (cs < es) parts.push(`MA: ${eT} → ${cT}`)
  }
  if (c.score_use_bb
    && entryRow.bb_lower != null && entryRow.bb_upper != null
    && exitRow.bb_lower  != null && exitRow.bb_upper  != null) {
    const es = isShort ? (entryRow.close >= entryRow.bb_upper ? 1 : 0) : (entryRow.close <= entryRow.bb_lower ? 1 : 0)
    const cs = isShort ? (exitRow.close  >= exitRow.bb_upper  ? 1 : 0) : (exitRow.close  <= exitRow.bb_lower  ? 1 : 0)
    if (cs < es) {
      const fmt = (r: Candle) => `${((r.close - r.bb_lower!) / (r.bb_upper! - r.bb_lower!) * 100).toFixed(0)}%`
      parts.push(`BB: ${fmt(entryRow)} → ${fmt(exitRow)}`)
    }
  }
  if (c.score_use_ichi
    && entryRow.ichimoku_a != null && entryRow.ichimoku_b != null
    && exitRow.ichimoku_a  != null && exitRow.ichimoku_b  != null) {
    const above = (r: Candle) => r.close > r.ichimoku_a! && r.close > r.ichimoku_b!
    const below = (r: Candle) => r.close < r.ichimoku_a! && r.close < r.ichimoku_b!
    const es = isShort ? (below(entryRow) ? 1 : 0) : (above(entryRow) ? 1 : 0)
    const cs = isShort ? (below(exitRow)  ? 1 : 0) : (above(exitRow)  ? 1 : 0)
    if (cs < es) {
      const label = (r: Candle) => above(r) ? '구름위' : below(r) ? '구름아래' : '구름안'
      parts.push(`일목: ${label(entryRow)} → ${label(exitRow)}`)
    }
  }
  if (c.score_use_fed_liquidity && entryRow.fed_state != null && exitRow.fed_state != null) {
    const es = isShort ? (entryRow.fed_state === -1 ? 1 : 0) : (entryRow.fed_state === 1 ? 1 : 0)
    const cs = isShort ? (exitRow.fed_state  === -1 ? 1 : 0) : (exitRow.fed_state  === 1 ? 1 : 0)
    if (cs < es) {
      const label = (s: number) => s === 1 ? '확장' : s === -1 ? '수축' : '혼재'
      parts.push(`연준: ${label(entryRow.fed_state)} → ${label(exitRow.fed_state)}`)
    }
  }
  if (c.score_use_cci && entryRow.cci20 != null && exitRow.cci20 != null) {
    const es = isShort ? (entryRow.cci20 > c.cci_overbought ? 1 : 0) : (entryRow.cci20 < c.cci_oversold ? 1 : 0)
    const cs = isShort ? (exitRow.cci20  > c.cci_overbought ? 1 : 0) : (exitRow.cci20  < c.cci_oversold ? 1 : 0)
    if (cs < es) {
      const fmt = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`
      parts.push(`CCI: ${fmt(entryRow.cci20)} → ${fmt(exitRow.cci20)}`)
    }
  }
  if (c.score_use_vwma && entryRow.vwma20 != null && exitRow.vwma20 != null) {
    const eA = entryRow.close > entryRow.vwma20
    const cA = exitRow.close  > exitRow.vwma20
    const es = isShort ? (!eA ? 1 : 0) : (eA ? 1 : 0)
    const cs = isShort ? (!cA ? 1 : 0) : (cA ? 1 : 0)
    if (cs < es) parts.push(`VWMA: ${eA ? '위' : '아래'} → ${cA ? '위' : '아래'}`)
  }
  return parts.length > 0 ? parts.join(' | ') : undefined
}