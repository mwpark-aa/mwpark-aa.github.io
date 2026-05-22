import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import StockBacktest from './StockBacktest'
import StockPaper from './StockPaper'

export default function StockExplorer() {
  const [tab, setTab] = useState(0)

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: '#fafafa' }}>
        US Stock Strategy
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 3,
          borderBottom: '1px solid #27272a',
          '& .MuiTab-root': { color: '#71717a', textTransform: 'none', fontSize: 14 },
          '& .Mui-selected': { color: '#fafafa' },
          '& .MuiTabs-indicator': { background: '#3b82f6' },
        }}
      >
        <Tab label="백테스트" />
        <Tab label="페이퍼 트레이딩" />
      </Tabs>

      {tab === 0 && <StockBacktest />}
      {tab === 1 && <StockPaper />}
    </Box>
  )
}
