import { useState } from 'react'
import BacktestViewer from './BacktestViewer'
import PaperDashboard from './PaperDashboard'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
type DashTab = 'paper' | 'backtest'

export default function CryptoExplorer() {
  const [tab, setTab] = useState<DashTab>('paper')

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: '#09090b',
        p: { xs: 2, sm: 3 },
        maxWidth: 1440,
        mx: 'auto',
      }}
    >
      {/* ── Header ── */}
      <Box sx={{ mb: 3 }}>
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: { xs: 20, sm: 24 },
            color: '#fafafa',
            letterSpacing: '-0.02em',
          }}
        >
          크립토 봇 대시보드
        </Typography>
      </Box>

      {/* ── Tab bar ── */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2.5 }}>
        {([
          { key: 'paper',    label: '페이퍼 트레이딩' },
          { key: 'backtest', label: '백테스트 뷰어'   },
        ] as { key: DashTab; label: string }[]).map(({ key, label }) => (
          <Box
            key={key}
            component="button"
            onClick={() => setTab(key)}
            sx={{
              px: 2, py: 0.75,
              borderRadius: 2,
              border: '1px solid',
              borderColor: tab === key
                ? key === 'paper' ? '#16a34a' : '#3b82f6'
                : '#27272a',
              background: tab === key
                ? key === 'paper' ? '#16a34a20' : '#3b82f620'
                : 'transparent',
              color: tab === key
                ? key === 'paper' ? '#4ade80' : '#3b82f6'
                : '#52525b',
              fontSize: 12,
              fontWeight: tab === key ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
              '&:hover': { borderColor: '#3b82f666', color: '#a1a1aa' },
            }}
          >
            {label}
          </Box>
        ))}
      </Box>

      {tab === 'backtest' ? (
        <BacktestViewer />
      ) : (
        <PaperDashboard />
      )}
    </Box>
  )
}
