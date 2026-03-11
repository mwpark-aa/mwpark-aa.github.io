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
  similarity: number
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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const limit = Math.min(parseInt(limitParam ?? '20', 10) || 20, 50)
    const threshold = parseFloat(thresholdParam ?? '0.65') || 0.65

    // 1. 임베딩 생성 — 외부 HTTP 없이 직접 인라인
    // deno-lint-ignore no-explicit-any
    const session = new (globalThis as any).Supabase.ai.Session('gte-small')
    const output = await session.run(q.trim(), { mean_pool: true, normalize: true })
    const embedding = Array.from(output as Float32Array)

    if (!embedding || embedding.length === 0) {
      console.error('embed returned empty vector')
      return new Response(
        JSON.stringify({ error: '임베딩 생성 실패 (빈 벡터)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`embedding dim=${embedding.length}, threshold=${threshold}, limit=${limit}`)

    // 2. pgvector 유사도 검색
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // pgvector는 '[x1,x2,...]' 문자열 형식으로 받아야 타입 변환이 정상 동작
    const embeddingStr = `[${embedding.join(',')}]`

    const { data, error } = await supabase.rpc('search_feed_items', {
      query_embedding: embeddingStr,
      match_threshold: threshold,
      match_count: limit,
      filter_category: category,
    })

    if (error) {
      console.error('search_feed_items RPC error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const rows = (data as SearchRpcRow[]) ?? []
    console.log(`search returned ${rows.length} results (top similarity: ${rows[0]?.similarity ?? 'n/a'})`)

    const items: FeedItem[] = rows.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      summary: row.summary,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      collectedAt: row.collected_at,
      similarity: Math.round(row.similarity * 1000) / 1000,
    }))

    return new Response(
      JSON.stringify({ items, query: q, count: items.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('search function error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
