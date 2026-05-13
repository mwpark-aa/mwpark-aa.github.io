import { useState, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { supabase } from '../../lib/supabase'

interface OverviewPosition {
  id: string
  backtest_run_id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  target_price: number | null
  stop_loss: number | null
  quantity: number
  capital_used: number
  entry_time: string
  score: number | null
}

interface StrategyStats {
  id: string
  name: string | null
  symbol: string
  interval: string
  leverage: number
  closed: number
  wins: number
  totalPnl: number
  totalReturn: number
}

function PnlChip({ pct }: { pct: number }) {
  const pos = pct >= 0
  return (
    <Box sx={{
      px: 1, py: 0.25, borderRadius: 1,
      background: pos ? '#14532d40' : '#450a0a40',
      border: `1px solid ${pos ? '#16a34a44' : '#ef444444'}`,
      display: 'inline-block',
    }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: pos ? '#4ade80' : '#f87171' }}>
        {pos ? '+' : ''}{pct.toFixed(2)}%
      </Typography>
    </Box>
  )
}

function DirectionChip({ dir }: { dir: string }) {
  const isLong = dir === 'LONG'
  return (
    <Box sx={{
      px: 0.75, py: 0.2, borderRadius: 0.75,
      background: isLong ? '#14532d30' : '#450a0a30',
      border: `1px solid ${isLong ? '#16a34a55' : '#ef444455'}`,
      display: 'inline-block',
    }}>
      <Typography sx={{ fontSize: 10, fontWeight: 800, color: isLong ? '#4ade80' : '#f87171' }}>
        {dir}
      </Typography>
    </Box>
  )
}

