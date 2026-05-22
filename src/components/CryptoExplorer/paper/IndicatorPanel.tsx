import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { Candle } from '../../../lib/backtest/types'
import type { ActiveConfig } from './types'

interface Props {
  candle: Candle
  config: ActiveConfig
}

interface IndicatorRow {
  label: string
  value: string
  longFiring: boolean
  shortFiring: boolean
  enabled: boolean
}

function buildRows(c: Candle, cfg: ActiveConfig): IndicatorRow[] {
  const rows: IndicatorRow[] = []

  if (cfg.score_use_rsi && c.rsi14 != null) {
    rows.push({
      label: 'RSI(14)',
      value: c.rsi14.toFixed(1),
      longFiring:  c.rsi14 < cfg.rsi_oversold,
      shortFiring: c.rsi14 > cfg.rsi_overbought,
      enabled: true,
    })
  }

  if (cfg.score_use_macd && c.macd_hist != null) {
    rows.push({
      label: 'MACD Hist',
      value: c.macd_hist.toFixed(4),
      longFiring:  c.macd_hist > 0,
      shortFiring: c.macd_hist < 0,
      enabled: true,
    })
  }

  if (cfg.score_use_adx && c.adx14 != null) {
    rows.push({
      label: `ADX(14) > ${cfg.adx_threshold}`,
      value: c.adx14.toFixed(1),
      longFiring:  c.adx14 > cfg.adx_threshold,
      shortFiring: c.adx14 > cfg.adx_threshold,
      enabled: true,
    })
  }

  if (cfg.score_use_bb && c.bb_upper != null && c.bb_lower != null) {
    rows.push({
      label: 'BB',
      value: `↓${c.bb_lower.toFixed(1)} / ↑${c.bb_upper.toFixed(1)}`,
      longFiring:  c.close <= c.bb_lower,
      shortFiring: c.close >= c.bb_upper,
      enabled: true,
    })
  }

  if (cfg.score_use_golden_cross && c.ma20 != null && c.ma60 != null) {
    rows.push({
      label: 'MA Cross',
      value: `MA20 ${c.ma20.toFixed(1)} / MA60 ${c.ma60.toFixed(1)}`,
      longFiring:  c.ma20 > c.ma60,
      shortFiring: c.ma20 < c.ma60,
      enabled: true,
    })
  }

  if (cfg.score_use_fed_liquidity) {
    const state = c.fed_state
    rows.push({
      label: 'Fed 유동성',
      value: state === 1 ? '확장' : state === -1 ? '수축' : '혼재',
      longFiring:  state === 1,
      shortFiring: state === -1,
      enabled: true,
    })
  }

  return rows
}

function computeScore(rows: IndicatorRow[], side: 'long' | 'short'): number {
  return rows.filter(r => side === 'long' ? r.longFiring : r.shortFiring).length
}

export default function IndicatorPanel({ candle, config }: Props) {
  const rows      = buildRows(candle, config)
  const longScore  = computeScore(rows, 'long')
  const shortScore = computeScore(rows, 'short')
  const minScore   = config.min_score

  if (rows.length === 0) return null

  const longReady  = longScore  >= minScore
  const shortReady = shortScore >= minScore

  return (
    <Box sx={{
      borderRadius: 2, border: '1px solid #1f1f23', background: '#0a0a0b',
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <Box sx={{
        px: 1.5, py: 1, background: '#111113',
        display: 'flex', alignItems: 'center', gap: 1,
        borderBottom: '1px solid #1f1f23',
      }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          현재 지표
        </Typography>
        {/* 스코어 뱃지 */}
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <ScoreBadge label="LONG" score={longScore} min={minScore} ready={longReady} color="#4ade80" />
          <ScoreBadge label="SHORT" score={shortScore} min={minScore} ready={shortReady} color="#f87171" />
        </Box>
      </Box>

      {/* 지표 rows */}
      <Box sx={{ px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {rows.map(row => (
          <Box key={row.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 10, color: '#52525b', flex: 1, fontFamily: 'monospace' }}>
              {row.label}
            </Typography>
            <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#a1a1aa' }}>
              {row.value}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Dot active={row.longFiring}  color="#4ade80" />
              <Dot active={row.shortFiring} color="#f87171" />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function Dot({ active, color }: { active: boolean; color: string }) {
  return (
    <Box sx={{
      width: 7, height: 7, borderRadius: '50%',
      background: active ? color : '#27272a',
      transition: 'background 0.2s',
    }} />
  )
}

function ScoreBadge({ label, score, min, ready, color }: {
  label: string; score: number; min: number; ready: boolean; color: string
}) {
  return (
    <Box sx={{
      px: 1, py: 0.25, borderRadius: 1,
      background: ready ? `${color}18` : '#18181b',
      border: `1px solid ${ready ? color + '44' : '#27272a'}`,
      display: 'flex', alignItems: 'center', gap: 0.5,
    }}>
      <Typography sx={{ fontSize: 9, color: ready ? color : '#52525b', fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 9, fontFamily: 'monospace', color: ready ? color : '#52525b' }}>
        {score}/{min}
      </Typography>
    </Box>
  )
}
