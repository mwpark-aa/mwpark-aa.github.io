import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Article {
  title: string
  sourceUrl: string
  sourceName: string
  content: string
}

interface GrokResult {
  koreanTitle: string
  summary: string[]
  category: 'AI Trends' | 'Tech Blogs' | 'Hot Deals'
  readTime: string
}

// ─── Grok summarization ────────────────────────────────────────────────────

async function summarizeWithGrok(
  title: string,
  content: string,
  apiKey: string,
): Promise<GrokResult | null> {
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-2-1212",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "당신은 기술 뉴스를 한국 개발자를 위해 요약하는 AI입니다. 항상 한국어로 응답하세요. 날카롭고 간결하게 작성하세요.",
          },
          {
            role: "user",
            content: `다음 기사를 분석해서 JSON으로만 응답해 (마크다운 없이):
제목: ${title}
내용: ${content}

{
  "koreanTitle": "한글 번역 제목",
  "summary": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "category": "AI Trends" | "Tech Blogs" | "Hot Deals",
  "readTime": "X min read"
}

카테고리 기준:
- AI Trends: AI/ML 모델, 연구, 도구
- Tech Blogs: 엔지니어링 블로그, 기술 사례
- Hot Deals: 할인, 무료 크레딧, 프로모션`,
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error(`Grok API error: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json()
    const raw = data?.choices?.[0]?.message?.content ?? ""

    // Strip any accidental markdown code fences
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim()
    const result: GrokResult = JSON.parse(cleaned)

    // Validate shape
    if (
      typeof result.koreanTitle !== "string" ||
      !Array.isArray(result.summary) ||
      !["AI Trends", "Tech Blogs", "Hot Deals"].includes(result.category) ||
      typeof result.readTime !== "string"
    ) {
      console.error("Grok returned unexpected shape:", result)
      return null
    }

    return result
  } catch (err) {
    console.error("summarizeWithGrok error:", err)
    return null
  }
}

// ─── Crawlers ──────────────────────────────────────────────────────────────

async function crawlHackerNews(): Promise<Article[]> {
  const articles: Article[] = []
  try {
    const idsRes = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
    )
    if (!idsRes.ok) throw new Error(`HN topstories: ${idsRes.status}`)
    const ids: number[] = await idsRes.json()

    // Fetch top 30 candidates in parallel, then filter by score
    const top30 = ids.slice(0, 30)
    const items = await Promise.all(
      top30.map(async (id) => {
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
      if (!item || item.type !== "story") continue
      if ((item.score ?? 0) <= 50) continue
      if (!item.title || !item.url) continue

      articles.push({
        title: item.title,
        sourceUrl: item.url,
        sourceName: "Hacker News",
        content: item.text
          ? item.text.replace(/<[^>]*>/g, "").slice(0, 800)
          : item.title,
      })

      if (articles.length >= 10) break
    }
  } catch (err) {
    console.error("crawlHackerNews error:", err)
  }
  return articles
}

async function crawlTechCrunch(): Promise<Article[]> {
  const articles: Article[] = []
  try {
    const res = await fetch("https://techcrunch.com/feed/", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FeedBot/1.0)" },
    })
    if (!res.ok) throw new Error(`TechCrunch feed: ${res.status}`)
    const xml = await res.text()

    // Extract <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match: RegExpExecArray | null
    let count = 0

    while ((match = itemRegex.exec(xml)) !== null && count < 8) {
      const block = match[1]

      const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ??
        block.match(/<title>([\s\S]*?)<\/title>/)
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/) ??
        block.match(/<link\s[^>]*href="([^"]+)"/)
      const descMatch =
        block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ??
        block.match(/<description>([\s\S]*?)<\/description>/)

      const title = titleMatch?.[1]?.trim()
      const url = linkMatch?.[1]?.trim()
      const desc = descMatch?.[1]
        ?.replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .trim()
        .slice(0, 800)

      if (title && url) {
        articles.push({
          title,
          sourceUrl: url,
          sourceName: "TechCrunch",
          content: desc ?? title,
        })
        count++
      }
    }
  } catch (err) {
    console.error("crawlTechCrunch error:", err)
  }
  return articles
}

async function crawlRedditML(): Promise<Article[]> {
  const articles: Article[] = []
  try {
    const res = await fetch(
      "https://www.reddit.com/r/MachineLearning/top.json?limit=10&t=day",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FeedBot/1.0; Deno)",
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
      if (post.is_self === false && !post.url) continue

      const url = post.url?.startsWith("http")
        ? post.url
        : `https://www.reddit.com${post.permalink}`

      articles.push({
        title: post.title,
        sourceUrl: url,
        sourceName: "Reddit r/MachineLearning",
        content: (post.selftext ?? post.title).slice(0, 800),
      })
    }
  } catch (err) {
    console.error("crawlRedditML error:", err)
  }
  return articles
}

// ─── Main handler ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const GROK_API_KEY = Deno.env.get("GROK_API_KEY")!

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let crawled = 0
  let inserted = 0
  let skipped = 0

  try {
    // 1. Crawl all sources in parallel
    const [hnArticles, tcArticles, redditArticles] = await Promise.all([
      crawlHackerNews(),
      crawlTechCrunch(),
      crawlRedditML(),
    ])

    const allArticles: Article[] = [...hnArticles, ...tcArticles, ...redditArticles]
    crawled = allArticles.length

    // 2. Process each article
    for (const article of allArticles) {
      try {
        // Dedup check
        const { data: existing } = await supabase
          .from("feed_items")
          .select("id")
          .eq("source_url", article.sourceUrl)
          .maybeSingle()

        if (existing) {
          skipped++
          continue
        }

        // Summarize with Grok
        const result = await summarizeWithGrok(
          article.title,
          article.content,
          GROK_API_KEY,
        )

        if (!result) {
          console.error(`Skipping article (no Grok result): ${article.title}`)
          skipped++
          continue
        }

        // Insert into Supabase
        const { error: insertError } = await supabase.from("feed_items").insert({
          category: result.category,
          title: result.koreanTitle,
          summary: result.summary,
          source_url: article.sourceUrl,
          source_name: article.sourceName,
          read_time: result.readTime,
          collected_at: new Date().toISOString(),
        })

        if (insertError) {
          // Unique constraint violations are expected for race conditions — treat as skip
          if (insertError.code === "23505") {
            skipped++
          } else {
            console.error(`Insert error for ${article.sourceUrl}:`, insertError.message)
            skipped++
          }
        } else {
          inserted++
        }
      } catch (articleErr) {
        console.error(`Error processing article "${article.title}":`, articleErr)
        skipped++
      }
    }

    // 3. Update data_sources status
    const sourceMap: Record<string, string> = {
      "Hacker News": "hacker-news",
      "TechCrunch": "techcrunch",
      "Reddit r/MachineLearning": "reddit-ml",
    }

    await Promise.all(
      Object.values(sourceMap).map((sourceId) =>
        supabase
          .from("data_sources")
          .update({
            status: "active",
            last_crawled: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sourceId)
      ),
    )

    // 4. Return summary
    return new Response(
      JSON.stringify({ crawled, inserted, skipped }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (err) {
    console.error("crawl function fatal error:", err)
    return new Response(
      JSON.stringify({ error: String(err), crawled, inserted, skipped }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
})
