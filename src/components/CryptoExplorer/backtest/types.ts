import type { UTCTimestamp } from 'lightweight-charts'
import type { BacktestParams as LibBacktestParams } from '../../../lib/backtest'

export type BacktestParams = Omit<LibBacktestParams, 'symbol'>

export interface BacktestResult {
  symbol: string
  interval: string
  start_date: string
  end_date: string
  initial_capital: number
  final_capital: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  total_return_pct: number
  max_drawdown_pct: number
  sharpe_ratio: number
  profit_factor: number | null
  trade_log: any[]
  equity_curve: number[]
  fed_latest_net_liquidity?: number | null
}

export interface AddEntry {
  step: number
  price: number
  qty: number
  capital_used: number
  ts: string
}

export interface BacktestTrade {
  id: string
  signal_type: string
  signal_details: string
  exit_details?: string
  direction: 'LONG' | 'SHORT'
  entry_ts: string
  exit_ts: string
  entry_price: number
  avg_entry_price: number | null
  exit_price: number
  tp: number | null
  sl: number | null
  gross_pnl: number | null
  commission: number | null
  net_pnl: number
  pnl_pct: number
  exit_reason: string
  entry_count: number | null
  add_count: number | null
  add_entries: any
  score?: number
  capital_used: number
}

export interface OHLCVCandle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}

export interface RunHistory {
  id: string
  created_at: string
  name?: string
  symbol: string
  interval: string
  start_date: string
  end_date: string
  leverage: number
  min_rr: number
  rsi_oversold: number
  rsi_overbought: number
  min_score: number
  initial_capital: number
  score_use_adx: boolean
  score_use_rsi: boolean
  score_use_macd: boolean
  score_use_rvol: boolean
  adx_threshold: number
  rvol_threshold: number
  rvol_skip: number
  total_return_pct: number
  win_rate: number
  max_drawdown_pct: number
  sharpe_ratio: number
  total_trades: number
}
