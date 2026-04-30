import type { Candle } from './types.ts'

export function intervalToMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
    '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000,
    '1d': 86_400_000, '1w': 604_800_000,
  }
  return map[interval] ?? 3_600_000
}

export async function fetchKlines(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<Candle[]> {
  const rows: Candle[] = []
  let cursor = startMs

  while (cursor < endMs) {
    const url = new URL('https://api.binance.com/api/v3/klines')
    url.searchParams.set('symbol',    `${symbol}USDT`)
    url.searchParams.set('interval',  interval)
    url.searchParams.set('startTime', String(cursor))
    url.searchParams.set('endTime',   String(endMs))
    url.searchParams.set('limit',     '1000')

    const resp = await fetch(url.toString())
    if (!resp.ok) throw new Error(`Binance klines ${resp.status}`)
    const data: unknown[][] = await resp.json() as unknown[][]
    if (!data.length) break

    for (const k of data) {
      rows.push({
        timestamp: Number(k[0]),
        open: +k[1]!, high: +k[2]!, low: +k[3]!, close: +k[4]!, volume: +k[5]!,
      })
    }
    cursor = Number(data[data.length - 1]![0]) + 1
    if (data.length < 1000) break
    await new Promise(r => setTimeout(r, 120))
  }
  return rows
}