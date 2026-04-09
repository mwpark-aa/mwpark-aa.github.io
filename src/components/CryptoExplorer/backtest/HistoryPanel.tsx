import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { RunHistory } from './types'

interface Props {
  history: RunHistory[]
  onApply: (run: RunHistory) => void
}

export default function HistoryPanel({ history, onApply }: Props) {
  if (history.length === 0) {
    return (
      <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #1f1f23' }}>
        <Typography sx={{ fontSize: 12, color: '#3f3f46', textAlign: 'center', py: 2 }}>
          아직 실행 이력이 없어요
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #1f1f23' }}>
      <Box sx={{
        overflowX: 'auto',
        '&::-webkit-scrollbar': { height: 3 },
        '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
      }}>
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          maxHeight: 280,
          overflowY: 'auto',
          minWidth: 480,
          '&::-webkit-scrollbar': { width: 3 },
          '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
        }}>
          {history.map((run) => {
            const ret = run.total_return_pct
            const retColor = ret >= 0 ? '#10b981' : '#ef4444'
            return (
              <Box
                key={run.id}
                onClick={() => onApply(run)}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '60px 48px 80px 80px 70px 70px 70px 1fr',
                  gap: 1, px: 1.5, py: 0.75, borderRadius: 1.5,
                  background: '#0a0a0b', border: '1px solid #1f1f23',
                  cursor: 'pointer', alignItems: 'center',
                  '&:hover': { borderColor: '#3b82f644', background: '#3b82f608' },
                }}
              >
                <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                  {new Date(run.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                </Typography>
                <Chip
                  label={run.symbol}
                  size="small"
                  sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: '#27272a', color: '#a1a1aa', '& .MuiChip-label': { px: 0.75 } }}
                />
                <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                  {run.start_date} ~
                </Typography>
                <Typography sx={{ fontSize: 9, color: retColor, fontFamily: 'monospace', fontWeight: 700 }}>
                  {ret >= 0 ? '+' : ''}{ret?.toFixed(1)}%
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
                  승률 {run.win_rate?.toFixed(0)}%
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
                  MDD -{run.max_drawdown_pct?.toFixed(1)}%
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                  {run.total_trades}건 · {run.interval}
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#3b82f680', textAlign: 'right' }}>
                  RSI {run.rsi_oversold}/{run.rsi_overbought} · {run.leverage}x · 점수{run.min_score}+
                </Typography>
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
