-- Add score_use_ma120 column and remove use_daily_trend from backtest_runs
-- Run once in Supabase SQL editor

ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS score_use_ma120 boolean NOT NULL DEFAULT true;

-- Migrate existing rows: anyone who had use_daily_trend=true → score_use_ma120=true (already default)
-- This is a no-op since default=true, but kept for clarity.

-- Remove old column if it exists
ALTER TABLE backtest_runs
  DROP COLUMN IF EXISTS use_daily_trend;