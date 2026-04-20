import { memo, useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { CommonTrade } from './CommonTrade'

function parseAddEntries(trade: CommonTrade) {
  if (!trade.add_entries) return [{ step: 'initial', ts: trade.entry_ts, price: trade.entry_price }]
  try {
    const entries = JSON.parse(trade.add_entries)
    return [{ step: 'initial', ts: trade.entry_ts, price: trade.entry_price }, ...entries]
  } catch {
    return [{ step: 'initial', ts: trade.entry_ts, price: trade.entry_price }]
  }
}

const EXIT_REASON_MAP: Record<string, string> = {
  'TP': '목표가 달성',
  'SL': '손절가 달성',
  'TRAIL': '추적손절',
  'BELOW_TP1': '부분익절',
  'TIMEOUT': '최대 보유기간 종료',
  'LIQUIDATED': '청산',
  'DATA_END': '데이터 종료',
}

interface Props {
  trade: CommonTrade
  index?: number
  onScrollTo?: (ts: string) => void
  onSelectTrade?: (id: string) => void
  isSelected?: boolean
  showCommission?: boolean
  showAvgEntry?: boolean
  showCapitalBefore?: boolean
  formatPrice?: (v: number) => string
  formatDate?: (iso: string) => string
  formatPct?: (v: number, sign?: boolean) => string
}

const fmtPrice = (v: number) =>
  v >= 1000
    ? v.toLocaleString('en', { maximumFractionDigits: 2 })
    : v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 5 })

