-- ============================================================
-- Live Trading 리팩토링
-- "누가 켰나"를 backtest_runs가 아닌 user_api_keys에서 관리
--
-- 변경 내용:
--   1. user_api_keys에 active_run_id 추가
--   2. backtest_runs에서 live_trading_enabled, api_key_id 제거
-- ============================================================

-- ── 1. user_api_keys에 active_run_id 추가 ────────────────────

ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS active_run_id uuid REFERENCES backtest_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_api_keys_active_run_id ON user_api_keys(active_run_id);


-- ── 2. backtest_runs에서 live 관련 컬럼 제거 (이미 제거됐으면 무시) ──

ALTER TABLE backtest_runs DROP COLUMN IF EXISTS live_trading_enabled;
ALTER TABLE backtest_runs DROP COLUMN IF EXISTS api_key_id;


-- ── 4. backtest_runs에서 user_id 제거 ────────────────────────
-- 소유권은 user_api_keys.user_id 로 관리

-- RLS 정책 교체: user_id 대신 user_api_keys 통해 소유자 확인
DROP POLICY IF EXISTS "br_update_owner" ON backtest_runs;
DROP POLICY IF EXISTS "br_delete_owner" ON backtest_runs;

CREATE POLICY "br_update_owner" ON backtest_runs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_api_keys
      WHERE user_id = auth.uid()
        AND active_run_id = backtest_runs.id
    )
  );

CREATE POLICY "br_delete_owner" ON backtest_runs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_api_keys
      WHERE user_id = auth.uid()
        AND active_run_id = backtest_runs.id
    )
  );

ALTER TABLE backtest_runs DROP COLUMN IF EXISTS user_id;
