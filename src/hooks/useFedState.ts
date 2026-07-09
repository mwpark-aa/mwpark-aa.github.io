import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const LOOKBACK = 4
const MA_PERIOD = 13  // 표시용 기본값

function computeLatestState(rows: { nl: number }[]): number | null {
  if (rows.length < LOOKBACK + 1) return null
  const i = rows.length - 1
  const s = rows[i].nl
  const prev = rows[i - LOOKBACK].nl
  const rising = s > prev ? true : s < prev ? false : null

  const start = Math.max(0, i - MA_PERIOD + 1)
  const slice = rows.slice(start, i + 1)
  if (slice.length < MA_PERIOD) return null
  const ma = slice.reduce((a, x) => a + x.nl, 0) / slice.length

  const aboveMA = s > ma
  if (aboveMA && rising === true)  return 1
  if (!aboveMA && rising === false) return -1
  return 0
}

export function useFedState(): number | null {
  const [fedState, setFedState] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('fed_liquidity_cache')
      .select('date, net_liquidity')
      .order('date', { ascending: false })
      .limit(MA_PERIOD + LOOKBACK + 2)
      .then(({ data }) => {
        if (!data?.length) return

        const withNl = data.filter(r => r.net_liquidity != null)
        if (withNl.length < MA_PERIOD + LOOKBACK) return

        const series = [...withNl].reverse().map(r => ({ nl: Number(r.net_liquidity) }))
        const state = computeLatestState(series)
        if (state != null) setFedState(state)
      })
  }, [])

  return fedState
}