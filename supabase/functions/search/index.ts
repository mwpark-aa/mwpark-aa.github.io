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

    if (!q || q.trim() === '') {
      return new Response(
        JSON.stringify({ error: '검색어(q)가 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const limit = Math.min(parseInt(limitParam ?? '10', 10) || 10, 30)
    const minSimilarity = parseFloat(url.searchParams.get('min_similarity') ?? '0.3') || 0.3

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

    console.log(`embedding dim=${embedding.length}, limit=${limit}`)

    // 2. pgvector 유사도 검색 (top-K, threshold 없음)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data, error } = await supabase.rpc('search_feed_items', {
      query_embedding: embedding,
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

    const allRows = (data as SearchRpcRow[]) ?? []

    // 1. 절대 유사도 필터
    const aboveFloor = allRows.filter((r) => r.similarity >= minSimilarity)

    // 2. 분산 체크 — 상위/하위 차이가 0.08 미만이면 모델이 구분 못하는 것 → 빈 결과 반환
    const spread = aboveFloor.length > 1
      ? aboveFloor[0].similarity - aboveFloor[aboveFloor.length - 1].similarity
      : 1

    const rows = spread >= 0.08 ? aboveFloor : []
    console.log(`top=${allRows[0]?.similarity ?? 'n/a'}, spread=${spread.toFixed(3)}, returned=${rows.length}`)

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
