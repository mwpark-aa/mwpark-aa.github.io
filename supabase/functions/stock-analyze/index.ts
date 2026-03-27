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
    const { symbol, indicators, patternInfo } = await req.json()
    const GROK_API_KEY = Deno.env.get('GROK_API_KEY')

    if (!symbol || !indicators) {
      return new Response(
        JSON.stringify({ error: 'Symbol and indicators are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const findLast = (key: string): number | null => {
      for (let i = indicators.length - 1; i >= 0; i--) {
        if (indicators[i][key] !== null && indicators[i][key] !== undefined) {
          return indicators[i][key]
        }
      }
      return null
    }

    const latest = indicators[indicators.length - 1]
    const price = latest.close

    // Moving averages
    const ma20 = findLast('ma20')
    const ma60 = findLast('ma60')
    const ma200 = findLast('ma200')

    // Oscillators
    const rsi = findLast('rsi')
    const macdLine = findLast('macdLine')
    const macdSignal = findLast('macdSignal')
    const macdHistogram = findLast('macdHistogram')
    const stochK = findLast('stochK')
    const stochD = findLast('stochD')

    // Ichimoku
    const tenkanSen = findLast('tenkanSen')
    const kijunSen = findLast('kijunSen')

    // Bands & volatility
    const bbUpper = findLast('bbUpper')
    const bbLower = findLast('bbLower')
    const atr = findLast('atr')

    // OBV trend (last 5 values)
    const recentObv = indicators.slice(-10).map((d: any) => d.obv).filter((v: any) => v !== null && v !== undefined)
    const obvTrend = recentObv.length >= 2
      ? (recentObv[recentObv.length - 1] > recentObv[0]
        ? `상승 추세 (매수 세력 유입 중)`
        : `하락 추세 (매도 세력 증가 중)`)
      : '데이터 부족'

    const fmt = (v: number | null) => v !== null ? `$${v}` : '데이터 부족'
    const trend = (v: number | null) =>
      v !== null ? `${fmt(v)} → 현재가 ${price > v ? '위 (상승 추세)' : '아래 (하락 추세)'}` : '데이터 부족'

    const rsiDesc = rsi === null ? '데이터 부족'
      : rsi > 70 ? `${rsi} → 과열 (조정 가능성)`
      : rsi < 30 ? `${rsi} → 침체 (반등 가능성)`
      : `${rsi} → 중립 (안정적 흐름)`

    const macdDesc = macdLine !== null && macdSignal !== null
      ? `MACD ${macdLine.toFixed(3)} / 시그널 ${macdSignal.toFixed(3)} / 히스토그램 ${(macdHistogram ?? 0).toFixed(3)} → ${macdLine > macdSignal ? 'MACD > 시그널 (상승 모멘텀)' : 'MACD < 시그널 (하락 모멘텀)'}`
      : '데이터 부족'

    const stochDesc = stochK !== null
      ? `%K ${stochK} / %D ${stochD ?? 'N/A'} → ${stochK > 80 ? '과매수 (80 이상), 조정 주의' : stochK < 20 ? '과매도 (20 이하), 반등 가능' : '중립 구간'}`
      : '데이터 부족'

    const ichimokuDesc = tenkanSen !== null && kijunSen !== null
      ? `전환선 ${fmt(tenkanSen)} / 기준선 ${fmt(kijunSen)} → ${tenkanSen > kijunSen ? '전환선 > 기준선 (단기 강세)' : '전환선 < 기준선 (단기 약세)'}`
      : '데이터 부족'

    const bbDesc = bbUpper !== null && bbLower !== null
      ? `상단 ${fmt(bbUpper)} / 하단 ${fmt(bbLower)} → 현재가 ${
          price >= bbUpper ? '상단 밴드 근접 (과열 신호)'
          : price <= bbLower ? '하단 밴드 근접 (반등 신호)'
          : `밴드 중간 (${Math.round(((price - bbLower) / (bbUpper - bbLower)) * 100)}% 위치)`
        }`
      : '데이터 부족'

    const atrDesc = atr !== null
      ? `$${atr} → 손절 기준 제안: $${(price - atr * 1.5).toFixed(2)} (현재가 - ATR×1.5)`
      : '데이터 부족'

    // Pattern info
    const patterns: any[] = patternInfo?.patterns ?? []
    const patternDesc = patterns.length > 0
      ? patterns.map((p: any) => `- [${p.type === 'bullish' ? '강세' : p.type === 'bearish' ? '약세' : '중립'}] ${p.name}: ${p.description}`).join('\n')
      : '특이 패턴 없음'

    const srDesc = patternInfo
      ? `저항선: ${patternInfo.nearestResistance ? `$${patternInfo.nearestResistance}` : '없음'} / 지지선: ${patternInfo.nearestSupport ? `$${patternInfo.nearestSupport}` : '없음'}`
      : '데이터 부족'

    const prompt = `종목: ${symbol}
현재가: $${price}

📈 이동평균선 (추세 방향):
- 20일 단기: ${trend(ma20)}
- 60일 중기: ${trend(ma60)}
- 200일 장기: ${trend(ma200)}

📊 RSI (14일) — 과열/침체: ${rsiDesc}

📊 MACD (12,26,9) — 모멘텀: ${macdDesc}

📊 스토캐스틱 %K/%D (14,3) — 단기 과매수/과매도: ${stochDesc}

🌐 일목균형표 — 추세 강도: ${ichimokuDesc}

📉 볼린저 밴드 — 가격 위치: ${bbDesc}

📈 OBV — 거래량 추세: ${obvTrend}

📏 ATR — 변동성/손절 기준: ${atrDesc}

🕯️ 감지된 차트/캔들 패턴:
${patternDesc}

🎯 주요 지지/저항선: ${srDesc}

위 지표와 패턴을 종합하여 아래 4가지를 한국어로 작성해주세요. 전문 용어는 괄호로 쉽게 풀어쓰고, 각 섹션은 3~4줄 이내로 간결하게 작성하세요.

### 1. 현재 상황 요약
모든 지표가 보여주는 현재 흐름 — 감지된 패턴과 주요 시그널 포함하여 설명

### 2. 핵심 시그널 분석
가장 주목해야 할 지표 신호 2~3가지 (골든/데드크로스, MACD, 패턴, RSI 등 중 주요 것만)

### 3. 투자 판단
**매수 / 관망 / 매도** 중 하나를 굵게 표시하고, 위 지표와 패턴을 근거로 간결하게 이유 설명

### 4. 대응 전략
지지/저항선, 볼린저 밴드, ATR 손절 기준을 활용해 구체적인 매수 타점, 목표가, 손절가 제안`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: '당신은 주식 차트를 쉽게 설명해주는 기술적 분석 전문가입니다. 이동평균선, MACD, RSI, 스토캐스틱, 볼린저 밴드, 일목균형표, 캔들 패턴, 차트 패턴 등 다양한 지표를 종합하여 분석합니다. 전문 용어 없이 일반인도 바로 이해할 수 있는 쉬운 말로 핵심만 간결하게 분석하세요.' },
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
