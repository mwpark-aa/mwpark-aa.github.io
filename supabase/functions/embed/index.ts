import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text } = await req.json() as { text: string }

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'text 필드가 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Supabase Edge Functions 내장 AI — gte-small (384차원, 무료)
    // deno lint: Supabase global is injected at runtime
    // deno-lint-ignore no-explicit-any
    const session = new (globalThis as any).Supabase.ai.Session('gte-small')
    const output = await session.run(text, { mean_pool: true, normalize: true })
    const embedding = Array.from(output as Float32Array)

    return new Response(
      JSON.stringify({ embedding }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('embed function error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
