import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { PaperPos } from './types'
import { fmtPrice, fmtPct, fmtTime } from './types'
import type { Candle } from '../../../lib/backtest/types'

const TIMING_LABELS: Record<string, string> = {
  klines_ms:  '캔들 로드',
  fed_ms:     '연준 데이터',
  daily_ms:   '일봉 로드',
  balance_ms: '잔액 조회',
  setup_ms:   '마진/레버리지',
  order_ms:   '진입 주문',
  tp_sl_ms:   'TP/SL 주문',
  total_ms:   '전체',
}
const TIMING_ORDER = ['klines_ms', 'fed_ms', 'daily_ms', 'balance_ms', 'setup_ms', 'order_ms', 'tp_sl_ms', 'total_ms']
const TIMING_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

function TimingBar({ timing }: { timing: Record<string, number> }) {
  const steps = TIMING_ORDER.filter(k => k !== 'total_ms' && timing[k] != null)
  const total = timing.total_ms ?? steps.reduce((s, k) => s + (timing[k] ?? 0), 0)
  return (
    <Box sx={{ px: 1.5, py: 1.25, background: '#0d0d10', borderTop: '1px solid #1f1f23' }}>
      <Box sx={{ display: 'flex', height: 6, borderRadius: 1, overflow: 'hidden', mb: 1.25, gap: '1px' }}>
        {steps.map((k, i) => (
          <Box key={k} sx={{ width: `${total > 0 ? ((timing[k] ?? 0) / total) * 100 : 0}%`, background: TIMING_COLORS[i % TIMING_COLORS.length], minWidth: timing[k] ? 2 : 0 }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {steps.map((k, i) => (
          <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: TIMING_COLORS[i % TIMING_COLORS.length], flexShrink: 0 }} />
            <Typography sx={{ fontSize: 10, color: '#71717a' }}>{TIMING_LABELS[k] ?? k}</Typography>
            <Typography sx={{ fontSize: 10, color: '#a1a1aa', fontWeight: 600, fontFamily: 'monospace' }}>{timing[k]}ms</Typography>
          </Box>
        ))}
        {timing.total_ms != null && (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 10, color: '#52525b' }}>총</Typography>
            <Typography sx={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: timing.total_ms > 5000 ? '#ef4444' : timing.total_ms > 3000 ? '#f59e0b' : '#10b981' }}>
              {timing.total_ms}ms
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}

// signal_details 파싱 및 현재값 계산
function parseSignalDetails(signal: string | null | undefined) {
  if (!signal) return []
  return signal.split(' | ').map(part => {
    const scored = part.endsWith('✓')
    const label = scored ? part.slice(0, -1) : part
    return { label, scored }
  })
}

function getFormattedIndicatorValue(label: string, candle: Candle | null, fedState?: number | null): string {
  if (!candle) return '—'

  const trimmed = label.trim()
  const indicatorName = trimmed.split(':')[0]
  let value: string | null = null

  if (trimmed.startsWith('RSI')) {
    value = candle.rsi14 != null ? candle.rsi14.toFixed(0) : null
  } else if (trimmed.startsWith('ADX')) {
    value = candle.adx14 != null ? candle.adx14.toFixed(1) : null
  } else if (trimmed.startsWith('BB')) {
    if (candle.bb_upper != null && candle.bb_lower != null) {
      const pct = ((candle.close - candle.bb_lower) / (candle.bb_upper - candle.bb_lower)) * 100
      value = pct.toFixed(0)
    }
  } else if (trimmed.startsWith('일목')) {
    if (candle.ichimoku_a != null && candle.ichimoku_b != null) {
      value = candle.close > candle.ichimoku_a ? '구름위' : '구름아래'
    }
  } else if (trimmed.startsWith('MACD')) {
    value = candle.macd_hist != null ? (candle.macd_hist >= 0 ? '양' : '음') : null
  } else if (trimmed.startsWith('연준')) {
    value = fedState != null
      ? (fedState === 1 ? '확장' : fedState === -1 ? '수축' : '혼재')
      : null
  }

  return `${indicatorName}: ${value !== null ? value : '—'}`
}

function OpenPositionRow({ pos, currentPrice, latestCandle, fedState, expanded, onToggle }: { pos: PaperPos; currentPrice?: number; latestCandle?: Candle | null; fedState?: number | null; expanded?: boolean; onToggle?: () => void }) {
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
    <>
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: pos.timing_ms ? '120px 140px 1fr 1fr 120px 140px 68px' : '120px 140px 1fr 1fr 120px 140px' },
      gap: 1.5, px: { xs: 1.5, sm: 2 }, py: 1.5,
      borderRadius: expanded ? '8px 8px 0 0' : 2, background: '#111113',
      borderLeft: `3px solid ${isShort ? '#f97316' : '#3b82f6'}`,
      border: `1px solid ${isShort ? '#f9731622' : '#3b82f622'}`,
      alignItems: 'center',
    }}>
      {/* 심볼 + 방향 — mobile: 좌상단, desktop: col1 */}
      <Box sx={{ order: { xs: 1, sm: 1 } }}>
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

      {/* 미실현 손익 — mobile: 우상단, desktop: col5 */}
      <Box sx={{ order: { xs: 2, sm: 5 }, textAlign: { xs: 'right', sm: 'left' } }}>
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

      {/* 진입가 — mobile: 좌하단, desktop: col2 */}
      <Box sx={{ order: { xs: 3, sm: 2 } }}>
        <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.25 }}>진입가</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#fafafa', fontFamily: 'monospace' }}>
          ${fmtPrice(pos.entry_price)}
        </Typography>
      </Box>

      {/* TP/SL — mobile: 우하단, desktop: col6 */}
      <Box sx={{ order: { xs: 4, sm: 6 }, textAlign: 'right' }}>
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
          <Box sx={{ width: { xs: '100%', sm: 100 }, height: 3, bgcolor: '#27272a', borderRadius: 99, overflow: 'hidden', ml: 'auto', mb: 0.5 }}>
            <Box sx={{ width: `${progressPct}%`, height: '100%', bgcolor: pnlColor, borderRadius: 99, transition: 'width 0.4s' }} />
          </Box>
        )}
        <Typography sx={{ fontSize: 9, color: '#52525b' }}>
          ${pos.capital_used.toLocaleString('en', { maximumFractionDigits: 0 })} 투입
        </Typography>
      </Box>

      {/* 지표 진입시 — mobile: 전체 폭, desktop: col3 */}
      {pos.signal_details && (
        <Box sx={{ order: { xs: 5, sm: 3 }, gridColumn: { xs: 'span 2', sm: 'auto' } }}>
          <Typography sx={{ fontSize: 7, color: '#52525b', mb: 0.25, fontWeight: 600 }}>진입시</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
            {parseSignalDetails(pos.signal_details).map((item, i, arr) => (
              <Typography key={`entry-${i}`} sx={{
                fontSize: 10, fontFamily: 'monospace',
                color: item.scored ? (isShort ? '#f97316' : '#10b981') : '#3f3f46',
                fontWeight: item.scored ? 700 : 400,
              }}>
                {item.label}{i < arr.length - 1 ? ' |' : ''}
              </Typography>
            ))}
          </Box>
        </Box>
      )}

      {/* 지표 현재 — mobile: 숨김, desktop: col4 */}
      {pos.signal_details && latestCandle && (
        <Box sx={{ order: { xs: 6, sm: 4 }, display: { xs: 'none', sm: 'block' } }}>
          <Typography sx={{ fontSize: 7, color: '#52525b', mb: 0.25, fontWeight: 600 }}>현재</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
            {parseSignalDetails(pos.signal_details).map((item, i, arr) => (
              <Typography key={`current-${i}`} sx={{ fontSize: 10, fontFamily: 'monospace', color: '#e4e4e7', fontWeight: 600 }}>
                {getFormattedIndicatorValue(item.label, latestCandle, fedState)}{i < arr.length - 1 ? ' |' : ''}
              </Typography>
            ))}
          </Box>
        </Box>
      )}

      {pos.timing_ms && onToggle && (
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'center', order: { sm: 7 } }}>
          <Box
            onClick={onToggle}
            sx={{
              display: 'flex', alignItems: 'center',
              px: 0.75, py: 0.4, borderRadius: 1,
              bgcolor: expanded ? '#3b82f620' : '#27272a',
              border: `1px solid ${expanded ? '#3b82f650' : '#3f3f46'}`,
              cursor: 'pointer', userSelect: 'none',
              '&:hover': { bgcolor: '#3b82f620', borderColor: '#3b82f650' },
            }}
          >
            <Typography sx={{ fontSize: 9, color: expanded ? '#3b82f6' : '#71717a', fontFamily: 'monospace', fontWeight: 600 }}>
              {pos.timing_ms.total_ms != null ? `${pos.timing_ms.total_ms}ms` : '—'}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
    {pos.timing_ms && expanded && <TimingBar timing={pos.timing_ms} />}
    </>
  );
}

interface Props {
  openPos: PaperPos[]
  currentPrice: number | null
  symbol: string
  latestCandle?: Candle | null
  fedState?: number | null
}

export default function OpenPositions({ openPos, currentPrice, symbol, latestCandle, fedState }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
          {openPos.map(pos => (
            <OpenPositionRow
              key={pos.id}
              pos={pos}
              currentPrice={pos.symbol === symbol ? currentPrice ?? undefined : undefined}
              latestCandle={pos.symbol === symbol ? latestCandle : undefined}
              fedState={fedState}
              expanded={expandedId === pos.id}
              onToggle={() => setExpandedId(id => id === pos.id ? null : pos.id)}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
