import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// DB fed_liquidity_cache 에서 최신 state 읽기
// live-trade edge function이 주 1회 갱신하므로 클라이언트는 단순 조회만
export function useFedState(): number | null {
  const [fedState, setFedState] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('fed_liquidity_cache')
      .select('date, state')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setFedState(data.state as number)
      })
  }, [])

  return fedState
}