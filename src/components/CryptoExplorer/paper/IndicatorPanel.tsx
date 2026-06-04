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
  lastLongEntryMs?: number | null
  lastShortEntryMs?: number | null
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
  pass: boolean | null
  passLong?: boolean | null
  passShort?: boolean | null
}

function buildRows(c: Candle, cfg: ActiveConfig, fedState?: number | null): IndicatorRow[] {
  const rows: IndicatorRow[] = []

  if (cfg.score_use_rsi && c.rsi14 != null) {
    rows.push({
      label: `RSI(14) < ${cfg.rsi_oversold} / > ${cfg.rsi_overbought}`,
      value: c.rsi14.toFixed(1),
      longFiring:  c.rsi14 < cfg.rsi_oversold,
      shortFiring: c.rsi14 > cfg.rsi_overbought,
    })
  }

  if (cfg.score_use_macd && c.macd_hist != null) {
    rows.push({
      label: 'MACD > 0 / < 0',
      value: `${c.macd_hist >= 0 ? '+' : ''}${c.macd_hist.toFixed(4)}`,
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
      label: `BB ≤ ${c.bb_lower.toFixed(1)} / ≥ ${c.bb_upper.toFixed(1)}`,
      value: c.close.toFixed(1),
      longFiring:  c.close <= c.bb_lower,
      shortFiring: c.close >= c.bb_upper,
    })
  }

  if (cfg.score_use_golden_cross && c.ma20 != null && c.ma60 != null) {
    rows.push({
      label: `MA20 > MA60 / MA20 < MA60`,
      value: `${c.ma20.toFixed(1)} / ${c.ma60.toFixed(1)}`,
      longFiring:  c.ma20 > c.ma60,
      shortFiring: c.ma20 < c.ma60,
    })
  }

  if (cfg.score_use_fed_liquidity) {
    const state = fedState ?? (c as any).fed_state ?? null
    rows.push({
      label: 'Fed 확장=롱 / 수축=숏',
      value: state === 1 ? '확장' : state === -1 ? '수축' : state === 0 ? '혼재' : '—',
      longFiring:  state === 1,
      shortFiring: state === -1,
    })
  }

  if (cfg.score_use_cci && c.cci20 != null) {
    const oversold  = cfg.cci_oversold  ?? -100
    const overbought = cfg.cci_overbought ?? 100
    rows.push({
      label: `CCI(20) < ${oversold} / > ${overbought}`,
      value: `${c.cci20 >= 0 ? '+' : ''}${c.cci20.toFixed(1)}`,
      longFiring:  c.cci20 < oversold,
      shortFiring: c.cci20 > overbought,
    })
  }

  return rows
}

const SIGNAL_COOLDOWN = 4

