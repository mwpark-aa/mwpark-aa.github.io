import { useState } from 'react'
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

interface Props {
  apiKeys: ApiKey[]
  onRefresh: () => void
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

  const resetForm = () => {
    setLabel(''); setApiKey(''); setApiSecret('')
    setIsTestnet(false); setError(null); setShowForm(false)
  }

  const handleAdd = async () => {
    if (!label.trim() || !apiKey.trim() || !apiSecret.trim()) {
      setError('모든 항목을 입력해주세요')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('upsert_api_key', {
      p_label:      label.trim(),
      p_api_key:    apiKey.trim(),
      p_api_secret: apiSecret.trim(),
      p_is_testnet: isTestnet,
    })
    if (rpcErr) {
      setError(rpcErr.message)
    } else {
      resetForm()
      onRefresh()
    }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await supabase.from('user_api_keys').delete().eq('id', id)
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
        {apiKeys.map(k => (
          <Box
            key={k.id}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              px: 1.5, py: 1, borderRadius: 1.5,
              background: '#0a0a0b', border: '1px solid #1f1f23',
            }}
          >
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
        ))}
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