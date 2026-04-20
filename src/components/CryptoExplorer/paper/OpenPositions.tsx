import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { PaperPos } from './types'
import { fmtPrice, fmtPct, fmtTime } from './types'
import type { Candle } from '../../../lib/backtest/types'

// signal_details 파싱 및 현재값 계산
function parseSignalDetails(signal: string | null | undefined) {
  if (!signal) return []
  return signal.split(' | ').map(part => {
    const scored = part.endsWith('✓')
    const label = scored ? part.slice(0, -1) : part
    return { label, scored }
  })
}

function getCurrentIndicatorValue(label: string, candle: Candle | null) {
  if (!candle) return null

  const trimmed = label.trim()

  if (trimmed.startsWith('RSI')) {
    return candle.rsi14 != null ? candle.rsi14.toFixed(0) : null
  }
  if (trimmed.startsWith('ADX')) {
    return candle.adx14 != null ? candle.adx14.toFixed(1) : null
  }
  if (trimmed.startsWith('BB')) {
    if (candle.bb_upper != null && candle.bb_lower != null) {
      const pct = ((candle.close - candle.bb_lower) / (candle.bb_upper - candle.bb_lower)) * 100
      return pct.toFixed(0)
    }
    return null
  }
  if (trimmed.startsWith('일목')) {
    if (candle.ichimoku_a != null && candle.ichimoku_b != null) {
      return candle.close > candle.ichimoku_a ? '구름위' : '구름아래'
    }
    return null
  }
  if (trimmed.startsWith('MACD')) {
    return candle.macd_hist != null ? (candle.macd_hist >= 0 ? '양' : '음') : null
  }

  return null
}

function OpenPositionRow({ pos, currentPrice, latestCandle }: { pos: PaperPos; currentPrice?: number; latestCandle?: Candle | null }) {
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
        gridTemplateColumns: {xs: '1fr', sm: '120px 140px 1fr 1fr 120px 140px'},
        gap: 1.5, px: 2, py: 1.5,
        borderRadius: 2, background: '#111113',
        borderLeft: `3px solid ${isShort ? '#f97316' : '#3b82f6'}`,
        border: `1px solid ${isShort ? '#f9731622' : '#3b82f622'}`,
        alignItems: 'center',
      }}>
        {/* 심볼 + 방향 */}
        <Box>
          <Box sx={{display: 'flex', gap: 0.75, alignItems: 'center', mb: 0.5}}>
            <Typography sx={{fontSize: 14, fontWeight: 800, color: '#fafafa', fontFamily: 'monospace'}}>
              {pos.symbol}
            </Typography>
            <Chip label={isShort ? '숏' : '롱'} size="small" sx={{
              height: 16, fontSize: 9, fontWeight: 800,
              bgcolor: isShort ? '#f9731620' : '#3b82f620',
              color: isShort ? '#f97316' : '#3b82f6',
              border: `1px solid ${isShort ? '#f9731640' : '#3b82f640'}`,
              '& .MuiChip-label': {px: 0.75},
            }}/>
          </Box>
          <Typography sx={{fontSize: 9, color: '#52525b'}}>{fmtTime(pos.entry_time)}</Typography>
          {pos.score != null && (
              <Typography sx={{fontSize: 9, color: '#52525b'}}>점수 {pos.score}</Typography>
          )}
        </Box>

        {/* 진입가 */}
        <Box>
          <Typography sx={{fontSize: 9, color: '#52525b', mb: 0.25}}>진입가</Typography>
          <Typography sx={{fontSize: 13, fontWeight: 700, color: '#fafafa', fontFamily: 'monospace'}}>
            ${fmtPrice(pos.entry_price)}
          </Typography>
        </Box>

        {/* 지표 (진입시 | 현재) */}
        {pos.signal_details && (
            <Box>
              <Box>
                <Typography sx={{fontSize: 7, color: '#52525b', mb: 0.25, fontWeight: 600}}>진입시</Typography>
                <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.25}}>
                  {parseSignalDetails(pos.signal_details).map((item, i, arr) => {
                    const scored = item.scored
                    return (
                        <Typography key={`entry-${i}`} sx={{
                          fontSize: 10, fontFamily: 'monospace',
                          color: scored ? (isShort ? '#f97316' : '#10b981') : '#3f3f46',
                          fontWeight: scored ? 700 : 400,
                        }}>
                          {item.label}{i < arr.length - 1 ? ' |' : ''}
                        </Typography>
                    )
                  })}
                </Box>
              </Box>
            </Box>
        )}

        {pos.signal_details && (
            <Box>
              {/* 현재 */}
              {latestCandle && (
                  <Box>
                    <Typography sx={{fontSize: 7, color: '#52525b', mb: 0.25, fontWeight: 600}}>현재</Typography>
                    <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.25}}>
                      {parseSignalDetails(pos.signal_details).map((item, i, arr) => {
                        const currentVal = getCurrentIndicatorValue(item.label, latestCandle)
                        return (
                            <Typography key={`current-${i}`} sx={{
                              fontSize: 10, fontFamily: 'monospace',
                              color: '#e4e4e7',
                              fontWeight: 600,
                            }}>
                              {currentVal !== null ? currentVal : '—'}
                              {i < arr.length - 1 ? ' |' : ''}
                            </Typography>
                        )
                      })}
                    </Box>
                  </Box>
              )}
            </Box>
        )}

        {/* 미실현 손익 */}
        <Box>
          <Typography sx={{fontSize: 9, color: '#52525b', mb: 0.25}}>미실현 손익</Typography>
          <Typography sx={{fontSize: 15, fontWeight: 800, color: pnlColor, fontFamily: 'monospace'}}>
            {currentPrice ? fmtPct(unrealPct) : '—'}
          </Typography>
          {currentPrice && (
              <Typography sx={{fontSize: 9, color: '#52525b', fontFamily: 'monospace'}}>
                ${fmtPrice(currentPrice)}
              </Typography>
          )}
        </Box>

        {/* TP / SL + 프로그레스 */}
        <Box sx={{textAlign: 'right'}}>
          <Box sx={{display: 'flex', gap: 1.5, justifyContent: 'flex-end', mb: 0.5}}>
            {pos.target_price != null && (
                <Typography sx={{fontSize: 9, color: '#10b98188', fontFamily: 'monospace'}}>
                  TP ${fmtPrice(pos.target_price)}
                </Typography>
            )}
            {pos.stop_loss != null && (
                <Typography sx={{fontSize: 9, color: '#ef444488', fontFamily: 'monospace'}}>
                  SL ${fmtPrice(pos.stop_loss)}
                </Typography>
            )}
          </Box>
          {progressPct != null && (
              <Box sx={{
                width: 100,
                height: 3,
                bgcolor: '#27272a',
                borderRadius: 99,
                overflow: 'hidden',
                ml: 'auto',
                mb: 0.5
              }}>
                <Box sx={{
                  width: `${progressPct}%`,
                  height: '100%',
                  bgcolor: pnlColor,
                  borderRadius: 99,
                  transition: 'width 0.4s'
                }}/>
              </Box>
          )}
          <Typography sx={{fontSize: 9, color: '#52525b'}}>
            ${pos.capital_used.toLocaleString('en', {maximumFractionDigits: 0})} 투입
          </Typography>
        </Box>
      </Box>
  );
}

interface Props {
  openPos: PaperPos[]
  currentPrice: number | null
  symbol: string
  latestCandle?: Candle | null
}

export default function OpenPositions({ openPos, currentPrice, symbol, latestCandle }: Props) {
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
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
