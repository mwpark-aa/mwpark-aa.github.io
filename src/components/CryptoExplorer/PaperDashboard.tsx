import { useState, useEffect, useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { supabase } from '../../lib/supabase'
import type { RunHistory } from './backtest/types'
import PaperChart from './PaperChart'
import ConfigBanner from './paper/ConfigBanner'
import HistoryList from './paper/HistoryList'
import AccountSummary from './paper/AccountSummary'
import OpenPositions from './paper/OpenPositions'
import ClosedTradeList from './paper/ClosedTradeList'
import type { ActiveConfig, PaperAccount, PaperPos, ClosedTrade } from './paper/types'

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

  // ── 데이터 로드 ──────────────────────────────────────────────

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

  // ── 액션 ─────────────────────────────────────────────────────

  const activatePaper = useCallback(async (run: RunHistory) => {
    setActivating(run.id)
    const willActivate = !run.paper_trading_enabled

    if (willActivate) {
      const initialCapital = run.initial_capital ?? 10000
      await supabase.from('paper_account').upsert({
        id: 1,
        capital: initialCapital,
        initial_capital: initialCapital,
        updated_at: new Date().toISOString(),
        last_processed_ts: null,
      }, { onConflict: 'id' })
    }

    await supabase.from('backtest_runs').update({ paper_trading_enabled: false }).eq('paper_trading_enabled', true)
    await supabase.from('backtest_runs').update({ paper_trading_enabled: willActivate }).eq('id', run.id)
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
      .channel('paper-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_positions' }, () => {
        if (!mounted) return
        loadOpenPos(); loadClosedTrades()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'paper_account' }, () => {
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

  // ── 계산 ─────────────────────────────────────────────────────

  const unrealizedPnl = openPos.reduce((sum, pos) => {
    const price = currentPrice ?? pos.entry_price
    const isShort = pos.direction === 'SHORT'
    return sum + (isShort ? pos.entry_price - price : price - pos.entry_price) * pos.quantity
  }, 0)

  const effectiveCapital = account ? account.capital + unrealizedPnl : null
  const totalReturn = account
    ? (effectiveCapital! - account.initial_capital) / account.initial_capital * 100
    : null
  const winCount  = closedTrades.filter(t => t.net_pnl > 0).length
  const loseCount = closedTrades.filter(t => t.net_pnl <= 0).length
  const winRate   = closedTrades.length > 0 ? winCount / closedTrades.length * 100 : null

  // ── 렌더 ─────────────────────────────────────────────────────

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
          아래 이력에서 ● 버튼으로 설정을 활성화하세요
        </Typography>
        <Box sx={{ mt: 2 }}>
          <HistoryList
            history={history}
            activating={activating}
            onActivate={activatePaper}
            onDelete={deleteHistory}
          />
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <ConfigBanner config={config} account={account} />
      <HistoryList
        history={history}
        activating={activating}
        onActivate={activatePaper}
        onDelete={deleteHistory}
      />
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
      <OpenPositions openPos={openPos} currentPrice={currentPrice} symbol={config.symbol} />
      <ClosedTradeList trades={closedTrades} />
    </Box>
  )
}
