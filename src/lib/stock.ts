import { computeIndicators } from './backtest/indicators'
import { simulate } from './backtest/simulate'
import { scoreLong, scoreShort, calcTPSL, buildSignalDetails } from './backtest/scoring'
import type { BacktestParams, BacktestResult, Candle } from './backtest/types'
import { WARMUP_CANDLES } from './backtest/types'

export const STOCK_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'META', 'GOOG', 'AMZN', 'AMD', 'SPY', 'QQQ'] as const
export const STOCK_INTERVALS = ['1d', '1wk'] as const
export type StockSymbol = typeof STOCK_SYMBOLS[number]
export type StockInterval = typeof STOCK_INTERVALS[number]

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export async function fetchStockKlines(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<Candle[]> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/stock-klines`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ symbol, interval, startMs, endMs }),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
    throw new Error(body.error ?? `HTTP ${resp.status}`)
  }
  const { candles } = await resp.json()
  return candles as Candle[]
}

export async function runStockBacktest(
  p: BacktestParams,
): Promise<{ result: BacktestResult; rows: Candle[]; startMs: number }> {
  const startMs = new Date(p.startDate).getTime()
  const endMs   = new Date(p.endDate).getTime()
  const msPerCandle = p.interval === '1wk' ? 7 * 86_400_000 : 86_400_000
  const warmupMs = WARMUP_CANDLES * msPerCandle

  const rows = await fetchStockKlines(p.symbol, p.interval, startMs - warmupMs, endMs)
  if (rows.length < 50) throw new Error('데이터 부족: 날짜 범위를 넓혀주세요.')

  computeIndicators(rows)
  const result = simulate(rows, { ...p, leverage: 1, scoreUseFedLiquidity: false }, null)
  return { result, rows, startMs }
}

// ── 페이퍼 트레이딩용 최신 신호 감지 ────────────────────────────

export interface StockSignal {
  direction: 'LONG' | 'SHORT'
  score: number
  entryPrice: number
  tp: number | null
  sl: number | null
  signalDetails: string
  ts: string
}

export async function detectLatestSignal(
  symbol: string,
  p: BacktestParams,
): Promise<{ signal: StockSignal | null; rows: Candle[] }> {
  const endMs   = Date.now()
  const msPerCandle = p.interval === '1wk' ? 7 * 86_400_000 : 86_400_000
  const warmupMs = WARMUP_CANDLES * msPerCandle
  const startMs = endMs - warmupMs - 30 * msPerCandle

  const rows = await fetchStockKlines(symbol, p.interval, startMs, endMs)
  if (rows.length < 50) return { signal: null, rows }

  computeIndicators(rows)

  // 마지막 완성 캔들 (last-1 is safer, but daily close = complete candle)
  const row = rows[rows.length - 1]!
  const prev = rows[rows.length - 2]

  const longScore  = scoreLong(row, p)
  const shortScore = scoreShort(row, p)

  let signal: StockSignal | null = null

  if (longScore >= p.minScore && (!prev || scoreLong(prev, p) < p.minScore)) {
    const { tp, sl, rr } = calcTPSL('LONG', row.close, p)
    signal = {
      direction: 'LONG',
      score: longScore,
      entryPrice: row.close,
      tp,
      sl,
      signalDetails: buildSignalDetails('LONG', row, longScore, rr, p),
      ts: new Date(row.timestamp).toISOString(),
    }
  } else if (shortScore >= p.minScore && (!prev || scoreShort(prev, p) < p.minScore)) {
    const { tp, sl, rr } = calcTPSL('SHORT', row.close, p)
    signal = {
      direction: 'SHORT',
      score: shortScore,
      entryPrice: row.close,
      tp,
      sl,
      signalDetails: buildSignalDetails('SHORT', row, shortScore, rr, p),
      ts: new Date(row.timestamp).toISOString(),
    }
  }

  return { signal, rows }
}