import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import type { RunHistory } from '../backtest/types'

interface Props {
  history: RunHistory[]
  activating: string | null
  onActivate: (run: RunHistory) => void
  onDelete: (id: string) => void
  activeKey?: 'paper_trading_enabled' | 'live_trading_enabled'
  activateLabel?: string
  activeColor?: string
  activeBgColor?: string
  currentUserId?: string | null  // 소유자 체크용 (없으면 모든 버튼 표시)
}

export default function HistoryList({
  history, activating, onActivate, onDelete,
  activeKey     = 'paper_trading_enabled',
  activateLabel = '이 설정으로 페이퍼 트레이딩 시작',
  activeColor   = '#4ade80',
  activeBgColor = '#16a34a',
  currentUserId,
}: Props) {
  return (
    <Box>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
        백테스트 이력 — 활성화할 설정 선택
      </Typography>
      <Box sx={{
        display: 'flex', flexDirection: 'column', gap: 0.5,
        maxHeight: 260, overflowY: 'auto',
        '&::-webkit-scrollbar': { width: 3 },
        '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
      }}>
        {history.length === 0 && (
          <Typography sx={{ fontSize: 11, color: '#3f3f46', textAlign: 'center', py: 3 }}>
            저장된 백테스트 이력이 없습니다
          </Typography>
        )}
        {history.map((run) => {
          const isActive  = run[activeKey] === true
          const ret       = run.total_return_pct
          const retColor  = ret >= 0 ? '#10b981' : '#ef4444'
          const isLoading = activating === run.id
          // currentUserId가 없으면 버튼 모두 표시 (페이퍼 탭)
          // 있으면 run.user_id가 일치해야 버튼 표시 (live 탭: 소유자만)
          const isOwner   = currentUserId == null || run.user_id === currentUserId

          const indicators = [
            run.score_use_rsi           && 'RSI',
            run.score_use_adx           && 'ADX',
            run.score_use_macd          && 'MACD',
            run.score_use_rvol          && 'RVOL',
            run.score_use_bb            && 'BB',
            run.score_use_golden_cross  && 'MA',
            run.score_use_ichi          && '일목',
            run.score_use_fed_liquidity && '연준',
          ].filter(Boolean) as string[]

          return (
            <Box
              key={run.id}
              sx={{ display: 'grid', gridTemplateColumns: isOwner ? '20px 1fr 20px' : '1fr', gap: 1, alignItems: 'flex-start' }}
            >
              {/* 활성화 토글 — 소유자만 */}
              {isOwner && (
                <Tooltip title={isActive ? '비활성화' : activateLabel} placement="right">
                  <Box
                    onClick={() => !isLoading && onActivate(run)}
                    sx={{
                      width: 20, height: 20, mt: '10px', borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isActive ? activeBgColor : '#1f1f23',
                      border: `1px solid ${isActive ? activeColor : '#3f3f46'}`,
                      cursor: isLoading ? 'wait' : 'pointer',
                      transition: 'all 0.15s',
                      '&:hover': { background: isActive ? activeBgColor : '#27272a', borderColor: isActive ? activeColor : '#52525b' },
                    }}
                  >
                    {isLoading
                      ? <CircularProgress size={8} sx={{ color: activeColor }} />
                      : <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? activeColor : '#52525b' }} />
                    }
                  </Box>
                </Tooltip>
              )}

              {/* 이력 카드 */}
              <Box sx={{
                px: 1.5, py: 1, borderRadius: 1.5,
                background: isActive ? `${activeBgColor}18` : '#0a0a0b',
                border: `1px solid ${isActive ? `${activeBgColor}55` : '#1f1f23'}`,
                minWidth: 0,
              }}>
                {/* 행 1: 이름 + 성과 */}
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.6, flexWrap: 'wrap' }}>
                  <Typography sx={{
                    fontSize: 13, fontWeight: 800,
                    color: isActive ? activeColor : '#e4e4e7',
                    flex: '1 1 auto', minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {run.name ?? `RSI ${run.rsi_oversold}/${run.rsi_overbought} · ${run.leverage}x · 점수${run.min_score}+`}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline', flexShrink: 0 }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 800, color: retColor, fontFamily: 'monospace' }}>
                      {ret >= 0 ? '+' : ''}{ret?.toFixed(1)}%
                    </Typography>
                    <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
                      승{run.win_rate?.toFixed(0)}%
                    </Typography>
                    <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                      MDD {run.max_drawdown_pct?.toFixed(1)}%
                    </Typography>
                    <Typography sx={{ fontSize: 9, color: '#3f3f46', fontFamily: 'monospace' }}>
                      {run.total_trades}건
                    </Typography>
                  </Box>
                </Box>

                {/* 행 2: 설정값 칩 */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, alignItems: 'center' }}>
                  {[run.symbol, run.interval, `${run.leverage}x`, `점수${run.min_score}+`].map(label => (
                    <Chip key={label} label={label} size="small" sx={{
                      height: 14, fontSize: 8, fontWeight: 700,
                      bgcolor: isActive ? `${activeBgColor}18` : '#27272a',
                      color: isActive ? activeColor : '#71717a',
                      '& .MuiChip-label': { px: 0.5 },
                    }} />
                  ))}
                  {(run.fixed_tp ?? 0) > 0 && (
                    <Chip label={`TP ${run.fixed_tp}% / SL ${run.fixed_sl}%`} size="small" sx={{
                      height: 14, fontSize: 8, fontWeight: 600,
                      bgcolor: '#10b98110', color: '#10b98188',
                      '& .MuiChip-label': { px: 0.5 },
                    }} />
                  )}
                  {run.score_use_rsi && (
                    <Chip label={`RSI ${run.rsi_oversold}/${run.rsi_overbought}`} size="small" sx={{
                      height: 14, fontSize: 8,
                      bgcolor: '#6366f110', color: '#818cf8',
                      '& .MuiChip-label': { px: 0.5 },
                    }} />
                  )}
                  {run.score_use_adx && (
                    <Chip label={`ADX>${run.adx_threshold}`} size="small" sx={{
                      height: 14, fontSize: 8,
                      bgcolor: '#f59e0b10', color: '#f59e0b88',
                      '& .MuiChip-label': { px: 0.5 },
                    }} />
                  )}
                  {indicators.filter(ind => !['RSI', 'ADX'].includes(ind)).map(ind => (
                    <Chip key={ind} label={ind} size="small" sx={{
                      height: 14, fontSize: 8,
                      bgcolor: '#27272a', color: '#52525b',
                      '& .MuiChip-label': { px: 0.5 },
                    }} />
                  ))}
                  <Typography sx={{ fontSize: 8, color: '#27272a', fontFamily: 'monospace', ml: 'auto' }}>
                    {run.start_date} ~ {new Date(run.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}
                  </Typography>
                </Box>
              </Box>

              {/* 삭제 버튼 — 소유자만 */}
              {isOwner && (
                <Tooltip title="이력 삭제" placement="right">
                  <Box
                    onClick={() => !isLoading && onDelete(run.id)}
                    sx={{
                      width: 20, height: 20, mt: '10px', borderRadius: 1, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#3f3f46', cursor: isLoading ? 'wait' : 'pointer',
                      '&:hover': { color: '#ef4444', background: '#ef444415' },
                      transition: 'all 0.15s',
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </Box>
                </Tooltip>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
