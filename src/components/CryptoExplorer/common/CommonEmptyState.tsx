import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface Props {
  message?: string
  minHeight?: number
}

export default function CommonEmptyState({
  message = '거래 데이터가 존재하지 않습니다',
  minHeight = 100,
}: Props) {
  return (
    <Box sx={{ py: 4, textAlign: 'center', minHeight }}>
      <Typography sx={{ fontSize: 12, color: '#3f3f46' }}>
        {message}
      </Typography>
    </Box>
  )
}
