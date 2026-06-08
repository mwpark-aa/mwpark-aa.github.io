// check-balance — Supabase Edge Function (Deno)
// Deploy: supabase functions deploy check-balance
//
// Body: { api_key_id: string }
// Returns: { balance: number, error?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getBinanceBalance } from '../_shared/binance.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { api_key_id } = await req.json() as { api_key_id: string }
    if (!api_key_id) return new Response(JSON.stringify({ error: 'api_key_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 인증 확인
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    // 본인 소유 키만 조회
    const { data: keyRow, error: keyErr } = await supabase
      .from('user_api_keys')
      .select('api_key, api_secret, is_testnet')
      .eq('id', api_key_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (keyErr || !keyRow) return new Response(JSON.stringify({ error: '키를 찾을 수 없습니다' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    const balance = await getBinanceBalance(keyRow.api_key, keyRow.api_secret, keyRow.is_testnet)
    return new Response(JSON.stringify({ balance }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 200, // 200으로 반환해서 프론트에서 error 필드 체크
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})