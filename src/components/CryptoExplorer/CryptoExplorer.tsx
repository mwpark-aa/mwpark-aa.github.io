import { useState, useRef, useEffect } from 'react'
import BacktestViewer from './BacktestViewer'
import PaperDashboard from './PaperDashboard'
import LiveDashboard from './LiveDashboard'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useAuth } from '../../contexts/AuthContext'

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
type DashTab = 'paper' | 'live' | 'backtest'
type AuthMode = 'signin' | 'signup'

const TAB_STYLES: Record<DashTab, { active: string; bg: string }> = {
  paper:    { active: '#4ade80', bg: '#16a34a' },
  live:     { active: '#fbbf24', bg: '#92400e' },
  backtest: { active: '#3b82f6', bg: '#1d4ed8' },
}

const inputSx = (error?: boolean) => ({
  background: '#09090b',
  border: '1px solid',
  borderColor: error ? '#ef4444' : '#3f3f46',
  borderRadius: '8px',
  color: '#fafafa',
  fontSize: 14,
  px: '12px', py: '10px',
  outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  '&::placeholder': { color: '#52525b' },
  '&:focus': { borderColor: error ? '#ef4444' : '#52525b' },
})

export default function CryptoExplorer() {
  const { user, loading, signIn, signUp, signOut } = useAuth()

  const [tab,       setTab]       = useState<DashTab>('paper')
  const [showModal, setShowModal] = useState(false)
  const [mode,      setMode]      = useState<AuthMode>('signin')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showModal) setTimeout(() => emailRef.current?.focus(), 50)
  }, [showModal])

  // 로그인 성공 후 live 탭으로 이동
  useEffect(() => {
    if (user && showModal) {
      setShowModal(false)
      setTab('live')
    }
  }, [user, showModal])

  function handleTabClick(key: DashTab) {
    if (key !== 'live') { setTab(key); return }
    if (user) { setTab('live'); return }
    setShowModal(true)
    setEmail(''); setPassword(''); setError(null); setMode('signin')
  }

  async function handleSubmit() {
    if (!email.trim() || !password) return
    setSubmitting(true)
    setError(null)

    const err = mode === 'signin'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password)

    if (err) {
      setError(err)
    } else if (mode === 'signup') {
      setError('가입 확인 이메일을 보냈습니다. 이메일을 확인해주세요.')
    }
    setSubmitting(false)
  }

  return (
    <Box sx={{ minHeight: '100vh', background: '#09090b', p: { xs: 2, sm: 3 }, maxWidth: 1440, mx: 'auto' }}>

      {/* ── Header ── */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontWeight: 800, fontSize: { xs: 20, sm: 24 }, color: '#fafafa', letterSpacing: '-0.02em' }}>
          크립토 봇 대시보드
        </Typography>

        {/* 로그인/로그아웃 */}
        {!loading && (
          user ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ fontSize: 11, color: '#52525b', fontFamily: 'monospace' }}>
                {user.email}
              </Typography>
              <Box
                component="button"
                onClick={signOut}
                sx={{
                  px: 1.5, py: 0.5, borderRadius: '6px', cursor: 'pointer',
                  border: '1px solid #3f3f46', background: 'transparent',
                  color: '#71717a', fontSize: 11,
                  '&:hover': { borderColor: '#52525b', color: '#a1a1aa' },
                }}
              >
                로그아웃
              </Box>
            </Box>
          ) : (
            <Box
              component="button"
              onClick={() => { setShowModal(true); setEmail(''); setPassword(''); setError(null); setMode('signin') }}
              sx={{
                px: 1.5, py: 0.5, borderRadius: '6px', cursor: 'pointer',
                border: '1px solid #3f3f46', background: 'transparent',
                color: '#71717a', fontSize: 11,
                '&:hover': { borderColor: '#52525b', color: '#a1a1aa' },
              }}
            >
              로그인
            </Box>
          )
        )}
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
                px: 2, py: 0.75, borderRadius: 2, border: '1px solid',
                borderColor: isActive ? style.active : '#27272a',
                background:  isActive ? `${style.bg}20` : 'transparent',
                color:       isActive ? style.active : '#52525b',
                fontSize: 12, fontWeight: isActive ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s',
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

      {/* ── 로그인/회원가입 모달 ── */}
      {showModal && (
        <Box
          onClick={() => setShowModal(false)}
          sx={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          }}
        >
          <Box
            onClick={e => e.stopPropagation()}
            sx={{
              background: '#18181b', border: '1px solid #27272a', borderRadius: '12px',
              p: '28px', width: 340, display: 'flex', flexDirection: 'column', gap: 2,
            }}
          >
            {/* 탭 */}
            <Box sx={{ display: 'flex', gap: 0.5, background: '#09090b', borderRadius: '8px', p: '4px' }}>
              {(['signin', 'signup'] as AuthMode[]).map(m => (
                <Box
                  key={m}
                  component="button"
                  onClick={() => { setMode(m); setError(null) }}
                  sx={{
                    flex: 1, py: '6px', borderRadius: '6px', cursor: 'pointer',
                    border: 'none',
                    background: mode === m ? '#27272a' : 'transparent',
                    color: mode === m ? '#fafafa' : '#52525b',
                    fontSize: 13, fontWeight: mode === m ? 600 : 400, transition: 'all 0.1s',
                  }}
                >
                  {m === 'signin' ? '로그인' : '회원가입'}
                </Box>
              ))}
            </Box>

            <Box component="input"
              ref={emailRef}
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="이메일"
              sx={inputSx()}
            />
            <Box component="input"
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="비밀번호"
              sx={inputSx(!!error && mode === 'signin')}
            />

            {error && (
              <Typography sx={{
                fontSize: 12, mt: -1,
                color: error.includes('확인 이메일') ? '#4ade80' : '#ef4444',
              }}>
                {error}
              </Typography>
            )}

            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
              <Box component="button" onClick={() => setShowModal(false)} sx={{
                flex: 1, py: '10px', borderRadius: '8px',
                border: '1px solid #3f3f46', background: 'transparent',
                color: '#71717a', fontSize: 13, cursor: 'pointer',
                '&:hover': { borderColor: '#52525b', color: '#a1a1aa' },
              }}>
                취소
              </Box>
              <Box component="button" onClick={handleSubmit} disabled={submitting} sx={{
                flex: 2, py: '10px', borderRadius: '8px',
                border: '1px solid #92400e', background: submitting ? '#92400e10' : '#92400e20',
                color: submitting ? '#a16207' : '#fbbf24',
                fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer',
                transition: 'all 0.1s',
                '&:hover': !submitting ? { background: '#92400e40' } : {},
              }}>
                {submitting ? '...' : mode === 'signin' ? '로그인' : '가입하기'}
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}