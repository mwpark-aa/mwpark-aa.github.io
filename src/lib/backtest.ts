// Crypto Backtest — public stub for build/deploy
// Real implementation is kept locally via: git update-index --skip-worktree src/lib/backtest.ts

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BacktestParams {
  symbol: string
  startDate: string
  endDate: string
  interval: string
  leverage: number
  minRR: number
  minRRRatio: number
  rsiOversold: number
  rsiOverbought: number
  minScore: number
  initialCapital: number
  scoreUseADX: boolean
  scoreUseOBV: boolean
  scoreUseMFI: boolean
  scoreUseMACD: boolean
  scoreUseStoch: boolean
  scoreUseRSI: boolean
  scoreUseRVOL: boolean
  adxThreshold: number
  mfiThreshold: number
  stochOversold: number
  stochOverbought: number
  rvolThreshold: number
  rvolSkip: number
}

export interface BacktestTrade {
  signal_type: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  exit_price: number
  tp: number
  sl: number
  quantity: number
  capital_used: number
  net_pnl: number
  pnl_pct: number
  exit_reason: string
  score: number
  entry_ts: string
  exit_ts: string
}

export interface BacktestResult {
  symbol: string
  interval: string
  start_date: string
  end_date: string
  initial_capital: number
  final_capital: number
  total_return_pct: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  max_drawdown_pct: number
  sharpe_ratio: number
  profit_factor: number | null
  trade_log: BacktestTrade[]
  equity_curve: number[]
}

// ── Stub implementation ────────────────────────────────────────────────────────

export async function runBacktest(_p: BacktestParams): Promise<BacktestResult> {
  throw new Error('Backtest engine not available in this build.')
}
