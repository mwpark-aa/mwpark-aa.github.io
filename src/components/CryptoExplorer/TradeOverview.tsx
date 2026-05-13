import { useState, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { supabase } from '../../lib/supabase'

interface RawPosition {
  id: string
  user_id: string
  backtest_run_id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  target_price: number | null
  stop_loss: number | null
  quantity: number
  capital_used: number
  entry_time: string
  net_pnl: number | null
  status: 'OPEN' | 'CLOSED'
}

interface TraderStat {
  userId: string
  idx: number
  openPositions: RawPosition[]
  closedCount: number
  wins: number
  realizedPnl: number
  totalCapital: number
}

function PnlBadge({ value, pct }: { value?: number; pct: number }) {
  const pos = pct >= 0
  return (
    <Box sx={{
      px: 1, py: 0.3, borderRadius: 1,
      background: pos ? '#14532d30' : '#450a0a30',
      border: `1px solid ${pos ? '#16a34a44' : '#ef444444'}`,
    }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: pos ? '#4ade80' : '#f87171' }}>
        {pos ? '+' : ''}{pct.toFixed(2)}%
        {value !== undefined && (
          <Box component="span" sx={{ fontSize: 10, ml: 0.5, opacity: 0.7 }}>
            ({pos ? '+' : ''}${value.toFixed(1)})
          </Box>
        )}
      </Typography>
    </Box>
  )
}

function elapsed(entryTime: string) {
  const ms = Date.now() - new Date(entryTime).getTime()
  const m  = Math.floor(ms / 60000)
  if (m < 60)   return `${m}분`
  if (m < 1440) return `${Math.floor(m / 60)}시간`
  return `${Math.floor(m / 1440)}일`
}

