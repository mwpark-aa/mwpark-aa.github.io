-- ============================================================
-- Live Trading Setup — 실제 바이낸스 선물 거래
-- Supabase SQL Editor에서 실행
-- ============================================================

-- ── backtest_runs: 실거래 활성화 플래그 ─────────────────────

ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS live_trading_enabled boolean DEFAULT false;

-- ── live_positions 테이블 ────────────────────────────────────

CREATE TABLE IF NOT EXISTS live_positions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_run_id         uuid        REFERENCES backtest_runs(id) ON DELETE SET NULL,
  symbol                  text        NOT NULL,
  direction               text        NOT NULL,       -- 'LONG' | 'SHORT'
  entry_price             numeric,                    -- 실제 평균 체결가
  avg_entry_price         numeric,
  target_price            numeric,                    -- TP 가격
  stop_loss               numeric,                    -- SL 가격
  quantity                numeric,
  capital_used            numeric,                    -- 사용한 증거금 (추정)
  entry_time              timestamptz,
  exit_price              numeric,
  exit_time               timestamptz,
  exit_reason             text,                       -- 'TP' | 'SL' | 'LIQUIDATED' | 'MANUAL'
  net_pnl                 numeric,
  pnl_pct                 numeric,
  status                  text        DEFAULT 'OPEN', -- 'OPEN' | 'CLOSED'
  score                   numeric,
  signal_details          text,
  exit_details            text,
  -- 바이낸스 주문 ID 추적
  binance_entry_order_id  text,
  binance_tp_order_id     text,
  binance_sl_order_id     text,
  entry_row               jsonb,
  last_candle_ts          timestamptz,
  created_at              timestamptz DEFAULT now()
);

-- ── live_account 테이블 ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS live_account (
  id                  int  PRIMARY KEY DEFAULT 1,
  balance             numeric,                        -- 현재 USDT 잔액 (바이낸스에서 fetch)
  initial_balance     numeric,                        -- 활성화 시점 잔액 (수익률 기준)
  updated_at          timestamptz,
  last_processed_ts   timestamptz
);

-- ── RLS 비활성화 (service role key로만 접근) ──────────────────

ALTER TABLE live_positions DISABLE ROW LEVEL SECURITY;
ALTER TABLE live_account   DISABLE ROW LEVEL SECURITY;

-- ── 인덱스 ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_live_positions_status          ON live_positions(status);
CREATE INDEX IF NOT EXISTS idx_live_positions_backtest_run_id ON live_positions(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_live_positions_entry_time      ON live_positions(entry_time DESC);

-- ── 크론 설정 예시 (pg_cron + pg_net 필요) ──────────────────
-- backtest_runs의 interval에 맞춰 호출 간격 조정 필요.
-- 예: 15분봉 → '*/15 * * * *'

/*
SELECT cron.schedule(
  'live-trade-15m',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/live-trade',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
*/