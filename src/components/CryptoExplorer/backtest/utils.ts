import type { UTCTimestamp } from 'lightweight-charts'
import type { AddEntry, BacktestTrade, OHLCVCandle } from './types'

export function fmtPrice(v: number | undefined | null): string {
  if (v == null) return '$0.00'
  return v >= 1000
    ? `$${v.toLocaleString('en', { maximumFractionDigits: 2 })}`
    : `$${v.toLocaleString('en', { maximumFractionDigits: 6 })}`
}

export function fmtPct(v: number | undefined | null): string {
  if (v == null) return '0.00%'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

const KST_OFFSET   = 9 * 3_600_000
const KST_OFFSET_S = 9 * 3600  // 초 단위 (lightweight-charts용)

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '-'
  try {
    const d = new Date(new Date(iso).getTime() + KST_OFFSET)
    const date = d.toISOString().slice(0, 10)
    const time = d.toISOString().slice(11, 16)
    return `${date} ${time}`
  } catch {
    return '-'
  }
}

export function parseAddEntries(trade: BacktestTrade): AddEntry[] {
  try {
    let raw = trade.add_entries
    if (typeof raw === 'string') {
      raw = raw.trim()
      if (!raw || raw === 'null' || raw === '[]') raw = null
      else raw = JSON.parse(raw)
    }
    if (Array.isArray(raw) && raw.length > 0) {
      const mapped = raw
        .filter((e: any) => e != null && typeof e === 'object')
        .map((e: any) => ({
          step: e.step || 1,
          price: typeof e.price === 'number' ? e.price : (trade.entry_price ?? 0),
          qty: e.qty ?? 0,
          capital_used: e.capital_used ?? 0,
          ts: e.ts || trade.entry_ts || new Date().toISOString(),
        }))
      if (mapped.length > 0) return mapped
    }
  } catch {
    // fallback
  }
  return [{
    step: 1,
    price: trade.entry_price ?? 0,
    qty: 0,
    capital_used: 0,
    ts: trade.entry_ts ?? new Date().toISOString(),
  }]
}

export async function fetchOHLCV(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<OHLCVCandle[]> {
  const candles: OHLCVCandle[] = []
  let cursor = startMs

  while (cursor < endMs) {
    const url = new URL('https://api.binance.com/api/v3/klines')
    url.searchParams.set('symbol', `${symbol}USDT`)
    url.searchParams.set('interval', interval)
    url.searchParams.set('startTime', String(cursor))
    url.searchParams.set('endTime', String(endMs))
    url.searchParams.set('limit', '1000')

    const res = await fetch(url.toString())
    if (!res.ok) break
    const data: number[][] = await res.json()
    if (!data.length) break

    for (const k of data) {
      candles.push({
        time: (Math.floor(k[0] / 1000) + KST_OFFSET_S) as UTCTimestamp,
        open: parseFloat(String(k[1])),
        high: parseFloat(String(k[2])),
        low: parseFloat(String(k[3])),
        close: parseFloat(String(k[4])),
      })
    }

    cursor = data[data.length - 1][0] + 1
    if (data.length < 1000) break
  }

  return candles
}
