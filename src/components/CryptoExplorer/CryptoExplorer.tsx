import { useState, useRef, useEffect } from 'react'
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

const LIVE_PW      = '0421'
const LIVE_PW_KEY  = 'live_auth_until'
const LIVE_PW_TTL  = 2 * 60 * 60 * 1000 // 2시간

function isLiveUnlocked() {
  const until = localStorage.getItem(LIVE_PW_KEY)
  return until !== null && Date.now() < Number(until)
}

export default function CryptoExplorer() {
  const [tab,        setTab]        = useState<DashTab>('paper')
  const [showModal,  setShowModal]  = useState(false)
  const [pw,         setPw]         = useState('')
  const [pwError,    setPwError]    = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showModal) setTimeout(() => inputRef.current?.focus(), 50)
  }, [showModal])

  function handleTabClick(key: DashTab) {
    if (key !== 'live') { setTab(key); return }
    if (isLiveUnlocked()) { setTab('live'); return }
    setShowModal(true)
    setPw('')
    setPwError(false)
  }

  function handlePwSubmit() {
    if (pw === LIVE_PW) {
      localStorage.setItem(LIVE_PW_KEY, String(Date.now() + LIVE_PW_TTL))
      setShowModal(false)
      setTab('live')
    } else {
      setPwError(true)
      setPw('')
      inputRef.current?.focus()
    }
  }

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
              onClick={() => handleTabClick(key)}
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

      {/* ── 비밀번호 모달 ── */}
      {showModal && (
        <Box
          onClick={() => setShowModal(false)}
          sx={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <Box
            onClick={e => e.stopPropagation()}
            sx={{
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: 3,
              p: 4,
              width: 300,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}
          >
            <Typography sx={{ color: '#fafafa', fontWeight: 700, fontSize: 16, textAlign: 'center' }}>
              🔒 실제 거래
            </Typography>
            <Typography sx={{ color: '#71717a', fontSize: 12, textAlign: 'center' }}>
              접근하려면 비밀번호를 입력하세요
            </Typography>
            <Box
              component="input"
              ref={inputRef}
              type="password"
              value={pw}
              onChange={e => { setPw(e.target.value); setPwError(false) }}
              onKeyDown={e => e.key === 'Enter' && handlePwSubmit()}
              placeholder="비밀번호"
              sx={{
                background: '#09090b',
                border: '1px solid',
                borderColor: pwError ? '#ef4444' : '#3f3f46',
                borderRadius: 1.5,
                color: '#fafafa',
                fontSize: 16,
                px: 1.5, py: 1,
                outline: 'none',
                textAlign: 'center',
                letterSpacing: '0.3em',
                '&::placeholder': { color: '#52525b', letterSpacing: 'normal' },
              }}
            />
            {pwError && (
              <Typography sx={{ color: '#ef4444', fontSize: 12, textAlign: 'center', mt: -1 }}>
                비밀번호가 올바르지 않습니다
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Box
                component="button"
                onClick={() => setShowModal(false)}
                sx={{
                  flex: 1, py: 1, borderRadius: 1.5,
                  border: '1px solid #3f3f46', background: 'transparent',
                  color: '#71717a', fontSize: 13, cursor: 'pointer',
                  '&:hover': { borderColor: '#52525b', color: '#a1a1aa' },
                }}
              >
                취소
              </Box>
              <Box
                component="button"
                onClick={handlePwSubmit}
                sx={{
                  flex: 1, py: 1, borderRadius: 1.5,
                  border: '1px solid #92400e', background: '#92400e20',
                  color: '#fbbf24', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  '&:hover': { background: '#92400e40' },
                }}
              >
                확인
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}