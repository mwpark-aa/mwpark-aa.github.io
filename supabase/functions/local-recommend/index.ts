import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ACTIVITY_KEYWORD_MAP: Record<string, string> = {
  '밥집': '맛집',
  '카페': '카페',
  '디저트': '디저트',
  '술집/바': '술집',
  '산책': '공원',
  '사진 명소': '관광명소',
  '독서': '북카페',
  '오락': '오락실',
  '영화': '영화관',
  '쇼핑': '쇼핑몰',
  '전시/문화': '미술관'
}

const GROQ_BASE = 'https://api.groq.com/openai/v1'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

interface KakaoPlace {
  place_name: string
  category_name: string
  road_address_name: string
  address_name: string
  phone: string
  place_url: string
  distance: string
  x: string
  y: string
}

interface CuratedPlace {
  name: string
  category: string
  distance: string
  address: string
  phone: string
  rating: number
  x: string
  y: string
  tags?: string[]
}

function lastPartOfCategory(cat: string): string {
  if (!cat) return ''
  const parts = cat.split(' > ')
  return parts[parts.length - 1] ?? cat
}

function formatDistance(dist: string): string {
  const m = parseInt(dist, 10)
  if (isNaN(m) || m === 0) return ''
  if (m < 1000) return `${m}m`
  return `${(m / 1000).toFixed(1)}km`
}

async function extractKeyword(query: string, apiKey: string): Promise<string> {
  const prompt = `사용자가 "${query}"를 찾고 있습니다.
카카오 로컬 검색에 적합한 한국어 키워드를 한 단어로 응답하세요.
예시: 카페, 음식점, 공원, 영화관, 노래방, 스파, 볼링장
JSON으로만 응답: {"keyword":"키워드"}`

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 64,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content ?? '{}'
  const result = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim())
  return result.keyword ?? query
}

async function curateAndComment(
  places: KakaoPlace[],
  label: string,
  address: string,
  grokKey: string,
): Promise<CuratedPlace[]> {
  if (places.length === 0) return []

  const list = places
    .map((p, i) => `${i + 1}. ${p.place_name} (${lastPartOfCategory(p.category_name)}, ${formatDistance(p.distance)})`)
    .join('\n')

  const prompt = `${address}에서 "${label}" 관련 장소들입니다:
${list}

가장 추천할 장소 최대 10개를 골라 예상 별점(1.0~5.0)과 해당 장소의 특징을 잘 나타내는 짧은 키워드 2-3개를 달아주세요.
규칙: 
- 화장실, 주차장, 관리소, 단순 부대시설 등은 추천에서 제외하세요.
- 장소 이름과 카테고리 정보를 분석하여 "${label}" 활동 목적에 정말 부합하는 장소만 선정하세요.
- 키워드는 장소의 분위기나 장점을 나타내는 2~5글자 내외의 명사형으로 작성하세요.
- 한글만 사용, 한자 금지, 마크다운 없이 순수 JSON만 출력.
형식: {"picks":[{"index":1,"rating":4.5,"tags":["조용한","분위기맛집"]},{"index":3,"rating":4.2,"tags":["산책로","전망좋은"]}]}`

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content ?? '{}'
  const result = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim())
  const picks: { index: number; rating: number; tags?: string[] }[] = result.picks ?? []

  const curated = picks.map(({ index, rating, tags }) => {
    const p = places[index - 1]
    if (!p) return null

    return {
      name: p.place_name,
      category: lastPartOfCategory(p.category_name),
      distance: formatDistance(p.distance),
      address: p.road_address_name || p.address_name,
      phone: p.phone ?? '',
      rating: typeof rating === 'number' ? Math.round(rating * 10) / 10 : 4.0,
      x: p.x,
      y: p.y,
      tags: tags || [],
    }
  })

  return curated.filter(Boolean) as CuratedPlace[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const lat = url.searchParams.get('lat')
    const lng = url.searchParams.get('lng')
    const address = url.searchParams.get('address') ?? ''
    const activity = url.searchParams.get('activity')
    const query = url.searchParams.get('query')
    const radius = Math.min(parseInt(url.searchParams.get('radius') ?? '1000', 10) || 1000, 5000)

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: '위치 정보(lat, lng)가 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!query && !activity) {
      return new Response(
        JSON.stringify({ error: 'activity 또는 query 중 하나는 필수입니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const KAKAO_API_KEY = Deno.env.get('KAKAO_API_KEY')
    const GROK_API_KEY = Deno.env.get('GROK_API_KEY')

    if (!KAKAO_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'KAKAO_API_KEY 환경 변수가 설정되지 않았습니다.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!GROK_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GROK_API_KEY 환경 변수가 설정되지 않았습니다.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Step 1 — determine keyword
    let keyword: string
    if (query) {
      keyword = await extractKeyword(query, GROK_API_KEY)
    } else {
      keyword = ACTIVITY_KEYWORD_MAP[activity!] ?? activity!
    }

    // Step 2 — Kakao search
    const kakaoUrl = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
    kakaoUrl.searchParams.set('query', keyword)
    kakaoUrl.searchParams.set('x', lng)
    kakaoUrl.searchParams.set('y', lat)
    kakaoUrl.searchParams.set('radius', `${radius}`)
    kakaoUrl.searchParams.set('size', '10') // AI 큐레이션 개수에 맞춰 조정
    kakaoUrl.searchParams.set('sort', 'distance')

    const kakaoResponse = await fetch(kakaoUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `KakaoAK ${KAKAO_API_KEY}`,
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!kakaoResponse.ok) {
      console.error(`Kakao API error: ${kakaoResponse.status} ${kakaoResponse.statusText}`)
      return new Response(
        JSON.stringify({ error: `Kakao API error: ${kakaoResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const kakaoData = await kakaoResponse.json()
    const kakaoPlaces: KakaoPlace[] = kakaoData?.documents ?? []

    // Step 3 — AI curation + comment
    const label = query || activity!
    const places = await curateAndComment(
      kakaoPlaces,
      label,
      address,
      GROK_API_KEY,
    )

    // Step 4 — return result
    return new Response(
      JSON.stringify({ places, keyword, count: places.length, kakaoCount: kakaoPlaces.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('local-recommend error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
