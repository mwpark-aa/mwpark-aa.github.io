import { useState, useEffect, useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { RunHistory } from './backtest/types'
import PaperChart, { type PaperChartHandle } from './PaperChart'
import ConfigBanner from './paper/ConfigBanner'
import HistoryList from './paper/HistoryList'
import AccountSummary from './paper/AccountSummary'
import OpenPositions from './paper/OpenPositions'
import ClosedTradeList from './paper/ClosedTradeList'
import ApiKeyManager, { type ApiKey } from './live/ApiKeyManager'
import type { ActiveConfig, PaperAccount, PaperPos, ClosedTrade } from './paper/types'
import type { Candle } from '../../lib/backtest/types'

export default function LiveDashboard() {
  const { user } = useAuth()
  const [config,            setConfig]            = useState<ActiveConfig | null>(null)
  const [history,           setHistory]           = useState<RunHistory[]>([])
  const [account,           setAccount]           = useState<PaperAccount | null>(null)
  const [openPos,           setOpenPos]           = useState<PaperPos[]>([])
  const [closedTrades,      setClosedTrades]      = useState<ClosedTrade[]>([])
  const [apiKeys,           setApiKeys]           = useState<ApiKey[]>([])
  const [pendingActivation, setPendingActivation] = useState<RunHistory | null>(null)
  const [currentPrice,      setCurrentPrice]      = useState<number | null>(null)
  const [loading,           setLoading]           = useState(true)
  const [activating,        setActivating]        = useState<string | null>(null)
  const priceTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const chartRef = useRef<PaperChartHandle>(null)
  const [latestCandle, setLatestCandle] = useState<Candle | null>(null)

  // ── 데이터 로드 ──────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('backtest_runs')
      .select('id, name, symbol, interval, leverage, min_score, rsi_oversold, rsi_overbought, fixed_tp, fixed_sl, initial_capital, score_exit_threshold, adx_threshold, score_use_adx, score_use_rsi, score_use_macd, score_use_bb, score_use_golden_cross, api_key_id, user_id')
      .eq('live_trading_enabled', true)
      .eq('user_id', user.id)
      .maybeSingle()
    setConfig(data as ActiveConfig | null)
  }, [user])

  const loadHistory = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setHistory(data as RunHistory[])
  }, [user])

  const loadAccount = useCallback(async (apiKeyId?: string | null) => {
    if (!apiKeyId) { setAccount(null); return }
    const { data } = await supabase
      .from('live_accounts')
      .select('balance, initial_balance, updated_at, last_processed_ts')
      .eq('api_key_id', apiKeyId)
      .maybeSingle()
    if (data) {
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

  // ── API 키 로드 ───────────────────────────────────────────────

  const loadApiKeys = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('user_api_keys')
      .select('id, label, is_testnet, created_at')
      .order('created_at', { ascending: true })
    if (data) setApiKeys(data as ApiKey[])
  }, [user])

  // ── 실거래 활성화 ─────────────────────────────────────────────

  const doActivateLive = useCallback(async (run: RunHistory) => {
    if (!user) return
    setActivating(run.id)
    const willActivate = !run.live_trading_enabled

    if (willActivate) {
      await supabase.from('live_positions').delete().eq('backtest_run_id', run.id)
      if (run.api_key_id) {
        await supabase.from('live_accounts').upsert({
          user_id:           user.id,
          api_key_id:        run.api_key_id,
          balance:           0,
          initial_balance:   0,
          updated_at:        new Date().toISOString(),
          last_processed_ts: null,
        }, { onConflict: 'api_key_id' })
      }
    }

    await supabase.from('backtest_runs').update({ live_trading_enabled: false }).eq('live_trading_enabled', true).eq('user_id', user.id)
    await supabase.from('backtest_runs').update({ live_trading_enabled: willActivate }).eq('id', run.id)
    await Promise.all([loadConfig(), loadHistory()])
    setActivating(null)
  }, [user, loadConfig, loadHistory])

  const activateLive = useCallback(async (run: RunHistory) => {
    if (!user || run.user_id !== user.id) return
    // api_key_id 없으면 키 선택 다이얼로그 먼저
    if (!run.api_key_id) {
      setPendingActivation(run)
      return
    }
    await doActivateLive(run)
  }, [user, doActivateLive])

  const confirmActivateWithKey = useCallback(async (keyId: string) => {
    if (!pendingActivation || !user) return
    // run에 api_key_id 저장 후 활성화
    await supabase.from('backtest_runs').update({ api_key_id: keyId }).eq('id', pendingActivation.id)
    const updatedRun = { ...pendingActivation, api_key_id: keyId }
    setPendingActivation(null)
    await doActivateLive(updatedRun)
  }, [pendingActivation, user, doActivateLive])

  const deleteHistory = useCallback(async (id: string) => {
    const run = history.find(r => r.id === id)
    if (!user || (run?.user_id && run.user_id !== user.id)) return  // FE owner check
    await supabase.from('backtest_runs').delete().eq('id', id)
    await Promise.all([loadConfig(), loadHistory()])
  }, [user, history, loadConfig, loadHistory])

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
      await Promise.all([loadConfig(), loadHistory(), loadApiKeys()])
      setLoading(false)
    }
    init()

    const channel = supabase
      .channel('live-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_positions' }, () => {
        if (!mounted) return
        loadOpenPos(); loadClosedTrades()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_accounts' }, () => {
        if (mounted) loadAccount(config?.api_key_id)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'backtest_runs' }, () => {
        if (mounted) { loadConfig(); loadHistory() }
      })
      .subscribe()

    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [loadConfig, loadHistory, loadApiKeys, loadOpenPos, loadClosedTrades, loadAccount, config?.api_key_id])

  useEffect(() => {
    loadAccount(config?.api_key_id)
    loadOpenPos(config?.id)
    loadClosedTrades(config?.id)
  }, [config?.id, config?.api_key_id, loadAccount, loadOpenPos, loadClosedTrades])

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
    currentUserId:  user?.id,
  }

  // ── 키 선택 다이얼로그 ────────────────────────────────────────

  const KeySelectDialog = pendingActivation && (
    <Box sx={{
      position: 'fixed', inset: 0, zIndex: 1300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#00000088',
    }}>
      <Box sx={{
        width: 320, borderRadius: 2, overflow: 'hidden',
        background: '#09090b', border: '1px solid #27272a',
      }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #18181b' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
            사용할 Binance API 키 선택
          </Typography>
          <Typography sx={{ fontSize: 11, color: '#71717a', mt: 0.3 }}>
            {pendingActivation.name ?? pendingActivation.symbol}
          </Typography>
        </Box>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {apiKeys.length === 0 ? (
            <Typography sx={{ fontSize: 11, color: '#52525b', textAlign: 'center', py: 2 }}>
              등록된 API 키가 없습니다. 먼저 키를 추가해주세요.
            </Typography>
          ) : apiKeys.map(k => (
            <Box
              key={k.id}
              onClick={() => confirmActivateWithKey(k.id)}
              sx={{
                px: 1.5, py: 1, borderRadius: 1.5, cursor: 'pointer',
                background: '#0a0a0b', border: '1px solid #1f1f23',
                display: 'flex', alignItems: 'center', gap: 1,
                '&:hover': { borderColor: '#fbbf2466', background: '#fbbf2408' },
                transition: 'all 0.15s',
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7', flex: 1 }}>{k.label}</Typography>
              {k.is_testnet && (
                <Typography sx={{ fontSize: 9, color: '#60a5fa', fontWeight: 700 }}>테스트넷</Typography>
              )}
            </Box>
          ))}
        </Box>
        <Box sx={{ px: 2, py: 1, borderTop: '1px solid #18181b', display: 'flex', justifyContent: 'flex-end' }}>
          <Box
            onClick={() => setPendingActivation(null)}
            sx={{ px: 1.5, py: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { background: '#27272a' } }}
          >
            <Typography sx={{ fontSize: 11, color: '#71717a' }}>취소</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  )

  if (!config) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {KeySelectDialog}
        {/* API 키 관리 */}
        <Box sx={{ px: 1.5, py: 1.5, borderRadius: 2, background: '#0a0a0b', border: '1px solid #1f1f23' }}>
          <ApiKeyManager apiKeys={apiKeys} onRefresh={loadApiKeys} />
        </Box>
        {/* 실거래 경고 배너 */}
        <Box sx={{
          px: 2, py: 1.5, borderRadius: 2,
          background: '#431407', border: '1px solid #c2410c55',
          textAlign: 'center',
        }}>
          <Typography sx={{ fontSize: 11, color: '#fb923c', fontWeight: 700 }}>
            실제 거래 모드 — 실제 자금이 사용됩니다
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 13, color: '#52525b', textAlign: 'center' }}>
          활성화된 실거래 설정이 없습니다
        </Typography>
        <Typography sx={{ fontSize: 11, color: '#3f3f46', textAlign: 'center' }}>
          아래 이력에서 ● 버튼으로 설정을 활성화하세요
        </Typography>
        <HistoryList {...historyListProps} />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {KeySelectDialog}
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
      {/* API 키 관리 */}
      <Box sx={{ px: 1.5, py: 1.5, borderRadius: 2, background: '#0a0a0b', border: '1px solid #1f1f23' }}>
        <ApiKeyManager apiKeys={apiKeys} onRefresh={loadApiKeys} />
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