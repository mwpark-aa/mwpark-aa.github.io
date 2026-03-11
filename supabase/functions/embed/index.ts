import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Pipeline } from 'https://esm.sh/@supabase/ai@1.3.4/deno/index.js'

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
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const pipe = new Pipeline('feature-extraction', 'Supabase/gte-small')
    const output = await pipe(text, { pooling: 'mean', normalize: true })
    const embedding = Array.from(output.data as Float32Array)

    return new Response(
      JSON.stringify({ embedding }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('embed function error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
