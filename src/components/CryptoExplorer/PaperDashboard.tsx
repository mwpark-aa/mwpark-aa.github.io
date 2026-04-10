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
  const [configs,      setConfigs]      = useState<ActiveConfig[]>([])
  const [history,      setHistory]      = useState<RunHistory[]>([])
  const [account,      setAccount]      = useState<PaperAccount | null>(null)
  const [openPos,      setOpenPos]      = useState<PaperPos[]>([])
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([])
  const [prices,       setPrices]       = useState<Record<string, number>>({})
  const [loading,      setLoading]      = useState(true)
  const [activating,   setActivating]   = useState<string | null>(null)
  const priceTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 데이터 로드 ──────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from('backtest_runs')
      .select('id, name, symbol, interval, leverage, min_score, rsi_oversold, rsi_overbought, fixed_tp, fixed_sl, initial_capital, score_exit_threshold, adx_threshold, score_use_adx, score_use_rsi, score_use_macd, score_use_bb, score_use_golden_cross')
      .eq('paper_trading_enabled', true)
    setConfigs((data ?? []) as ActiveConfig[])
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

  const loadOpenPos = useCallback(async () => {
    const { data } = await supabase
      .from('paper_positions')
      .select('id, backtest_run_id, symbol, direction, entry_price, target_price, stop_loss, quantity, capital_used, entry_time, signal_details, score, status')
      .eq('status', 'OPEN')
      .order('entry_time', { ascending: false })
    if (data) setOpenPos(data as PaperPos[])
  }, [])

  const loadClosedTrades = useCallback(async () => {
    const { data } = await supabase
      .from('paper_positions')
      .select('id, backtest_run_id, symbol, direction, entry_price, exit_price, net_pnl, pnl_pct, exit_reason, entry_time, exit_time, score')
      .eq('status', 'CLOSED')
      .order('exit_time', { ascending: false })
      .limit(100)
    if (data) setClosedTrades(data as ClosedTrade[])
  }, [])

  // ── 액션 ─────────────────────────────────────────────────────

  const activatePaper = useCallback(async (run: RunHistory) => {
    setActivating(run.id)
    const willActivate = !run.paper_trading_enabled

    if (willActivate) {
      // 현재 활성 설정이 없을 때만 자본 초기화
      const { count } = await supabase
        .from('backtest_runs')
        .select('id', { count: 'exact', head: true })
        .eq('paper_trading_enabled', true)

      if ((count ?? 0) === 0) {
        const initialCapital = run.initial_capital ?? 10000
        await supabase.from('paper_account').upsert({
          id: 1,
          capital: initialCapital,
          initial_capital: initialCapital,
          updated_at: new Date().toISOString(),
          last_processed_ts: null,
        }, { onConflict: 'id' })
      }
    }

    await supabase.from('backtest_runs')
      .update({ paper_trading_enabled: willActivate })
      .eq('id', run.id)

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
      setPrices(prev => ({ ...prev, [symbol]: parseFloat(price) }))
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
    loadOpenPos()
    loadClosedTrades()
  }, [configs.map(c => c.id).join(','), loadOpenPos, loadClosedTrades])

  // 활성 심볼들의 현재가 폴링
  const symbolsKey = configs.map(c => c.symbol).join(',')
  useEffect(() => {
    if (priceTimer.current) clearInterval(priceTimer.current)
    const symbols = [...new Set(configs.map(c => c.symbol))]
    if (symbols.length === 0) { setPrices({}); return }
    symbols.forEach(sym => fetchPrice(sym))
    priceTimer.current = setInterval(() => symbols.forEach(sym => fetchPrice(sym)), 10_000)
    return () => { if (priceTimer.current) clearInterval(priceTimer.current) }
  }, [symbolsKey, fetchPrice])

  // ── 계산 ─────────────────────────────────────────────────────

  const unrealizedPnl = openPos.reduce((sum, pos) => {
    const price = prices[pos.symbol] ?? pos.entry_price
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

  // 차트는 첫 번째 활성 설정 기준
  const primaryConfig = configs[0] ?? null

  // ── 렌더 ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={24} sx={{ color: '#3b82f6' }} />
      </Box>
    )
  }

  if (configs.length === 0) {
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
      <ConfigBanner configs={configs} account={account} />
      <HistoryList
        history={history}
        activating={activating}
        onActivate={activatePaper}
        onDelete={deleteHistory}
      />
      <AccountSummary
        account={account}
        effectiveCapital={effectiveCapital}
        unrealizedPnl={unrealizedPnl}
        totalReturn={totalReturn}
        winRate={winRate}
        winCount={winCount}
        loseCount={loseCount}
        closedCount={closedTrades.length}
        configs={configs}
        prices={prices}
      />
      {primaryConfig && (
        <PaperChart
          symbol={primaryConfig.symbol}
          interval={primaryConfig.interval}
          chartConfig={{
            showMA:        primaryConfig.score_use_golden_cross ?? true,
            showBB:        primaryConfig.score_use_bb           ?? false,
            showRSI:       primaryConfig.score_use_rsi          ?? true,
            showMACD:      primaryConfig.score_use_macd         ?? true,
            showADX:       primaryConfig.score_use_adx          ?? false,
            rsiOversold:   primaryConfig.rsi_oversold,
            rsiOverbought: primaryConfig.rsi_overbought,
            adxThreshold:  primaryConfig.adx_threshold ?? 20,
          }}
          position={openPos.find(p => p.symbol === primaryConfig.symbol)
            ? (() => {
                const p = openPos.find(pos => pos.symbol === primaryConfig.symbol)!
                return { entry_price: p.entry_price, target_price: p.target_price, stop_loss: p.stop_loss, direction: p.direction }
              })()
            : null
          }
        />
      )}
      <OpenPositions openPos={openPos} prices={prices} configs={configs} />
      <ClosedTradeList trades={closedTrades} configs={configs} />
    </Box>
  )
}
