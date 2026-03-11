import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_BASE = 'https://api.groq.com/openai/v1'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get('mode') ?? 'activities'
    const lat = url.searchParams.get('lat')
    const lng = url.searchParams.get('lng')
    const address = url.searchParams.get('address') ?? '알 수 없는 위치'
    const activity = url.searchParams.get('activity') ?? ''

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: '위치 정보(lat, lng)가 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const GROK_API_KEY = Deno.env.get('GROK_API_KEY')!

    let prompt: string

    if (mode === 'activities') {
      prompt = `당신은 지역 활동 추천 전문가입니다.
위치: ${address} (위도 ${lat}, 경도 ${lng})

이 지역에서 지금 할 수 있는 활동 6가지를 JSON으로만 응답하세요 (마크다운 없이):
{"activities":[{"emoji":"☕","name":"카페","desc":"아늑한 카페에서 여유롭게"},{"emoji":"🍽","name":"맛집","desc":"이 동네 유명 맛집 탐방"},{"emoji":"🎮","name":"오락","desc":"게임과 엔터테인먼트"},{"emoji":"🌿","name":"산책","desc":"공원 및 자연 즐기기"},{"emoji":"🛍","name":"쇼핑","desc":"동네 특색 쇼핑"},{"emoji":"🎭","name":"문화","desc":"전시 및 문화 체험"}]}

각 활동은 emoji, name(2-4글자), desc(10-20글자)로 구성. 이 지역 특성에 맞게 다양하게 추천.`
    } else {
      prompt = `당신은 지역 장소 추천 전문가입니다.
위치: ${address} (위도 ${lat}, 경도 ${lng})
찾는 것: ${activity}

이 지역 근처 ${activity} 추천 장소 5곳을 JSON으로만 응답하세요 (마크다운 없이):
{"places":[{"name":"장소명","category":"세부카테고리","rating":4.5,"desc":"한 줄 설명 (20자 내외)","tip":"이 장소만의 꿀팁 (20자 내외)","address":"대략적 주소 또는 위치 설명"}]}

이 지역 ${address}에 실제로 있을 법한 장소들을 추천. rating은 3.5-5.0 범위. 각 장소의 특색을 살린 tip 포함.`
    }

    const response = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      console.error(`Groq API error: ${response.status} ${response.statusText}`)
      return new Response(
        JSON.stringify({ error: `Groq API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const data = await response.json()
    const raw: string = data?.choices?.[0]?.message?.content ?? '{}'
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const result = JSON.parse(cleaned)

    return new Response(
      JSON.stringify(result),
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
