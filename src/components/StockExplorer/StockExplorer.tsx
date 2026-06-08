import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import StockBacktest from './StockBacktest'

export default function StockExplorer() {
  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: '#fafafa' }}>
        US Stock Strategy
      </Typography>

      <StockBacktest />
    </Box>
  )
}
