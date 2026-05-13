import { useState, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { supabase } from '../../lib/supabase'

interface RawPosition {
  id: string
  user_id: string
  api_key_id: string | null
  symbol: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  quantity: number
  capital_used: number
  entry_time: string
  net_pnl: number | null
  status: 'OPEN' | 'CLOSED'
}

interface RawAccount {
  api_key_id: string | null
  user_id: string
  balance: number | null
  initial_balance: number | null
  is_testnet: boolean
}

interface TraderStat {
  userId: string
  idx: number
  openPositions: RawPosition[]
  closedCount: number
  wins: number
  realizedPnl: number
  closedCapital: number
  balance: number | null
  initialBalance: number | null
}

function StatBox({ label, value, sub, valueColor }: {
  label: string; value: string; sub?: string; valueColor?: string
}) {
  return (
    <Box sx={{ px: 1.5, py: 1, borderRadius: 1.5, background: '#0a0a0b', border: '1px solid #1f1f23' }}>
      <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 15, fontWeight: 800, color: valueColor ?? '#e4e4e7', fontFamily: 'monospace', lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: 10, color: '#52525b', fontFamily: 'monospace', mt: 0.2 }}>{sub}</Typography>
      )}
    </Box>
  )
}

function pnlColor(pct: number) { return pct >= 0 ? '#4ade80' : '#f87171' }
function pnlFmt(pct: number, abs: number) {
  const sign = pct >= 0 ? '+' : ''
  return { pctStr: `${sign}${pct.toFixed(2)}%`, absStr: `${sign}$${Math.abs(abs).toFixed(1)}` }
}

function elapsed(entryTime: string) {
  const ms = Date.now() - new Date(entryTime).getTime()
  const m  = Math.floor(ms / 60000)
  if (m < 60)   return `${m}분`
  if (m < 1440) return `${Math.floor(m / 60)}시간`
  return `${Math.floor(m / 1440)}일`
}

