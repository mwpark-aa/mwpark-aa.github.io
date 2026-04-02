import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Target coins (BTC 제외 메이저 코인)
const SYMBOLS = ['ETH', 'SOL', 'XRP', 'DOGE', 'ADA']

interface Kline {
  symbol: string
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

async function fetchBinanceKlines(symbol: string, interval = '1m', limit = 100): Promise<Kline[]> {
  const pair = `${symbol}USDT`
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Binance API error for ${symbol}: ${res.status}`)
  }

  const data: number[][] = await res.json()

  return data.map((k) => ({
    symbol,
    timestamp: new Date(k[0]).toISOString(),
    open: parseFloat(k[1] as unknown as string),
    high: parseFloat(k[2] as unknown as string),
    low: parseFloat(k[3] as unknown as string),
    close: parseFloat(k[4] as unknown as string),
    volume: parseFloat(k[5] as unknown as string),
  }))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const db = createClient(supabaseUrl, supabaseKey)

    const entries = await Promise.all(
      SYMBOLS.map(async (symbol) => {
        try {
          const klines = await fetchBinanceKlines(symbol, '1m', 200)
          const { error } = await db
            .from('market_data')
            .upsert(klines, { onConflict: 'symbol,timestamp' })
          return [symbol, { inserted: error ? 0 : klines.length, ...(error && { error: error.message }) }] as const
        } catch (err) {
          return [symbol, { inserted: 0, error: String(err) }] as const
        }
      })
    )
    const results = Object.fromEntries(entries)

    return new Response(
      JSON.stringify({ ok: true, results, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
