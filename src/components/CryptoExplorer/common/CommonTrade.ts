export interface CommonTrade {
  id: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  exit_price: number
  entry_ts: string
  exit_ts: string
  net_pnl: number
  pnl_pct: number
  exit_reason: string
  signal_details?: string | null
  exit_details?: string | null
  capital_used: number
  capital_before?: number | null
  score?: number | null

  // 백테스트 특화 (선택)
  commission?: number | null
  avg_entry_price?: number | null
  add_entries?: any
}
