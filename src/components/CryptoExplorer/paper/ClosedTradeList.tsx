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

export default function ClosedTradeList({ trades }: Props) {
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
                <CommonTradeRow
                  key={t.id}
                  trade={{ ...t, entry_ts: t.entry_time, exit_ts: t.exit_time } as any}
                  index={i}
                  showCommission={false}
                  showAvgEntry={false}
                  showCapitalBefore={false}
                />
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
