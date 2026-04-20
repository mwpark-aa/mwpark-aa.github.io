import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import CommonTradeRow from '../common/CommonTradeRow'
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
          {/* 헤더 — 데스크탑만 표시 */}
          <Box sx={{
            display: { xs: 'none', sm: 'grid' },
            gridTemplateColumns: '36px 100px 1.5fr 1.0fr 100px 80px 80px 80px',
            gap: 1,
            px: 1.5, py: 0.75, mb: 0.5,
            minWidth: 540,
            borderBottom: '1px solid #27272a',
          }}>
            {['방향', '진입', '매수 이유', '매도 이유', '청산', '손익', '', '수수료'].map((h) => (
              <Typography
                key={h}
                sx={{ fontSize: 9, color: '#52525b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em' }}
              >
                {h}
              </Typography>
            ))}
          </Box>

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
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 12, color: '#3f3f46' }}>
                  거래 데이터가 존재하지 않습니다.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}
