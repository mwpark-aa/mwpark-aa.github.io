-- ============================================================
-- Binance API Key 암호화 저장 RPC
-- 프론트엔드에서 supabase.rpc('upsert_api_key', {...}) 로 호출
-- Supabase SQL Editor에서 실행
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_api_key(
  p_label      text,
  p_api_key    text,
  p_api_secret text,
  p_is_testnet boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- 같은 api_key가 다른 라벨로 이미 등록된 경우 차단
  IF EXISTS (
    SELECT 1 FROM user_api_keys
    WHERE user_id = auth.uid()
      AND api_key  = p_api_key
      AND label   <> p_label
  ) THEN
    RAISE EXCEPTION '이미 등록된 API Key입니다 (다른 이름으로 등록되어 있습니다)';
  END IF;

  INSERT INTO user_api_keys (user_id, label, api_key, api_secret, is_testnet)
  VALUES (auth.uid(), p_label, p_api_key, p_api_secret, p_is_testnet)
  ON CONFLICT (user_id, label)
  DO UPDATE SET
    api_key    = p_api_key,
    api_secret = p_api_secret,
    is_testnet = p_is_testnet,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;