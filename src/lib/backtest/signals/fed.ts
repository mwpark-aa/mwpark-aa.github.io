/**
 * 연준 유동성 (Fed Net Liquidity) — 대차대조표 - TGA - 역레포
 * 롱: fed_state === 1 (유동성 확장 확정) → +1
 * 숏: fed_state === -1 (유동성 수축 확정) → +1
 */
import type { Candle, BacktestParams } from '../types'

const STATE_LABEL: Record<number, string> = { 1: '확장', [-1]: '수축', 0: '혼재' }

export const Fed = {
  flag: 'scoreUseFedLiquidity' as const,

  scoreLong(row: Candle, p: BacktestParams): number {
    return p.scoreUseFedLiquidity && row.fed_state === 1 ? 1 : 0
  },

  scoreShort(row: Candle, p: BacktestParams): number {
    return p.scoreUseFedLiquidity && row.fed_state === -1 ? 1 : 0
  },

  detail(row: Candle, p: BacktestParams, isLong: boolean): string | null {
    if (!p.scoreUseFedLiquidity || row.fed_state == null) return null
    const scored = isLong ? row.fed_state === 1 : row.fed_state === -1
    const label  = STATE_LABEL[row.fed_state] ?? '혼재'
    return `연준: ${label}${scored ? '✓' : ''}`
  },
}
