import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { ClosedTrade } from './types'
import { fmtPrice, fmtPct, fmtTime } from './types'

const REASON_COLOR: Record<string, string> = {
  TP:         '#10b981',
  SL:         '#ef4444',
  SCORE_EXIT: '#f59e0b',
  LIQUIDATED: '#dc2626',
  DATA_END:   '#52525b',
}

function ClosedTradeRow({ trade }: { trade: ClosedTrade }) {
  const isShort  = trade.direction === 'SHORT'
  const pnlColor = trade.net_pnl >= 0 ? '#10b981' : '#ef4444'

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '80px 36px 100px 100px 80px 60px 1fr',
      gap: 0.75, px: 1.5, py: 0.75,
      borderRadius: 1.5, background: '#0a0a0b',
      border: '1px solid #1a1a1e',
      alignItems: 'center',
      '&:hover': { borderColor: '#27272a' },
    }}>
      <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
        {fmtTime(trade.exit_time)}
      </Typography>
      <Chip label={isShort ? '숏' : '롱'} size="small" sx={{
        height: 14, fontSize: 8, fontWeight: 800,
        bgcolor: isShort ? '#f9731618' : '#3b82f618',
        color: isShort ? '#f97316' : '#3b82f6',
        '& .MuiChip-label': { px: 0.5 },
      }} />
      <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
        ${fmtPrice(trade.entry_price)}
      </Typography>
      <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
        ${fmtPrice(trade.exit_price)}
      </Typography>
      <Typography sx={{ fontSize: 10, fontWeight: 700, color: pnlColor, fontFamily: 'monospace' }}>
        {fmtPct(trade.pnl_pct)}
      </Typography>
      <Chip
        label={trade.exit_reason}
        size="small"
        sx={{
          height: 14, fontSize: 8,
          bgcolor: `${REASON_COLOR[trade.exit_reason] ?? '#52525b'}18`,
          color: REASON_COLOR[trade.exit_reason] ?? '#52525b',
          '& .MuiChip-label': { px: 0.5 },
        }}
      />
      <Typography sx={{ fontSize: 9, color: '#3f3f46', fontFamily: 'monospace' }}>
        {trade.symbol}
      </Typography>
    </Box>
  )
}

interface Props {
  trades: ClosedTrade[]
}

const HEADERS = ['청산시각', '방향', '진입가', '청산가', '수익률', '이유', '심볼']

export default function ClosedTradeList({ trades }: Props) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fafafa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          청산 내역
        </Typography>
        <Chip label={`최근 ${trades.length}건`} size="small" sx={{
          height: 16, fontSize: 9, bgcolor: '#27272a', color: '#52525b',
          '& .MuiChip-label': { px: 0.75 },
        }} />
      </Box>

      {trades.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', borderRadius: 2, border: '1px solid #1f1f23' }}>
          <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>아직 청산된 거래가 없습니다</Typography>
        </Box>
      ) : (
        <Box sx={{ borderRadius: 2, border: '1px solid #1f1f23', overflow: 'hidden' }}>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: '80px 36px 100px 100px 80px 60px 1fr',
            gap: 0.75, px: 1.5, py: 0.75,
            background: '#0d0d0f', borderBottom: '1px solid #1f1f23',
          }}>
            {HEADERS.map(h => (
              <Typography key={h} sx={{ fontSize: 9, color: '#3f3f46', fontWeight: 600 }}>{h}</Typography>
            ))}
          </Box>
          <Box sx={{
            maxHeight: 340, overflowY: 'auto',
            '&::-webkit-scrollbar': { width: 3 },
            '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
          }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.75 }}>
              {trades.map(t => (
                <ClosedTradeRow key={t.id} trade={t} />
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
