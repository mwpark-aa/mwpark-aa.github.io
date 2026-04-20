-- ============================================================
-- Paper Trading Setup — backtest_runs 기반 페이퍼 트레이딩
-- Supabase SQL Editor에서 실행
-- ============================================================

-- ── backtest_runs 컬럼 추가 ──────────────────────────────────

-- 이력 저장 시 현재 코드가 쓰는 컬럼 중 SQL 원본에 없는 것들
ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS name               text,
  ADD COLUMN IF NOT EXISTS score_use_bb       boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS score_exit_threshold numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tpsl_mode          text     DEFAULT 'fixed';

-- 페이퍼 트레이딩 활성화 플래그 (단 하나만 true 허용)
ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS paper_trading_enabled boolean DEFAULT false;

-- ── paper_positions 컬럼 추가 ────────────────────────────────

ALTER TABLE paper_positions
  ADD COLUMN IF NOT EXISTS backtest_run_id  uuid REFERENCES backtest_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signal_details   text,
  ADD COLUMN IF NOT EXISTS exit_details     text,
  ADD COLUMN IF NOT EXISTS entry_row        jsonb,
  ADD COLUMN IF NOT EXISTS last_candle_ts   timestamptz;  -- 마지막으로 체크한 캔들 시각

-- ── paper_account: 마지막 처리 캔들 추적 ─────────────────────

ALTER TABLE paper_account
  ADD COLUMN IF NOT EXISTS last_processed_ts timestamptz;

-- ── 유니크 제약: paper_trading_enabled = true 는 한 건만 ──────
-- (DB 제약 대신 앱/함수 레벨에서 enforce)

-- ── 크론 설정 (pg_cron + pg_net 필요) ────────────────────────
-- Supabase 대시보드 > Database > Extensions 에서
--   pg_cron, pg_net 활성화 후 아래 실행

/*
SELECT cron.schedule(
  'paper-trade-15m',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/paper-trade',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
*/

-- app.supabase_url / app.supabase_anon_key 를 직접 입력하는 버전:
-- SELECT cron.schedule(
--   'paper-trade-15m',
--   '*/15 * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/paper-trade',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );
