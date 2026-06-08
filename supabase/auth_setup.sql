-- ============================================================
-- Auth + Per-User Binance Key Setup
-- Supabase SQL Editor에서 실행
-- ============================================================

-- ── 1. user_api_keys 테이블 ──────────────────────────────────
-- Binance API 키를 유저별 저장 (RLS로 본인만 접근 가능)

CREATE TABLE IF NOT EXISTS user_api_keys (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       text        NOT NULL DEFAULT 'default',  -- 키 별칭
  api_key     text        NOT NULL,                    -- pgp_sym_encrypt 암호화값
  api_secret  text        NOT NULL,                    -- pgp_sym_encrypt 암호화값
  is_testnet  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, label)
);

-- 본인 row만 읽기/쓰기
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select" ON user_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON user_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON user_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_delete" ON user_api_keys FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);


-- ── 2. backtest_runs: user_id 추가 ───────────────────────────
-- live_trading_enabled = true 인 row의 소유자 식별용
ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_backtest_runs_user_id ON backtest_runs(user_id);


-- ── 3. live_positions: user_id 추가 ──────────────────────────
ALTER TABLE live_positions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_live_positions_user_id ON live_positions(user_id);


-- ── 4. live_account → live_accounts (per-user) ───────────────
-- 기존 단일 row live_account는 그대로 두고, 유저별 테이블 신설
CREATE TABLE IF NOT EXISTS live_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance             numeric,
  initial_balance     numeric,
  updated_at          timestamptz,
  last_processed_ts   timestamptz,
  UNIQUE(user_id)
);

ALTER TABLE live_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_all" ON live_accounts FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_live_accounts_user_id ON live_accounts(user_id);


-- ── 5. get_binance_keys 함수 (live_trading_rls.sql에서 최신 버전으로 교체됨) ──
-- live_trading_rls.sql 실행 시 api_key_id 기반으로 재정의됨