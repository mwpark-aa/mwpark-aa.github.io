import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RawArticle {
  sourceId: string
  sourceName: string
  originalTitle: string
  snippet: string
  sourceUrl: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// ─── Crawlers ──────────────────────────────────────────────────────────────

async function crawlHackerNews(): Promise<RawArticle[]> {
  const articles: RawArticle[] = []
  try {
    const idsRes = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
    )
    if (!idsRes.ok) throw new Error(`HN topstories: ${idsRes.status}`)
    const ids: number[] = await idsRes.json()

    const top15 = ids.slice(0, 15)
    const items = await Promise.all(
      top15.map(async (id) => {
        try {
          const itemRes = await fetch(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          )
          if (!itemRes.ok) return null
          return await itemRes.json()
        } catch {
          return null
        }
      }),
    )

    for (const item of items) {
      if (!item || item.type !== 'story') continue
      if ((item.score ?? 0) <= 50) continue
      if (!item.title || !item.url) continue

      const snippet = item.text
        ? stripHtml(item.text).slice(0, 400)
        : ''

      articles.push({
        sourceId: 'hacker-news',
        sourceName: 'Hacker News',
        originalTitle: item.title,
        snippet,
        sourceUrl: item.url,
      })
    }
  } catch (err) {
    console.error("crawlHackerNews error:", err)
  }
  return articles
}

async function crawlTechCrunch(): Promise<RawArticle[]> {
  const articles: RawArticle[] = []
  try {
    const res = await fetch("https://techcrunch.com/feed/", {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedBot/1.0)' },
    })
    if (!res.ok) throw new Error(`TechCrunch feed: ${res.status}`)
    const xml = await res.text()

    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match: RegExpExecArray | null
    let count = 0

    while ((match = itemRegex.exec(xml)) !== null && count < 8) {
      const block = match[1]

      const titleMatch =
        block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ??
        block.match(/<title>([\s\S]*?)<\/title>/)
      const linkMatch =
        block.match(/<link>([\s\S]*?)<\/link>/) ??
        block.match(/<link\s[^>]*href="([^"]+)"/)
      const descMatch =
        block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ??
        block.match(/<description>([\s\S]*?)<\/description>/)

      const title = titleMatch?.[1]?.trim()
      const url = linkMatch?.[1]?.trim()
      const snippet = descMatch?.[1]
        ? unescapeHtml(stripHtml(descMatch[1])).trim().slice(0, 400)
        : ''

      if (title && url) {
        articles.push({
          sourceId: 'techcrunch',
          sourceName: 'TechCrunch',
          originalTitle: title,
          snippet,
          sourceUrl: url,
        })
        count++
      }
    }
  } catch (err) {
    console.error("crawlTechCrunch error:", err)
  }
  return articles
}

async function crawlRedditML(): Promise<RawArticle[]> {
  const articles: RawArticle[] = []
  try {
    const res = await fetch(
      "https://www.reddit.com/r/MachineLearning/top.json?limit=15&t=day",
      {
        headers: {
          'User-Agent': 'grok-intelligence-bot/1.0',
        },
      },
    )
    if (!res.ok) throw new Error(`Reddit ML: ${res.status}`)
    const json = await res.json()
    const children = json?.data?.children ?? []

    for (const child of children) {
      const post = child?.data
      if (!post) continue
      if ((post.score ?? 0) < 100) continue

      const url = post.url?.startsWith('http')
        ? post.url
        : `https://www.reddit.com${post.permalink}`

      const snippet = post.selftext
        ? post.selftext.slice(0, 400)
        : ''

      articles.push({
        sourceId: 'reddit-ml',
        sourceName: 'Reddit r/MachineLearning',
        originalTitle: post.title,
        snippet,
        sourceUrl: url,
      })
    }
  } catch (err) {
    console.error("crawlRedditML error:", err)
  }
  return articles
}

// ─── Main handler ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let crawled = 0
  let inserted = 0
  let skipped = 0

  try {
    // 1. Crawl all sources in parallel (no Grok calls here)
    const [hnArticles, tcArticles, redditArticles] = await Promise.all([
      crawlHackerNews(),
      crawlTechCrunch(),
      crawlRedditML(),
    ])

    const allArticles: RawArticle[] = [
      ...hnArticles,
      ...tcArticles,
      ...redditArticles,
    ]
    crawled = allArticles.length

    // 2. Insert into raw_articles, skip duplicates
    for (const article of allArticles) {
      try {
        // Dedup check via source_url unique constraint
        const { data: existing } = await supabase
          .from('raw_articles')
          .select('id')
          .eq('source_url', article.sourceUrl)
          .maybeSingle()

        if (existing) {
          skipped++
          continue
        }

        const { error: insertError } = await supabase
          .from('raw_articles')
          .insert({
            source_id: article.sourceId,
            source_name: article.sourceName,
            original_title: article.originalTitle,
            snippet: article.snippet,
            source_url: article.sourceUrl,
          })

        if (insertError) {
          // Unique constraint violation (23505) = race condition duplicate — treat as skip
          console.error(
            `raw_articles insert error [${insertError.code}] for ${article.sourceUrl}:`,
            insertError.message,
          )
          skipped++
        } else {
          inserted++
        }
      } catch (articleErr) {
        console.error(
          `Error storing article "${article.originalTitle}":`,
          articleErr,
        )
        skipped++
      }
    }

    // 3. Update data_sources status
    const sourceIds = ['hacker-news', 'techcrunch', 'reddit-ml']
    await Promise.all(
      sourceIds.map((sourceId) =>
        supabase
          .from('data_sources')
          .update({
            status: 'active',
            last_crawled: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', sourceId)
      ),
    )

    return new Response(
      JSON.stringify({ crawled, inserted, skipped }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error("crawl function fatal error:", err)
    return new Response(
      JSON.stringify({ error: String(err), crawled, inserted, skipped }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
