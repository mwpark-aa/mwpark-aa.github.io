import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { symbol, indicators } = await req.json()
    const GROK_API_KEY = Deno.env.get('GROK_API_KEY')

    if (!symbol || !indicators) {
      return new Response(
        JSON.stringify({ error: 'Symbol and indicators are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!GROK_API_KEY) {
       // GROK_API_KEY가 설정되어 있지 않은 경우에 대한 폴백 처리 (기존 summarize 등에서 사용 중인 키 이름 확인 필요)
       // GROQ_API_KEY 인지 GROK_API_KEY 인지 확인이 필요할 수 있음. SUPABASE_SETUP.md 에는 GROK_API_KEY 로 명시됨.
    }

    const latest = indicators[indicators.length - 1]
    const prompt = `당신은 세계 최고의 주식 차트 분석가입니다.
회사의 내재 가치나 미래 가능성을 보는 것이 아니라, 오로지 제공된 "객관적인 기술적 지표"만을 바탕으로 차트를 분석합니다.
주관적인 감정이나 추측을 배제하고 데이터에 기반한 분석 결과를 제공하세요.

분석 대상: ${symbol}
현재 기술 지표 데이터:
- 종가: ${latest.close}
- 20일 이동평균선: ${latest.ma20}
- 60일 이동평균선: ${latest.ma60}
- 200일 이동평균선: ${latest.ma200}
- RSI (14): ${latest.rsi}
- 일목균형표 전환선(Tenkan): ${latest.tenkanSen}
- 일목균형표 기준선(Kijun): ${latest.kijunSen}

위 데이터를 바탕으로 현재 이 주식이 "매수하기에 매력적인 구간인지" 아니면 "관망 또는 매도 구간인지" 분석해 주세요. 
분석은 한국어로 작성하며, **반드시 Markdown 형식을 사용하여 가독성 있게** 작성해 주세요.

다음 구조를 활용하세요:
### 1. 종합 판단
(매수 적기 / 관망 / 주의 등을 강조해서 표시)

### 2. 기술적 지표 분석
- **이동평균선**: 현재 주가와 이평선(20일, 60일, 200일)의 관계 분석
- **RSI**: 현재 과매수/과매도 여부 및 강도 분석
- **일목균형표**: 전환선과 기준선의 관계 분석

### 3. 향후 전망 및 전략
- **목표가 및 손절가**: 기술적 지지/저항선을 기반으로 제안

> **주의**: 이 분석은 오로지 차트 지표에 기반한 기술적 분석이며, 실제 투자는 본인의 판단하에 신중히 결정해야 합니다. 절대 투자 권유가 아닙니다.`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: '당신은 차트 데이터만을 분석하는 냉철한 기술적 분석 전문가입니다.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2, // 객관성을 위해 낮은 온도로 설정
      }),
    })

    const result = await response.json()
    const analysis = result.choices[0].message.content

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
