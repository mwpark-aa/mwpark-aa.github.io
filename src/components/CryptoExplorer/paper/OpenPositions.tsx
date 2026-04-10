import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { PaperPos, ActiveConfig } from './types'
import { fmtPrice, fmtPct, fmtTime } from './types'

function OpenPositionRow({ pos, currentPrice }: { pos: PaperPos; currentPrice?: number }) {
  const isShort   = pos.direction === 'SHORT'
  const refPrice  = currentPrice ?? pos.entry_price
  const unrealPct = isShort
    ? ((pos.entry_price - refPrice) / pos.entry_price) * 100
    : ((refPrice - pos.entry_price) / pos.entry_price) * 100
  const pnlColor  = unrealPct >= 0 ? '#10b981' : '#ef4444'

  const progressPct = pos.stop_loss != null && pos.target_price != null
    ? Math.max(0, Math.min(100, isShort
        ? (pos.stop_loss - refPrice) / (pos.stop_loss - pos.target_price) * 100
        : (refPrice - pos.stop_loss) / (pos.target_price - pos.stop_loss) * 100
      ))
    : null

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: '120px 1fr 120px 140px' },
      gap: 1.5, px: 2, py: 1.5,
      borderRadius: 2, background: '#111113',
      borderLeft: `3px solid ${isShort ? '#f97316' : '#3b82f6'}`,
      border: `1px solid ${isShort ? '#f9731622' : '#3b82f622'}`,
      alignItems: 'center',
    }}>
      {/* 심볼 + 방향 */}
      <Box>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mb: 0.5 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#fafafa', fontFamily: 'monospace' }}>
            {pos.symbol}
          </Typography>
          <Chip label={isShort ? '숏' : '롱'} size="small" sx={{
            height: 16, fontSize: 9, fontWeight: 800,
            bgcolor: isShort ? '#f9731620' : '#3b82f620',
            color: isShort ? '#f97316' : '#3b82f6',
            border: `1px solid ${isShort ? '#f9731640' : '#3b82f640'}`,
            '& .MuiChip-label': { px: 0.75 },
          }} />
        </Box>
        <Typography sx={{ fontSize: 9, color: '#52525b' }}>{fmtTime(pos.entry_time)}</Typography>
        {pos.score != null && (
          <Typography sx={{ fontSize: 9, color: '#52525b' }}>점수 {pos.score}</Typography>
        )}
      </Box>

      {/* 진입가 + 시그널 */}
      <Box>
        <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.25 }}>진입가</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#fafafa', fontFamily: 'monospace' }}>
          ${fmtPrice(pos.entry_price)}
        </Typography>
        {pos.signal_details && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.3, mt: 0.25 }}>
            {pos.signal_details.split(' | ').map((part, i, arr) => {
              const scored = part.endsWith('✓')
              const label  = scored ? part.slice(0, -1) : part
              return (
                <Typography key={i} sx={{
                  fontSize: 9, fontFamily: 'monospace',
                  color: scored ? (isShort ? '#f97316' : '#10b981') : '#3f3f46',
                  fontWeight: scored ? 700 : 400,
                }}>
                  {label}{i < arr.length - 1 ? ' |' : ''}
                </Typography>
              )
            })}
          </Box>
        )}
      </Box>

      {/* 미실현 손익 */}
      <Box>
        <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.25 }}>미실현 손익</Typography>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: pnlColor, fontFamily: 'monospace' }}>
          {currentPrice ? fmtPct(unrealPct) : '—'}
        </Typography>
        {currentPrice && (
          <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
            ${fmtPrice(currentPrice)}
          </Typography>
        )}
      </Box>

      {/* TP / SL + 프로그레스 */}
      <Box sx={{ textAlign: 'right' }}>
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mb: 0.5 }}>
          {pos.target_price != null && (
            <Typography sx={{ fontSize: 9, color: '#10b98188', fontFamily: 'monospace' }}>
              TP ${fmtPrice(pos.target_price)}
            </Typography>
          )}
          {pos.stop_loss != null && (
            <Typography sx={{ fontSize: 9, color: '#ef444488', fontFamily: 'monospace' }}>
              SL ${fmtPrice(pos.stop_loss)}
            </Typography>
          )}
        </Box>
        {progressPct != null && (
          <Box sx={{ width: 100, height: 3, bgcolor: '#27272a', borderRadius: 99, overflow: 'hidden', ml: 'auto', mb: 0.5 }}>
            <Box sx={{ width: `${progressPct}%`, height: '100%', bgcolor: pnlColor, borderRadius: 99, transition: 'width 0.4s' }} />
          </Box>
        )}
        <Typography sx={{ fontSize: 9, color: '#52525b' }}>
          ${pos.capital_used.toLocaleString('en', { maximumFractionDigits: 0 })} 투입
        </Typography>
      </Box>
    </Box>
  )
}

interface Props {
  openPos: PaperPos[]
  prices: Record<string, number>
  configs: ActiveConfig[]
}

export default function OpenPositions({ openPos, prices, configs }: Props) {
  const configMap = Object.fromEntries(configs.map(c => [c.id, c]))
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fafafa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          오픈 포지션
        </Typography>
        <Chip
          label={openPos.length > 0 ? `${openPos.length}건` : '없음'}
          size="small"
          sx={{
            height: 16, fontSize: 9, fontWeight: 700,
            bgcolor: openPos.length > 0 ? '#10b98120' : '#27272a',
            color: openPos.length > 0 ? '#10b981' : '#52525b',
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
      </Box>

      {openPos.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', borderRadius: 2, border: '1px solid #1f1f23' }}>
          <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>오픈 포지션 없음</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {openPos.map(pos => {
            const cfg = configMap[pos.backtest_run_id]
            const configLabel = cfg
              ? (cfg.name ?? `${cfg.symbol} ${cfg.interval} 점수${cfg.min_score}+`)
              : null
            return (
              <Box key={pos.id}>
                {configLabel && configs.length > 1 && (
                  <Typography sx={{ fontSize: 9, color: '#3f3f46', px: 0.5, mb: 0.25 }}>
                    {configLabel}
                  </Typography>
                )}
                <OpenPositionRow pos={pos} currentPrice={prices[pos.symbol]} />
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
