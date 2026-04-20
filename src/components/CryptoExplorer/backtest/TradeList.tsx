import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import CommonTradeRow from '../common/CommonTradeRow'
import CommonTradeListHeader from '../common/CommonTradeListHeader'
import CommonEmptyState from '../common/CommonEmptyState'
import type { BacktestTrade } from './types'

interface Props {
  trades: BacktestTrade[]
  loading: boolean
  selectedTradeId: string | null
  onScrollTo: (ts: string) => void
  onSelectTrade: (id: string) => void
}

export default function TradeList({ trades, loading, selectedTradeId, onScrollTo, onSelectTrade }: Props) {
  return (
    <Card sx={{ background: '#111113', border: '1px solid #27272a', borderRadius: 3 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#fafafa' }}>
            거래 내역 ({trades.length}건)
          </Typography>
          {loading && <CircularProgress size={12} sx={{ color: '#3b82f6' }} />}
        </Box>

        <Box sx={{
          overflowX: 'auto',
          '&::-webkit-scrollbar': { height: 3 },
          '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
        }}>
          <CommonTradeListHeader
            columns={['방향', '진입', '매수 이유', '매도 이유', '청산', '손익', '', '수수료']}
            showCommission={true}
          />

          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            minHeight: 100,
            maxHeight: 600,
            minWidth: { xs: 0, sm: 460 },
            overflowY: 'auto',
            pr: 0.5,
            '&::-webkit-scrollbar': { width: 3 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
          }}>
            {trades.length > 0 ? (
              trades.map((t, i) => (
                <CommonTradeRow
                  key={t.id}
                  trade={t}
                  index={i}
                  onScrollTo={onScrollTo}
                  onSelectTrade={onSelectTrade}
                  isSelected={t.id === selectedTradeId}
                  showCommission={true}
                  showAvgEntry={true}
                  showCapitalBefore={true}
                />
              ))
            ) : (
              <CommonEmptyState />
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}
