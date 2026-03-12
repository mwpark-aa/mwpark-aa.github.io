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
    const { symbol } = await req.json()
    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Yahoo Finance Query (v8)
    // 1 year interval = 1d, range = 1y
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    })
    if (!response.ok) {
      const errorText = await response.text()
      return new Response(
        JSON.stringify({ error: `Yahoo Finance API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const json = await response.json()
    const result = json.chart.result[0]

    if (!result || !result.timestamp) {
      return new Response(
        JSON.stringify({ error: 'No data found for this symbol' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const timestamps = result.timestamp
    const quotes = result.indicators.quote[0]
    const adjClose = result.indicators.adjclose?.[0].adjclose || quotes.close

    const data = timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: parseFloat(adjClose[i]?.toFixed(2) || '0'),
      volume: quotes.volume[i],
      open: parseFloat(quotes.open[i]?.toFixed(2) || '0'),
      high: parseFloat(quotes.high[i]?.toFixed(2) || '0'),
      low: parseFloat(quotes.low[i]?.toFixed(2) || '0'),
    })).filter((d: any) => d.close > 0)

    return new Response(
      JSON.stringify({ symbol: result.meta.symbol, currency: result.meta.currency, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
