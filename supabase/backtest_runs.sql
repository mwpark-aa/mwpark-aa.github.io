create table if not exists backtest_runs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),

  -- 파라미터
  symbol          text not null,
  interval        text not null,
  start_date      date not null,
  end_date        date not null,
  leverage        numeric not null,
  min_rr          numeric not null,
  min_rr_ratio    numeric not null,
  rsi_oversold    integer not null,
  rsi_overbought  integer not null,
  min_score       integer not null,
  initial_capital numeric not null,

  -- 연준 유동성 MA 기간
  fed_liquidity_ma_period integer default 13,

  -- 지표 동의 항목
  score_use_adx          boolean default true,
  score_use_obv          boolean default true,
  score_use_mfi          boolean default true,
  score_use_macd         boolean default true,
  score_use_stoch        boolean default true,
  score_use_rsi          boolean default true,
  score_use_rvol         boolean default true,
  score_use_ichi         boolean default false,
  score_use_golden_cross boolean default true,
  score_use_fed_liquidity boolean default false,

  -- 지표 임계값 파라미터
  adx_threshold    numeric default 20,
  mfi_threshold    numeric default 50,
  stoch_oversold   numeric default 20,
  stoch_overbought numeric default 80,
  rvol_threshold   numeric default 1.5,
  rvol_skip        numeric default 0.4,

  -- 고정 TP/SL
  fixed_tp         numeric default 0,
  fixed_sl         numeric default 0,

  -- 기타 옵션
  use_daily_trend  boolean default false,

  -- 결과 요약
  total_return_pct  numeric,
  win_rate          numeric,
  max_drawdown_pct  numeric,
  sharpe_ratio      numeric,
  profit_factor     numeric,
  total_trades      integer
);