export default function TradeOverview() {
  const [traders, setTraders] = useState<TraderStat[]>([])
  const [prices,  setPrices]  = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from('live_positions')
      .select('id, user_id, backtest_run_id, symbol, direction, entry_price, target_price, stop_loss, quantity, capital_used, entry_time, net_pnl, status')
      .in('status', ['OPEN', 'CLOSED'])
      .order('entry_time', { ascending: false })
      .limit(500)

    const rows = (data ?? []) as RawPosition[]

    // user_id별로 그룹화
    const map = new Map<string, { open: RawPosition[]; closed: RawPosition[] }>()
    for (const r of rows) {
      if (!map.has(r.user_id)) map.set(r.user_id, { open: [], closed: [] })
      if (r.status === 'OPEN')   map.get(r.user_id)!.open.push(r)
      else                       map.get(r.user_id)!.closed.push(r)
    }

    // 실제 거래가 있는 유저만, 총수익률 내림차순 정렬
    const stats: TraderStat[] = Array.from(map.entries())
      .map(([userId, { open, closed }], idx) => {
        const realizedPnl  = closed.reduce((s, t) => s + (t.net_pnl ?? 0), 0)
        const totalCapital = closed.reduce((s, t) => s + (t.capital_used ?? 0), 0)
        const wins         = closed.filter(t => (t.net_pnl ?? 0) > 0).length
        return { userId, idx: idx + 1, openPositions: open, closedCount: closed.length, wins, realizedPnl, totalCapital }
      })
      .sort((a, b) => {
        const ra = a.totalCapital > 0 ? a.realizedPnl / a.totalCapital : 0
        const rb = b.totalCapital > 0 ? b.realizedPnl / b.totalCapital : 0
        return rb - ra
      })
      .map((s, i) => ({ ...s, idx: i + 1 }))

    setTraders(stats)
    setLoading(false)
  }, [])

  // 현재가 폴링
  useEffect(() => {
    const symbols = [...new Set(traders.flatMap(t => t.openPositions.map(p => p.symbol)))]
    if (symbols.length === 0) return
    const fetch_ = () => Promise.all(symbols.map(async sym => {
      try {
        const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}USDT`)
        const { price } = await r.json() as { price: string }
        setPrices(prev => ({ ...prev, [sym]: parseFloat(price) }))
      } catch { /* 무시 */ }
    }))
    fetch_()
    const timer = setInterval(fetch_, 5000)
    return () => clearInterval(timer)
  }, [traders])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const ch = supabase.channel('overview-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_positions' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadData])

  if (loading) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
      <CircularProgress size={22} sx={{ color: '#38bdf8' }} />
    </Box>
  )

  const totalOpen = traders.reduce((s, t) => s + t.openPositions.length, 0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* 요약 헤더 */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        {[
          { label: '거래자', value: traders.length },
          { label: 'OPEN 포지션', value: totalOpen },
        ].map(s => (
          <Box key={s.label} sx={{ px: 2, py: 1.25, borderRadius: 2, background: '#0a0a0b', border: '1px solid #1f1f23', minWidth: 90 }}>
            <Typography sx={{ fontSize: 10, color: '#52525b' }}>{s.label}</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>{s.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* 거래자별 카드 */}
      {traders.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: '#3f3f46', textAlign: 'center', py: 6 }}>
          거래 데이터 없음
        </Typography>
      ) : traders.map(trader => {
        const returnPct = trader.totalCapital > 0
          ? (trader.realizedPnl / trader.totalCapital) * 100 : 0
        const winRate   = trader.closedCount > 0
          ? (trader.wins / trader.closedCount) * 100 : null

        // 미실현 손익 합산
        const unrealizedPnl = trader.openPositions.reduce((sum, pos) => {
          const p = prices[pos.symbol]
          if (!p) return sum
          const diff = pos.direction === 'LONG' ? p - pos.entry_price : pos.entry_price - p
          return sum + diff * pos.quantity
        }, 0)
        const unrealizedPct = trader.openPositions.reduce((cap, p) => cap + p.capital_used, 0)
        const unrealizedReturn = unrealizedPct > 0 ? (unrealizedPnl / unrealizedPct) * 100 : null

        return (
          <Box key={trader.userId} sx={{
            borderRadius: 2, border: '1px solid #1f1f23', background: '#0a0a0b',
            overflow: 'hidden',
          }}>
            {/* 유저 헤더 */}
            <Box sx={{
              px: 2, py: 1.25, background: '#111113',
              display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
            }}>
              {/* 식별자 */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: `hsl(${(trader.idx * 67) % 360}, 60%, 45%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>
                    {trader.idx}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#e4e4e7' }}>
                  거래자 {trader.idx}
                </Typography>
                {trader.openPositions.length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80',
                      animation: 'pulse 2s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
                    <Typography sx={{ fontSize: 10, color: '#4ade80' }}>거래중</Typography>
                  </Box>
                )}
              </Box>

              <Box sx={{ flex: 1 }} />

              {/* 실현 수익 */}
              {trader.closedCount > 0 && (
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.25 }}>실현 수익</Typography>
                  <PnlBadge value={trader.realizedPnl} pct={returnPct} />
                </Box>
              )}

              {/* 미실현 수익 */}
              {unrealizedReturn !== null && (
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.25 }}>미실현</Typography>
                  <PnlBadge pct={unrealizedReturn} />
                </Box>
              )}

              {/* 승률 */}
              {winRate !== null && (
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: 9, color: '#52525b' }}>
                    승률 {winRate.toFixed(0)}% · {trader.closedCount}건
                  </Typography>
                </Box>
              )}
            </Box>

            {/* OPEN 포지션 목록 */}
            {trader.openPositions.length > 0 && (
              <Box sx={{ px: 2, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {trader.openPositions.map(pos => {
                  const cur = prices[pos.symbol]
                  const isShort = pos.direction === 'LONG' ? false : true
                  const unrealPct = cur
                    ? ((isShort ? pos.entry_price - cur : cur - pos.entry_price) / pos.entry_price) * 100
                    : null
                  const posColor = pos.direction === 'LONG' ? '#4ade80' : '#f87171'

                  return (
                    <Box key={pos.id} sx={{
                      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                      px: 1.5, py: 0.75, borderRadius: 1.5,
                      background: '#09090b', border: '1px solid #18181b',
                    }}>
                      {/* 심볼 + 방향 */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 110 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#fafafa', fontFamily: 'monospace' }}>
                          {pos.symbol}
                        </Typography>
                        <Box sx={{ px: 0.75, py: 0.15, borderRadius: 0.75, background: `${posColor}15`, border: `1px solid ${posColor}44` }}>
                          <Typography sx={{ fontSize: 10, fontWeight: 800, color: posColor }}>
                            {pos.direction}
                          </Typography>
                        </Box>
                      </Box>

                      {/* 가격 */}
                      <Typography sx={{ fontSize: 11, color: '#71717a', fontFamily: 'monospace', flex: 1 }}>
                        ${pos.entry_price.toLocaleString()}
                        {cur && <> → <Box component="span" sx={{ color: '#a1a1aa' }}>${cur.toLocaleString()}</Box></>}
                      </Typography>

                      {/* 미실현 손익 */}
                      {unrealPct !== null
                        ? <PnlBadge pct={unrealPct} />
                        : <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>—</Typography>
                      }

                      {/* TP/SL */}
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {pos.target_price && (
                          <Typography sx={{ fontSize: 10, color: '#4ade8055', fontFamily: 'monospace' }}>
                            TP ${pos.target_price.toLocaleString()}
                          </Typography>
                        )}
                        {pos.stop_loss && (
                          <Typography sx={{ fontSize: 10, color: '#f8717155', fontFamily: 'monospace' }}>
                            SL ${pos.stop_loss.toLocaleString()}
                          </Typography>
                        )}
                      </Box>

                      {/* 경과 */}
                      <Typography sx={{ fontSize: 10, color: '#3f3f46', fontFamily: 'monospace' }}>
                        {elapsed(pos.entry_time)}
                      </Typography>
                    </Box>
                  )
                })}
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
