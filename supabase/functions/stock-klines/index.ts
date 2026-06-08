// stock-klines — Yahoo Finance OHLCV proxy
// Deploy: supabase functions deploy stock-klines
// POST { symbol, interval, startMs, endMs } → { candles: Candle[] }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const INTERVAL_MAP: Record<string, string> = {
  '15m': '15m',
  '1h': '60m',
  '1d': '1d',
  '1wk': '1wk',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { symbol, interval, startMs, endMs } = await req.json() as {
      symbol: string; interval: string; startMs: number; endMs: number
    }

    const yahooInterval = INTERVAL_MAP[interval] ?? '1d'
    const period1 = Math.floor(startMs / 1000)
    const period2 = Math.floor(endMs / 1000)

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${yahooInterval}`

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    })

    if (!resp.ok) {
      const text = await resp.text()
      return new Response(JSON.stringify({ error: `Yahoo Finance ${resp.status}`, details: text }), {
        status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const json = await resp.json() as { chart: { result: { timestamp: number[]; indicators: { quote: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }[] } }[] | null } }
    const result = json.chart?.result?.[0]

    if (!result?.timestamp) {
      return new Response(JSON.stringify({ error: `Symbol not found: ${symbol}` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const q = result.indicators.quote[0]
    const candles = result.timestamp
      .map((ts, i) => ({
        timestamp: ts * 1000,
        open:   +(q.open[i]  ?? 0).toFixed(4),
        high:   +(q.high[i]  ?? 0).toFixed(4),
        low:    +(q.low[i]   ?? 0).toFixed(4),
        close:  +(q.close[i] ?? 0).toFixed(4),
        volume: q.volume[i] ?? 0,
      }))
      .filter(c => c.close > 0)

    return new Response(JSON.stringify({ candles }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})