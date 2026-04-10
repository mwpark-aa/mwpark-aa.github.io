import { memo, useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { BacktestTrade } from './types'
import { fmtDate, fmtPrice, fmtPct, parseAddEntries } from './utils'

const EXIT_REASON_MAP: Record<string, string> = {
  'TP': '목표가 달성',
  'SL': '손절가 달성',
  'TRAIL': '추적손절',
  'BELOW_TP1': '부분익절',
  'TIMEOUT': '최대 보유기간 종료',
  'LIQUIDATED': '청산',
  'SCORE_EXIT': '신호약화',
}

interface Props {
  trade: BacktestTrade
  index: number
  onScrollTo: (ts: string) => void
  initialCapital: number
  onSelectTrade: (id: string) => void
  isSelected: boolean
}

const TradeRow = memo(function TradeRow({ trade, index, onScrollTo, initialCapital: _initialCapital, onSelectTrade, isSelected }: Props) {
  if (!trade) return null

  const win = (trade.net_pnl ?? 0) > 0
  const isShort = trade.direction === 'SHORT'
  const isSL = trade.exit_reason?.includes('STOP_LOSS') || trade.exit_reason?.includes('손절')

  const pnlColor = win ? '#10b981' : '#ec4899'
  const dirColor = isShort ? '#ef4444' : '#3b82f6'
  const bg = index % 2 === 0 ? '#111113' : '#18181b'

  const entries = useMemo(() => parseAddEntries(trade), [trade])
  const exitMarkerColor = win ? '#10b981' : isSL ? '#ec4899' : '#ef4444'
  const hasMultiple = entries.length > 1
  const isMobile = useMediaQuery('(max-width:600px)')

  const handleClick = () => {
    onSelectTrade(trade.id)
    trade.entry_ts && onScrollTo(trade.entry_ts)
  }

  // ── 모바일 카드 레이아웃 ──────────────────────────────────────────
  if (isMobile) {
    return (
      <Box
        onClick={handleClick}
        sx={{
          borderRadius: 1.5,
          borderLeft: `3px solid ${dirColor}${isSelected ? 'ff' : '66'}`,
          cursor: 'pointer',
          background: isSelected ? `${dirColor}0f` : bg,
          transition: 'all 0.15s',
          px: 1.5,
          py: 1,
        }}
      >
        {/* 행 1: 방향 + 진입→청산 시각 + 손익 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Chip
              label={isShort ? '숏' : '롱'}
              size="small"
              sx={{
                height: 16, fontSize: 9, fontWeight: 800,
                bgcolor: `${dirColor}18`, color: dirColor,
                border: `1px solid ${dirColor}44`,
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
            <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
              {fmtDate(trade.entry_ts)} → {fmtDate(trade.exit_ts)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: pnlColor, fontFamily: 'monospace', lineHeight: 1.2 }}>
              {fmtPct(trade.pnl_pct)}
            </Typography>
            <Typography sx={{ fontSize: 9, color: pnlColor, fontFamily: 'monospace', opacity: 0.8 }}>
              {win ? '+' : ''}${trade.net_pnl.toFixed(2)}
            </Typography>
          </Box>
        </Box>

        {/* 행 2: 진입가 → 청산가 */}
        <Box sx={{ mb: 0.5 }}>
          <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>진입 → 청산</Typography>
          <Typography sx={{ fontSize: 10, color: '#fff', fontFamily: 'monospace' }}>
            {fmtPrice(trade.entry_price)} → <span style={{ color: exitMarkerColor }}>{fmtPrice(trade.exit_price)}</span>
          </Typography>
          {hasMultiple && trade.avg_entry_price && (
            <Typography sx={{ fontSize: 8, color: '#71717a' }}>avg {fmtPrice(trade.avg_entry_price)}</Typography>
          )}
        </Box>

        {/* 행 3: 매수 이유 */}
        {trade.signal_details && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mb: 0.4 }}>
            {trade.signal_details.split(' | ').map((part, i) => {
              const scored = part.endsWith('✓')
              const label  = scored ? part.slice(0, -1) : part
              return (
                <Typography key={i} sx={{
                  fontSize: 9, fontFamily: 'monospace', lineHeight: 1.4,
                  color: scored ? (isShort ? '#f97316' : '#10b981') : '#52525b',
                  fontWeight: scored ? 700 : 400,
                }}>
                  {label}{i < trade.signal_details!.split(' | ').length - 1 ? ' |' : ''}
                </Typography>
              )
            })}
          </Box>
        )}

        {/* 행 4: 매도 이유 + 자본 정보 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 9, color: '#71717a' }}>
            {EXIT_REASON_MAP[trade.exit_reason] ?? trade.exit_reason}
            {trade.exit_reason === 'SCORE_EXIT' && trade.exit_details ? ` : ${trade.exit_details}` : ''}
          </Typography>
          <Box sx={{ textAlign: 'right' }}>
            {trade.capital_before != null && (
              <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                보유 ${trade.capital_before.toFixed(0)}
              </Typography>
            )}
            <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
              투입 ${trade.capital_used.toFixed(0)}
            </Typography>
          </Box>
        </Box>
      </Box>
    )
  }

  // ── 데스크탑 그리드 레이아웃 ─────────────────────────────────────
  return (
    <Box
      onClick={handleClick}
      sx={{
        borderRadius: 1.5,
        borderLeft: `3px solid ${dirColor}${isSelected ? 'ff' : '66'}`,
        cursor: 'pointer',
        background: isSelected ? `${dirColor}0f` : 'transparent',
        '&:hover > *': { background: `${dirColor}0a !important` },
        transition: 'all 0.15s',
      }}
    >
      {entries.map((e, ei) => {
        const isFirst = ei === 0
        const isLast = ei === entries.length - 1

        return (
          <Box
            key={`${index}-${e.step}-${ei}`}
            sx={{
              display: 'grid',
              gridTemplateColumns: '36px 100px 1.5fr 1.0fr 100px 80px 90px 80px',
              gap: 0.75,
              px: 1.5,
              py: 0.55,
              background: bg,
              alignItems: 'center',
              borderBottom: !isLast ? '1px solid #ffffff06' : 'none',
            }}
          >
            {/* 방향 */}
            {isFirst ? (
              <Chip
                label={isShort ? '숏' : '롱'}
                size="small"
                sx={{
                  height: 15, fontSize: 8, fontWeight: 800,
                  bgcolor: `${dirColor}18`, color: dirColor,
                  border: `1px solid ${dirColor}44`,
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            ) : <Box />}

            {/* 진입 */}
            <Box>
              <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>{fmtDate(e.ts)}</Typography>
              <Typography sx={{ fontSize: 10, color: '#ffffff', fontFamily: 'monospace' }}>{fmtPrice(e.price)}</Typography>
            </Box>

            {/* 매수 이유 */}
            {isFirst ? (
              <Box>
                {trade.signal_details && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.3 }}>
                    {trade.signal_details.split(' | ').map((part, i) => {
                      const scored = part.endsWith('✓')
                      const label  = scored ? part.slice(0, -1) : part
                      return (
                        <Typography key={i} sx={{
                          fontSize: 9, fontFamily: 'monospace', lineHeight: 1.4,
                          color: scored ? (isShort ? '#f97316' : '#10b981') : '#52525b',
                          fontWeight: scored ? 700 : 400,
                        }}>
                          {label}{i < trade.signal_details!.split(' | ').length - 1 ? ' |' : ''}
                        </Typography>
                      )
                    })}
                  </Box>
                )}
              </Box>
            ) : <Box />}

            {/* 매도 이유 */}
            {isFirst ? (
              <Box>
                <Typography sx={{ fontSize: 10, color: '#FFF', fontFamily: 'monospace', lineHeight: 1.3, whiteSpace: 'normal' }}>
                  {EXIT_REASON_MAP[trade.exit_reason]}{trade.exit_reason === 'SCORE_EXIT' && trade.exit_details ? ` : ${trade.exit_details}` : ''}
                </Typography>
              </Box>
            ) : <Box />}

            {/* 청산 */}
            {isLast ? (
              <Box>
                <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>{fmtDate(trade.exit_ts)}</Typography>
                <Typography sx={{ fontSize: 10, color: exitMarkerColor, fontFamily: 'monospace', fontWeight: 700 }}>
                  {fmtPrice(trade.exit_price)}
                </Typography>
                {hasMultiple && trade.avg_entry_price && (
                  <Typography sx={{ fontSize: 8, color: '#71717a' }}>avg {fmtPrice(trade.avg_entry_price)}</Typography>
                )}
              </Box>
            ) : <Box />}

            {/* 손익 */}
            {isFirst ? (
              <Box sx={{ textAlign: 'right' }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: pnlColor, fontFamily: 'monospace', lineHeight: 1.2 }}>
                  {fmtPct(trade.pnl_pct)}
                </Typography>
                <Typography sx={{ fontSize: 9, color: pnlColor, fontFamily: 'monospace', opacity: 0.75 }}>
                  {win ? '+' : ''}${trade.net_pnl.toFixed(2)}
                </Typography>
              </Box>
            ) : <Box />}

            {/* 진입금액 / 잔여금액 */}
            {isFirst ? (
              <Box sx={{ textAlign: 'right' }}>
                {trade.capital_before != null && (
                  <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                    보유 ${trade.capital_before.toFixed(0)}
                  </Typography>
                )}
                <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
                  투입 ${trade.capital_used.toFixed(0)}
                </Typography>
              </Box>
            ) : <Box />}

            {/* 수수료 */}
            {isFirst ? (
              <Box sx={{ textAlign: 'right' }}>
                {trade.commission != null && trade.commission > 0 ? (
                  <Typography sx={{ fontSize: 9, color: '#dc2626', fontFamily: 'monospace', fontWeight: 600 }}>
                    -${trade.commission.toFixed(2)}
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: 9, color: '#52525b' }}>-</Typography>
                )}
              </Box>
            ) : <Box />}
          </Box>
        )
      })}
    </Box>
  )
})

export default TradeRow
