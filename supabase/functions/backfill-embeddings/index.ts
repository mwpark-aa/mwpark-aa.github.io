import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // URL 파라미터로 한 번에 처리할 개수 조정 (기본 20, 최대 50)
  const url = new URL(req.url)
  const limitParam = url.searchParams.get('limit')
  const batchSize = Math.min(parseInt(limitParam ?? '20', 10) || 20, 50)

  let processed = 0
  let failed = 0

  try {
    // embedding이 null인 항목 조회
    const { data: rows, error: fetchError } = await supabase
      .from('feed_items')
      .select('id, title, summary')
      .is('embedding', null)
      .order('collected_at', { ascending: false })
      .limit(batchSize)

    if (fetchError) throw new Error(`fetch error: ${fetchError.message}`)

    const items = rows ?? []

    for (const item of items) {
      try {
        const text = `${item.title} ${(item.summary as string[]).join(' ')}`

        const embedRes = await fetch(
          `${SUPABASE_URL}/functions/v1/embed`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(30_000),
          },
        )

        if (!embedRes.ok) {
          console.error(`embed failed (${embedRes.status}) for id=${item.id}`)
          failed++
          await sleep(300)
          continue
        }

        const { embedding } = await embedRes.json() as { embedding: number[] }

        const { error: updateError } = await supabase
          .from('feed_items')
          .update({ embedding })
          .eq('id', item.id)

        if (updateError) {
          console.error(`update failed for id=${item.id}:`, updateError.message)
          failed++
        } else {
          processed++
        }
      } catch (err) {
        console.error(`error for id=${item.id}:`, err)
        failed++
      }

      await sleep(200)
    }

    // 남은 null 개수 확인
    const { count: remaining } = await supabase
      .from('feed_items')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null)

    return new Response(
      JSON.stringify({ processed, failed, remaining: remaining ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('backfill-embeddings error:', err)
    return new Response(
      JSON.stringify({ error: String(err), processed, failed }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