export default function TradeOverview() {
  const [openPos,    setOpenPos]    = useState<OverviewPosition[]>([])
  const [strategies, setStrategies] = useState<StrategyStats[]>([])
  const [prices,     setPrices]     = useState<Record<string, number>>({})
  const [loading,    setLoading]    = useState(true)

  const loadData = useCallback(async () => {
    // OPEN 포지션 전체
    const { data: openData } = await supabase
      .from('live_positions')
      .select('id, backtest_run_id, symbol, direction, entry_price, target_price, stop_loss, quantity, capital_used, entry_time, score')
      .eq('status', 'OPEN')
      .order('entry_time', { ascending: false })

    const positions = (openData ?? []) as OverviewPosition[]
    setOpenPos(positions)

    // 전략별 CLOSED 집계
    const { data: closedData } = await supabase
      .from('live_positions')
      .select('backtest_run_id, net_pnl, capital_used')
      .eq('status', 'CLOSED')

    const statsMap = new Map<string, { closed: number; wins: number; totalPnl: number; totalCapital: number }>()
    for (const t of (closedData ?? [])) {
      const s = statsMap.get(t.backtest_run_id) ?? { closed: 0, wins: 0, totalPnl: 0, totalCapital: 0 }
      s.closed++
      s.totalPnl += t.net_pnl ?? 0
      s.totalCapital += t.capital_used ?? 0
      if ((t.net_pnl ?? 0) > 0) s.wins++
      statsMap.set(t.backtest_run_id, s)
    }

    // 전략 메타 조회
    const runIds = [...new Set([
      ...positions.map(p => p.backtest_run_id),
      ...Array.from(statsMap.keys()),
    ])]

    if (runIds.length > 0) {
      const { data: runs } = await supabase
        .from('backtest_runs')
        .select('id, name, symbol, interval, leverage')
        .in('id', runIds)

      const strats: StrategyStats[] = (runs ?? []).map(r => {
        const s = statsMap.get(r.id)
        return {
          id:          r.id,
          name:        r.name ?? null,
          symbol:      r.symbol,
          interval:    r.interval,
          leverage:    r.leverage,
          closed:      s?.closed ?? 0,
          wins:        s?.wins ?? 0,
          totalPnl:    s?.totalPnl ?? 0,
          totalReturn: s && s.totalCapital > 0 ? (s.totalPnl / s.totalCapital) * 100 : 0,
        }
      }).filter(s => s.closed > 0 || positions.some(p => p.backtest_run_id === s.id))
        .sort((a, b) => b.totalReturn - a.totalReturn)

      setStrategies(strats)
    }

    setLoading(false)
  }, [])

  // 현재가 폴링
  useEffect(() => {
    if (openPos.length === 0) return
    const symbols = [...new Set(openPos.map(p => p.symbol))]
    const fetchAll = () => Promise.all(symbols.map(async sym => {
      try {
        const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}USDT`)
        const { price } = await r.json() as { price: string }
        setPrices(prev => ({ ...prev, [sym]: parseFloat(price) }))
      } catch { /* 무시 */ }
    }))
    fetchAll()
    const timer = setInterval(fetchAll, 5000)
    return () => clearInterval(timer)
  }, [openPos])

  useEffect(() => { loadData() }, [loadData])

  // Realtime 구독
  useEffect(() => {
    const channel = supabase
      .channel('trade-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_positions' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={24} sx={{ color: '#3b82f6' }} />
      </Box>
    )
  }

  const activeStrategies = strategies.filter(s => openPos.some(p => p.backtest_run_id === s.id))
  const closedStrategies = strategies.filter(s => s.closed > 0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ── 요약 통계 ── */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {[
          { label: '활성 전략', value: activeStrategies.length, color: '#3b82f6' },
          { label: 'OPEN 포지션', value: openPos.length, color: '#fbbf24' },
          { label: '총 거래 수', value: closedStrategies.reduce((s, c) => s + c.closed, 0), color: '#a78bfa' },
        ].map(stat => (
          <Box key={stat.label} sx={{
            px: 2, py: 1.5, borderRadius: 2,
            background: '#0a0a0b', border: `1px solid ${stat.color}22`,
            minWidth: 100,
          }}>
            <Typography sx={{ fontSize: 10, color: '#52525b', mb: 0.25 }}>{stat.label}</Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 800, color: stat.color, fontFamily: 'monospace' }}>
              {stat.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── OPEN 포지션 ── */}
      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#a1a1aa', mb: 1 }}>
          실시간 OPEN 포지션
        </Typography>
        {openPos.length === 0 ? (
          <Typography sx={{ fontSize: 11, color: '#3f3f46', textAlign: 'center', py: 3 }}>
            현재 활성 포지션 없음
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {openPos.map(pos => {
              const currentPrice  = prices[pos.symbol]
              const isShort       = pos.direction === 'SHORT'
              const unrealPct     = currentPrice
                ? (isShort
                    ? (pos.entry_price - currentPrice) / pos.entry_price
                    : (currentPrice - pos.entry_price) / pos.entry_price) * 100
                : null
              const strategy = strategies.find(s => s.id === pos.backtest_run_id)
              const entryDate = new Date(pos.entry_time)
              const elapsed   = Math.floor((Date.now() - entryDate.getTime()) / 60000)
              const elapsedStr = elapsed < 60 ? `${elapsed}분` : elapsed < 1440 ? `${Math.floor(elapsed / 60)}시간` : `${Math.floor(elapsed / 1440)}일`

              return (
                <Box key={pos.id} sx={{
                  px: 2, py: 1.25, borderRadius: 2,
                  background: '#0a0a0b', border: '1px solid #1f1f23',
                  display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                }}>
                  {/* 심볼 + 방향 */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 100 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#fafafa', fontFamily: 'monospace' }}>
                      {pos.symbol}
                    </Typography>
                    <DirectionChip dir={pos.direction} />
                  </Box>

                  {/* 가격 정보 */}
                  <Box sx={{ flex: 1, minWidth: 140 }}>
                    <Typography sx={{ fontSize: 10, color: '#52525b' }}>
                      진입 ${pos.entry_price.toLocaleString()}
                      {currentPrice && (
                        <> → 현재 ${currentPrice.toLocaleString()}</>
                      )}
                    </Typography>
                  </Box>

                  {/* 미실현 손익 */}
                  <Box sx={{ minWidth: 70 }}>
                    {unrealPct != null
                      ? <PnlChip pct={unrealPct} />
                      : <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>—</Typography>
                    }
                  </Box>

                  {/* 전략명 */}
                  <Typography sx={{ fontSize: 10, color: '#52525b', flex: 1 }}>
                    {strategy?.name ?? strategy ? `${strategy?.symbol} ${strategy?.interval}` : '—'}
                  </Typography>

                  {/* 경과 시간 */}
                  <Typography sx={{ fontSize: 10, color: '#3f3f46', fontFamily: 'monospace' }}>
                    {elapsedStr} 전
                  </Typography>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>

      {/* ── 전략별 수익률 현황 ── */}
      {closedStrategies.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#a1a1aa', mb: 1 }}>
            전략별 수익률 현황
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {closedStrategies.map((s, i) => {
              const winRate = s.closed > 0 ? (s.wins / s.closed) * 100 : 0
              const isOpen  = openPos.some(p => p.backtest_run_id === s.id)
              return (
                <Box key={s.id} sx={{
                  px: 2, py: 1.25, borderRadius: 2,
                  background: '#0a0a0b',
                  border: `1px solid ${isOpen ? '#3b82f633' : '#1f1f23'}`,
                  display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                }}>
                  {/* 순위 */}
                  <Typography sx={{ fontSize: 12, fontWeight: 800, color: i < 3 ? '#fbbf24' : '#3f3f46', fontFamily: 'monospace', width: 20 }}>
                    {i + 1}
                  </Typography>

                  {/* 전략명 */}
                  <Box sx={{ flex: 1, minWidth: 120 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7' }}>
                      {s.name ?? `${s.symbol} ${s.interval}`}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: '#52525b' }}>
                      {s.symbol} · {s.interval} · {s.leverage}x
                      {isOpen && <Box component="span" sx={{ ml: 0.75, color: '#3b82f6' }}>● 거래중</Box>}
                    </Typography>
                  </Box>

                  {/* 수익률 */}
                  <PnlChip pct={s.totalReturn} />

                  {/* 승률 */}
                  <Box sx={{ textAlign: 'right', minWidth: 60 }}>
                    <Typography sx={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'monospace' }}>
                      {winRate.toFixed(0)}% 승률
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: '#52525b' }}>
                      {s.wins}W / {s.closed - s.wins}L
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      )}

      {strategies.length === 0 && openPos.length === 0 && (
        <Typography sx={{ fontSize: 11, color: '#3f3f46', textAlign: 'center', py: 6 }}>
          아직 거래 데이터가 없습니다
        </Typography>
      )}
    </Box>
  )
}
