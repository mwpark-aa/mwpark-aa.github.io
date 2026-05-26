import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { Candle } from '../../../lib/backtest/types'
import type { ActiveConfig } from './types'

interface Props {
  candle: Candle
  config: ActiveConfig
  fedState?: number | null
  symbol?: string
}

interface IndicatorRow {
  label: string
  value: string
  longFiring: boolean
  shortFiring: boolean
}

interface FilterRow {
  label: string
  value: string
  longPass: boolean | null
  shortPass: boolean | null
}

function buildRows(c: Candle, cfg: ActiveConfig, fedState?: number | null): IndicatorRow[] {
  const rows: IndicatorRow[] = []

  if (cfg.score_use_rsi && c.rsi14 != null) {
    rows.push({
      label: 'RSI(14)',
      value: c.rsi14.toFixed(1),
      longFiring:  c.rsi14 < cfg.rsi_oversold,
      shortFiring: c.rsi14 > cfg.rsi_overbought,
    })
  }

  if (cfg.score_use_macd && c.macd_hist != null) {
    rows.push({
      label: 'MACD Hist',
      value: c.macd_hist.toFixed(4),
      longFiring:  c.macd_hist > 0,
      shortFiring: c.macd_hist < 0,
    })
  }

  if (cfg.score_use_adx && c.adx14 != null) {
    rows.push({
      label: `ADX(14) > ${cfg.adx_threshold}`,
      value: c.adx14.toFixed(1),
      longFiring:  c.adx14 > cfg.adx_threshold,
      shortFiring: c.adx14 > cfg.adx_threshold,
    })
  }

  if (cfg.score_use_bb && c.bb_upper != null && c.bb_lower != null) {
    rows.push({
      label: 'BB',
      value: `↓${c.bb_lower.toFixed(1)} / ↑${c.bb_upper.toFixed(1)}`,
      longFiring:  c.close <= c.bb_lower,
      shortFiring: c.close >= c.bb_upper,
    })
  }

  if (cfg.score_use_golden_cross && c.ma20 != null && c.ma60 != null) {
    rows.push({
      label: 'MA Cross',
      value: `MA20 ${c.ma20.toFixed(1)} / MA60 ${c.ma60.toFixed(1)}`,
      longFiring:  c.ma20 > c.ma60,
      shortFiring: c.ma20 < c.ma60,
    })
  }

  if (cfg.score_use_fed_liquidity) {
    const state = fedState ?? (c as any).fed_state ?? null
    rows.push({
      label: 'Fed 유동성',
      value: state === 1 ? '확장' : state === -1 ? '수축' : state === 0 ? '혼재' : '—',
      longFiring:  state === 1,
      shortFiring: state === -1,
    })
  }

  return rows
}

function buildFilterRows(c: Candle, dailyClose: number | null, dailyMa120: number | null): FilterRow[] {
  const rows: FilterRow[] = []

  if (c.ma120 != null) {
    rows.push({
      label: 'MA120 (15m)',
      value: c.ma120.toFixed(1),
      longPass:  c.close >= c.ma120,
      shortPass: c.close <= c.ma120,
    })
  }

  rows.push({
    label: 'MA120 (일봉)',
    value: dailyMa120 != null ? dailyMa120.toFixed(1) : '—',
    longPass:  dailyClose != null && dailyMa120 != null ? dailyClose >= dailyMa120 : null,
    shortPass: dailyClose != null && dailyMa120 != null ? dailyClose <= dailyMa120 : null,
  })

  return rows
}

function computeScore(rows: IndicatorRow[], side: 'long' | 'short'): number {
  return rows.filter(r => side === 'long' ? r.longFiring : r.shortFiring).length
}

