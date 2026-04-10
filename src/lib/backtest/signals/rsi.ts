/**
 * RSI (Relative Strength Index) — 과매수/과매도
 * 롱: RSI < rsiOversold (과매도 → 반등 기대) → +1
 * 숏: RSI > rsiOverbought (과매수 → 하락 기대) → +1
 */
import type { Candle, BacktestParams } from '../types'

export const RSI = {
  flag: 'scoreUseRSI' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    return p.scoreUseRSI && row.rsi14 != null && row.rsi14 < p.rsiOversold ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    return p.scoreUseRSI && row.rsi14 != null && row.rsi14 > p.rsiOverbought ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, isLong: boolean): string | null {
    if (!p.scoreUseRSI || row.rsi14 == null) return null
    const scored = isLong ? row.rsi14 < p.rsiOversold : row.rsi14 > p.rsiOverbought
    return `RSI: ${Math.round(row.rsi14)}${scored ? '✓' : ''}`
  },
}
