-- fed_liquidity_cache: state(계산값) → net_liquidity(원시값) 으로 전환
-- state는 런타임에 현재 maPeriod로 동적 계산하므로 캐시 불필요

ALTER TABLE fed_liquidity_cache
  ADD COLUMN IF NOT EXISTS net_liquidity DOUBLE PRECISION;

-- 기존 state 컬럼은 nullable로 변경 (이후 완전 제거 가능)
ALTER TABLE fed_liquidity_cache
  ALTER COLUMN state DROP NOT NULL;

-- 기존 캐시 행 초기화 — net_liquidity 없이 state만 있는 구 데이터는 무효
-- 다음 live-trade 실행 시 FRED에서 자동으로 재fetch됨
TRUNCATE TABLE fed_liquidity_cache;