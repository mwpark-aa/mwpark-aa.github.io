import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import type { BacktestResult, BacktestTrade } from './types'
import { fmtPct } from './utils'

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Box sx={{ px: 2, py: 1.5, borderRadius: 2, background: '#18181b', border: '1px solid #27272a', minWidth: 100 }}>
      <Typography sx={{ fontSize: 9, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 15, fontWeight: 800, color: color ?? '#fafafa', fontFamily: 'monospace', lineHeight: 1 }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ fontSize: 10, color: '#52525b', mt: 0.25 }}>{sub}</Typography>}
    </Box>
  )
}

interface Props {
  result: BacktestResult
  trades: BacktestTrade[]
}

export default function ResultSummary({ result, trades }: Props) {
  const returnColor = result.total_return_pct >= 0 ? '#10b981' : '#ef4444'

  return (
    <Card sx={{ background: '#111113', border: '1px solid #27272a', borderRadius: 3 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 16, color: '#fafafa', letterSpacing: '-0.01em' }}>
              {result.symbol}/USDT
              <Typography component="span" sx={{ fontSize: 11, color: '#52525b', ml: 1, fontWeight: 400 }}>
                {result.interval} · {result.start_date} ~ {result.end_date}
              </Typography>
            </Typography>
          </Box>
          <Chip
            label={`${trades.length}건 거래`}
            size="small"
            sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: '#18181b', color: '#71717a', border: '1px solid #27272a', '& .MuiChip-label': { px: 1 } }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <MetricCard
            label="총 수익률"
            value={fmtPct(result.total_return_pct)}
            sub={`$${result.initial_capital.toLocaleString()} → $${result.final_capital.toLocaleString()}`}
            color={returnColor}
          />
          <MetricCard
            label="승률"
            value={`${result.win_rate.toFixed(1)}%`}
            sub={`${result.winning_trades}승 ${result.losing_trades}패`}
            color={result.win_rate >= 50 ? '#10b981' : '#ef4444'}
          />
          <MetricCard
            label="최대 낙폭"
            value={`-${result.max_drawdown_pct.toFixed(2)}%`}
            color="#f59e0b"
          />
          <MetricCard
            label="샤프 비율"
            value={result.sharpe_ratio.toFixed(3)}
          />
          <MetricCard
            label="손익 비율"
            value={result.profit_factor == null || result.profit_factor > 99 ? '∞' : result.profit_factor.toFixed(3)}
          />
        </Box>
      </CardContent>
    </Card>
  )
}
