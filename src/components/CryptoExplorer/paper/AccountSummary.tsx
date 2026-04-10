import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { PaperAccount, ActiveConfig } from './types'
import { fmtPrice, fmtPct } from './types'

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

interface Props {
  account: PaperAccount | null
  configs: ActiveConfig[]
  prices: Record<string, number>
  effectiveCapital: number | null
  unrealizedPnl: number
  totalReturn: number | null
  winRate: number | null
  winCount: number
  loseCount: number
  closedCount: number
}

export default function AccountSummary({
  account, configs, prices, effectiveCapital, unrealizedPnl,
  totalReturn, winRate, winCount, loseCount, closedCount,
}: Props) {
  const symbols = [...new Set(configs.map(c => c.symbol))]
  const singleSymbol = symbols.length === 1 ? symbols[0] : null

  return (
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
      {singleSymbol != null && prices[singleSymbol] != null && (
        <MetricBox
          label={`${singleSymbol} 현재가`}
          value={`$${fmtPrice(prices[singleSymbol]!)}`}
          color="#fafafa"
        />
      )}
    </Box>
  )
}
