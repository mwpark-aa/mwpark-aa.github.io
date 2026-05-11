import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { PaperAccount, ActiveConfig } from './types'
import { fmtPrice, fmtPct } from './types'

function intervalToMs(interval: string): number {
  const units: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 }
  const m = interval.match(/^(\d+)([mhd])$/)
  return m ? parseInt(m[1]) * (units[m[2]] ?? 60_000) : 60_000
}

function MetricBox({ label, value, color = '#fafafa', sub }: {
  label: string; value: string; color?: string; sub?: string
}) {
  return (
    <Box sx={{ px: 2, py: 1.5, borderRadius: 2, background: '#0a0a0b', border: '1px solid #1f1f23', minWidth: 0 }}>
      <Typography sx={{ fontSize: 10, color: '#52525b', mb: 0.25 }}>{label}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'monospace', lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ fontSize: 9, color: '#3f3f46', fontFamily: 'monospace', mt: 0.25 }}>{sub}</Typography>}
    </Box>
  )
}

function useCountdown(interval: string) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const ms = intervalToMs(interval)
    const tick = () => {
      const now = Date.now()
      const nextEnd = Math.ceil(now / ms) * ms
      setRemaining(Math.max(0, nextEnd - now))
    }
    tick()
    const t = setInterval(tick, 1_000)
    return () => clearInterval(t)
  }, [interval])

  const total = intervalToMs(interval)
  const m = Math.floor(remaining / 60_000)
  const s = Math.floor((remaining % 60_000) / 1_000)
  const label = `${m > 0 ? `${m}m ` : ''}${String(s).padStart(2, '0')}s`
  const pct   = remaining / total * 100

  return { label, pct }
}

function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)  return `${Math.floor(diff / 1_000)}초 전`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  return `${Math.floor(diff / 3_600_000)}시간 전`
}

interface Props {
  account: PaperAccount | null
  config: ActiveConfig
  effectiveCapital: number | null
  unrealizedPnl: number
  totalReturn: number | null
  winRate: number | null
  winCount: number
  loseCount: number
  closedCount: number
  currentPrice: number | null
}

export default function AccountSummary({
  account, config, effectiveCapital, unrealizedPnl,
  totalReturn, winRate, winCount, loseCount, closedCount, currentPrice,
}: Props) {
  const { label: countdownLabel, pct: countdownPct } = useCountdown(config.interval)
  const [, forceUpdate] = useState(0)

  // "X분 전" 표시를 1분마다 갱신
  useEffect(() => {
    const t = setInterval(() => forceUpdate(n => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1 }}>
        <MetricBox
          label="현재 자본"
          value={`$${effectiveCapital != null ? effectiveCapital.toLocaleString('en', { maximumFractionDigits: 2 }) : '—'}`}
          color="#fafafa"
          sub={unrealizedPnl !== 0 && account
            ? `미실현 ${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)} 포함`
            : `초기 $${account?.initial_capital.toLocaleString('en', { maximumFractionDigits: 0 }) ?? '—'}`}
        />
        <MetricBox
          label="총 수익률"
          value={totalReturn != null ? fmtPct(totalReturn) : '—'}
          color={totalReturn == null ? '#71717a' : totalReturn >= 0 ? '#10b981' : '#ef4444'}
        />
        <MetricBox
          label="승률"
          value={winRate != null ? `${winRate.toFixed(1)}%` : '—'}
          color={winRate != null && winRate >= 50 ? '#10b981' : '#71717a'}
          sub={`${winCount}승 ${loseCount}패 (${closedCount}건)`}
        />
        {currentPrice != null && (
          <MetricBox
            label={`${config.symbol} 현재가`}
            value={`$${fmtPrice(currentPrice)}`}
            color="#fafafa"
          />
        )}
      </Box>

      {/* 다음 캔들 카운트다운 + 마지막 처리 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 0.5 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
            <Typography sx={{ fontSize: 9, color: '#52525b' }}>다음 캔들</Typography>
            <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>{countdownLabel}</Typography>
          </Box>
          <Box sx={{ height: 2, borderRadius: 99, background: '#1f1f23', overflow: 'hidden' }}>
            <Box sx={{
              height: '100%', borderRadius: 99,
              background: countdownPct < 20 ? '#f59e0b' : '#3f3f46',
              width: `${100 - countdownPct}%`,
              transition: 'width 1s linear, background 0.3s',
            }} />
          </Box>
        </Box>
        <Typography sx={{ fontSize: 9, color: '#3f3f46', flexShrink: 0 }}>
          마지막 처리 {fmtAgo(account?.last_processed_ts ?? null)}
        </Typography>
      </Box>
    </Box>
  )
}
