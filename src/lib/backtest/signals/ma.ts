/**
 * MA 추세 필터 (골든/데드크로스) — MA20 vs MA60
 * 롱: MA20 > MA60 (상승 추세) → +1
 * 숏: MA20 < MA60 (하락 추세) → +1
 *
 * detectSignals의 isUptrend/isDowntrend 필터와 연동됨
 */
import type { Candle, BacktestParams } from '../types'

export const MA = {
  flag: 'scoreUseGoldenCross' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    return p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null && row.ma20 > row.ma60 ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    return p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null && row.ma20 < row.ma60 ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, isLong: boolean): string | null {
    if (!p.scoreUseGoldenCross || row.ma20 == null || row.ma60 == null) return null
    const maUp  = row.ma20 > row.ma60
    const scored = isLong ? maUp : !maUp
    return `MA: ${maUp ? '상승' : '하락'}${scored ? '✓' : ''}`
  },
}
