/**
 * 볼린저밴드 (Bollinger Bands) — 극단 구간 반전
 * 롱: 가격 ≤ 하단밴드 (극도 과매도 → 반등 기대) → +1
 * 숏: 가격 ≥ 상단밴드 (극도 과매수 → 조정 기대) → +1
 */
import type { Candle, BacktestParams } from '../types'

export const BB = {
  flag: 'scoreUseBB' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    return p.scoreUseBB && row.bb_lower != null && row.close <= row.bb_lower ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    return p.scoreUseBB && row.bb_upper != null && row.close >= row.bb_upper ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, isLong: boolean): string | null {
    if (!p.scoreUseBB || row.bb_upper == null || row.bb_lower == null) return null
    const bbPct = ((row.close - row.bb_lower) / (row.bb_upper - row.bb_lower) * 100).toFixed(0)
    const scored = isLong ? row.close <= row.bb_lower : row.close >= row.bb_upper
    return `BB: ${bbPct}%${scored ? '✓' : ''}`
  },
}
