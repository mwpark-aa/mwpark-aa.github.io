import { useState, useEffect, useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import { supabase } from '../../lib/supabase'
import type { RunHistory } from './backtest/types'
import PaperChart from './PaperChart'

// ── 타입 ─────────────────────────────────────────────────────

interface ActiveConfig {
  id: string
  name?: string
  symbol: string
  interval: string
  leverage: number
  min_score: number
  rsi_oversold: number
  rsi_overbought: number
  fixed_tp: number
  fixed_sl: number
  initial_capital: number
  score_exit_threshold: number
  adx_threshold: number
  score_use_adx: boolean
  score_use_rsi: boolean
  score_use_macd: boolean
  score_use_bb: boolean
  score_use_golden_cross: boolean
}

interface PaperAccount {
  capital: number
  initial_capital: number
  updated_at: string | null
  last_processed_ts: string | null
}

interface PaperPos {
  id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  target_price: number | null
  stop_loss: number | null
  quantity: number
  capital_used: number
  entry_time: string
  signal_details?: string | null
  score?: number | null
  status: string
}

interface ClosedTrade {
  id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  exit_price: number
  net_pnl: number
  pnl_pct: number
  exit_reason: string
  entry_time: string
  exit_time: string
  score?: number | null
}

// ── 유틸 ─────────────────────────────────────────────────────

const fmtPrice = (v: number) =>
  v >= 1000
    ? v.toLocaleString('en', { maximumFractionDigits: 2 })
    : v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 5 })

const fmtPct = (v: number, sign = true) =>
  `${sign && v >= 0 ? '+' : ''}${v.toFixed(2)}%`

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── 소형 지표 카드 ────────────────────────────────────────────

function MetricBox({ label, value, color = '#fafafa', sub }: {
  label: string; value: string; color?: string; sub?: string
}) {
  return (
    <Box sx={{ px: 2, py: 1.5, borderRadius: 2, background: '#0a0a0b', border: '1px solid #1f1f23', minWidth: 0 }}>
      <Typography sx={{ fontSize: 10, color: '#52525b', mb: 0.25 }}>{label}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'monospace', lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ fontSize: 9, color: '#3f3f46', fontFamily: 'monospace', mt: 0.25 }}>{sub}</Typography>}
    </Box>
  )
}

// ── 오픈 포지션 카드 ─────────────────────────────────────────

function OpenPositionRow({ pos, currentPrice }: { pos: PaperPos; currentPrice?: number }) {
  const isShort   = pos.direction === 'SHORT'
  const refPrice  = currentPrice ?? pos.entry_price
  const unrealPct = isShort
    ? ((pos.entry_price - refPrice) / pos.entry_price) * 100
    : ((refPrice - pos.entry_price) / pos.entry_price) * 100
  const pnlColor  = unrealPct >= 0 ? '#10b981' : '#ef4444'

  // TP↔SL 프로그레스 (0% = SL, 100% = TP)
  const progressPct = pos.stop_loss != null && pos.target_price != null
    ? Math.max(0, Math.min(100, isShort
        ? (pos.stop_loss - refPrice) / (pos.stop_loss - pos.target_price) * 100
        : (refPrice - pos.stop_loss) / (pos.target_price - pos.stop_loss) * 100
      ))
    : null

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: '120px 1fr 120px 140px' },
      gap: 1.5, px: 2, py: 1.5,
      borderRadius: 2, background: '#111113',
      borderLeft: `3px solid ${isShort ? '#f97316' : '#3b82f6'}`,
      border: `1px solid ${isShort ? '#f9731622' : '#3b82f622'}`,
      alignItems: 'center',
    }}>
      {/* 심볼 + 방향 */}
      <Box>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mb: 0.5 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#fafafa', fontFamily: 'monospace' }}>
            {pos.symbol}
          </Typography>
          <Chip label={isShort ? '숏' : '롱'} size="small" sx={{
            height: 16, fontSize: 9, fontWeight: 800,
            bgcolor: isShort ? '#f9731620' : '#3b82f620',
            color: isShort ? '#f97316' : '#3b82f6',
            border: `1px solid ${isShort ? '#f9731640' : '#3b82f640'}`,
            '& .MuiChip-label': { px: 0.75 },
          }} />
        </Box>
        <Typography sx={{ fontSize: 9, color: '#52525b' }}>
          {fmtTime(pos.entry_time)}
        </Typography>
        {pos.score != null && (
          <Typography sx={{ fontSize: 9, color: '#52525b' }}>점수 {pos.score}</Typography>
        )}
      </Box>

      {/* 진입가 + 시그널 */}
      <Box>
        <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.25 }}>진입가</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#fafafa', fontFamily: 'monospace' }}>
          ${fmtPrice(pos.entry_price)}
        </Typography>
        {pos.signal_details && (
          <Typography sx={{ fontSize: 9, color: '#3f3f46', mt: 0.25 }}>{pos.signal_details}</Typography>
        )}
      </Box>

      {/* 미실현 손익 */}
      <Box>
        <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.25 }}>미실현 손익</Typography>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: pnlColor, fontFamily: 'monospace' }}>
          {currentPrice ? fmtPct(unrealPct) : '—'}
        </Typography>
        {currentPrice && (
          <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
            ${fmtPrice(currentPrice)}
          </Typography>
        )}
      </Box>

      {/* TP / SL + 프로그레스 */}
      <Box sx={{ textAlign: 'right' }}>
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mb: 0.5 }}>
          {pos.target_price != null && (
            <Typography sx={{ fontSize: 9, color: '#10b98188', fontFamily: 'monospace' }}>
              TP ${fmtPrice(pos.target_price)}
            </Typography>
          )}
          {pos.stop_loss != null && (
            <Typography sx={{ fontSize: 9, color: '#ef444488', fontFamily: 'monospace' }}>
              SL ${fmtPrice(pos.stop_loss)}
            </Typography>
          )}
        </Box>
        {progressPct != null && (
          <Box sx={{ width: 100, height: 3, bgcolor: '#27272a', borderRadius: 99, overflow: 'hidden', ml: 'auto', mb: 0.5 }}>
            <Box sx={{ width: `${progressPct}%`, height: '100%', bgcolor: pnlColor, borderRadius: 99, transition: 'width 0.4s' }} />
          </Box>
        )}
        <Typography sx={{ fontSize: 9, color: '#52525b' }}>
          ${pos.capital_used.toLocaleString('en', { maximumFractionDigits: 0 })} 투입
        </Typography>
      </Box>
    </Box>
  )
}