const fmtPct = (v: number, sign = true) =>
  `${sign && v >= 0 ? '+' : ''}${v.toFixed(2)}%`

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${mo}/${dd} ${hh}:${mm}`
}

const CommonTradeRow = memo(function CommonTradeRow({
  trade,
  index = 0,
  onScrollTo,
  onSelectTrade,
  isSelected = false,
  showCommission = true,
  showAvgEntry = false,
  showCapitalBefore = true,
  formatPrice = fmtPrice,
  formatDate = fmtDate,
  formatPct = fmtPct,
}: Props) {
  if (!trade) return null

  const win = (trade.net_pnl ?? 0) > 0
  const isShort = trade.direction === 'SHORT'
  const isSL = trade.exit_reason?.includes('STOP_LOSS') || trade.exit_reason?.includes('손절')

  const pnlColor = win ? '#10b981' : '#ec4899'
  const dirColor = isShort ? '#ef4444' : '#3b82f6'
  const bg = index % 2 === 0 ? '#111113' : '#18181b'

  const exitMarkerColor = win ? '#10b981' : isSL ? '#ec4899' : '#ef4444'
  const isMobile = useMediaQuery('(max-width:600px)')

  const entries = useMemo(() => parseAddEntries(trade), [trade])
  const hasMultiple = entries.length > 1

  const handleClick = () => {
    onSelectTrade?.(trade.id)
    trade.entry_ts && onScrollTo?.(trade.entry_ts)
  }

  // ── 모바일 카드 레이아웃 ──────────────────────────────────────────
  if (isMobile) {
    return (
      <Box
        onClick={handleClick}
        sx={{
          borderRadius: 1.5,
          borderLeft: `3px solid ${dirColor}${isSelected ? 'ff' : '66'}`,
          cursor: onSelectTrade ? 'pointer' : 'default',
          background: isSelected ? `${dirColor}0f` : bg,
          transition: 'all 0.15s',
          px: 1.5,
          py: 1,
        }}
      >
        {/* 방향 + 시각 + 손익 */}
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
              {formatDate(trade.entry_ts)} → {formatDate(trade.exit_ts)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: pnlColor, fontFamily: 'monospace', lineHeight: 1.2 }}>
              {formatPct(trade.pnl_pct)}
            </Typography>
            <Typography sx={{ fontSize: 9, color: pnlColor, fontFamily: 'monospace', opacity: 0.8 }}>
              {win ? '+' : ''}${trade.net_pnl.toFixed(2)}
            </Typography>
          </Box>
        </Box>

        {/* 진입가 → 청산가 */}
        <Box sx={{ mb: 0.5 }}>
          <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>진입 → 청산</Typography>
          <Typography sx={{ fontSize: 10, color: '#fff', fontFamily: 'monospace' }}>
            {formatPrice(trade.entry_price)} → <span style={{ color: exitMarkerColor }}>{formatPrice(trade.exit_price)}</span>
          </Typography>
          {showAvgEntry && trade.avg_entry_price && (
            <Typography sx={{ fontSize: 8, color: '#71717a' }}>avg {formatPrice(trade.avg_entry_price)}</Typography>
          )}
        </Box>

        {/* 시그널 */}
        {trade.signal_details && (
          <Box sx={{ mb: 0.4 }}>
            <SignalDetails details={trade.signal_details} isShort={isShort} />
          </Box>
        )}

        {/* 청산 이유 + 청산 상세 */}
        <Box sx={{ mb: 0.4 }}>
          <Typography sx={{ fontSize: 9, color: '#71717a', mb: 0.2 }}>
            {EXIT_REASON_MAP[trade.exit_reason] ?? trade.exit_reason}
          </Typography>
          {trade.exit_details && (
            <Typography sx={{ fontSize: 9, fontFamily: 'monospace', lineHeight: 1.4, color: '#fafafa' }}>
              {trade.exit_details.split(' | ').map((d, i, arr) => (
                <span key={i}>{d}{i < arr.length - 1 ? ' | ' : ''}</span>
              ))}
            </Typography>
          )}
        </Box>

        {/* 투입금 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Box />
          <Box sx={{ textAlign: 'right' }}>
            {showCapitalBefore && trade.capital_before != null && (
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
  const columns = [
    '36px',      // 방향
    '100px',     // 진입 시각/가격
    '1.5fr',     // 시그널
    '1.0fr',     // 청산 이유
    '100px',     // 청산 시각/가격
    '80px',      // 손익
    showCommission ? '90px' : '80px',  // 투입금/수수료
    ...(showCommission ? ['80px'] : []),  // 수수료 (별도)
  ].filter(Boolean)

  return (
    <Box
      onClick={handleClick}
      sx={{
        borderRadius: 1.5,
        borderLeft: `3px solid ${dirColor}${isSelected ? 'ff' : '66'}`,
        cursor: onSelectTrade ? 'pointer' : 'default',
        background: isSelected ? `${dirColor}0f` : 'transparent',
        '&:hover > *': onSelectTrade ? { background: `${dirColor}0a !important` } : {},
        transition: 'all 0.15s',
      }}
    >
      {entries.map((e, ei) => {
        const isFirst = ei === 0
        const isLast = ei === entries.length - 1

        return (
          <Box
            key={`${trade.id}-${e.step}-${ei}`}
            sx={{
              display: 'grid',
              gridTemplateColumns: columns.join(' '),
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
              <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>{formatDate(e.ts)}</Typography>
              <Typography sx={{ fontSize: 10, color: '#ffffff', fontFamily: 'monospace' }}>{formatPrice(e.price)}</Typography>
            </Box>

            {/* 매수 이유 */}
            {isFirst ? (
              <Box>
                {trade.signal_details && (
                  <SignalDetails details={trade.signal_details} isShort={isShort} />
                )}
              </Box>
            ) : <Box />}

            {/* 청산 이유 */}
            {isFirst ? (
              <Box>
                <Typography sx={{ fontSize: 10, color: '#FFF', fontFamily: 'monospace', lineHeight: 1.3, mb: 0.3 }}>
                  {EXIT_REASON_MAP[trade.exit_reason]}
                </Typography>
                {trade.exit_details && (
                  <Typography sx={{ fontSize: 9, fontFamily: 'monospace', lineHeight: 1.4, color: '#fafafa' }}>
                    {trade.exit_details.split(' | ').map((d, i, arr) => (
                      <span key={i}>{d}{i < arr.length - 1 ? ' | ' : ''}</span>
                    ))}
                  </Typography>
                )}
              </Box>
            ) : <Box />}

            {/* 청산 */}
            {isLast ? (
              <Box>
                <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>{formatDate(trade.exit_ts)}</Typography>
                <Typography sx={{ fontSize: 10, color: exitMarkerColor, fontFamily: 'monospace', fontWeight: 700 }}>
                  {formatPrice(trade.exit_price)}
                </Typography>
                {hasMultiple && trade.avg_entry_price && (
                  <Typography sx={{ fontSize: 8, color: '#71717a' }}>avg {formatPrice(trade.avg_entry_price)}</Typography>
                )}
              </Box>
            ) : <Box />}

            {/* 손익 */}
            {isFirst ? (
              <Box sx={{ textAlign: 'right' }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: pnlColor, fontFamily: 'monospace', lineHeight: 1.2 }}>
                  {formatPct(trade.pnl_pct)}
                </Typography>
                <Typography sx={{ fontSize: 9, color: pnlColor, fontFamily: 'monospace', opacity: 0.75 }}>
                  {win ? '+' : ''}${trade.net_pnl.toFixed(2)}
                </Typography>
              </Box>
            ) : <Box />}

            {/* 투입금 / 보유금 */}
            {isFirst ? (
              <Box sx={{ textAlign: 'right' }}>
                {showCapitalBefore && trade.capital_before != null && (
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
            {showCommission && isFirst ? (
              <Box sx={{ textAlign: 'right' }}>
                {trade.commission != null && trade.commission > 0 ? (
                  <Typography sx={{ fontSize: 9, color: '#dc2626', fontFamily: 'monospace', fontWeight: 600 }}>
                    -${trade.commission.toFixed(2)}
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: 9, color: '#52525b' }}>-</Typography>
                )}
              </Box>
            ) : showCommission ? <Box /> : null}
          </Box>
        )
      })}
    </Box>
  )
})

function SignalDetails({ details, isShort }: { details: string; isShort: boolean }) {
  const parts = details.split(' | ')
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.3 }}>
      {parts.map((part, i) => {
        const scored = part.endsWith('✓')
        const label = scored ? part.slice(0, -1) : part
        return (
          <Typography key={i} sx={{
            fontSize: 10, fontFamily: 'monospace', lineHeight: 1.3, mb: 0.3,
            color: scored ? (isShort ? '#f97316' : '#10b981') : '#52525b',
            fontWeight: scored ? 700 : 400,
          }}>
            {label}{i < parts.length - 1 ? ' |' : ''}
          </Typography>
        )
      })}
    </Box>
  )
}

export default CommonTradeRow
