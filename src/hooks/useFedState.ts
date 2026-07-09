import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const LOOKBACK = 4
const DEFAULT_MA_PERIOD = 13

function computeLatestState(rows: { nl: number }[], maPeriod: number): number | null {
  if (rows.length < LOOKBACK + 1) return null
  const i = rows.length - 1
  const s = rows[i].nl
  const prev = rows[i - LOOKBACK].nl
  const rising = s > prev ? true : s < prev ? false : null

  const start = Math.max(0, i - maPeriod + 1)
  const slice = rows.slice(start, i + 1)
  if (slice.length < maPeriod) return null
  const ma = slice.reduce((a, x) => a + x.nl, 0) / slice.length

  const aboveMA = s > ma
  if (aboveMA && rising === true)  return 1
  if (!aboveMA && rising === false) return -1
  return 0
}

async function fetchFedState(maPeriod: number): Promise<number | null> {
  const { data } = await supabase
    .from('fed_liquidity_cache')
    .select('date, net_liquidity')
    .order('date', { ascending: false })
    .limit(maPeriod + LOOKBACK + 2)

  if (!data?.length) return null
  const withNl = data.filter(r => r.net_liquidity != null)
  if (withNl.length < maPeriod + LOOKBACK) return null

  const series = [...withNl].reverse().map(r => ({ nl: Number(r.net_liquidity) }))
  return computeLatestState(series, maPeriod)
}

/** 단일 MA 기간(기본 13) 기준 연준 상태 — 하위 호환용 */
export function useFedState(maPeriod: number = DEFAULT_MA_PERIOD): number | null {
  const [fedState, setFedState] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchFedState(maPeriod).then(state => {
      if (!cancelled && state != null) setFedState(state)
    })
    return () => { cancelled = true }
  }, [maPeriod])

  return fedState
}

/** 여러 전략(config)이 저마다 다른 MA 기간을 쓸 때, 기간별 연준 상태를 한번에 계산 */
export function useFedStateByPeriod(maPeriods: number[]): Record<number, number | null> {
  const [stateMap, setStateMap] = useState<Record<number, number | null>>({})
  const key = [...new Set(maPeriods)].sort((a, b) => a - b).join(',')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const periods = key.split(',').map(Number)
    periods.forEach(period => {
      fetchFedState(period).then(state => {
        if (!cancelled && state != null) setStateMap(prev => ({ ...prev, [period]: state }))
      })
    })
    return () => { cancelled = true }
  }, [key])

  return stateMap
}