import type { Candle, BacktestParams } from './types'
import { SWING_LOOKBACK, CAPITAL_PER_TRADE } from './types'
import { INDICATORS } from './signals'

// ── TP/SL 계산 ───────────────────────────────────────────────

export function calcTPSL(direction: string, entryPrice: number, p: BacktestParams) {
  const isLong  = direction === 'LONG'
  const isShort = direction === 'SHORT'
  let tp: number | null = null
  let sl: number | null = null

  if (p.fixedTP > 0 && p.fixedSL > 0) {
    const round = (v: number) => Math.round(v * 1e6) / 1e6
    if (isLong) {
      sl = round(entryPrice * (1 - p.fixedSL / 100))
      tp = round(entryPrice * (1 + p.fixedTP / 100))
    } else if (isShort) {
      sl = round(entryPrice * (1 + p.fixedSL / 100))
      tp = round(entryPrice * (1 - p.fixedTP / 100))
    }
  }

  const rr = tp != null && sl != null && sl !== entryPrice
    ? Math.round(Math.abs(tp - entryPrice) / Math.abs(entryPrice - sl) * 100) / 100
    : null

  return { tp, sl, rr }
}

// ── 점수 계산 ────────────────────────────────────────────────

export function scoreLong(row: Candle, p: BacktestParams): number {
  return INDICATORS.reduce((sum, ind) => sum + ind.scoreLong(row, p), 0)
}

export function scoreShort(row: Candle, p: BacktestParams): number {
  return INDICATORS.reduce((sum, ind) => sum + ind.scoreShort(row, p), 0)
}

// ── 신호 감지 ────────────────────────────────────────────────

export function detectSignals(
  rows: Candle[],
  i: number,
  cooldown: Record<string, number>,
  p: BacktestParams,
) {
  if (i < 1) return []

  const curr = rows[i]
  const rvol = curr.vol_rvol168 ?? 1.0

  if (p.scoreUseRVOL && rvol < p.rvolSkip) return []

  const isReady = (type: string) => (cooldown[type] ?? 0) <= 0

  const lookback = Math.min(SWING_LOOKBACK, i)
  const window   = rows.slice(i - lookback, i + 1)
  const swingLow  = Math.min(...window.map(r => r.low))
  const swingHigh = Math.max(...window.map(r => r.high))

  const rowForLong:  Candle = { ...curr, swing_low:  swingLow }
  const rowForShort: Candle = { ...curr, swing_high: swingHigh }

  const hasMA      = curr.ma20 != null && curr.ma60 != null
  const useMA      = p.scoreUseGoldenCross && hasMA
  const isUptrend   = !useMA || (curr.ma20! > curr.ma60! && curr.close > curr.ma60!)
  const isDowntrend = !useMA || (curr.ma20! < curr.ma60! && curr.close < curr.ma60!)

  const fired: any[] = []
  const add = (type: string, score: number) => {
    const { tp, sl, rr } = calcTPSL(type, curr.close, p)
    fired.push({ signal_type: type, tp, sl, rr, score })
  }

  // CCI 진입 차단: 절댓값이 cciMaxEntry를 초과하면 해당 방향 진입 금지
  const cciCap = p.cciMaxEntry > 0 && curr.cci20 != null
  const longBlocked  = cciCap && curr.cci20! < -p.cciMaxEntry
  const shortBlocked = cciCap && curr.cci20! >  p.cciMaxEntry

  if (isUptrend   && isReady('LONG')  && !longBlocked) {
    const score = scoreLong(rowForLong, p)
    if (score > 0) add('LONG', score)
  }

  if (isDowntrend && isReady('SHORT') && !shortBlocked) {
    const score = scoreShort(rowForShort, p)
    if (score > 0) add('SHORT', score)
  }

  return fired
}

// ── 진입 신호 상세 문자열 ─────────────────────────────────────

export function buildSignalDetails(
  direction: string,
  row: Candle,
  _score: number,
  rr: number | null,
  p: BacktestParams,
): string {
  const isLong = direction === 'LONG'

  const parts = INDICATORS
    .map(ind => ind.detail(row, p, isLong))
    .filter((s): s is string => s != null)

  if (rr != null && p.fixedTP === 0 && p.fixedSL === 0) {
    parts.push(`RR: ${rr.toFixed(2)}`)
  }

  return parts.join(' | ')
}

// ── 포지션 크기 계산 ─────────────────────────────────────────

export function calcPositionSize(capital: number, entry: number, _sl: number, leverage: number) {
  if (entry <= 0 || capital <= 0 || leverage <= 0) {
    return { quantity: 0, capitalUsed: 0 }
  }

  const capitalUsed = capital * CAPITAL_PER_TRADE
  const quantity    = (capitalUsed * leverage) / entry

  return { quantity, capitalUsed }
}
