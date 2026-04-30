export interface Candle {
  timestamp: number
  open: number; high: number; low: number; close: number; volume: number
  ma20?: number | null; ma60?: number | null; ma120?: number | null
  bb_upper?: number | null; bb_lower?: number | null
  rsi14?: number | null; atr14?: number | null; adx14?: number | null
  mfi14?: number | null; macd_hist?: number | null
  vol_ma20?: number | null; vol_rvol168?: number
  ichimoku_a?: number | null; ichimoku_b?: number | null
  cci20?: number | null; vwma20?: number | null
  swing_low?: number; swing_high?: number
  fed_state?: number | null
}

export interface BaseConfig {
  id: string
  symbol: string
  interval: string
  leverage: number
  rsi_oversold: number
  rsi_overbought: number
  min_score: number
  initial_capital: number
  score_use_adx: boolean
  score_use_rsi: boolean
  score_use_macd: boolean
  score_use_rvol: boolean
  score_use_bb: boolean
  score_use_ichi: boolean
  score_use_golden_cross: boolean
  score_use_fed_liquidity: boolean
  score_use_cci: boolean
  score_use_vwma: boolean
  fed_liquidity_ma_period: number
  cci_oversold: number
  cci_overbought: number
  cci_max_entry: number
  adx_threshold: number
  rvol_threshold: number
  rvol_skip: number
  fixed_tp: number
  fixed_sl: number
  score_exit_threshold: number
  use_daily_trend: boolean
}

export interface SignalResult {
  type: string
  score: number
  swingLow: number
  swingHigh: number
}

export type DailyBar = { close: number; ma120: number | null }