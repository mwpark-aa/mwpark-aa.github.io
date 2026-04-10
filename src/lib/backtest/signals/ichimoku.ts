/**
 * 일목균형표 (Ichimoku Cloud) — 구름 위/아래 위치
 * 롱: 가격 > 구름(A, B 모두 위) → 상승 지지 +1
 * 숏: 가격 < 구름(A, B 모두 아래) → 하락 저항 +1
 */
import type { Candle, BacktestParams } from '../types'

const aboveCloud = (row: Candle) =>
  row.ichimoku_a != null && row.ichimoku_b != null &&
  row.close > row.ichimoku_a && row.close > row.ichimoku_b

const belowCloud = (row: Candle) =>
  row.ichimoku_a != null && row.ichimoku_b != null &&
  row.close < row.ichimoku_a && row.close < row.ichimoku_b

export const Ichimoku = {
  flag: 'scoreUseIchi' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    return p.scoreUseIchi && aboveCloud(row) ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    return p.scoreUseIchi && belowCloud(row) ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, isLong: boolean): string | null {
    if (!p.scoreUseIchi || row.ichimoku_a == null || row.ichimoku_b == null) return null
    const above  = aboveCloud(row)
    const below  = belowCloud(row)
    const label  = above ? '구름위' : below ? '구름아래' : '구름안'
    const scored = isLong ? above : below
    return `일목: ${label}${scored ? '✓' : ''}`
  },
}
