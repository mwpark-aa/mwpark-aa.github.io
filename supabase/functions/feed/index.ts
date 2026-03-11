import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const category = url.searchParams.get('category')   // optional filter
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const limit = Math.min(parseInt(limitParam ?? '20', 10) || 20, 100)
    const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let query = supabase
      .from('feed_items')
      .select('*', { count: 'exact' })
      .order('collected_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (category && category !== 'All') {
      query = query.eq('category', category)
    }

    const { data, error, count } = await query

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Map snake_case DB columns to camelCase for frontend
    const items = (data ?? []).map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      summary: row.summary,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      collectedAt: row.collected_at,
    }))

    return new Response(JSON.stringify({ items, total: count ?? 0, offset, limit }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('feed function error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
