import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RawArticleRow {
  id: string
  source_id: string
  source_name: string
  original_title: string
  snippet: string | null
  source_url: string
  crawled_at: string
  processed: boolean
  processed_at: string | null
}

interface GrokResult {
  koreanTitle: string
  summary: string[]
  category: 'AI Trends' | 'Tech Blogs' | 'Hot Deals'
}

// ─── Grok summarization ────────────────────────────────────────────────────

const GROQ_BASE = 'https://api.groq.com/openai/v1'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
async function summarizeWithGrok(
  article: RawArticleRow,
  apiKey: string,
): Promise<GrokResult | null> {
  try {
    const prompt = `
    기사를 분석해서 JSON만 응답 (마크다운 없이):
    제목: ${article.original_title} 
    ${article.snippet ? `내용: ${article.snippet.slice(0, 300)}` : ''}
    {"koreanTitle":"한글제목","summary":["요점1","요점2","요점3"],"category":"AI Trends"|"Tech Blogs"|"Hot Deals"}
    `
    const response = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 1024,
          response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      console.error(
        `Grok API error: ${response.status} ${response.statusText}`,
      )
      return null
    }

    const data = await response.json()
    const raw: string = data?.choices?.[0]?.message?.content ?? ''

    // Strip any accidental markdown code fences
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim()

    const result: GrokResult = JSON.parse(cleaned)

    // Validate shape
    if (
      typeof result.koreanTitle !== 'string' ||
      !Array.isArray(result.summary) ||
      !['AI Trends', 'Tech Blogs', 'Hot Deals'].includes(result.category) ||
      !result.category
    ) {
      console.error('Grok returned unexpected shape:', result)
      return null
    }

    return result
  } catch (err) {
    console.error('summarizeWithGrok error:', err)
    return null
  }
}

// ─── Helper: sleep ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Main handler ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const GROK_API_KEY = Deno.env.get('GROK_API_KEY')!

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let processed = 0
  let inserted = 0
  let skipped = 0

  try {
    // 1. Fetch up to 10 unprocessed raw articles (oldest first)
    const { data: pendingArticles, error: fetchError } = await supabase
      .from('raw_articles')
      .select('*')
      .eq('processed', false)
      .order('crawled_at', { ascending: true })
      .limit(10)

    if (fetchError) {
      throw new Error(`Failed to fetch raw_articles: ${fetchError.message}`)
    }

    const articles: RawArticleRow[] = pendingArticles ?? []

    // 2. Process each article sequentially (no parallel — rate limit protection)
    for (const article of articles) {
      try {
        // a. Check if feed_items already has this source_url (dedup across retries)
        const { data: existingFeedItem } = await supabase
          .from('feed_items')
          .select('id')
          .eq('source_url', article.source_url)
          .maybeSingle()

        if (existingFeedItem) {
          // 이미 feed_items에 존재 — raw_articles에서 삭제
          await supabase
            .from('raw_articles')
            .delete()
            .eq('id', article.id)
          skipped++
          processed++
          await sleep(500)
          continue
        }

        // b. Call Grok
        const result = await summarizeWithGrok(article, GROK_API_KEY)

        if (!result) {
          console.error(
            `Skipping article (no Grok result): ${article.original_title}`,
          )
          skipped++
          await sleep(500)
          continue
        }

        // c. Insert into feed_items
        const { data: insertedRow, error: insertError } = await supabase
          .from('feed_items')
          .insert({
            category: result.category,
            title: result.koreanTitle,
            summary: result.summary,
            source_url: article.source_url,
            source_name: article.source_name,
            collected_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (insertError) {
          console.error(
            `feed_items insert error [${insertError.code}] for ${article.source_url}:`,
            insertError.message,
          )
          skipped++
          await sleep(500)
          continue
        }

        inserted++

        // c-2. 임베딩 생성 및 저장 (실패해도 전체 흐름은 계속)
        try {
          const embedText = `${result.koreanTitle} ${result.summary.join(' ')}`
          const embedRes = await fetch(
            `${SUPABASE_URL}/functions/v1/embed`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ text: embedText }),
              signal: AbortSignal.timeout(30_000),
            },
          )

          if (embedRes.ok) {
            const { embedding } = await embedRes.json() as { embedding: number[] }
            const { error: embedUpdateError } = await supabase
              .from('feed_items')
              .update({ embedding })
              .eq('id', insertedRow.id)

            if (embedUpdateError) {
              console.error(
                `embedding update error for id=${insertedRow.id}:`,
                embedUpdateError.message,
              )
            }
          } else {
            console.error(
              `embed function returned ${embedRes.status} for id=${insertedRow.id}`,
            )
          }
        } catch (embedErr) {
          console.error(`embed call failed for id=${insertedRow.id}:`, embedErr)
        }

        // d. 처리 완료된 raw_articles 행 삭제
        await supabase
          .from('raw_articles')
          .delete()
          .eq('id', article.id)

        processed++
      } catch (articleErr) {
        console.error(
          `Error processing article "${article.original_title}":`,
          articleErr,
        )
        skipped++
      }

      // e. Rate limit guard between Grok calls
      await sleep(500)
    }

    // 3. Count remaining unprocessed articles
    const { count: remaining } = await supabase
      .from('raw_articles')
      .select('id', { count: 'exact', head: true })
      .eq('processed', false)

    return new Response(
      JSON.stringify({
        processed,
        inserted,
        skipped,
        remaining: remaining ?? 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error("summarize function fatal error:", err)
    return new Response(
      JSON.stringify({
        error: String(err),
        processed,
        inserted,
        skipped,
        remaining: null,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
