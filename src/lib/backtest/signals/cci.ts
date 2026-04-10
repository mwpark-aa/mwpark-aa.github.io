/**
 * CCI (Commodity Channel Index, period=20) — 과매수/과매도
 * CCI = (TP - SMA(TP)) / (0.015 × MeanDev)
 * 롱: CCI < cciOversold  (기본 -100) → +1
 * 숏: CCI > cciOverbought (기본 +100) → +1
 */
import type { Candle, BacktestParams } from '../types'

export const CCI = {
  flag: 'scoreUseCCI' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    return p.scoreUseCCI && row.cci20 != null && row.cci20 < p.cciOversold ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    return p.scoreUseCCI && row.cci20 != null && row.cci20 > p.cciOverbought ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, isLong: boolean): string | null {
    if (!p.scoreUseCCI || row.cci20 == null) return null
    const v      = Math.round(row.cci20)
    const scored = isLong ? row.cci20 < p.cciOversold : row.cci20 > p.cciOverbought
    return `CCI: ${v > 0 ? '+' : ''}${v}${scored ? '✓' : ''}`
  },
}
