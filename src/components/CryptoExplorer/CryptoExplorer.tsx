import { useState } from 'react'
import BacktestViewer from './BacktestViewer'
import PaperDashboard from './PaperDashboard'
import LiveDashboard from './LiveDashboard'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
type DashTab = 'paper' | 'live' | 'backtest'

const TAB_STYLES: Record<DashTab, { active: string; bg: string }> = {
  paper:    { active: '#4ade80', bg: '#16a34a' },
  live:     { active: '#fbbf24', bg: '#92400e' },
  backtest: { active: '#3b82f6', bg: '#1d4ed8' },
}

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
          { key: 'live',     label: '실제 거래'        },
          { key: 'backtest', label: '백테스트 뷰어'   },
        ] as { key: DashTab; label: string }[]).map(({ key, label }) => {
          const isActive = tab === key
          const style    = TAB_STYLES[key]
          return (
            <Box
              key={key}
              component="button"
              onClick={() => setTab(key)}
              sx={{
                px: 2, py: 0.75,
                borderRadius: 2,
                border: '1px solid',
                borderColor: isActive ? style.active : '#27272a',
                background:  isActive ? `${style.bg}20` : 'transparent',
                color:       isActive ? style.active : '#52525b',
                fontSize: 12,
                fontWeight: isActive ? 700 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { borderColor: '#3b82f666', color: '#a1a1aa' },
              }}
            >
              {label}
              {key === 'live' && (
                <Box component="span" sx={{
                  ml: 0.75, display: 'inline-block',
                  width: 5, height: 5, borderRadius: '50%',
                  background: isActive ? '#f97316' : '#3f3f46',
                  verticalAlign: 'middle',
                  ...(isActive && {
                    animation: 'pulse 2s infinite',
                    '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                  }),
                }} />
              )}
            </Box>
          )
        })}
      </Box>

      {tab === 'backtest' ? (
        <BacktestViewer />
      ) : tab === 'live' ? (
        <LiveDashboard />
      ) : (
        <PaperDashboard />
      )}
    </Box>
  )
}
