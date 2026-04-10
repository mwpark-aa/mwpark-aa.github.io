import type { Candle, BacktestParams } from './types'
import { SWING_LOOKBACK } from './types'

// ── TP/SL 계산 ───────────────────────────────────────────────────

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

// ── 점수 계산 ────────────────────────────────────────────────────

/** 롱 진입 점수: 각 지표가 조건을 만족하면 +1 */
export function scoreLong(row: Candle, p: BacktestParams): number {
  let score = 0
  const rvol = row.vol_rvol168 ?? 1.0

  // ADX: 추세 존재 (방향 무관)
  if (p.scoreUseADX && row.adx14 != null && row.adx14 > p.adxThreshold) score++

  // RSI: 과매도 구간 (반등 신호)
  if (p.scoreUseRSI && row.rsi14 != null && row.rsi14 < p.rsiOversold) score++

  // MACD: 양봉 히스토그램 (상승 모멘텀)
  if (p.scoreUseMACD && row.macd_hist != null && row.macd_hist > 0) score++

  // RVOL: 평균 대비 거래량 급증
  if (p.scoreUseRVOL && rvol >= p.rvolThreshold) score++

  // BB: 하단 터치 (극도의 약세 → 반등 기대)
  if (p.scoreUseBB && row.bb_lower != null && row.close <= row.bb_lower) score++

  // 일목: 구름 위 (상승 지지)
  if (p.scoreUseIchi
    && row.ichimoku_a != null && row.ichimoku_b != null
    && row.close > row.ichimoku_a && row.close > row.ichimoku_b
  ) score++

  // MA 추세: MA20 > MA60 (상승 추세)
  if (p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null && row.ma20 > row.ma60) score++

  // 연준 유동성: 확장 확정 (MA 위 + 상승)
  if (p.scoreUseFedLiquidity && row.fed_state === 1) score++

  return score
}

/** 숏 진입 점수: 각 지표가 조건을 만족하면 +1 */
export function scoreShort(row: Candle, p: BacktestParams): number {
  let score = 0
  const rvol = row.vol_rvol168 ?? 1.0

  // ADX: 추세 존재 (방향 무관)
  if (p.scoreUseADX && row.adx14 != null && row.adx14 > p.adxThreshold) score++

  // RSI: 과매수 구간 (하락 신호)
  if (p.scoreUseRSI && row.rsi14 != null && row.rsi14 > p.rsiOverbought) score++

  // MACD: 음봉 히스토그램 (하락 모멘텀)
  if (p.scoreUseMACD && row.macd_hist != null && row.macd_hist < 0) score++

  // RVOL: 평균 대비 거래량 급증
  if (p.scoreUseRVOL && rvol >= p.rvolThreshold) score++

  // BB: 상단 터치 (극도의 강세 → 조정 기대)
  if (p.scoreUseBB && row.bb_upper != null && row.close >= row.bb_upper) score++

  // 일목: 구름 아래 (하락 저항)
  if (p.scoreUseIchi
    && row.ichimoku_a != null && row.ichimoku_b != null
    && row.close < row.ichimoku_a && row.close < row.ichimoku_b
  ) score++

  // MA 추세: MA20 < MA60 (하락 추세)
  if (p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null && row.ma20 < row.ma60) score++

  // 연준 유동성: 수축 확정 (MA 아래 + 하락)
  if (p.scoreUseFedLiquidity && row.fed_state === -1) score++

  return score
}

// ── 신호 감지 ────────────────────────────────────────────────────

/**
 * 캔들 rows[i]에서 롱/숏 신호를 감지.
 * 쿨다운(cd)이 남아 있으면 해당 방향 신호를 건너뜀.
 */
export function detectSignals(
  rows: Candle[],
  i: number,
  cooldown: Record<string, number>,
  p: BacktestParams,
) {
  if (i < 1) return []

  const curr = rows[i]
  const rvol = curr.vol_rvol168 ?? 1.0

  // RVOL 최소 기준 미달 시 전체 스킵
  if (p.scoreUseRVOL && rvol < p.rvolSkip) return []

  const isReady = (type: string) => (cooldown[type] ?? 0) <= 0

  // 스윙 고저 계산 (진입가 기준 TP/SL용)
  const lookback = Math.min(SWING_LOOKBACK, i)
  const window   = rows.slice(i - lookback, i + 1)
  const swingLow  = Math.min(...window.map(r => r.low))
  const swingHigh = Math.max(...window.map(r => r.high))

  const rowForLong:  Candle = { ...curr, swing_low:  swingLow }
  const rowForShort: Candle = { ...curr, swing_high: swingHigh }

  // MA 추세 필터
  const hasMA     = curr.ma20 != null && curr.ma60 != null
  const useMA     = p.scoreUseGoldenCross && hasMA
  const isUptrend   = !useMA || (curr.ma20! > curr.ma60! && curr.close > curr.ma60!)
  const isDowntrend = !useMA || (curr.ma20! < curr.ma60! && curr.close < curr.ma60!)

  const fired: any[] = []
  const add = (type: string, score: number) => {
    const { tp, sl, rr } = calcTPSL(type, curr.close, p)
    fired.push({ signal_type: type, tp, sl, rr, score })
  }

  if (isUptrend   && isReady('LONG')) {
    const score = scoreLong(rowForLong, p)
    if (score > 0) add('LONG', score)
  }

  if (isDowntrend && isReady('SHORT')) {
    const score = scoreShort(rowForShort, p)
    if (score > 0) add('SHORT', score)
  }

  return fired
}

