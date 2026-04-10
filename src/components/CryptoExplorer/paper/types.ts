// ── 타입 ─────────────────────────────────────────────────────

export interface ActiveConfig {
  id: string
  name?: string
  symbol: string
  interval: string
  leverage: number
  min_score: number
  rsi_oversold: number
  rsi_overbought: number
  fixed_tp: number
  fixed_sl: number
  initial_capital: number
  score_exit_threshold: number
  adx_threshold: number
  score_use_adx: boolean
  score_use_rsi: boolean
  score_use_macd: boolean
  score_use_bb: boolean
  score_use_golden_cross: boolean
}

export interface PaperAccount {
  capital: number
  initial_capital: number
  updated_at: string | null
  last_processed_ts: string | null
}

export interface PaperPos {
  id: string
  backtest_run_id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  target_price: number | null
  stop_loss: number | null
  quantity: number
  capital_used: number
  entry_time: string
  signal_details?: string | null
  score?: number | null
  status: string
}

export interface ClosedTrade {
  id: string
  backtest_run_id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  exit_price: number
  net_pnl: number
  pnl_pct: number
  exit_reason: string
  entry_time: string
  exit_time: string
  score?: number | null
}

// ── 유틸 ─────────────────────────────────────────────────────

export const fmtPrice = (v: number) =>
  v >= 1000
    ? v.toLocaleString('en', { maximumFractionDigits: 2 })
    : v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 5 })

export const fmtPct = (v: number, sign = true) =>
  `${sign && v >= 0 ? '+' : ''}${v.toFixed(2)}%`

export const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
