// ── 공개 파라미터 ───────────────────────────────────────────────

export interface BacktestParams {
  symbol: string
  startDate: string
  endDate: string
  interval: string
  leverage: number
  minRR: number
  rsiOversold: number
  rsiOverbought: number
  minScore: number
  initialCapital: number

  // 지표 활성화 플래그
  scoreUseADX: boolean
  scoreUseRSI: boolean
  scoreUseMACD: boolean
  scoreUseRVOL: boolean
  scoreUseBB: boolean
  scoreUseIchi: boolean
  scoreUseGoldenCross: boolean
  scoreUseFedLiquidity: boolean

  // 지표 파라미터
  adxThreshold: number
  rvolThreshold: number
  rvolSkip: number
  fedLiquidityMAPeriod: number   // MA 기간 (주 단위, 기본 13 ≈ 3개월)

  // TP/SL
  fixedTP: number                // 고정 익절 % (현물 기준, 0 = ATR 자동)
  fixedSL: number                // 고정 손절 % (현물 기준, 0 = ATR 자동)
  tpslMode: 'auto' | 'fixed'

  // 기타 필터
  useDailyTrend: boolean         // 일봉 MA120 방향과 일치할 때만 진입 (MTF)
  scoreExitThreshold: number     // 점수가 이 값 이하로 떨어지면 청산 (0 = 비활성화)
}

// ── 거래 기록 ────────────────────────────────────────────────────

export interface BacktestTrade {
  signal_type: string
  signal_details: string    // 진입 시 지표 값 요약
  exit_details?: string     // SCORE_EXIT 시 청산 시점 지표 변화
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

// ── 백테스트 결과 ────────────────────────────────────────────────

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
  fed_latest_net_liquidity?: number | null
}

// ── 내부 캔들 타입 ───────────────────────────────────────────────

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number

  // 이동평균
  ma20?: number | null
  ma60?: number | null
  ma120?: number | null

  // 볼린저밴드
  bb_upper?: number | null
  bb_lower?: number | null

  // 지표
  rsi14?: number | null
  atr14?: number | null
  adx14?: number | null
  mfi14?: number | null
  macd_hist?: number | null

  // 거래량
  vol_ma20?: number | null
  vol_rvol168?: number

  // 일목균형표
  ichimoku_a?: number | null
  ichimoku_b?: number | null

  // 스윙 고저
  swing_low?: number
  swing_high?: number

  // 연준 유동성 (대차대조표 - TGA - 역레포)
  fed_net_liquidity?: number | null
  fed_state?: number | null    // 1=확장, -1=수축, 0=혼재
}

// ── Fed 유동성 데이터 ────────────────────────────────────────────

export interface FedBar {
  date: string
  netLiquidity: number
  ma: number | null
  state: number
}

// ── 일봉 추세 (MTF용) ────────────────────────────────────────────

export interface DailyBar {
  close: number
  ma120: number | null
  ichimoku_a: number | null
  ichimoku_b: number | null
}

// ── 상수 ─────────────────────────────────────────────────────────

export const COMMISSION         = 0.001   // 바이낸스 선물 기본 수수료율 (0.1%)
export const MAX_CAPITAL_PCT    = 0.20    // 포지션 1개당 최대 자본 비율
export const RISK_PER_TRADE     = 0.04   // 거래당 감수 최대 손실 비율
export const SWING_LOOKBACK     = 4      // 스윙 고저 탐색 범위 (캔들 수)
export const SIGNAL_COOLDOWN    = 4      // 동일 신호 재발생 억제 기간 (캔들 수)
export const DAILY_LOSS_LIMIT_PCT = 0.06 // 하루 최대 손실 한도 (초과 시 당일 거래 중단)
export const WARMUP_CANDLES     = 168    // RVOL168 계산을 위한 워밍업 캔들 수
