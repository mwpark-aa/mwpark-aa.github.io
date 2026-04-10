/**
 * MACD 히스토그램 — 모멘텀 방향
 * 롱: 히스토그램 > 0 (상승 모멘텀) → +1
 * 숏: 히스토그램 < 0 (하락 모멘텀) → +1
 */
import type { Candle, BacktestParams } from '../types'

export const MACD = {
  flag: 'scoreUseMACD' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    return p.scoreUseMACD && row.macd_hist != null && row.macd_hist > 0 ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    return p.scoreUseMACD && row.macd_hist != null && row.macd_hist < 0 ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, isLong: boolean): string | null {
    if (!p.scoreUseMACD || row.macd_hist == null) return null
    const v = Math.round(row.macd_hist * 1000) / 1000
    const scored = isLong ? row.macd_hist > 0 : row.macd_hist < 0
    return `MACD: ${v > 0 ? '+' : ''}${v}${scored ? '✓' : ''}`
  },
}
