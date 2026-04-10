import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { ActiveConfig, PaperAccount } from './types'
import { fmtTime } from './types'

interface Props {
  configs: ActiveConfig[]
  account: PaperAccount | null
}

export default function ConfigBanner({ configs, account }: Props) {
  return (
    <>
      {/* 페이퍼 트레이딩 제한 안내 */}
      <Box sx={{
        px: 2, py: 1, borderRadius: 1.5,
        background: '#0d0d0f', border: '1px solid #1f1f23',
        display: 'flex', alignItems: 'flex-start', gap: 1,
      }}>
        <Typography sx={{ fontSize: 10, color: '#3f3f46', mt: '1px', flexShrink: 0 }}>ℹ</Typography>
        <Typography sx={{ fontSize: 10, color: '#FFF', lineHeight: 1.6 }}>
          실제 거래소는 TP/SL 지정가 주문이 미리 걸려 있어 가격 도달 즉시 체결됩니다.
          페이퍼 트레이딩은{' '}
          <Box component="span" sx={{ color: '#52525b', fontFamily: 'monospace' }}>
            {[...new Set(configs.map(c => c.interval))].join(', ')}
          </Box>
          {' '}크론 기준으로 캔들 종료 후 고가/저가로 TP·SL 터치 여부를 확인하므로,
          실제 체결 시점과 최대{' '}
          <Box component="span" sx={{ color: '#52525b', fontFamily: 'monospace' }}>1캔들</Box>
          의 차이가 발생할 수 있습니다.
        </Typography>
      </Box>
    </>
  )
}
