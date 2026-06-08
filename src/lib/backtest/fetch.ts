import type { Candle, FedBar, DailyBar } from './types'
import { computeIndicators } from './indicators'
import { supabase } from '../supabase'

// ── Binance 캔들 데이터 ──────────────────────────────────────────

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
    url.searchParams.set('symbol', `${symbol}USDT`)
    url.searchParams.set('interval', interval)
    url.searchParams.set('startTime', String(cursor))
    url.searchParams.set('endTime', String(endMs))
    url.searchParams.set('limit', '1000')

    const resp = await fetch(url.toString())
    if (!resp.ok) throw new Error(`Binance API 오류: ${resp.status}`)

    const data: any[][] = await resp.json()
    if (!data.length) break

    for (const k of data) {
      rows.push({
        timestamp: Number(k[0]),
        open:   +k[1],
        high:   +k[2],
        low:    +k[3],
        close:  +k[4],
        volume: +k[5],
      })
    }

    cursor = data[data.length - 1][0] + 1
    if (data.length < 1000) break

    // API 요청 간 딜레이 (레이트 리밋 방지)
    await new Promise(r => setTimeout(r, 120))
  }

  return rows
}

// ── 연준 유동성 (Fed Net Liquidity) ──────────────────────────────

const LOOKBACK = 4

function computeStates(
  series: { date: string; nl: number }[],
  maPeriod: number,
  startDate: string,
): FedBar[] {
  return series.map((s, i) => {
    const prev   = i >= LOOKBACK ? series[i - LOOKBACK]!.nl : null
    const rising = prev == null ? null : s.nl > prev ? true : s.nl < prev ? false : null
    let ma: number | null = null
    if (i >= maPeriod - 1) {
      const slice = series.slice(i - maPeriod + 1, i + 1)
      ma = slice.reduce((a, x) => a + x.nl, 0) / slice.length
    }
    const aboveMA = ma != null ? s.nl > ma : null
    let state = 0
    if (aboveMA === true  && rising === true)  state =  1
    if (aboveMA === false && rising === false) state = -1
    return { date: s.date, netLiquidity: s.nl, ma, state }
  }).filter(r => r.date >= startDate)
}

export async function fetchFedLiquidity(
  startDate: string,
  endDate: string,
  maPeriod: number,
): Promise<FedBar[]> {
  // MA 워밍업용 선행 데이터 포함
  const warmupStart = new Date(new Date(startDate).getTime() - (maPeriod + 8) * 7 * 86_400_000)
    .toISOString().slice(0, 10)

  // 1. 캐시 우선 (FRED rate limit 회피)
  try {
    const { data: rows } = await supabase
      .from('fed_liquidity_cache')
      .select('date, net_liquidity, state')
      .gte('date', warmupStart)
      .lte('date', endDate)
      .order('date')

    if (rows?.length) {
      // 캐시의 가장 오래된 날짜가 warmupStart보다 7일 이상 늦으면 Edge Function으로 fallback
      const oldestCached = String(rows[0].date)
      const cacheCoversStart = oldestCached <= new Date(new Date(warmupStart).getTime() + 7 * 86_400_000).toISOString().slice(0, 10)

      if (cacheCoversStart) {
        // net_liquidity 있으면 → maPeriod로 state 동적 계산
        const nlRows = rows.filter(r => r.net_liquidity != null)
        if (nlRows.length >= maPeriod) {
          return computeStates(
            nlRows.map(r => ({ date: String(r.date), nl: Number(r.net_liquidity) })),
            maPeriod,
            startDate,
          )
        }
        // 구버전 캐시 (state만 있음) → 그대로 사용
        const stateRows = rows.filter(r => r.state != null && r.date >= startDate)
        if (stateRows.length) {
          return stateRows.map(r => ({ date: String(r.date), netLiquidity: 0, ma: null, state: Number(r.state) }))
        }
      }
    }
  } catch (e) {
    console.warn('[fed] 캐시 읽기 실패, Edge Function 시도:', e)
  }

  // 2. 캐시 없으면 Edge Function 호출 (fallback)
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string
  if (!baseUrl) return []
  try {
    const resp = await fetch(`${baseUrl}/functions/v1/fed-liquidity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
      },
      body: JSON.stringify({ startDate, endDate, maPeriod }),
    })
    if (!resp.ok) {
      console.error(`[fed] Edge Function HTTP ${resp.status}:`, await resp.text().catch(() => ''))
      return []
    }
    return ((await resp.json()).data ?? []) as FedBar[]
  } catch (e) {
    console.error('[fed] fetchFedLiquidity 오류:', e)
    return []
  }
}

/**
 * Fed 데이터를 캔들에 forward-fill로 부착.
 * 주 1회 발표 데이터를 다음 발표 전까지 이어서 사용.
 */
export function attachFedData(rows: Candle[], fedBars: FedBar[]): void {
  if (!fedBars.length) return

  const sorted = [...fedBars].sort((a, b) => a.date.localeCompare(b.date))
  let lastBar: FedBar | null = null
  let fedIdx = 0

  for (const row of rows) {
    const dateStr = new Date(row.timestamp).toISOString().slice(0, 10)

    // 현재 날짜 이하인 가장 최신 Fed 데이터 찾기
    while (fedIdx < sorted.length && sorted[fedIdx].date <= dateStr) {
      lastBar = sorted[fedIdx]
      fedIdx++
    }

    if (lastBar) {
      row.fed_net_liquidity = lastBar.netLiquidity
      row.fed_state         = lastBar.state
    }
  }
}

// ── 일봉 추세 맵 (MTF용) ─────────────────────────────────────────

/**
 * 일봉 MA120 + 일목균형표를 날짜별로 저장한 Map을 반환.
 * 서브 인터벌 봉에서 "현재 일봉 추세"를 조회하는 데 사용.
 */
export async function buildDailyTrendMap(
  symbol: string,
  startMs: number,
  endMs: number,
): Promise<Map<number, DailyBar>> {
  // MA120 + 일목 워밍업: 220일
  const WARMUP_MS = 220 * 86400000
  const rows = await fetchKlines(symbol, '1d', startMs - WARMUP_MS, endMs)

  // 지표 계산 (MA120, 일목 등)
  computeIndicators(rows)

  const map = new Map<number, DailyBar>()
  for (const row of rows) {
    map.set(row.timestamp, {
      close:       row.close,
      ma120:       row.ma120 ?? null,
      ichimoku_a:  row.ichimoku_a ?? null,
      ichimoku_b:  row.ichimoku_b ?? null,
    })
  }
  return map
}

/**
 * 주어진 타임스탬프 기준 "직전 완료 일봉"을 반환.
 * 당일 미완성 봉은 포함하지 않음 (전날부터 최대 7일 소급).
 */
export function getDailyBar(map: Map<number, DailyBar>, ts: number): DailyBar | null {
  const d = new Date(ts)
  const todayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const yesterdayMs = todayMs - 86400000

  for (let i = 0; i < 7; i++) {
    const bar = map.get(yesterdayMs - i * 86400000)
    if (bar) return bar
  }
  return null
}
