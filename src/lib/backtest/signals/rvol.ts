/**
 * RVOL (Relative Volume) — 상대 거래량
 * 롱/숏 공통: 168시간 평균 대비 거래량 급증 → 신뢰도 상승 +1
 */
import type { Candle, BacktestParams } from '../types'

export const RVOL = {
  flag: 'scoreUseRVOL' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    const rvol = row.vol_rvol168 ?? 1.0
    return p.scoreUseRVOL && rvol >= p.rvolThreshold ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    const rvol = row.vol_rvol168 ?? 1.0
    return p.scoreUseRVOL && rvol >= p.rvolThreshold ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, _isLong: boolean): string | null {
    if (!p.scoreUseRVOL || row.vol_rvol168 == null) return null
    const scored = row.vol_rvol168 >= p.rvolThreshold
    return `RVOL: ${Math.round(row.vol_rvol168 * 10) / 10}x${scored ? '✓' : ''}`
  },
}
