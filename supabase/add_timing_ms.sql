-- live_positions 에 실행 타이밍 기록 컬럼 추가
ALTER TABLE live_positions
  ADD COLUMN IF NOT EXISTS timing_ms JSONB;