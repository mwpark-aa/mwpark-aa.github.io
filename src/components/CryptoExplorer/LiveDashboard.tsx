import { useState, useEffect, useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { supabase } from '../../lib/supabase'
import type { RunHistory } from './backtest/types'
import PaperChart, { type PaperChartHandle } from './PaperChart'
import ConfigBanner from './paper/ConfigBanner'
import HistoryList from './paper/HistoryList'
import AccountSummary from './paper/AccountSummary'
import OpenPositions from './paper/OpenPositions'
import ClosedTradeList from './paper/ClosedTradeList'
import type { ActiveConfig, PaperAccount, PaperPos, ClosedTrade } from './paper/types'
import type { Candle } from '../../lib/backtest/types'

export default function LiveDashboard() {
  const [config,       setConfig]       = useState<ActiveConfig | null>(null)
  const [history,      setHistory]      = useState<RunHistory[]>([])
  const [account,      setAccount]      = useState<PaperAccount | null>(null)
  const [openPos,      setOpenPos]      = useState<PaperPos[]>([])
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [activating,   setActivating]   = useState<string | null>(null)
  const priceTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const chartRef = useRef<PaperChartHandle>(null)
  const [latestCandle, setLatestCandle] = useState<Candle | null>(null)

  // ── 데이터 로드 ──────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from('backtest_runs')
      .select('id, name, symbol, interval, leverage, min_score, rsi_oversold, rsi_overbought, fixed_tp, fixed_sl, initial_capital, score_exit_threshold, adx_threshold, score_use_adx, score_use_rsi, score_use_macd, score_use_bb, score_use_golden_cross')
      .eq('live_trading_enabled', true)
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

  const loadAccount = useCallback(async () => {
    const { data } = await supabase
      .from('live_account')
      .select('balance, initial_balance, updated_at, last_processed_ts')
      .eq('id', 1)
      .single()
    if (data) {
      // live_account.balance → PaperAccount.capital 로 매핑
      setAccount({
        capital:           data.balance ?? 0,
        initial_capital:   data.initial_balance ?? data.balance ?? 0,
        updated_at:        data.updated_at,
        last_processed_ts: data.last_processed_ts,
      } as PaperAccount)
    }
  }, [])

  const loadOpenPos = useCallback(async (configId?: string) => {
    const query = supabase
      .from('live_positions')
      .select('id, backtest_run_id, symbol, direction, entry_price, target_price, stop_loss, quantity, capital_used, entry_time, signal_details, score, status')
      .eq('status', 'OPEN')
      .order('entry_time', { ascending: false })
    if (configId) query.eq('backtest_run_id', configId)
    const { data } = await query
    if (data) setOpenPos(data as PaperPos[])
  }, [])

  const loadClosedTrades = useCallback(async (configId?: string) => {
    const query = supabase
      .from('live_positions')
      .select('id, backtest_run_id, symbol, direction, entry_price, exit_price, net_pnl, pnl_pct, exit_reason, entry_time, exit_time, score, signal_details, exit_details, capital_used')
      .eq('status', 'CLOSED')
      .order('exit_time', { ascending: false })
      .limit(100)
    if (configId) query.eq('backtest_run_id', configId)
    const { data } = await query
    if (data) setClosedTrades(data as ClosedTrade[])
  }, [])

  // ── 실거래 활성화 ─────────────────────────────────────────────

  const activateLive = useCallback(async (run: RunHistory) => {
    setActivating(run.id)
    const willActivate = !run.live_trading_enabled

    if (willActivate) {
      // 기존 실거래 포지션 정리 (새 설정 시작)
      await supabase.from('live_positions').delete().eq('backtest_run_id', run.id)

      // live_account 초기화 (현재 바이낸스 잔액은 edge function이 채움)
      await supabase.from('live_account').upsert({
        id:              1,
        balance:         0,
        initial_balance: 0,
        updated_at:      new Date().toISOString(),
        last_processed_ts: null,
      }, { onConflict: 'id' })
    }

    await supabase.from('backtest_runs').update({ live_trading_enabled: false }).eq('live_trading_enabled', true)
    await supabase.from('backtest_runs').update({ live_trading_enabled: willActivate }).eq('id', run.id)
    await Promise.all([loadConfig(), loadAccount(), loadHistory()])
    setActivating(null)
  }, [loadConfig, loadAccount, loadHistory])

  const deleteHistory = useCallback(async (id: string) => {
    await supabase.from('backtest_runs').delete().eq('id', id)
    await Promise.all([loadConfig(), loadHistory()])
  }, [loadConfig, loadHistory])

  // ── 현재가 폴링 ──────────────────────────────────────────────

  const fetchPrice = useCallback(async (symbol: string) => {
    try {
      const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`)
      if (!resp.ok) return
      const { price } = await resp.json() as { price: string }
      setCurrentPrice(parseFloat(price))
    } catch { /* 무시 */ }
  }, [])

  // ── 초기화 + 구독 ─────────────────────────────────────────────

  useEffect(() => {
    let mounted = true
    const init = async () => {
      setLoading(true)
      await Promise.all([loadConfig(), loadAccount(), loadHistory()])
      setLoading(false)
    }
    init()

    const channel = supabase
      .channel('live-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_positions' }, () => {
        if (!mounted) return
        loadOpenPos(); loadClosedTrades()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_account' }, () => {
        if (mounted) loadAccount()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'backtest_runs' }, () => {
        if (mounted) { loadConfig(); loadHistory() }
      })
      .subscribe()

    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [loadConfig, loadAccount, loadOpenPos, loadClosedTrades, loadHistory])

  useEffect(() => {
    loadOpenPos(config?.id)
    loadClosedTrades(config?.id)
  }, [config?.id, loadOpenPos, loadClosedTrades])

  useEffect(() => {
    if (priceTimer.current) clearInterval(priceTimer.current)
    if (!config?.symbol) { setCurrentPrice(null); return }
    fetchPrice(config.symbol)
    priceTimer.current = setInterval(() => fetchPrice(config.symbol), 10_000)
    return () => { if (priceTimer.current) clearInterval(priceTimer.current) }
  }, [config?.symbol, fetchPrice])

  useEffect(() => {
    const timer = setInterval(() => {
      if (chartRef.current?.latestCandle) setLatestCandle(chartRef.current.latestCandle)
    }, 500)
    return () => clearInterval(timer)
  }, [])

  // ── 계산 ─────────────────────────────────────────────────────

  const unrealizedPnl = openPos.reduce((sum, pos) => {
    const price = currentPrice ?? pos.entry_price
    const isShort = pos.direction === 'SHORT'
    return sum + (isShort ? pos.entry_price - price : price - pos.entry_price) * pos.quantity
  }, 0)

  const effectiveCapital = account ? account.capital + unrealizedPnl : null
  const totalReturn = account && account.initial_capital > 0
    ? (effectiveCapital! - account.initial_capital) / account.initial_capital * 100
    : null
  const winCount  = closedTrades.filter(t => t.net_pnl > 0).length
  const loseCount = closedTrades.filter(t => t.net_pnl <= 0).length
  const winRate   = closedTrades.length > 0 ? winCount / closedTrades.length * 100 : null

  // ── 렌더 ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={24} sx={{ color: '#f59e0b' }} />
      </Box>
    )
  }

  const historyListProps = {
    history,
    activating,
    onActivate:     activateLive,
    onDelete:       deleteHistory,
    activeKey:      'live_trading_enabled' as const,
    activateLabel:  '이 설정으로 실제 거래 시작',
    activeColor:    '#fbbf24',
    activeBgColor:  '#92400e',
  }

  if (!config) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        {/* 실거래 경고 배너 */}
        <Box sx={{
          mb: 3, mx: 'auto', maxWidth: 480,
          px: 2, py: 1.5, borderRadius: 2,
          background: '#431407',
          border: '1px solid #c2410c55',
        }}>
          <Typography sx={{ fontSize: 11, color: '#fb923c', fontWeight: 700 }}>
            실제 거래 모드 — 실제 자금이 사용됩니다
          </Typography>
          <Typography sx={{ fontSize: 10, color: '#78350f', mt: 0.5 }}>
            BINANCE_API_KEY / BINANCE_API_SECRET 환경변수가 Supabase Edge Function에 설정되어 있어야 합니다
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 13, color: '#52525b', mb: 1 }}>
          활성화된 실거래 설정이 없습니다
        </Typography>
        <Typography sx={{ fontSize: 11, color: '#3f3f46' }}>
          아래 이력에서 ● 버튼으로 설정을 활성화하세요
        </Typography>
        <Box sx={{ mt: 2 }}>
          <HistoryList {...historyListProps} />
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 실거래 경고 */}
      <Box sx={{
        px: 2, py: 1, borderRadius: 2,
        background: '#431407',
        border: '1px solid #c2410c55',
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0,
          animation: 'pulse 2s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
        <Typography sx={{ fontSize: 11, color: '#fb923c', fontWeight: 700 }}>
          실제 거래 진행 중 — 바이낸스 선물 계정의 실제 자금이 사용됩니다
        </Typography>
      </Box>

      <ConfigBanner configs={[config]} account={account} />
      <HistoryList {...historyListProps} />
      <AccountSummary
        account={account}
        config={config}
        effectiveCapital={effectiveCapital}
        unrealizedPnl={unrealizedPnl}
        totalReturn={totalReturn}
        winRate={winRate}
        winCount={winCount}
        loseCount={loseCount}
        closedCount={closedTrades.length}
        currentPrice={currentPrice}
      />
      <PaperChart
        ref={chartRef}
        symbol={config.symbol}
        interval={config.interval}
        chartConfig={{
          showMA:        config.score_use_golden_cross ?? true,
          showBB:        config.score_use_bb           ?? false,
          showRSI:       config.score_use_rsi          ?? true,
          showMACD:      config.score_use_macd         ?? true,
          showADX:       config.score_use_adx          ?? false,
          rsiOversold:   config.rsi_oversold,
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
      <OpenPositions openPos={openPos} currentPrice={currentPrice} symbol={config.symbol} latestCandle={latestCandle} />
      <ClosedTradeList trades={closedTrades} configs={[config]} />
    </Box>
  )
}