async function fetchDailyMA120(symbol: string): Promise<{ close: number; ma120: number } | null> {
  try {
    const resp = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=130`
    )
    if (!resp.ok) return null
    const data = await resp.json() as [number, string, string, string, string, ...unknown[]][]
    if (data.length < 120) return null
    const closes = data.map(k => parseFloat(k[4]))
    const ma120 = closes.slice(-120).reduce((a, b) => a + b, 0) / 120
    return { close: closes[closes.length - 1]!, ma120 }
  } catch {
    return null
  }
}

export default function IndicatorPanel({ candle, config, fedState, symbol }: Props) {
  const [dailyData, setDailyData] = useState<{ close: number; ma120: number } | null>(null)

  useEffect(() => {
    if (!symbol) return
    fetchDailyMA120(symbol).then(setDailyData)
    const id = setInterval(() => fetchDailyMA120(symbol).then(setDailyData), 60_000)
    return () => clearInterval(id)
  }, [symbol])

  const rows       = buildRows(candle, config, fedState)
  const filterRows = buildFilterRows(candle, dailyData?.close ?? null, dailyData?.ma120 ?? null)
  const longScore  = computeScore(rows, 'long')
  const shortScore = computeScore(rows, 'short')
  const minScore   = config.min_score

  if (rows.length === 0) return null

  const longReady   = longScore  >= minScore
  const shortReady  = shortScore >= minScore
  const longBlocked = filterRows.some(r => r.longPass === false)
  const shortBlocked = filterRows.some(r => r.shortPass === false)

  return (
    <Box sx={{ borderRadius: 2, border: '1px solid #1f1f23', background: '#0a0a0b', overflow: 'hidden' }}>
      {/* 헤더 */}
      <Box sx={{
        px: 1.5, py: 1, background: '#111113',
        display: 'flex', alignItems: 'center', gap: 1,
        borderBottom: '1px solid #1f1f23',
      }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          현재 지표
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <ScoreBadge label="LONG"  score={longScore}  min={minScore} ready={longReady && !longBlocked}   color="#4ade80" blocked={longBlocked} />
          <ScoreBadge label="SHORT" score={shortScore} min={minScore} ready={shortReady && !shortBlocked} color="#f87171" blocked={shortBlocked} />
        </Box>
      </Box>

      {/* 스코어 지표 */}
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

      {/* 필터 구분선 */}
      <Box sx={{ borderTop: '1px solid #1f1f23', px: 1.5, pt: 0.75, pb: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography sx={{ fontSize: 9, color: '#3f3f46', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.25 }}>
          진입 필터
        </Typography>
        {filterRows.map(row => (
          <Box key={row.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 10, color: '#52525b', flex: 1, fontFamily: 'monospace' }}>
              {row.label}
            </Typography>
            <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#a1a1aa' }}>
              {row.value}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <FilterDot pass={row.longPass}  color="#4ade80" />
              <FilterDot pass={row.shortPass} color="#f87171" />
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

function FilterDot({ pass, color }: { pass: boolean | null; color: string }) {
  const bg = pass === null ? '#27272a' : pass ? color : '#ef4444'
  return (
    <Box sx={{
      width: 7, height: 7, borderRadius: '50%',
      background: bg,
      transition: 'background 0.2s',
    }} />
  )
}

function ScoreBadge({ label, score, min, ready, color, blocked }: {
  label: string; score: number; min: number; ready: boolean; color: string; blocked: boolean
}) {
  const effectiveReady = ready && !blocked
  return (
    <Box sx={{
      px: 1, py: 0.25, borderRadius: 1,
      background: effectiveReady ? `${color}18` : blocked ? '#ef444410' : '#18181b',
      border: `1px solid ${effectiveReady ? color + '44' : blocked ? '#ef444444' : '#27272a'}`,
      display: 'flex', alignItems: 'center', gap: 0.5,
    }}>
      <Typography sx={{ fontSize: 9, color: effectiveReady ? color : blocked ? '#ef4444' : '#52525b', fontWeight: 700 }}>
        {label}{blocked ? ' 🚫' : ''}
      </Typography>
      <Typography sx={{ fontSize: 9, fontFamily: 'monospace', color: effectiveReady ? color : blocked ? '#ef4444' : '#52525b' }}>
        {score}/{min}
      </Typography>
    </Box>
  )
}