// ── 진입 신호 상세 문자열 ─────────────────────────────────────────

/** 거래 내역에 표시할 진입 시점 지표 값 요약 */
export function buildSignalDetails(
  direction: string,
  row: Candle,
  _score: number,
  rr: number | null,
  p: BacktestParams,
): string {
  const isLong = direction === 'LONG'
  // 점수 기여 시 '✓' 접미사 → UI에서 색상 구분용
  const s = (label: string, scored: boolean) => scored ? `${label}✓` : label

  const parts: string[] = []

  if (p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null) {
    const maUp = row.ma20 > row.ma60
    parts.push(s(`MA: ${maUp ? '상승' : '하락'}`, isLong ? maUp : !maUp))
  }
  if (p.scoreUseRSI && row.rsi14 != null) {
    const scored = isLong ? row.rsi14 < p.rsiOversold : row.rsi14 > p.rsiOverbought
    parts.push(s(`RSI: ${Math.round(row.rsi14)}`, scored))
  }
  if (p.scoreUseADX && row.adx14 != null) {
    parts.push(s(`ADX: ${Math.round(row.adx14 * 10) / 10}`, row.adx14 > p.adxThreshold))
  }
  if (p.scoreUseMACD && row.macd_hist != null) {
    const v = Math.round(row.macd_hist * 1000) / 1000
    const scored = isLong ? row.macd_hist > 0 : row.macd_hist < 0
    parts.push(s(`MACD: ${v > 0 ? '+' : ''}${v}`, scored))
  }
  if (p.scoreUseRVOL && row.vol_rvol168 != null) {
    parts.push(s(`RVOL: ${Math.round(row.vol_rvol168 * 10) / 10}x`, row.vol_rvol168 >= p.rvolThreshold))
  }
  if (p.scoreUseBB && row.bb_upper != null && row.bb_lower != null) {
    const bbPct = ((row.close - row.bb_lower) / (row.bb_upper - row.bb_lower) * 100).toFixed(0)
    const scored = isLong ? row.close <= row.bb_lower : row.close >= row.bb_upper
    parts.push(s(`BB: ${bbPct}%`, scored))
  }
  if (p.scoreUseIchi && row.ichimoku_a != null && row.ichimoku_b != null) {
    const above = row.close > row.ichimoku_a && row.close > row.ichimoku_b
    const below = row.close < row.ichimoku_a && row.close < row.ichimoku_b
    const scored = isLong ? above : below
    parts.push(s(`일목: 구름${above ? '위' : '아래'}`, scored))
  }
  if (p.scoreUseFedLiquidity && row.fed_state != null) {
    const label = row.fed_state === 1 ? '확장' : row.fed_state === -1 ? '수축' : '혼재'
    const scored = isLong ? row.fed_state === 1 : row.fed_state === -1
    parts.push(s(`연준: ${label}`, scored))
  }
  if (rr != null && p.fixedTP === 0 && p.fixedSL === 0) {
    parts.push(`RR: ${rr.toFixed(2)}`)
  }

  return parts.join(' | ')
}

// ── 포지션 크기 계산 ─────────────────────────────────────────────

import { RISK_PER_TRADE, MAX_CAPITAL_PCT } from './types'

/**
 * 리스크 기반 포지션 크기 계산.
 * - 기본: 자본의 RISK_PER_TRADE % 손실을 SL 거리로 나눈 수량
 * - 최대: 자본의 MAX_CAPITAL_PCT × 레버리지 이내로 제한
 */
export function calcPositionSize(capital: number, entry: number, sl: number, leverage: number) {
  const slDistance = Math.abs(entry - sl)
  if (slDistance <= 0 || entry <= 0 || capital <= 0) {
    return { quantity: 0, capitalUsed: 0 }
  }

  let quantity = (capital * RISK_PER_TRADE) / slDistance
  const maxQuantity = (capital * MAX_CAPITAL_PCT * leverage) / entry

  if (quantity > maxQuantity) quantity = maxQuantity

  return {
    quantity,
    capitalUsed: (quantity * entry) / leverage,
  }
}
