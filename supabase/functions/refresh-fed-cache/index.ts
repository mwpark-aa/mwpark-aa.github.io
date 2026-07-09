// Fed Liquidity Cache 갱신 — 전용 크론 (매시 정각)
// fed_liquidity_cache.net_liquidity 를 최신 상태로 유지하는 유일한 쓰기 주체.
// live-trade, 백테스트는 이 테이블을 읽기만 하고 각자의 fed_liquidity_ma_period 로 state를 계산한다.
//
// 크론 등록 (SQL Editor):
//   select cron.schedule('fed-liquidity-refresh-hourly', '0 * * * *', $$
//     select net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/refresh-fed-cache',
//       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <service-role-key>'),
//       body := '{}'::jsonb
//     );
//   $$);

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { fetchFedBars } from '../_shared/fed.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const FETCH_WINDOW_DAYS = 200 // MA 워밍업 + 여유
const DEFAULT_MA_PERIOD = 13  // state fallback 컬럼 계산용 (실제 판단은 각 소비처가 자기 MA로 재계산)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const fetchStart = new Date(Date.now() - FETCH_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
    const fetchEnd   = new Date().toISOString().slice(0, 10)

    const bars = await fetchFedBars(fetchStart, fetchEnd, DEFAULT_MA_PERIOD)
    if (bars.length === 0) {
      return new Response(JSON.stringify({ ok: true, upserted: 0, message: 'FRED 데이터 없음' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('fed_liquidity_cache')
      .upsert(bars.map(b => ({ date: b.date, net_liquidity: b.nl, state: b.state, updated_at: now })), { onConflict: 'date' })
    if (error) throw error

    return new Response(JSON.stringify({ ok: true, upserted: bars.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    console.error('[refresh-fed-cache] 실패:', e)
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})