import type { Candle } from './types.ts'

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
const FRED_KEY  = Deno.env.get("FRED_API_KEY") ?? ""

interface FedObs { date: string; value: number }

async function fetchFredSeries(id: string, start: string, end: string): Promise<FedObs[]> {
  if (!FRED_KEY) return []
  const url = new URL(FRED_BASE)
  url.searchParams.set("series_id",         id)
  url.searchParams.set("api_key",           FRED_KEY)
  url.searchParams.set("observation_start", start)
  url.searchParams.set("observation_end",   end)
  url.searchParams.set("file_type",         "json")
  const resp = await fetch(url.toString())
  if (!resp.ok) return []
  const json = await resp.json() as { observations: { date: string; value: string }[] }
  return (json.observations ?? [])
    .filter(o => o.value !== ".")
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
}

export async function fetchFedBars(
  startDate: string,
  endDate: string,
  maPeriod: number,
): Promise<{ date: string; state: number }[]> {
  if (!FRED_KEY) return []

  const extraDays  = (maPeriod + 8) * 7
  const fetchStart = new Date(new Date(startDate).getTime() - extraDays * 86_400_000)
    .toISOString().slice(0, 10)

  const [walcl, tga, rrp] = await Promise.all([
    fetchFredSeries("WALCL",     fetchStart, endDate),
    fetchFredSeries("WTREGEN",   fetchStart, endDate),
    fetchFredSeries("RRPONTSYD", fetchStart, endDate),
  ])

  const allDates = Array.from(
    new Set([...walcl.map(d => d.date), ...tga.map(d => d.date), ...rrp.map(d => d.date)])
  ).sort()

  const walclMap = new Map(walcl.map(d => [d.date, d.value]))
  const tgaMap   = new Map(tga.map(d => [d.date, d.value]))
  const rrpMap   = new Map(rrp.map(d => [d.date, d.value]))

  let lastW: number | null = null, lastT: number | null = null, lastR: number | null = null
  const series: { date: string; nl: number }[] = []

  for (const date of allDates) {
    if (walclMap.has(date)) lastW = walclMap.get(date)!
    if (tgaMap.has(date))   lastT = tgaMap.get(date)!
    if (rrpMap.has(date))   lastR = rrpMap.get(date)!
    if (lastW != null && lastT != null && lastR != null)
      series.push({ date, nl: lastW - lastT - lastR })
  }

  const LOOKBACK = 4
  const result = series.map((s, i) => {
    const prev    = i >= LOOKBACK ? series[i - LOOKBACK]!.nl : null
    const rising  = prev == null ? null : s.nl > prev ? true : s.nl < prev ? false : null
    let ma: number | null = null
    if (i >= maPeriod - 1) {
      const slice = series.slice(i - maPeriod + 1, i + 1)
      ma = slice.reduce((a, x) => a + x.nl, 0) / slice.length
    }
    const aboveMA = ma != null ? s.nl > ma : null
    let state = 0
    if (aboveMA === true  && rising === true)  state =  1
    if (aboveMA === false && rising === false) state = -1
    return { date: s.date, state }
  })

  return result.filter(r => r.date >= startDate)
}

export function attachFedData(rows: Candle[], fedBars: { date: string; state: number }[]): void {
  if (!fedBars.length) return
  const sorted = [...fedBars].sort((a, b) => a.date.localeCompare(b.date))
  let lastState: number | null = null
  let fedIdx = 0

  for (const row of rows) {
    const dateStr = new Date(row.timestamp).toISOString().slice(0, 10)
    while (fedIdx < sorted.length && sorted[fedIdx]!.date <= dateStr) {
      lastState = sorted[fedIdx]!.state
      fedIdx++
    }
    if (lastState != null) row.fed_state = lastState
  }
}