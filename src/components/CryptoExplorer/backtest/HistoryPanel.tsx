import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import type { RunHistory } from './types'

interface Props {
  history: RunHistory[]
  onApply: (run: RunHistory) => void
  onActivatePaper?: (run: RunHistory) => void
  activePaperId?: string | null
}

export default function HistoryPanel({ history, onApply, onActivatePaper, activePaperId }: Props) {
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
            const ret       = run.total_return_pct
            const retColor  = ret >= 0 ? '#10b981' : '#ef4444'
            const isActive  = activePaperId === run.id

            return (
              <Box
                key={run.id}
                sx={{
                  display:       'grid',
                  gridTemplateColumns: '60px 48px 80px 80px 70px 70px 70px 1fr 28px',
                  gap: 1, px: 1.5, py: 0.75, borderRadius: 1.5,
                  background: isActive ? '#052e16' : '#0a0a0b',
                  border: `1px solid ${isActive ? '#16a34a55' : '#1f1f23'}`,
                  alignItems: 'center',
                  cursor: 'pointer',
                  '&:hover': { borderColor: '#3b82f644', background: isActive ? '#052e16' : '#3b82f608' },
                }}
              >
                {/* 이력 행 클릭 → 파라미터 적용 */}
                <Box
                  onClick={() => onApply(run)}
                  sx={{ display: 'contents' }}
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

                {/* 페이퍼 트레이딩 활성화 버튼 */}
                {onActivatePaper && (
                  <Tooltip
                    title={isActive ? '페이퍼 트레이딩 중 (클릭하여 중지)' : '이 설정으로 페이퍼 트레이딩 시작'}
                    placement="left"
                  >
                    <Box
                      onClick={(e) => {
                        e.stopPropagation()
                        onActivatePaper(run)
                      }}
                      sx={{
                        width: 20, height: 20,
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isActive ? '#16a34a' : '#1f1f23',
                        border: `1px solid ${isActive ? '#22c55e' : '#3f3f46'}`,
                        cursor: 'pointer',
                        flexShrink: 0,
                        '&:hover': {
                          background: isActive ? '#15803d' : '#27272a',
                          borderColor: isActive ? '#4ade80' : '#52525b',
                        },
                        transition: 'all 0.15s',
                      }}
                    >
                      <Box
                        sx={{
                          width: 6, height: 6,
                          borderRadius: '50%',
                          background: isActive ? '#4ade80' : '#52525b',
                        }}
                      />
                    </Box>
                  </Tooltip>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
