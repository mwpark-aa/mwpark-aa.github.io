import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { ClosedTrade, ActiveConfig } from './types'
import { fmtPct } from './types'
import CommonTradeRow from '../common/CommonTradeRow'
import CommonTradeListHeader from '../common/CommonTradeListHeader'
import CommonTradeStats from '../common/CommonTradeStats'
import CommonEmptyState from '../common/CommonEmptyState'

function ConfigTradeSection({ config, trades }: { config: ActiveConfig | undefined; trades: ClosedTrade[] }) {
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
        <CommonTradeStats trades={trades} showCount={true} compact={true} formatPct={fmtPct} />
      </Box>

      <CommonTradeListHeader
        columns={['방향', '진입', '시그널', '청산이유', '청산', '손익', '투입']}
        showCommission={false}
      />

      {/* 거래 행 */}
      <Box sx={{
        maxHeight: 320, overflowY: 'auto',
        '&::-webkit-scrollbar': { width: 3 },
        '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
      }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.75 }}>
          {trades.map((t, i) => (
            <CommonTradeRow
              key={t.id}
              trade={{
                ...t,
                entry_ts: t.entry_time,
                exit_ts: t.exit_time,
              } as any}
              index={i}
              showCommission={false}
              showAvgEntry={false}
              showCapitalBefore={false}
            />
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
          <CommonEmptyState message="아직 청산된 거래가 없습니다" minHeight={undefined} />
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
