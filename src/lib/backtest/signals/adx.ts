/**
 * ADX (Average Directional Index) — 추세 강도
 * 롱/숏 공통: ADX > adxThreshold 이면 추세 존재로 판단해 +1
 */
import type { Candle, BacktestParams } from '../types'

export const ADX = {
  flag: 'scoreUseADX' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    return p.scoreUseADX && row.adx14 != null && row.adx14 > p.adxThreshold ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    return p.scoreUseADX && row.adx14 != null && row.adx14 > p.adxThreshold ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, _isLong: boolean): string | null {
    if (!p.scoreUseADX || row.adx14 == null) return null
    const scored = row.adx14 > p.adxThreshold
    return `ADX: ${Math.round(row.adx14 * 10) / 10}${scored ? '✓' : ''}`
  },
}
