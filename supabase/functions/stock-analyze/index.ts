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

    // Find last non-null value for a given key
    const findLast = (key: string): number | null => {
      for (let i = indicators.length - 1; i >= 0; i--) {
        if (indicators[i][key] !== null && indicators[i][key] !== undefined) {
          return indicators[i][key]
        }
      }
      return null
    }

    const latest = indicators[indicators.length - 1]
    const ma20 = findLast('ma20')
    const ma60 = findLast('ma60')
    const ma200 = findLast('ma200')
    const rsi = findLast('rsi')
    const tenkanSen = findLast('tenkanSen')
    const kijunSen = findLast('kijunSen')
    const bbUpper = findLast('bbUpper')
    const bbLower = findLast('bbLower')
    const atr = findLast('atr')

    const price = latest.close
    const fmt = (v: number | null) => v !== null ? `$${v}` : '데이터 부족'
    const fmtN = (v: number | null) => v !== null ? `${v}` : '데이터 부족'
    const trend = (v: number | null, label: string) =>
      v !== null ? `${fmt(v)} → 현재가가 ${price > v ? '위 (상승 추세)' : '아래 (하락 추세)'}` : '데이터 부족'

    const rsiDesc = rsi === null
      ? '데이터 부족'
      : rsi > 70
        ? `${rsi} → 과열 구간 (너무 많이 올라 조정 가능성)`
        : rsi < 30
          ? `${rsi} → 침체 구간 (많이 떨어져 반등 가능성)`
          : `${rsi} → 중립 (안정적인 흐름)`

    const ichimokuDesc =
      tenkanSen !== null && kijunSen !== null
        ? `전환선 ${fmt(tenkanSen)}, 기준선 ${fmt(kijunSen)} → 전환선이 기준선 ${tenkanSen > kijunSen ? '위 (단기 강세 신호)' : '아래 (단기 약세 신호)'}`
        : '데이터 부족'

    const bbDesc = bbUpper !== null && bbLower !== null
      ? `상단 ${fmt(bbUpper)} / 하단 ${fmt(bbLower)} → 현재가가 ${
          price >= bbUpper ? '상단 밴드 근접 (과열 신호)' :
          price <= bbLower ? '하단 밴드 근접 (반등 가능 신호)' :
          `밴드 중간 (${Math.round(((price - bbLower) / (bbUpper - bbLower)) * 100)}% 위치)`
        }`
      : '데이터 부족'

    const atrDesc = atr !== null
      ? `$${atr} → 손절 기준 제안: $${(price - atr * 1.5).toFixed(2)} (현재가 - ATR×1.5)`
      : '데이터 부족'

    const prompt = `종목: ${symbol}
현재가: $${price}

📈 이동평균선 (주가 방향 파악):
- 20일 평균: ${trend(ma20, '20일')} (단기)
- 60일 평균: ${trend(ma60, '60일')} (중기)
- 200일 평균: ${trend(ma200, '200일')} (장기)

📊 RSI (과열/침체 여부): ${rsiDesc}

🌐 일목균형표 (추세 강도 파악): ${ichimokuDesc}

📉 볼린저 밴드 (가격 위치 파악): ${bbDesc}

📏 ATR - 변동성 기반 손절 기준: ${atrDesc}

위 지표를 바탕으로 아래 3가지를 한국어로 작성해주세요. 전문 용어는 괄호로 쉽게 풀어쓰고, 각 섹션은 3줄 이내로 간결하게 작성하세요.

### 1. 현재 상황 요약
지표들이 보여주는 현재 흐름을 쉽게 설명

### 2. 투자 판단
**매수 / 관망 / 매도** 중 하나를 굵게 표시하고 이유를 간결하게 설명

### 3. 대응 전략
볼린저 밴드와 ATR 손절 기준을 활용해 구체적인 매수 타점, 목표가, 손절가 제안`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: '주식 차트를 쉽게 설명해주는 분석가입니다. 전문 용어 없이, 일반인도 바로 이해할 수 있는 쉬운 말로 핵심만 간결하게 분석하세요.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
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
