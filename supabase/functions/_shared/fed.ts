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
  if (!resp.ok) {
    console.error(`[fed] FRED ${id} 요청 실패 — HTTP ${resp.status}`)
    return []
  }
  const json = await resp.json() as { observations: { date: string; value: string }[] }
  const obs = (json.observations ?? [])
    .filter(o => o.value !== ".")
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
  if (obs.length === 0) console.warn(`[fed] FRED ${id} 반환 데이터 없음 (start=${start}, end=${end})`)
  return obs
}

export async function fetchFedBars(
  startDate: string,
  endDate: string,
  maPeriod: number,
): Promise<{ date: string; state: number }[]> {
  if (!FRED_KEY) {
    console.warn('[fed] FRED_API_KEY 미설정 — 연준 유동성 비활성화')
    return []
  }

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

// FRED는 매주 목요일에 WALCL 릴리즈 → 가장 최근 목요일 00:00 UTC 반환
function lastFredThursday(): Date {
  const now = new Date()
  const day = now.getUTCDay() // 0=일 ... 4=목
  const daysBack = day >= 4 ? day - 4 : day + 3
  const thu = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack))
  return thu
}

// DB 캐시를 사용하는 버전 — 이번 주 목요일 이후 갱신됐으면 FRED API 미호출
// deno-lint-ignore no-explicit-any
export async function fetchFedBarsWithCache(
  startDate: string,
  endDate: string,
  maPeriod: number,
  supabase: any,
): Promise<{ date: string; state: number }[]> {
  // 캐시 신선도 확인 — 마지막 목요일 이후에 갱신됐는지
  const { data: freshCheck } = await supabase
    .from('fed_liquidity_cache')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastThursday = lastFredThursday()
  const lastUpdated  = freshCheck ? new Date(freshCheck.updated_at as string) : null
  const isStale      = !lastUpdated || lastUpdated < lastThursday

  if (isStale) {
    // FRED에서 6개월치 fetch 후 DB에 upsert
    const fetchStart = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10)
    const fetchEnd   = new Date().toISOString().slice(0, 10)
    try {
      const freshBars = await fetchFedBars(fetchStart, fetchEnd, maPeriod)
      if (freshBars.length > 0) {
        const now = new Date().toISOString()
        await supabase
          .from('fed_liquidity_cache')
          .upsert(freshBars.map(b => ({ date: b.date, state: b.state, updated_at: now })), { onConflict: 'date' })
        console.log(`[fed] FRED 갱신 완료 — ${freshBars.length}건 upsert`)
      }
    } catch (err) {
      console.warn('[fed] FRED fetch 실패, DB 기존 캐시 사용:', err)
    }
  }

  // DB에서 요청 범위 반환
  const { data: rows } = await supabase
    .from('fed_liquidity_cache')
    .select('date, state')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  return (rows ?? []).map((r: any) => ({ date: String(r.date), state: Number(r.state) }))
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