// ── 청산 내역 행 ─────────────────────────────────────────────

function ClosedTradeRow({ trade }: { trade: ClosedTrade }) {
  const isShort  = trade.direction === 'SHORT'
  const isProfit = trade.net_pnl >= 0
  const pnlColor = isProfit ? '#10b981' : '#ef4444'

  const reasonColor: Record<string, string> = {
    TP:         '#10b981',
    SL:         '#ef4444',
    SCORE_EXIT: '#f59e0b',
    LIQUIDATED: '#dc2626',
    DATA_END:   '#52525b',
  }

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '80px 36px 100px 100px 80px 60px 1fr',
      gap: 0.75, px: 1.5, py: 0.75,
      borderRadius: 1.5, background: '#0a0a0b',
      border: '1px solid #1a1a1e',
      alignItems: 'center',
      '&:hover': { borderColor: '#27272a' },
    }}>
      <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
        {fmtTime(trade.exit_time)}
      </Typography>
      <Chip label={isShort ? '숏' : '롱'} size="small" sx={{
        height: 14, fontSize: 8, fontWeight: 800,
        bgcolor: isShort ? '#f9731618' : '#3b82f618',
        color: isShort ? '#f97316' : '#3b82f6',
        '& .MuiChip-label': { px: 0.5 },
      }} />
      <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
        ${fmtPrice(trade.entry_price)}
      </Typography>
      <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
        ${fmtPrice(trade.exit_price)}
      </Typography>
      <Typography sx={{ fontSize: 10, fontWeight: 700, color: pnlColor, fontFamily: 'monospace' }}>
        {fmtPct(trade.pnl_pct)}
      </Typography>
      <Chip
        label={trade.exit_reason}
        size="small"
        sx={{
          height: 14, fontSize: 8,
          bgcolor: `${reasonColor[trade.exit_reason] ?? '#52525b'}18`,
          color: reasonColor[trade.exit_reason] ?? '#52525b',
          '& .MuiChip-label': { px: 0.5 },
        }}
      />
      <Typography sx={{ fontSize: 9, color: '#3f3f46', fontFamily: 'monospace' }}>
        {trade.symbol}
      </Typography>
    </Box>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export default function PaperDashboard() {
  const [config,       setConfig]       = useState<ActiveConfig | null>(null)
  const [history,      setHistory]      = useState<RunHistory[]>([])
  const [account,      setAccount]      = useState<PaperAccount | null>(null)
  const [openPos,      setOpenPos]      = useState<PaperPos[]>([])
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [activating,   setActivating]   = useState<string | null>(null)
  const priceTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 데이터 로드 ────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from('backtest_runs')
      .select('id, name, symbol, interval, leverage, min_score, rsi_oversold, rsi_overbought, fixed_tp, fixed_sl, initial_capital, score_exit_threshold, adx_threshold, score_use_adx, score_use_rsi, score_use_macd, score_use_bb, score_use_golden_cross')
      .eq('paper_trading_enabled', true)
      .maybeSingle()
    setConfig(data as ActiveConfig | null)
  }, [])

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('backtest_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setHistory(data as RunHistory[])
  }, [])

  const activatePaper = useCallback(async (run: RunHistory) => {
    setActivating(run.id)
    const willActivate = !run.paper_trading_enabled
    await supabase.from('backtest_runs').update({ paper_trading_enabled: false }).eq('paper_trading_enabled', true)
    await supabase.from('backtest_runs').update({ paper_trading_enabled: willActivate }).eq('id', run.id)
    await Promise.all([loadConfig(), loadHistory()])
    setActivating(null)
  }, [loadConfig, loadHistory])

  const loadAccount = useCallback(async () => {
    const { data } = await supabase
      .from('paper_account')
      .select('capital, initial_capital, updated_at, last_processed_ts')
      .eq('id', 1)
      .single()
    if (data) setAccount(data as PaperAccount)
  }, [])

  const loadOpenPos = useCallback(async (configId?: string) => {
    const query = supabase
      .from('paper_positions')
      .select('id, symbol, direction, entry_price, target_price, stop_loss, quantity, capital_used, entry_time, signal_details, score, status')
      .eq('status', 'OPEN')
      .order('entry_time', { ascending: false })

    if (configId) query.eq('backtest_run_id', configId)

    const { data } = await query
    if (data) setOpenPos(data as PaperPos[])
  }, [])

  const loadClosedTrades = useCallback(async (configId?: string) => {
    const query = supabase
      .from('paper_positions')
      .select('id, symbol, direction, entry_price, exit_price, net_pnl, pnl_pct, exit_reason, entry_time, exit_time, score')
      .eq('status', 'CLOSED')
      .order('exit_time', { ascending: false })
      .limit(30)

    if (configId) query.eq('backtest_run_id', configId)

    const { data } = await query
    if (data) setClosedTrades(data as ClosedTrade[])
  }, [])

  // ── 현재가 폴링 ────────────────────────────────────────────

  const fetchPrice = useCallback(async (symbol: string) => {
    try {
      const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`)
      if (!resp.ok) return
      const { price } = await resp.json() as { price: string }
      setCurrentPrice(parseFloat(price))
    } catch {
      // 네트워크 오류 무시
    }
  }, [])

  // ── 초기화 + 구독 ──────────────────────────────────────────

  useEffect(() => {
    let mounted = true

    const init = async () => {
      setLoading(true)
      await Promise.all([loadConfig(), loadAccount(), loadHistory()])
      setLoading(false)
    }
    init()

    // Supabase Realtime 구독
    const channel = supabase
      .channel('paper-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_positions' }, () => {
        if (!mounted) return
        loadConfig().then(async () => {
          // config가 갱신된 후 positions 다시 로드
        })
        loadOpenPos()
        loadClosedTrades()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'paper_account' }, () => {
        if (mounted) loadAccount()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'backtest_runs' }, () => {
        if (mounted) { loadConfig(); loadHistory() }
      })
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [loadConfig, loadAccount, loadOpenPos, loadClosedTrades, loadHistory])

  // config 로드 후 포지션 / 거래 내역 로드
  useEffect(() => {
    loadOpenPos(config?.id)
    loadClosedTrades(config?.id)
  }, [config?.id, loadOpenPos, loadClosedTrades])

// 현재가 폴링 (config 심볼 기준, 10초 간격)
  useEffect(() => {
    if (priceTimer.current) clearInterval(priceTimer.current)
    if (!config?.symbol) { setCurrentPrice(null); return }

    fetchPrice(config.symbol)
    priceTimer.current = setInterval(() => fetchPrice(config.symbol), 10_000)
    return () => { if (priceTimer.current) clearInterval(priceTimer.current) }
  }, [config?.symbol, fetchPrice])

  // ── 계산 ───────────────────────────────────────────────────

  const totalReturn = account
    ? (account.capital - account.initial_capital) / account.initial_capital * 100
    : null

  const winCount  = closedTrades.filter(t => t.net_pnl > 0).length
  const loseCount = closedTrades.filter(t => t.net_pnl <= 0).length
  const winRate   = closedTrades.length > 0 ? winCount / closedTrades.length * 100 : null

  // ── 렌더 ───────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={24} sx={{ color: '#3b82f6' }} />
      </Box>
    )
  }

  if (!config) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 13, color: '#52525b', mb: 1 }}>
          활성화된 페이퍼 트레이딩 설정이 없습니다
        </Typography>
        <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>
          백테스트 뷰어 → 이력에서 ● 버튼으로 설정을 활성화하세요
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* ── 활성 설정 배너 ──────────────────────────────────── */}
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

      {/* ── 페이퍼 트레이딩 제한 안내 ──────────────────────────── */}
      <Box sx={{
        px: 2, py: 1, borderRadius: 1.5,
        background: '#0d0d0f', border: '1px solid #1f1f23',
        display: 'flex', alignItems: 'flex-start', gap: 1,
      }}>
        <Typography sx={{ fontSize: 10, color: '#3f3f46', mt: '1px', flexShrink: 0 }}>ℹ</Typography>
        <Typography sx={{ fontSize: 10, color: '#FFF', lineHeight: 1.6 }}>
          실제 거래소는 TP/SL 지정가 주문이 미리 걸려 있어 가격 도달 즉시 체결됩니다.
          페이퍼 트레이딩은 <Box component="span" sx={{ color: '#52525b', fontFamily: 'monospace' }}>{config.interval}</Box> 크론 기준으로 캔들 종료 후 고가/저가로 TP·SL 터치 여부를 확인하므로,
          실제 체결 시점과 최대 <Box component="span" sx={{ color: '#52525b', fontFamily: 'monospace' }}>1캔들</Box>의 차이가 발생할 수 있습니다.
        </Typography>
      </Box>

      {/* ── 이력 목록 ───────────────────────────────────────── */}
      <Box>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
          백테스트 이력 — 활성화할 설정 선택
        </Typography>
        <Box sx={{
          display: 'flex', flexDirection: 'column', gap: 0.5,
          maxHeight: 260, overflowY: 'auto',
          '&::-webkit-scrollbar': { width: 3 },
          '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
        }}>
          {history.length === 0 && (
            <Typography sx={{ fontSize: 11, color: '#3f3f46', textAlign: 'center', py: 3 }}>
              저장된 백테스트 이력이 없습니다
            </Typography>
          )}
          {history.map((run) => {
            const isActive  = run.paper_trading_enabled === true
            const ret       = run.total_return_pct
            const retColor  = ret >= 0 ? '#10b981' : '#ef4444'
            const isLoading = activating === run.id

            return (
              <Box
                key={run.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '20px 1fr',
                  gap: 1, alignItems: 'center',
                }}
              >
                {/* 활성화 토글 버튼 */}
                <Tooltip title={isActive ? '비활성화' : '이 설정으로 페이퍼 트레이딩 시작'} placement="right">
                  <Box
                    onClick={() => !isLoading && activatePaper(run)}
                    sx={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isActive ? '#16a34a' : '#1f1f23',
                      border: `1px solid ${isActive ? '#22c55e' : '#3f3f46'}`,
                      cursor: isLoading ? 'wait' : 'pointer',
                      transition: 'all 0.15s',
                      '&:hover': { background: isActive ? '#15803d' : '#27272a', borderColor: isActive ? '#4ade80' : '#52525b' },
                    }}
                  >
                    {isLoading
                      ? <CircularProgress size={8} sx={{ color: '#4ade80' }} />
                      : <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#4ade80' : '#52525b' }} />
                    }
                  </Box>
                </Tooltip>

                {/* 이력 행 */}
                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: '52px 44px 76px 76px 64px 64px 64px 1fr',
                  gap: 0.75, px: 1.5, py: 0.75, borderRadius: 1.5,
                  background: isActive ? '#052e16' : '#0a0a0b',
                  border: `1px solid ${isActive ? '#16a34a55' : '#1f1f23'}`,
                  alignItems: 'center',
                  minWidth: 0,
                }}>
                  <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                    {new Date(run.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </Typography>
                  <Chip label={run.symbol} size="small" sx={{
                    height: 15, fontSize: 9, fontWeight: 700,
                    bgcolor: '#27272a', color: '#a1a1aa',
                    '& .MuiChip-label': { px: 0.75 },
                  }} />
                  <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                    {run.start_date} ~
                  </Typography>
                  <Typography sx={{ fontSize: 9, color: retColor, fontFamily: 'monospace', fontWeight: 700 }}>
                    {ret >= 0 ? '+' : ''}{ret?.toFixed(1)}%
                  </Typography>
                  <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
                    승률 {run.win_rate?.toFixed(0)}%
                  </Typography>
                  <Typography sx={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>
                    MDD -{run.max_drawdown_pct?.toFixed(1)}%
                  </Typography>
                  <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                    {run.total_trades}건 · {run.interval}
                  </Typography>
                  <Typography sx={{ fontSize: 9, color: isActive ? '#4ade80' : '#3b82f660', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.name ?? `RSI ${run.rsi_oversold}/${run.rsi_overbought} · ${run.leverage}x · 점수${run.min_score}+`}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* ── 계좌 요약 ───────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1 }}>
        <MetricBox
          label="현재 자본"
          value={`$${account ? account.capital.toLocaleString('en', { maximumFractionDigits: 2 }) : '—'}`}
          color="#fafafa"
          sub={`초기 $${account?.initial_capital.toLocaleString('en', { maximumFractionDigits: 0 }) ?? '—'}`}
        />
        <MetricBox
          label="총 수익률"
          value={totalReturn != null ? fmtPct(totalReturn) : '—'}
          color={totalReturn == null ? '#71717a' : totalReturn >= 0 ? '#10b981' : '#ef4444'}
        />
        <MetricBox
          label="승률"
          value={winRate != null ? `${winRate.toFixed(1)}%` : '—'}
          color={winRate != null && winRate >= 50 ? '#10b981' : '#71717a'}
          sub={`${winCount}승 ${loseCount}패 (${closedTrades.length}건)`}
        />
        {currentPrice != null && (
          <MetricBox
            label={`${config.symbol} 현재가`}
            value={`$${fmtPrice(currentPrice)}`}
            color="#fafafa"
          />
        )}
      </Box>

      {/* ── 실시간 차트 ─────────────────────────────────────── */}
      <PaperChart
        symbol={config.symbol}
        interval={config.interval}
        chartConfig={{
          showMA:   config.score_use_golden_cross ?? true,
          showBB:   config.score_use_bb           ?? false,
          showRSI:  config.score_use_rsi          ?? true,
          showMACD: config.score_use_macd         ?? true,
          showADX:  config.score_use_adx          ?? false,
          rsiOversold:  config.rsi_oversold,
          rsiOverbought: config.rsi_overbought,
          adxThreshold:  config.adx_threshold ?? 20,
        }}
        position={openPos.length > 0 ? {
          entry_price:  openPos[0].entry_price,
          target_price: openPos[0].target_price,
          stop_loss:    openPos[0].stop_loss,
          direction:    openPos[0].direction,
        } : null}
      />

      {/* ── 오픈 포지션 ─────────────────────────────────────── */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fafafa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            오픈 포지션
          </Typography>
          <Chip
            label={openPos.length > 0 ? `${openPos.length}건` : '없음'}
            size="small"
            sx={{
              height: 16, fontSize: 9, fontWeight: 700,
              bgcolor: openPos.length > 0 ? '#10b98120' : '#27272a',
              color: openPos.length > 0 ? '#10b981' : '#52525b',
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        </Box>

        {openPos.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center', borderRadius: 2, border: '1px solid #1f1f23' }}>
            <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>오픈 포지션 없음</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {openPos.map(pos => (
              <OpenPositionRow
                key={pos.id}
                pos={pos}
                currentPrice={pos.symbol === config.symbol ? currentPrice ?? undefined : undefined}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* ── 청산 내역 ────────────────────────────────────────── */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fafafa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            청산 내역
          </Typography>
          <Chip label={`최근 ${closedTrades.length}건`} size="small" sx={{
            height: 16, fontSize: 9, bgcolor: '#27272a', color: '#52525b',
            '& .MuiChip-label': { px: 0.75 },
          }} />
        </Box>

        {closedTrades.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center', borderRadius: 2, border: '1px solid #1f1f23' }}>
            <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>아직 청산된 거래가 없습니다</Typography>
          </Box>
        ) : (
          <Box sx={{ borderRadius: 2, border: '1px solid #1f1f23', overflow: 'hidden' }}>
            {/* 헤더 */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: '80px 36px 100px 100px 80px 60px 1fr',
              gap: 0.75, px: 1.5, py: 0.75,
              background: '#0d0d0f', borderBottom: '1px solid #1f1f23',
            }}>
              {['청산시각', '방향', '진입가', '청산가', '수익률', '이유', '심볼'].map(h => (
                <Typography key={h} sx={{ fontSize: 9, color: '#3f3f46', fontWeight: 600 }}>{h}</Typography>
              ))}
            </Box>
            {/* 행 */}
            <Box sx={{
              maxHeight: 340, overflowY: 'auto',
              '&::-webkit-scrollbar': { width: 3 },
              '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
            }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.75 }}>
                {closedTrades.map(t => (
                  <ClosedTradeRow key={t.id} trade={t} />
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Box>

    </Box>
  )
}
