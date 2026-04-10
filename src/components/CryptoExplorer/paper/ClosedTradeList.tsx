import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { ClosedTrade, ActiveConfig } from './types'
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
      gridTemplateColumns: '80px 36px 100px 100px 80px 60px',
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
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', flex: '1 1 auto', minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexShrink: 0 }}>
          <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
            {trades.length}건
          </Typography>
          {winRate != null && (
            <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
              {wins}승 {losses}패
              <Box component="span" sx={{ color: Number(winRate) >= 50 ? '#10b981' : '#ef4444' }}>
                {' '}({winRate}%)
              </Box>
            </Typography>
          )}
          {avgPnl != null && (
            <Typography sx={{ fontSize: 9, fontFamily: 'monospace',
              color: avgPnl >= 0 ? '#10b98188' : '#ef444488' }}>
              avg {fmtPct(avgPnl)}
            </Typography>
          )}
        </Box>
      </Box>

      {/* 컬럼 헤더 */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: '80px 36px 100px 100px 80px 60px',
        gap: 0.75, px: 1.5, py: 0.5,
        background: '#0a0a0b', borderBottom: '1px solid #1a1a1e',
      }}>
        {['청산시각', '방향', '진입가', '청산가', '수익률', '이유'].map(h => (
          <Typography key={h} sx={{ fontSize: 9, color: '#3f3f46', fontWeight: 600 }}>{h}</Typography>
        ))}
      </Box>

      {/* 거래 행 */}
      <Box sx={{
        maxHeight: 260, overflowY: 'auto',
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
  // backtest_run_id 기준 그룹핑 (등장 순서 유지)
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
              <ConfigTradeSection
                config={configMap[runId]}
                trades={groupTrades}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
