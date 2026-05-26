import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { ClosedTrade, ActiveConfig } from './types'
import CommonTradeRow from '../common/CommonTradeRow'
import CommonTradeListHeader from '../common/CommonTradeListHeader'
import CommonTradeStats from '../common/CommonTradeStats'
import CommonEmptyState from '../common/CommonEmptyState'
import { fmtPct } from './types'

interface Props {
  trades: ClosedTrade[]
  configs: ActiveConfig[]
}

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

function TimingBar({ timing }: { timing: Record<string, number> }) {
  const steps = TIMING_ORDER.filter(k => k !== 'total_ms' && timing[k] != null)
  const total = timing.total_ms ?? steps.reduce((s, k) => s + (timing[k] ?? 0), 0)

  return (
    <Box sx={{ px: 1.5, py: 1.25, background: '#0d0d10', borderTop: '1px solid #1f1f23' }}>
      {/* 가로 막대 */}
      <Box sx={{ display: 'flex', height: 6, borderRadius: 1, overflow: 'hidden', mb: 1.25, gap: '1px' }}>
        {steps.map((k, i) => {
          const pct = total > 0 ? ((timing[k] ?? 0) / total) * 100 : 0
          const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899']
          return (
            <Box key={k} sx={{ width: `${pct}%`, background: colors[i % colors.length], minWidth: pct > 0 ? 2 : 0 }} />
          )
        })}
      </Box>

      {/* 범례 */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {steps.map((k, i) => {
          const ms = timing[k] ?? 0
          const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899']
          return (
            <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: colors[i % colors.length], flexShrink: 0 }} />
              <Typography sx={{ fontSize: 10, color: '#71717a' }}>{TIMING_LABELS[k] ?? k}</Typography>
              <Typography sx={{ fontSize: 10, color: '#a1a1aa', fontWeight: 600, fontFamily: 'monospace' }}>
                {ms}ms
              </Typography>
            </Box>
          )
        })}
        {timing.total_ms != null && (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 10, color: '#52525b' }}>총</Typography>
            <Typography sx={{
              fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
              color: timing.total_ms > 5000 ? '#ef4444' : timing.total_ms > 3000 ? '#f59e0b' : '#10b981',
            }}>
              {timing.total_ms}ms
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default function ClosedTradeList({ trades }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
        {trades.length > 0 && (
          <Box sx={{ ml: 'auto' }}>
            <CommonTradeStats trades={trades} showCount={false} compact={true} formatPct={fmtPct} />
          </Box>
        )}
      </Box>

      {trades.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', borderRadius: 2, border: '1px solid #1f1f23' }}>
          <CommonEmptyState message="아직 청산된 거래가 없습니다" minHeight={undefined} />
        </Box>
      ) : (
        <Box sx={{ borderRadius: 2, border: '1px solid #1f1f23', overflow: 'hidden' }}>
          <CommonTradeListHeader
            columns={['방향', '진입', '시그널', '청산이유', '청산', '손익', '투입']}
            showCommission={false}
          />
          <Box sx={{
            maxHeight: 480, overflowY: 'auto',
            '&::-webkit-scrollbar': { width: 3 },
            '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
          }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.75 }}>
              {trades.map((t, i) => (
                <Box key={t.id}>
                  <Box
                    onClick={() => t.timing_ms ? setExpandedId(id => id === t.id ? null : t.id) : undefined}
                    sx={{ cursor: t.timing_ms ? 'pointer' : 'default' }}
                  >
                    <CommonTradeRow
                      trade={{ ...t, entry_ts: t.entry_time, exit_ts: t.exit_time } as any}
                      index={i}
                      showCommission={false}
                      showAvgEntry={false}
                      showCapitalBefore={false}
                    />
                  </Box>
                  {t.timing_ms && expandedId === t.id && (
                    <TimingBar timing={t.timing_ms} />
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}