function buildFilterRows(
  c: Candle,
  cfg: ActiveConfig,
  dailyClose: number | null,
  dailyMa120: number | null,
  lastLongMs: number | null,
  lastShortMs: number | null,
): FilterRow[] {
  const rows: FilterRow[] = []
  const fmtPrice = (v: number) =>
    v >= 1000 ? v.toFixed(1) : v >= 10 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(4)

  // ① MA120 (15m) — 롱: close >= MA, 숏: close <= MA
  if (c.ma120 != null) {
    rows.push({
      label: 'MA120 (15m)',
      value: `${fmtPrice(c.close)} / MA ${fmtPrice(c.ma120)}`,
      pass: null,
      passLong:  c.close >= c.ma120,
      passShort: c.close <= c.ma120,
    })
  }

  // ② MA120 (일봉) — use_daily_trend 시
  if (cfg.use_daily_trend) {
    const passLong  = dailyClose != null && dailyMa120 != null ? dailyClose >= dailyMa120 : null
    const passShort = dailyClose != null && dailyMa120 != null ? dailyClose <= dailyMa120 : null
    rows.push({
      label: 'MA120 (일봉)',
      value: dailyMa120 != null && dailyClose != null ? `${fmtPrice(dailyClose)} / MA ${fmtPrice(dailyMa120)}` : '—',
      pass: null,
      passLong,
      passShort,
    })
  }

  // ③ 쿨다운 — 롱숏 중 하나라도 막히면 빨강
  const intervalMsMap: Record<string, number> = {
    '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000,
    '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
  }
  const intervalMs  = intervalMsMap[cfg.interval] ?? 900_000
  const cooldownMs  = SIGNAL_COOLDOWN * intervalMs
  const nowMs       = c.timestamp + intervalMs
  const longCoolOk  = lastLongMs  == null || (nowMs - lastLongMs)  >= cooldownMs
  const shortCoolOk = lastShortMs == null || (nowMs - lastShortMs) >= cooldownMs
  const longRemain  = !longCoolOk  && lastLongMs  != null ? Math.ceil((cooldownMs - (nowMs - lastLongMs))  / 60_000) : 0
  const shortRemain = !shortCoolOk && lastShortMs != null ? Math.ceil((cooldownMs - (nowMs - lastShortMs)) / 60_000) : 0
  const coolParts: string[] = []
  if (!longCoolOk)  coolParts.push(`롱 ${longRemain}분`)
  if (!shortCoolOk) coolParts.push(`숏 ${shortRemain}분`)
  rows.push({
    label: `쿨다운 (${SIGNAL_COOLDOWN}캔들)`,
    value: coolParts.length > 0 ? coolParts.join(' / ') + ' 남음' : '통과',
    pass: longCoolOk && shortCoolOk,
  })

  // ④ CCI 캡 — cci_max_entry > 0 시
  if ((cfg.cci_max_entry ?? 0) > 0 && c.cci20 != null) {
    const cap = cfg.cci_max_entry!
    rows.push({
      label: `CCI 캡 (±${cap})`,
      value: c.cci20.toFixed(1),
      pass: c.cci20 >= -cap && c.cci20 <= cap,
    })
  }

  // ⑤ RVOL 스킵 — score_use_rvol 시
  if (cfg.score_use_rvol && (cfg.rvol_skip ?? 0) > 0 && c.vol_rvol168 != null) {
    rows.push({
      label: `RVOL ≥ ${cfg.rvol_skip}`,
      value: c.vol_rvol168.toFixed(2),
      pass: c.vol_rvol168 >= cfg.rvol_skip!,
    })
  }

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

export default function IndicatorPanel({ candle, config, fedState, symbol, lastLongEntryMs, lastShortEntryMs }: Props) {
  const [dailyData, setDailyData] = useState<{ close: number; ma120: number } | null>(null)

  useEffect(() => {
    if (!symbol) return
    fetchDailyMA120(symbol).then(setDailyData)
    const id = setInterval(() => fetchDailyMA120(symbol).then(setDailyData), 60_000)
    return () => clearInterval(id)
  }, [symbol])

  const rows       = buildRows(candle, config, fedState)
  const filterRows = buildFilterRows(
    candle, config,
    dailyData?.close ?? null, dailyData?.ma120 ?? null,
    lastLongEntryMs ?? null, lastShortEntryMs ?? null,
  )
  const longScore  = computeScore(rows, 'long')
  const shortScore = computeScore(rows, 'short')
  const minScore   = config.min_score

  if (rows.length === 0) return null

  const longReady   = longScore  >= minScore
  const shortReady  = shortScore >= minScore
  const longBlocked  = filterRows.some(r => r.pass === false)
  const shortBlocked = filterRows.some(r => r.pass === false)

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
            <Typography sx={{ fontSize: 10, color: '#a1a1aa', flex: 1, fontFamily: 'monospace' }}>
              {row.label}
            </Typography>
            <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#a1a1aa' }}>
              {row.value}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', background: row.longFiring  ? '#4ade80' : '#ef4444' }} />
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', background: row.shortFiring ? '#4ade80' : '#ef4444' }} />
            </Box>
          </Box>
        ))}
      </Box>

      {/* 필터 구분선 */}
      <Box sx={{ borderTop: '1px solid #1f1f23', px: 1.5, pt: 0.75, pb: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography sx={{ fontSize: 9, color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.25 }}>
          진입 필터
        </Typography>
        {filterRows.map(row => (
          <Box key={row.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 10, color: '#a1a1aa', flex: 1, fontFamily: 'monospace' }}>
              {row.label}
            </Typography>
            <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: row.pass === false ? '#f87171' : row.pass === true ? '#4ade80' : '#52525b' }}>
              {row.value}
            </Typography>
            {row.passLong != null || row.passShort != null ? (
              <Box sx={{ display: 'flex', gap: 0.4, alignItems: 'center' }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', background: row.passLong === null ? '#27272a' : row.passLong ? '#4ade80' : '#ef4444' }} />
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', background: row.passShort === null ? '#27272a' : row.passShort ? '#4ade80' : '#ef4444' }} />
              </Box>
            ) : (
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: row.pass === null ? '#27272a' : row.pass ? '#4ade80' : '#ef4444', transition: 'background 0.2s' }} />
            )}
          </Box>
        ))}
      </Box>
    </Box>
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