function fmtUsd(v: number) {
  return v >= 10000
    ? `$${(v / 1000).toFixed(1)}k`
    : `$${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
}

export default function TradeOverview() {
  const [traders,     setTraders]     = useState<TraderStat[]>([])
  const [prices,      setPrices]      = useState<Record<string, number>>({})
  const [testnetKeys, setTestnetKeys] = useState<Record<string, boolean>>({})
  const [loading,     setLoading]     = useState(true)

  const loadData = useCallback(async () => {
    const [posRes, accRes] = await Promise.all([
      supabase
        .from('live_positions')
        .select('id, user_id, api_key_id, symbol, direction, entry_price, quantity, capital_used, entry_time, net_pnl, status')
        .in('status', ['OPEN', 'CLOSED'])
        .order('entry_time', { ascending: false })
        .limit(500),
      supabase
        .from('live_accounts')
        .select('api_key_id, user_id, balance, initial_balance, is_testnet'),
    ])

    const rows    = (posRes.data ?? []) as RawPosition[]
    const accounts = (accRes.data ?? []) as RawAccount[]

    // api_key_id → is_testnet (포지션 행에서 직접 조회용)
    const keyTestnet: Record<string, boolean> = {}
    for (const a of accounts) {
      if (a.api_key_id) keyTestnet[a.api_key_id] = a.is_testnet
    }
    setTestnetKeys(keyTestnet)

    // user_id별 잔액 합산 (여러 api_key → sum)
    const balanceMap = new Map<string, { balance: number; initialBalance: number }>()
    for (const a of accounts) {
      if (!a.user_id) continue
      const prev = balanceMap.get(a.user_id) ?? { balance: 0, initialBalance: 0 }
      balanceMap.set(a.user_id, {
        balance:        prev.balance        + (a.balance        ?? 0),
        initialBalance: prev.initialBalance + (a.initial_balance ?? 0),
      })
    }

    const map = new Map<string, { open: RawPosition[]; closed: RawPosition[] }>()
    for (const r of rows) {
      if (!map.has(r.user_id)) map.set(r.user_id, { open: [], closed: [] })
      if (r.status === 'OPEN') map.get(r.user_id)!.open.push(r)
      else                     map.get(r.user_id)!.closed.push(r)
    }

    const stats: TraderStat[] = Array.from(map.entries())
      .map(([userId, { open, closed }], idx) => {
        const realizedPnl  = closed.reduce((s, t) => s + (t.net_pnl ?? 0), 0)
        const closedCapital = closed.reduce((s, t) => s + (t.capital_used ?? 0), 0)
        const wins          = closed.filter(t => (t.net_pnl ?? 0) > 0).length
        const acc = balanceMap.get(userId)
        return {
          userId, idx: idx + 1,
          openPositions: open,
          closedCount: closed.length,
          wins,
          realizedPnl,
          closedCapital,
          balance:        acc?.balance        ?? null,
          initialBalance: acc?.initialBalance ?? null,
        }
      })
      .filter(s => s.closedCount > 0 || s.openPositions.length > 0)
      .sort((a, b) => {
        // 총 수익률 기준 내림차순
        const pctA = a.initialBalance && a.initialBalance > 0 && a.balance !== null
          ? (a.balance - a.initialBalance) / a.initialBalance : 0
        const pctB = b.initialBalance && b.initialBalance > 0 && b.balance !== null
          ? (b.balance - b.initialBalance) / b.initialBalance : 0
        return pctB - pctA
      })
      .map((s, i) => ({ ...s, idx: i + 1 }))

    setTraders(stats)
    setLoading(false)
  }, [])

  // 현재가 폴링 (5초)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_accounts'  }, loadData)
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
        <StatBox label="거래자" value={String(traders.length)} valueColor="#38bdf8" />
        <StatBox label="OPEN 포지션" value={String(totalOpen)} valueColor="#4ade80" />
      </Box>

      {/* 거래자별 카드 */}
      {traders.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: '#3f3f46', textAlign: 'center', py: 6 }}>
          거래 데이터 없음
        </Typography>
      ) : traders.map(trader => {
        // 미실현 손익
        const unrealizedPnl = trader.openPositions.reduce((sum, pos) => {
          const p = prices[pos.symbol]
          if (!p) return sum
          const diff = pos.direction === 'LONG' ? p - pos.entry_price : pos.entry_price - p
          return sum + diff * pos.quantity
        }, 0)
        const openCapital = trader.openPositions.reduce((s, p) => s + p.capital_used, 0)

        // 모든 % 는 동일한 기준(초기 잔액 → 없으면 총 투입 자금)으로 통일
        const initBal = trader.initialBalance
        const curBal  = trader.balance
        const pctBase = (initBal && initBal > 0) ? initBal : (trader.closedCapital + openCapital) || null

        const totalPnl      = trader.realizedPnl + unrealizedPnl
        const totalPct      = pctBase ? (totalPnl      / pctBase) * 100 : null
        const realizedPct   = pctBase ? (trader.realizedPnl / pctBase) * 100 : null
        const unrealizedPct = pctBase ? (unrealizedPnl / pctBase) * 100 : null

        const winRate = trader.closedCount > 0
          ? (trader.wins / trader.closedCount) * 100 : null

        const isLive = trader.openPositions.length > 0

        return (
          <Box key={trader.userId} sx={{
            borderRadius: 2, border: '1px solid #1f1f23', background: '#0a0a0b',
            overflow: 'hidden',
          }}>
            {/* 유저 헤더 */}
            <Box sx={{ px: 2, py: 1.5, background: '#111113' }}>
              {/* 상단: 이름 + 라이브 뱃지 */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.25 }}>
                <Box sx={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: `hsl(${(trader.idx * 67) % 360}, 55%, 42%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{trader.idx}</Typography>
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7' }}>
                  거래자 {trader.idx}
                </Typography>
                {isLive && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                    <Box sx={{
                      width: 5, height: 5, borderRadius: '50%', background: '#4ade80',
                      animation: 'pulse 2s infinite',
                      '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                    }} />
                    <Typography sx={{ fontSize: 10, color: '#4ade80' }}>거래중</Typography>
                  </Box>
                )}
                <Box sx={{ flex: 1 }} />
                {winRate !== null && (
                  <Typography sx={{ fontSize: 11, color: '#52525b' }}>
                    승률 {winRate.toFixed(0)}% · {trader.closedCount}건
                  </Typography>
                )}
              </Box>

              {/* 자금 & 수익 stats — 균등 그리드 */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 1 }}>
                <StatBox
                  label="초기 자금"
                  value={initBal != null && initBal > 0 ? fmtUsd(initBal) : '—'}
                  valueColor={initBal != null && initBal > 0 ? '#a1a1aa' : '#3f3f46'}
                />
                <StatBox
                  label="현재 잔액"
                  value={curBal != null ? fmtUsd(curBal) : '—'}
                  valueColor={curBal != null ? '#e4e4e7' : '#3f3f46'}
                />
                {realizedPct !== null && trader.realizedPnl !== 0 && (() => {
                  const { pctStr, absStr } = pnlFmt(realizedPct, trader.realizedPnl)
                  return <StatBox label="실현 손익" value={pctStr} sub={absStr} valueColor={pnlColor(realizedPct)} />
                })()}
                {unrealizedPct !== null && openCapital > 0 && (() => {
                  const { pctStr, absStr } = pnlFmt(unrealizedPct, unrealizedPnl)
                  return <StatBox label="미실현" value={pctStr} sub={absStr} valueColor={pnlColor(unrealizedPct)} />
                })()}
                {totalPct !== null && (trader.realizedPnl !== 0 || openCapital > 0) && (() => {
                  const { pctStr, absStr } = pnlFmt(totalPct, totalPnl)
                  return <StatBox label="총 손익" value={pctStr} sub={absStr} valueColor={pnlColor(totalPct)} />
                })()}
              </Box>
            </Box>

            {/* OPEN 포지션 목록 */}
            {trader.openPositions.length > 0 && (
              <Box sx={{ px: { xs: 1, sm: 2 }, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {trader.openPositions.map(pos => {
                  const cur       = prices[pos.symbol]
                  const isShort   = pos.direction === 'SHORT'
                  const isTestnet = pos.api_key_id ? (testnetKeys[pos.api_key_id] ?? false) : false
                  const unrealAbs = cur
                    ? (isShort ? pos.entry_price - cur : cur - pos.entry_price) * pos.quantity
                    : null
                  const unrealPct = (unrealAbs != null && pos.capital_used > 0)
                    ? (unrealAbs / pos.capital_used) * 100
                    : null
                  const posColor = isShort ? '#f87171' : '#4ade80'

                  return (
                    <Box key={pos.id} sx={{
                      px: 1.5, py: 0.75, borderRadius: 1.5,
                      background: '#09090b', border: '1px solid #18181b',
                    }}>
                      {/* 상단: 심볼 + 방향 + 손익 + 경과 */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap' }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#fafafa', fontFamily: 'monospace' }}>
                          {pos.symbol}
                        </Typography>
                        <Box sx={{ px: 0.6, py: 0.1, borderRadius: 0.75, background: `${posColor}15`, border: `1px solid ${posColor}44`, flexShrink: 0 }}>
                          <Typography sx={{ fontSize: 9, fontWeight: 800, color: posColor }}>{pos.direction}</Typography>
                        </Box>
                        {isTestnet && (
                          <Box sx={{ px: 0.5, py: 0.1, borderRadius: 0.5, background: '#7c3aed15', border: '1px solid #7c3aed33', flexShrink: 0 }}>
                            <Typography sx={{ fontSize: 8, fontWeight: 700, color: '#a78bfa' }}>TEST</Typography>
                          </Box>
                        )}
                        <Box sx={{ flex: 1 }} />
                        {unrealPct !== null && unrealAbs !== null ? (
                          <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: pnlColor(unrealPct) }}>
                            {pnlFmt(unrealPct, unrealAbs).pctStr}
                          </Typography>
                        ) : (
                          <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>—</Typography>
                        )}
                        <Typography sx={{ fontSize: 10, color: '#3f3f46', fontFamily: 'monospace', ml: 1, flexShrink: 0 }}>
                          {elapsed(pos.entry_time)}
                        </Typography>
                      </Box>
                      {/* 하단: 진입가 → 현재가 + 손익 절대값 */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                        <Typography sx={{ fontSize: 10, color: '#52525b', fontFamily: 'monospace' }}>
                          ${pos.entry_price.toLocaleString()}
                          {cur && <> → <Box component="span" sx={{ color: '#71717a' }}>${cur.toLocaleString()}</Box></>}
                        </Typography>
                        {unrealAbs !== null && (
                          <Typography sx={{ fontSize: 10, color: `${pnlColor(unrealAbs)}99`, fontFamily: 'monospace', ml: 'auto' }}>
                            {pnlFmt(0, unrealAbs).absStr}
                          </Typography>
                        )}
                      </Box>
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
