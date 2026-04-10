/**
 * VWMA (Volume Weighted Moving Average, period=20) — 가격 위치
 * VWMA = Σ(close × volume) / Σ(volume)
 * 롱: 가격 > VWMA (매수 압력 우세) → +1
 * 숏: 가격 < VWMA (매도 압력 우세) → +1
 */
import type { Candle, BacktestParams } from '../types'

export const VWMA = {
  flag: 'scoreUseVWMA' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    return p.scoreUseVWMA && row.vwma20 != null && row.close > row.vwma20 ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    return p.scoreUseVWMA && row.vwma20 != null && row.close < row.vwma20 ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, isLong: boolean): string | null {
    if (!p.scoreUseVWMA || row.vwma20 == null) return null
    const above  = row.close > row.vwma20
    const scored = isLong ? above : !above
    return `VWMA: ${above ? '위' : '아래'}${scored ? '✓' : ''}`
  },
}
