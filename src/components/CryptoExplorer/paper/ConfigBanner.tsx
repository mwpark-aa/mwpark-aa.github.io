import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import type { ActiveConfig, PaperAccount } from './types'
import { fmtTime } from './types'

interface Props {
  config: ActiveConfig
  account: PaperAccount | null
}

export default function ConfigBanner({ config, account }: Props) {
  return (
    <>
      {/* 활성 설정 배너 */}
      <Box sx={{
        px: 2, py: 1.5, borderRadius: 2,
        background: '#052e1680', border: '1px solid #16a34a44',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#4ade80' }}>페이퍼 트레이딩 실행 중</Typography>
        </Box>
        {config.name && (
          <Typography sx={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600 }}>"{config.name}"</Typography>
        )}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', ml: 'auto' }}>
          {[
            config.symbol,
            config.interval,
            `${config.leverage}x`,
            `점수 ${config.min_score}+`,
            config.fixed_tp ? `TP ${config.fixed_tp}% / SL ${config.fixed_sl}%` : null,
          ].filter(Boolean).map(label => (
            <Chip key={label} label={label} size="small" sx={{
              height: 18, fontSize: 9, fontWeight: 700,
              bgcolor: '#16a34a22', color: '#4ade80',
              border: '1px solid #16a34a44',
              '& .MuiChip-label': { px: 0.75 },
            }} />
          ))}
        </Box>
        {account?.last_processed_ts && (
          <Typography sx={{ fontSize: 9, color: '#3f3f46', ml: 'auto', fontFamily: 'monospace' }}>
            마지막 실행 {fmtTime(account.last_processed_ts)}
          </Typography>
        )}
      </Box>

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
          <Box component="span" sx={{ color: '#52525b', fontFamily: 'monospace' }}>{config.interval}</Box>
          {' '}크론 기준으로 캔들 종료 후 고가/저가로 TP·SL 터치 여부를 확인하므로,
          실제 체결 시점과 최대{' '}
          <Box component="span" sx={{ color: '#52525b', fontFamily: 'monospace' }}>1캔들</Box>
          의 차이가 발생할 수 있습니다.
        </Typography>
      </Box>
    </>
  )
}
