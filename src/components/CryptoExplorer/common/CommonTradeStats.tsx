import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface Props {
  trades: Array<{ net_pnl: number; pnl_pct: number }>
  title?: string
  showCount?: boolean
  compact?: boolean
  formatPct?: (v: number, sign?: boolean) => string
}

export default function CommonTradeStats({
  trades,
  title,
  showCount = true,
  compact = false,
  formatPct = (v: number, sign = true) => `${sign && v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
}: Props) {
  const wins = trades.filter(t => t.net_pnl > 0).length
  const losses = trades.filter(t => t.net_pnl <= 0).length
  const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(0) : null
  const avgPnl = trades.length > 0 ? trades.reduce((s, t) => s + t.pnl_pct, 0) / trades.length : null

  if (compact) {
    return (
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexShrink: 0 }}>
        {showCount && (
          <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
            {trades.length}건
          </Typography>
        )}
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
            avg {formatPct(avgPnl)}
          </Typography>
        )}
      </Box>
    )
  }

  return (
    <Box>
      {title && (
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', mb: 0.5 }}>
          {title}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {showCount && (
          <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
            {trades.length}건
          </Typography>
        )}
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
            avg {formatPct(avgPnl)}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
