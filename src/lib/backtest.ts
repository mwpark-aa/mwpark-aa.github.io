// Crypto Backtest — public API entry point
// Real implementation. git update-index --skip-worktree keeps this local.

export type { BacktestParams, BacktestResult, BacktestTrade } from './backtest/types'

import type { BacktestParams, BacktestResult } from './backtest/types'
import { WARMUP_CANDLES } from './backtest/types'
import { fetchKlines, fetchFedLiquidity, attachFedData, buildDailyTrendMap } from './backtest/fetch'
import { computeIndicators } from './backtest/indicators'
import { simulate } from './backtest/simulate'

export async function runBacktest(p: BacktestParams): Promise<BacktestResult> {
  // YYYY-MM-DDTHH:MM (datetime-local) → 로컬 시각 그대로 사용
  // YYYY-MM-DD (legacy) → UTC 자정 -9h = KST 00:00
  const startMs = p.startDate.includes('T')
    ? new Date(p.startDate).getTime()
    : new Date(p.startDate).getTime() - 9 * 3_600_000
  const endMs = p.endDate.includes('T')
    ? new Date(p.endDate).getTime()
    : new Date(p.endDate).getTime() + 15 * 3_600_000

  // RVOL168 계산용 워밍업 구간 추가
  const msPerCandle =
    p.interval === '1d'  ? 86400000 :
    p.interval === '4h'  ? 4 * 3600000 :
    p.interval === '1h'  ? 3600000 :
    p.interval === '30m' ? 30 * 60000 :
    p.interval === '15m' ? 15 * 60000 :
    p.interval === '5m'  ? 5 * 60000 :
                           3600000
  const warmupMs = WARMUP_CANDLES * msPerCandle

  const rows = await fetchKlines(p.symbol, p.interval, startMs - warmupMs, endMs)
  if (rows.length < 200) throw new Error('데이터 부족: 날짜 범위를 넓혀주세요.')

  computeIndicators(rows)

  // 연준 유동성 데이터 부착
  let fedLatest: number | null = null
  if (p.scoreUseFedLiquidity) {
    // FRED 주간 데이터(WALCL)는 목요일 업데이트 → startDate가 월요일이면 직전 목요일 데이터가
    // fed-liquidity 필터에서 제외됨. 14일 여유를 두어 항상 최근 데이터가 포함되도록 함.
    const fedStartStr = new Date(startMs - 14 * 86_400_000).toISOString().slice(0, 10)
    const fedBars = await fetchFedLiquidity(fedStartStr, p.endDate, p.fedLiquidityMAPeriod)
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
