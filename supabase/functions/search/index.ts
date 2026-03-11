import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FeedItem {
  id: string
  category: string
  title: string
  summary: string[]
  sourceUrl: string
  sourceName: string
  collectedAt: string
}

interface SearchRpcRow {
  id: string
  category: string
  title: string
  summary: string[]
  source_url: string
  source_name: string
  collected_at: string
  similarity: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const q = url.searchParams.get('q')
    const category = url.searchParams.get('category') ?? null
    const limitParam = url.searchParams.get('limit')
    const thresholdParam = url.searchParams.get('threshold')

    if (!q || q.trim() === '') {
      return new Response(
        JSON.stringify({ error: '검색어(q)가 필요합니다.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const limit = Math.min(parseInt(limitParam ?? '20', 10) || 20, 50)
    const threshold = parseFloat(thresholdParam ?? '0.5') || 0.5

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. 쿼리 텍스트 임베딩 생성
    const embedRes = await fetch(
      `${SUPABASE_URL}/functions/v1/embed`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ text: q }),
        signal: AbortSignal.timeout(30_000),
      },
    )

    if (!embedRes.ok) {
      const errText = await embedRes.text()
      console.error(`embed function error (${embedRes.status}):`, errText)
      return new Response(
        JSON.stringify({ error: '임베딩 생성에 실패했습니다.' }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const { embedding } = await embedRes.json() as { embedding: number[] }

    // 2. Postgres RPC 호출로 유사 항목 검색
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data, error } = await supabase.rpc('search_feed_items', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
      filter_category: category,
    })

    if (error) {
      console.error('search_feed_items RPC error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 3. snake_case → camelCase 변환
    const items: FeedItem[] = ((data as SearchRpcRow[]) ?? []).map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      summary: row.summary,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      collectedAt: row.collected_at,
    }))

    return new Response(
      JSON.stringify({ items, query: q }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('search function error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
