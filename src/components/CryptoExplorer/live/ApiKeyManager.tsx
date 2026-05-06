import { useState, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import { supabase } from '../../../lib/supabase'

export interface ApiKey {
  id: string
  label: string
  is_testnet: boolean
  created_at: string
}

interface BalanceState {
  loading: boolean
  balance?: number
  error?: string
}

interface Props {
  apiKeys: ApiKey[]
  onRefresh: () => Promise<unknown> | void
}

const inputSx = {
  background: '#09090b',
  border: '1px solid #3f3f46',
  borderRadius: '6px',
  color: '#fafafa',
  fontSize: 12,
  px: '10px', py: '7px',
  outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  '&::placeholder': { color: '#52525b' },
  '&:focus': { borderColor: '#71717a' },
}

export default function ApiKeyManager({ apiKeys, onRefresh }: Props) {
  const [showForm,    setShowForm]    = useState(false)
  const [label,       setLabel]       = useState('')
  const [apiKey,      setApiKey]      = useState('')
  const [apiSecret,   setApiSecret]   = useState('')
  const [isTestnet,   setIsTestnet]   = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [balances,    setBalances]    = useState<Record<string, BalanceState>>({})

  const resetForm = () => {
    setLabel(''); setApiKey(''); setApiSecret('')
    setIsTestnet(false); setError(null); setShowForm(false)
  }

  const checkBalance = useCallback(async (id: string) => {
    setBalances(prev => ({ ...prev, [id]: { loading: true } }))
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setBalances(prev => ({ ...prev, [id]: { loading: false, error: '로그인 필요' } }))
      return
    }
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ api_key_id: id }),
      })
      const json = await resp.json() as { balance?: number; error?: string }
      if (json.error) {
        setBalances(prev => ({ ...prev, [id]: { loading: false, error: json.error } }))
      } else {
        setBalances(prev => ({ ...prev, [id]: { loading: false, balance: json.balance } }))
      }
    } catch (e) {
      setBalances(prev => ({ ...prev, [id]: { loading: false, error: e instanceof Error ? e.message : '오류' } }))
    }
  }, [])

  const handleAdd = async () => {
    if (!label.trim() || !apiKey.trim() || !apiSecret.trim()) {
      setError('모든 항목을 입력해주세요')
      return
    }
    setSubmitting(true)
    setError(null)
    const { data: newId, error: rpcErr } = await supabase.rpc('upsert_api_key', {
      p_label:      label.trim(),
      p_api_key:    apiKey.trim(),
      p_api_secret: apiSecret.trim(),
      p_is_testnet: isTestnet,
    })
    if (rpcErr) {
      setError(rpcErr.message)
      setSubmitting(false)
      return
    }
    resetForm()
    await onRefresh()
    // 저장 직후 자동 잔고 체크
    if (newId) checkBalance(newId as string)
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await supabase.from('user_api_keys').delete().eq('id', id)
    setBalances(prev => { const n = { ...prev }; delete n[id]; return n })
    onRefresh()
    setDeleting(null)
  }

  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Binance API 키
        </Typography>
        <Tooltip title={showForm ? '취소' : '키 추가'} placement="left">
          <Box
            onClick={() => { setShowForm(v => !v); setError(null) }}
            sx={{
              width: 20, height: 20, borderRadius: 1, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: showForm ? '#71717a' : '#fbbf24',
              '&:hover': { background: '#27272a' },
              transition: 'all 0.15s',
            }}
          >
            {showForm
              ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              : <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            }
          </Box>
        </Tooltip>
      </Box>

      {/* 키 목록 */}
      {apiKeys.length === 0 && !showForm && (
        <Typography sx={{ fontSize: 11, color: '#3f3f46', textAlign: 'center', py: 2 }}>
          등록된 API 키가 없습니다
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: showForm ? 1.5 : 0 }}>
        {apiKeys.map(k => {
          const bs = balances[k.id]
          return (
            <Box
              key={k.id}
              sx={{
                display: 'flex', flexDirection: 'column',
                px: 1.5, py: 1, borderRadius: 1.5,
                background: '#0a0a0b',
                border: `1px solid ${bs?.error ? '#ef444430' : bs?.balance !== undefined ? '#16a34a30' : '#1f1f23'}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7', flex: 1 }}>
                  {k.label}
                </Typography>
                {k.is_testnet && (
                  <Chip label="테스트넷" size="small" sx={{
                    height: 14, fontSize: 8, fontWeight: 700,
                    bgcolor: '#1d4ed820', color: '#60a5fa',
                    '& .MuiChip-label': { px: 0.5 },
                  }} />
                )}
                <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                  {new Date(k.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                </Typography>
                {/* 잔고 새로고침 버튼 */}
                <Tooltip title="잔고 확인" placement="top">
                  <Box
                    onClick={() => !bs?.loading && checkBalance(k.id)}
                    sx={{
                      width: 18, height: 18, borderRadius: 1, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#52525b', cursor: bs?.loading ? 'wait' : 'pointer',
                      '&:hover': { color: '#fbbf24', background: '#fbbf2415' },
                      transition: 'all 0.15s',
                    }}
                  >
                    {bs?.loading
                      ? <CircularProgress size={8} sx={{ color: '#fbbf24' }} />
                      : <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                          <path d="M10 6A4 4 0 1 1 6 2M6 2l2 2M6 2l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    }
                  </Box>
                </Tooltip>
                {/* 삭제 버튼 */}
                <Tooltip title="키 삭제" placement="right">
                  <Box
                    onClick={() => deleting !== k.id && handleDelete(k.id)}
                    sx={{
                      width: 18, height: 18, borderRadius: 1, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#3f3f46', cursor: deleting === k.id ? 'wait' : 'pointer',
                      '&:hover': { color: '#ef4444', background: '#ef444415' },
                      transition: 'all 0.15s',
                    }}
                  >
                    {deleting === k.id
                      ? <CircularProgress size={8} sx={{ color: '#ef4444' }} />
                      : <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    }
                  </Box>
                </Tooltip>
              </Box>
              {/* 잔고 / 에러 표시 */}
              {bs && !bs.loading && (
                <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {bs.error
                    ? <>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                        <Typography sx={{ fontSize: 9, color: '#ef4444', fontFamily: 'monospace' }}>
                          키 오류: {bs.error}
                        </Typography>
                      </>
                    : <>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                        <Typography sx={{ fontSize: 9, color: '#4ade80', fontFamily: 'monospace' }}>
                          USDT {bs.balance?.toFixed(2)} (Futures 잔고)
                        </Typography>
                      </>
                  }
                </Box>
              )}
            </Box>
          )
        })}
      </Box>

      {/* 추가 폼 */}
      {showForm && (
        <Box sx={{
          px: 1.5, py: 1.5, borderRadius: 1.5,
          background: '#0a0a0b', border: '1px solid #27272a',
          display: 'flex', flexDirection: 'column', gap: 1,
        }}>
          <Box component="input"
            placeholder="키 이름 (예: main, sub1)"
            value={label}
            onChange={e => setLabel(e.target.value)}
            sx={inputSx}
          />
          <Box component="input"
            placeholder="API Key"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            sx={inputSx}
          />
          <Box component="input"
            type="password"
            placeholder="API Secret"
            value={apiSecret}
            onChange={e => setApiSecret(e.target.value)}
            sx={inputSx}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              onClick={() => setIsTestnet(v => !v)}
              sx={{
                width: 28, height: 16, borderRadius: 99, cursor: 'pointer',
                background: isTestnet ? '#1d4ed8' : '#27272a',
                position: 'relative', transition: 'background 0.15s', flexShrink: 0,
              }}
            >
              <Box sx={{
                position: 'absolute', top: 2, left: isTestnet ? 14 : 2,
                width: 12, height: 12, borderRadius: '50%',
                background: isTestnet ? '#93c5fd' : '#52525b',
                transition: 'left 0.15s',
              }} />
            </Box>
            <Typography sx={{ fontSize: 11, color: '#71717a' }}>테스트넷</Typography>
            <Box sx={{ flex: 1 }} />
            <Box
              onClick={() => !submitting && handleAdd()}
              sx={{
                px: 1.5, py: 0.5, borderRadius: 1, cursor: submitting ? 'wait' : 'pointer',
                background: '#fbbf2420', border: '1px solid #fbbf2440',
                display: 'flex', alignItems: 'center', gap: 0.5,
              }}
            >
              {submitting && <CircularProgress size={8} sx={{ color: '#fbbf24' }} />}
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>저장</Typography>
            </Box>
          </Box>
          {error && (
            <Typography sx={{ fontSize: 10, color: '#ef4444' }}>{error}</Typography>
          )}
        </Box>
      )}
    </Box>
  )
}