import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { ClosedTrade, ActiveConfig } from './types'
import { fmtPrice, fmtPct, fmtTime } from './types'

const EXIT_REASON_MAP: Record<string, string> = {
  TP:         '목표가 달성',
  SL:         '손절가 달성',
  SCORE_EXIT: '신호약화',
  LIQUIDATED: '청산',
  DATA_END:   '데이터 종료',
}

function SignalDetails({ details, isShort }: { details: string; isShort: boolean }) {
  const parts = details.split(' | ')
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.3 }}>
      {parts.map((part, i) => {
        const scored = part.endsWith('✓')
        const label  = scored ? part.slice(0, -1) : part
        return (
          <Typography key={i} sx={{
            fontSize: 9, fontFamily: 'monospace', lineHeight: 1.4,
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

function ClosedTradeRow({ trade }: { trade: ClosedTrade }) {
  const isShort      = trade.direction === 'SHORT'
  const win          = trade.net_pnl >= 0
  const pnlColor     = win ? '#10b981' : '#ec4899'
  const dirColor     = isShort ? '#ef4444' : '#3b82f6'
  const exitColor    = win ? '#10b981' : '#ef4444'
  const isMobile     = useMediaQuery('(max-width:600px)')

  const exitLabel = EXIT_REASON_MAP[trade.exit_reason] ?? trade.exit_reason

  if (isMobile) {
    return (
      <Box sx={{
        borderRadius: 1.5,
        borderLeft: `3px solid ${dirColor}66`,
        background: '#111113',
        px: 1.5, py: 1,
      }}>
        {/* 행 1: 방향 + 시각 + 손익 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Chip label={isShort ? '숏' : '롱'} size="small" sx={{
              height: 16, fontSize: 9, fontWeight: 800,
              bgcolor: `${dirColor}18`, color: dirColor,
              border: `1px solid ${dirColor}44`,
              '& .MuiChip-label': { px: 0.75 },
            }} />
            <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
              {fmtTime(trade.entry_time)} → {fmtTime(trade.exit_time)}
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
            {fmtPrice(trade.entry_price)} →{' '}
            <Box component="span" sx={{ color: exitColor }}>{fmtPrice(trade.exit_price)}</Box>
          </Typography>
        </Box>

        {/* 행 3: 시그널 */}
        {trade.signal_details && (
          <Box sx={{ mb: 0.4 }}>
            <SignalDetails details={trade.signal_details} isShort={isShort} />
          </Box>
        )}

        {/* 행 4: 청산 이유 + 투입금 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 9, color: '#71717a' }}>{exitLabel}</Typography>
          <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
            투입 ${trade.capital_used.toFixed(0)}
          </Typography>
        </Box>
      </Box>
    )
  }

  // ── 데스크탑 ────────────────────────────────────────────────────
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '36px 100px 1.5fr 1.0fr 100px 80px 80px',
      gap: 0.75, px: 1.5, py: 0.55,
      background: '#111113',
      borderRadius: 1.5,
      borderLeft: `3px solid ${dirColor}66`,
      alignItems: 'center',
      '&:hover': { background: `${dirColor}08` },
      transition: 'background 0.15s',
    }}>
      {/* 방향 */}
      <Chip label={isShort ? '숏' : '롱'} size="small" sx={{
        height: 15, fontSize: 8, fontWeight: 800,
        bgcolor: `${dirColor}18`, color: dirColor,
        border: `1px solid ${dirColor}44`,
        '& .MuiChip-label': { px: 0.5 },
      }} />

      {/* 진입 */}
      <Box>
        <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>{fmtTime(trade.entry_time)}</Typography>
        <Typography sx={{ fontSize: 10, color: '#fff', fontFamily: 'monospace' }}>{fmtPrice(trade.entry_price)}</Typography>
      </Box>

      {/* 시그널 */}
      <Box>
        {trade.signal_details && <SignalDetails details={trade.signal_details} isShort={isShort} />}
      </Box>

      {/* 청산 이유 */}
      <Box>
        <Typography sx={{ fontSize: 10, color: '#fff', fontFamily: 'monospace', lineHeight: 1.3 }}>
          {exitLabel}
        </Typography>
      </Box>

      {/* 청산 */}
      <Box>
        <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>{fmtTime(trade.exit_time)}</Typography>
        <Typography sx={{ fontSize: 10, color: exitColor, fontFamily: 'monospace', fontWeight: 700 }}>
          {fmtPrice(trade.exit_price)}
        </Typography>
      </Box>

      {/* 손익 */}
      <Box sx={{ textAlign: 'right' }}>
        <Typography sx={{ fontSize: 11, fontWeight: 800, color: pnlColor, fontFamily: 'monospace', lineHeight: 1.2 }}>
          {fmtPct(trade.pnl_pct)}
        </Typography>
        <Typography sx={{ fontSize: 9, color: pnlColor, fontFamily: 'monospace', opacity: 0.75 }}>
          {win ? '+' : ''}${trade.net_pnl.toFixed(2)}
        </Typography>
      </Box>

      {/* 투입금 */}
      <Box sx={{ textAlign: 'right' }}>
        <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
          투입 ${trade.capital_used.toFixed(0)}
        </Typography>
      </Box>
    </Box>
  )
}

function ConfigTradeSection({ config, trades }: { config: ActiveConfig | undefined; trades: ClosedTrade[] }) {
  const wins    = trades.filter(t => t.net_pnl > 0).length
  const losses  = trades.filter(t => t.net_pnl <= 0).length
  const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(0) : null
  const avgPnl  = trades.length > 0
    ? trades.reduce((s, t) => s + t.pnl_pct, 0) / trades.length
    : null
  const label = config
    ? (config.name ?? `${config.symbol} ${config.interval} 점수${config.min_score}+`)
    : '알 수 없는 설정'

  return (
    <Box>
      {/* 설정 헤더 */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
        px: 1.5, py: 0.75,
        background: '#0d0d0f', borderBottom: '1px solid #1f1f23',
      }}>
        <Typography sx={{
          fontSize: 10, fontWeight: 700, color: '#a1a1aa', flex: '1 1 auto', minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexShrink: 0 }}>
          <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
            {trades.length}건
          </Typography>
          {winRate != null && (
            <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
              {wins}승 {losses}패{' '}
              <Box component="span" sx={{ color: Number(winRate) >= 50 ? '#10b981' : '#ef4444' }}>
                ({winRate}%)
              </Box>
            </Typography>
          )}
          {avgPnl != null && (
            <Typography sx={{ fontSize: 9, fontFamily: 'monospace', color: avgPnl >= 0 ? '#10b98188' : '#ef444488' }}>
              avg {fmtPct(avgPnl)}
            </Typography>
          )}
        </Box>
      </Box>

      {/* 컬럼 헤더 (데스크탑) */}
      <Box sx={{
        display: { xs: 'none', sm: 'grid' },
        gridTemplateColumns: '36px 100px 1.5fr 1.0fr 100px 80px 80px',
        gap: 0.75, px: 1.5, py: 0.5,
        background: '#0a0a0b', borderBottom: '1px solid #1a1a1e',
      }}>
        {['방향', '진입', '시그널', '청산이유', '청산', '손익', '투입'].map(h => (
          <Typography key={h} sx={{ fontSize: 9, color: '#3f3f46', fontWeight: 600 }}>{h}</Typography>
        ))}
      </Box>

      {/* 거래 행 */}
      <Box sx={{
        maxHeight: 320, overflowY: 'auto',
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
  )
}

interface Props {
  trades: ClosedTrade[]
  configs: ActiveConfig[]
}

export default function ClosedTradeList({ trades, configs }: Props) {
  const grouped = trades.reduce<Map<string, ClosedTrade[]>>((map, t) => {
    const key = t.backtest_run_id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
    return map
  }, new Map())

  const configMap = Object.fromEntries(configs.map(c => [c.id, c]))

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fafafa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          청산 내역
        </Typography>
        <Chip label={`${trades.length}건`} size="small" sx={{
          height: 16, fontSize: 9, bgcolor: '#27272a', color: '#52525b',
          '& .MuiChip-label': { px: 0.75 },
        }} />
      </Box>

      {trades.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', borderRadius: 2, border: '1px solid #1f1f23' }}>
          <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>아직 청산된 거래가 없습니다</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[...grouped.entries()].map(([runId, groupTrades]) => (
            <Box key={runId} sx={{ borderRadius: 2, border: '1px solid #1f1f23', overflow: 'hidden' }}>
              <ConfigTradeSection config={configMap[runId]} trades={groupTrades} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
