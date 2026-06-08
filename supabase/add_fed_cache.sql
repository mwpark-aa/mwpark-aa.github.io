-- 연준 유동성 캐시 테이블 (주 1회 갱신)
CREATE TABLE IF NOT EXISTS fed_liquidity_cache (
  date        DATE        PRIMARY KEY,
  state       SMALLINT    NOT NULL,   -- 1=확장, -1=수축, 0=혼재
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fed_liquidity_cache DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fed_cache_updated ON fed_liquidity_cache(updated_at DESC);