// Crypto Backtest — public API entry point
// Real implementation. git update-index --skip-worktree keeps this local.

export type { BacktestParams, BacktestResult, BacktestTrade } from './backtest/types'

import type { BacktestParams, BacktestResult } from './backtest/types'
import { WARMUP_CANDLES } from './backtest/types'
import { fetchKlines, fetchFedLiquidity, attachFedData, buildDailyTrendMap } from './backtest/fetch'
import { computeIndicators } from './backtest/indicators'
import { simulate } from './backtest/simulate'

export async function runBacktest(p: BacktestParams): Promise<BacktestResult> {
  const startMs = new Date(p.startDate).getTime()
  const endMs   = new Date(p.endDate).getTime()

  // RVOL168 계산용 워밍업 구간 추가
  const msPerCandle =
    p.interval === '1d' ? 86400000 :
    p.interval === '4h' ? 4 * 3600000 :
                          3600000
  const warmupMs = WARMUP_CANDLES * msPerCandle

  const rows = await fetchKlines(p.symbol, p.interval, startMs - warmupMs, endMs)
  if (rows.length < 200) throw new Error('데이터 부족: 날짜 범위를 넓혀주세요.')

  computeIndicators(rows)

  // 연준 유동성 데이터 부착
  let fedLatest: number | null = null
  if (p.scoreUseFedLiquidity) {
    const fedBars = await fetchFedLiquidity(p.startDate, p.endDate, p.fedLiquidityMAPeriod)
    attachFedData(rows, fedBars)
    const lastWithFed = [...rows].reverse().find(r => r.fed_net_liquidity != null)
    fedLatest = lastWithFed?.fed_net_liquidity ?? null
  }

  // MTF: 서브 인터벌일 때만 일봉 추세 맵 별도 fetch
  const dailyMap = (p.useDailyTrend && p.interval !== '1d')
    ? await buildDailyTrendMap(p.symbol, startMs, endMs)
    : null

  const result = simulate(rows, p, dailyMap)
  result.fed_latest_net_liquidity = fedLatest
  return result
}
