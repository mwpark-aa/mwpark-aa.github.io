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

    const prompt = `당신은 한국 지역 장소 추천 전문가입니다.

위치: ${address} (위도 ${lat}, 경도 ${lng})
찾는 것: ${activity}

이 지역 근처 ${activity} 추천 장소 12곳을 JSON으로만 응답하세요.

규칙:
- 한글과 영어만 사용. 한자(漢字) 절대 금지.
- 마크다운, 코드펜스 없이 순수 JSON만 출력.
- name, desc, tip, address 모두 한글로 작성.
- rating은 3.5 ~ 5.0 범위의 소수점 한 자리 숫자.

형식:
{"places":[{"name":"장소명","category":"세부카테고리","rating":4.5,"desc":"한 줄 설명 (20자 내외)","tip":"이 장소만의 꿀팁 (20자 내외)","address":"대략적 위치 설명"}]}`

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
        max_tokens: 2048,
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
