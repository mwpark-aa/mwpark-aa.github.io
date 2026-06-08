-- ============================================================
-- Live Trading Schema 개편 + RLS 설정
--
-- 변경 내용:
--   1. live_account (글로벌 단일 row) 삭제
--   2. backtest_runs에 api_key_id 추가
--   3. live_accounts를 api_key_id 기준으로 재편
--   4. live_positions에 api_key_id 추가
--   5. get_binance_keys() 함수 교체
--   6. RLS 정책 설정
--
-- 실행 순서대로 Supabase SQL Editor에서 실행
-- ============================================================


-- ── 1. 기존 live_account (글로벌 단일 row) 삭제 ──────────────

DROP TABLE IF EXISTS live_account;


-- ── 2. backtest_runs: api_key_id 추가 ────────────────────────

ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS api_key_id uuid REFERENCES user_api_keys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_backtest_runs_api_key_id ON backtest_runs(api_key_id);


-- ── 3. live_positions: api_key_id 추가 ───────────────────────

ALTER TABLE live_positions
  ADD COLUMN IF NOT EXISTS api_key_id uuid REFERENCES user_api_keys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_live_positions_api_key_id ON live_positions(api_key_id);


-- ── 4. live_accounts: UNIQUE(user_id) → UNIQUE(api_key_id), is_testnet 추가 ──
-- user_id는 소유자 식별용으로 유지, api_key_id가 파티션 키

ALTER TABLE live_accounts
  ADD COLUMN IF NOT EXISTS api_key_id uuid;

ALTER TABLE live_accounts
  ADD COLUMN IF NOT EXISTS is_testnet boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'live_accounts_api_key_id_fkey'
      AND table_name = 'live_accounts'
  ) THEN
    ALTER TABLE live_accounts
      ADD CONSTRAINT live_accounts_api_key_id_fkey
      FOREIGN KEY (api_key_id) REFERENCES user_api_keys(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 기존 UNIQUE(user_id) 제약 제거
ALTER TABLE live_accounts
  DROP CONSTRAINT IF EXISTS live_accounts_user_id_key;

-- api_key_id 기준으로 UNIQUE 재설정 (키 하나당 잔액 1개)
ALTER TABLE live_accounts
  DROP CONSTRAINT IF EXISTS live_accounts_api_key_id_key;
ALTER TABLE live_accounts
  ADD CONSTRAINT live_accounts_api_key_id_key UNIQUE (api_key_id);

CREATE INDEX IF NOT EXISTS idx_live_accounts_api_key_id ON live_accounts(api_key_id);


-- ── 5. get_binance_keys() 함수 교체 ──────────────────────────
-- 기존: user_id + label='default'
-- 변경: api_key_id 직접 조회

DROP FUNCTION IF EXISTS get_binance_keys(uuid);

CREATE OR REPLACE FUNCTION get_binance_keys(p_api_key_id uuid)
RETURNS TABLE(api_key text, api_secret text, is_testnet boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT k.api_key, k.api_secret, k.is_testnet
  FROM user_api_keys k
  WHERE k.id = p_api_key_id;
END;
$$;


-- ── 6. RLS 설정 ───────────────────────────────────────────────

-- ── 6-1. backtest_runs ──────────────────────────────────────
-- SELECT·INSERT: 누구나 (backtest는 공개)
-- UPDATE·DELETE: 소유자만 (user_id IS NULL = 기존 row 호환)

ALTER TABLE backtest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "br_select_all"   ON backtest_runs;
DROP POLICY IF EXISTS "br_insert_all"   ON backtest_runs;
DROP POLICY IF EXISTS "br_update_owner" ON backtest_runs;
DROP POLICY IF EXISTS "br_delete_owner" ON backtest_runs;

CREATE POLICY "br_select_all"   ON backtest_runs FOR SELECT USING (true);
CREATE POLICY "br_insert_all"   ON backtest_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "br_update_owner" ON backtest_runs FOR UPDATE
  USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "br_delete_owner" ON backtest_runs FOR DELETE
  USING (user_id IS NULL OR user_id = auth.uid());


-- ── 6-2. live_positions ─────────────────────────────────────
-- SELECT: 누구나 (공개 조회)
-- INSERT·UPDATE: service role (edge function) — 정책 없음 = anon 불가
-- DELETE: 소유자만 (거래 취소)

ALTER TABLE live_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lp_select_all"   ON live_positions;
DROP POLICY IF EXISTS "lp_delete_owner" ON live_positions;

CREATE POLICY "lp_select_all"   ON live_positions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lp_delete_owner" ON live_positions FOR DELETE
  USING (user_id IS NULL OR user_id = auth.uid());


-- ── 6-3. live_accounts ──────────────────────────────────────
-- SELECT: 누구나 (공개 조회)
-- INSERT·UPDATE·DELETE: 소유자만

DROP POLICY IF EXISTS "own_all"        ON live_accounts;
DROP POLICY IF EXISTS "la_select_all"  ON live_accounts;
DROP POLICY IF EXISTS "la_insert_owner" ON live_accounts;
DROP POLICY IF EXISTS "la_update_owner" ON live_accounts;
DROP POLICY IF EXISTS "la_delete_owner" ON live_accounts;

CREATE POLICY "la_select_all"   ON live_accounts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "la_insert_owner" ON live_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "la_update_owner" ON live_accounts FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "la_delete_owner" ON live_accounts FOR DELETE
  USING (auth.uid() = user_id);


-- ── 6-4. user_api_keys ──────────────────────────────────────
-- 기존 own_* 정책 유지 — 변경 없음
-- SELECT·INSERT·UPDATE·DELETE: auth.uid() = user_id