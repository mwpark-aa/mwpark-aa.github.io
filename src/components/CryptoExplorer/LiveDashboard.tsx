import { useState, useEffect, useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { RunHistory } from './backtest/types'
import PaperChart, { type PaperChartHandle } from './PaperChart'
import HistoryList from './paper/HistoryList'
import AccountSummary from './paper/AccountSummary'
import OpenPositions from './paper/OpenPositions'
import ClosedTradeList from './paper/ClosedTradeList'
import ApiKeyManager, { type ApiKey } from './live/ApiKeyManager'
import type { ActiveConfig, PaperAccount, PaperPos, ClosedTrade } from './paper/types'
import IndicatorPanel from './paper/IndicatorPanel'
import type { Candle } from '../../lib/backtest/types'
import { useFedState } from '../../hooks/useFedState'

export default function LiveDashboard() {
  const { user, session } = useAuth()
  const fedState = useFedState()

  const [configs,           setConfigs]           = useState<ActiveConfig[]>([])
  const [history,           setHistory]           = useState<RunHistory[]>([])
  const [accounts,          setAccounts]          = useState<Record<string, PaperAccount>>({})
  const [openPos,           setOpenPos]           = useState<PaperPos[]>([])
  const [closedTrades,      setClosedTrades]      = useState<ClosedTrade[]>([])
  const [apiKeys,           setApiKeys]           = useState<ApiKey[]>([])
  const apiKeysRef = useRef<ApiKey[]>([])           // loadConfigs 의존성 cycle 방지용
  const [pendingActivation, setPendingActivation] = useState<RunHistory | null>(null)
  const [keyValidating,     setKeyValidating]     = useState(false)
  const [keyError,          setKeyError]          = useState<string | null>(null)
  const [prices,            setPrices]            = useState<Record<string, number>>({})
  const [loading,           setLoading]           = useState(true)
  const [activating,        setActivating]        = useState<string | null>(null)
  const [stopError,         setStopError]         = useState<string | null>(null)
  const priceTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const chartRef   = useRef<PaperChartHandle>(null)
  const [latestCandle,     setLatestCandle]     = useState<Candle | null>(null)
  const [lastClosedCandle, setLastClosedCandle] = useState<Candle | null>(null)

  // ── 데이터 로드 ──────────────────────────────────────────────

  const loadConfigs = useCallback(async (keys?: ApiKey[]) => {
    if (!user) return
    const myKeys = keys ?? apiKeysRef.current
    const activeRunIds = myKeys.filter(k => k.active_run_id).map(k => k.active_run_id as string)
    if (activeRunIds.length === 0) { setConfigs([]); return }
    const { data } = await supabase
      .from('backtest_runs')
      .select('id, name, symbol, interval, leverage, min_score, rsi_oversold, rsi_overbought, fixed_tp, fixed_sl, initial_capital, score_exit_threshold, adx_threshold, score_use_adx, score_use_rsi, score_use_macd, score_use_bb, score_use_golden_cross, score_use_fed_liquidity, use_daily_trend')
      .in('id', activeRunIds)
    const cfgs = (data ?? []).map(run => ({
      ...run,
      api_key_id: myKeys.find(k => k.active_run_id === run.id)?.id ?? null,
    }))
    setConfigs(cfgs as ActiveConfig[])
  }, [user])

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('backtest_runs')
      .select('id,name,created_at,symbol,interval,leverage,min_score,rsi_oversold,rsi_overbought,score_use_rsi,score_use_adx,score_use_macd,score_use_rvol,score_use_bb,score_use_golden_cross,score_use_ichi,score_use_fed_liquidity,adx_threshold,rvol_threshold,rvol_skip,fixed_tp,fixed_sl,score_exit_threshold,cci_max_entry,total_return_pct,win_rate,max_drawdown_pct,sharpe_ratio,total_trades,paper_trading_enabled')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setHistory(data as RunHistory[])
  }, [])

  const loadAccounts = useCallback(async (cfgs: ActiveConfig[]) => {
    const keyIds = cfgs.map(c => c.api_key_id).filter(Boolean) as string[]
    if (keyIds.length === 0) { setAccounts({}); return }
    const { data } = await supabase
      .from('live_accounts')
      .select('api_key_id, balance, initial_balance, updated_at, last_processed_ts')
      .in('api_key_id', keyIds)
    if (data) {
      const map: Record<string, PaperAccount> = {}
      data.forEach(row => {
        if (row.api_key_id) map[row.api_key_id] = {
          capital:           row.balance ?? 0,
          initial_capital:   row.initial_balance ?? row.balance ?? 0,
          updated_at:        row.updated_at,
          last_processed_ts: row.last_processed_ts,
        }
      })
      setAccounts(map)
    }
  }, [])

  const loadOpenPos = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('live_positions')
      .select('id, backtest_run_id, api_key_id, symbol, direction, entry_price, target_price, stop_loss, quantity, capital_used, entry_time, signal_details, score, status, timing_ms')
      .eq('status', 'OPEN')
      .eq('user_id', user.id)
      .order('entry_time', { ascending: false })
    if (data) setOpenPos(data as PaperPos[])
  }, [user])

  const loadClosedTrades = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('live_positions')
      .select('id, backtest_run_id, symbol, direction, entry_price, exit_price, net_pnl, pnl_pct, exit_reason, entry_time, exit_time, score, signal_details, exit_details, capital_used, timing_ms')
      .eq('status', 'CLOSED')
      .eq('user_id', user.id)
      .order('exit_time', { ascending: false })
      .limit(200)
    if (data) setClosedTrades(data as ClosedTrade[])
  }, [user])

  const loadApiKeys = useCallback(async () => {
    if (!user) return []
    const { data } = await supabase
      .from('user_api_keys')
      .select('id, label, is_testnet, created_at, active_run_id')
      .order('created_at', { ascending: true })
    const keys = (data ?? []) as ApiKey[]
    apiKeysRef.current = keys
    setApiKeys(keys)
    return keys
  }, [user])

  // ── 실거래 활성화 ─────────────────────────────────────────────

  const doActivateLive = useCallback(async (run: RunHistory, keyId: string | null, willActivate: boolean) => {
    if (!user) return
    setActivating(run.id)

    if (willActivate && keyId) {
      await supabase.from('live_positions').delete().eq('backtest_run_id', run.id)

      let initialBalance = 0
      try {
        const { data } = await supabase.functions.invoke('check-balance', {
          body: { api_key_id: keyId },
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        })
        if (data?.balance != null) initialBalance = data.balance as number
      } catch { /* fallback to 0 */ }

      await supabase.from('live_accounts').upsert({
        user_id:           user.id,
        api_key_id:        keyId,
        balance:           initialBalance,
        initial_balance:   initialBalance,
        updated_at:        new Date().toISOString(),
        last_processed_ts: null,
      }, { onConflict: 'api_key_id' })

      // 키에 active_run_id 설정 (같은 키의 이전 run은 자동으로 끊김)
      await supabase.from('user_api_keys')
        .update({ active_run_id: run.id })
        .eq('id', keyId)
    } else {
      // 비활성화: Binance 포지션 청산 + active_run_id 해제 (keyId는 activateLive에서 넘어옴)
      if (keyId) {
        const { data, error } = await supabase.functions.invoke('stop-live-trade', {
          body: { api_key_id: keyId, run_id: run.id },
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        })
        if (error) setStopError(`종료 실패: ${error.message ?? String(error)}`)
        else if (data?.errors?.length) setStopError(`청산 일부 실패: ${data.errors[0]}`)
        else setStopError(null)
      } else {
        await supabase.from('user_api_keys')
          .update({ active_run_id: null })
          .eq('active_run_id', run.id)
      }
    }

    const newKeys = await loadApiKeys()
    await Promise.all([loadConfigs(newKeys ?? []), loadHistory()])
    setActivating(null)
  }, [user, session, loadApiKeys, loadConfigs, loadHistory])

  const validateBinanceKey = useCallback(async (keyId: string): Promise<string | null> => {
    setKeyValidating(true)
    setKeyError(null)
    try {
      const { data, error } = await supabase.functions.invoke('check-balance', {
        body: { api_key_id: keyId },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
      if (error) return error.message ?? '연결 실패'
      if (data?.error) return data.error as string
      return null
    } catch (e) {
      return String(e)
    } finally {
      setKeyValidating(false)
    }
  }, [session])

  const activateLive = useCallback(async (run: RunHistory) => {
    if (!user) return
    const activeKey = apiKeysRef.current.find(k => k.active_run_id === run.id)

    if (activeKey) {
      await doActivateLive(run, activeKey.id, false)
    } else {
      setKeyError(null)
      setPendingActivation(run)
    }
  }, [user, doActivateLive])

  const confirmActivateWithKey = useCallback(async (keyId: string) => {
    if (!pendingActivation || !user) return
    const err = await validateBinanceKey(keyId)
    if (err) { setKeyError(err); return }
    setPendingActivation(null)
    setKeyError(null)
    await doActivateLive(pendingActivation, keyId, true)
  }, [pendingActivation, user, validateBinanceKey, doActivateLive])

  const deleteHistory = useCallback(async (id: string) => {
    if (!user) return
    await supabase.from('backtest_runs').delete().eq('id', id)
    await Promise.all([loadConfigs(), loadHistory()])
  }, [user, loadConfigs, loadHistory])

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
      const [keys] = await Promise.all([loadApiKeys(), loadHistory()])
      await loadConfigs(keys ?? [])
      setLoading(false)
      // 포지션/거래 이력은 화면 표시 후 로드 (로딩 시간 단축)
      await Promise.all([loadOpenPos(), loadClosedTrades()])
    }
    init()

    const channel = supabase
      .channel('live-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_positions' }, () => {
        if (!mounted) return
        loadOpenPos(); loadClosedTrades()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_api_keys' }, async () => {
        if (!mounted) return
        const newKeys = await loadApiKeys()
        await loadConfigs(newKeys ?? [])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_accounts' }, async () => {
        if (!mounted) return
        setConfigs(prev => { loadAccounts(prev); return prev })
      })
      .subscribe()

    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [loadConfigs, loadHistory, loadApiKeys, loadOpenPos, loadClosedTrades, loadAccounts])

  // configs 변경 시 account + price 갱신
  useEffect(() => {
    loadAccounts(configs)
    const symbols = [...new Set(configs.map(c => c.symbol))]
    if (priceTimer.current) clearInterval(priceTimer.current)
    if (symbols.length === 0) return
    symbols.forEach(s => fetchPrice(s))
    priceTimer.current = setInterval(() => symbols.forEach(s => fetchPrice(s)), 5_000)
    return () => { if (priceTimer.current) clearInterval(priceTimer.current) }
  }, [configs, loadAccounts, fetchPrice])


  // ── 렌더 헬퍼 ────────────────────────────────────────────────

  const historyListProps = {
    history,
    activating,
    onActivate:    activateLive,
    onDelete:      deleteHistory,
    activateLabel: '이 설정으로 실제 거래 시작',
    activeColor:   '#fbbf24',
    activeBgColor: '#92400e',
    activeRunIds:  apiKeys.filter(k => k.active_run_id).map(k => k.active_run_id as string),
  }

  // ── 키 선택 다이얼로그 ────────────────────────────────────────

  const KeySelectDialog = pendingActivation && (
    <Box sx={{
      position: 'fixed', inset: 0, zIndex: 1300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#00000088',
    }}>
      <Box sx={{ width: { xs: 'calc(100vw - 32px)', sm: 320 }, maxWidth: 360, borderRadius: 2, overflow: 'hidden', background: '#09090b', border: '1px solid #27272a' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #18181b' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>사용할 Binance API 키 선택</Typography>
          <Typography sx={{ fontSize: 11, color: '#71717a', mt: 0.3 }}>
            {pendingActivation.name ?? pendingActivation.symbol}
          </Typography>
        </Box>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {keyError && (
            <Typography sx={{ fontSize: 11, color: '#f87171', mb: 0.5, wordBreak: 'break-all' }}>
              ✕ {keyError}
            </Typography>
          )}
          {keyValidating && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <CircularProgress size={10} sx={{ color: '#fbbf24' }} />
              <Typography sx={{ fontSize: 11, color: '#71717a' }}>Binance 연결 확인 중...</Typography>
            </Box>
          )}
          {apiKeys.length === 0
            ? <Typography sx={{ fontSize: 11, color: '#52525b', textAlign: 'center', py: 2 }}>
                등록된 API 키가 없습니다. 먼저 키를 추가해주세요.
              </Typography>
            : apiKeys.map(k => (
              <Box key={k.id} onClick={() => !keyValidating && confirmActivateWithKey(k.id)} sx={{
                px: 1.5, py: { xs: 1.5, sm: 1 }, borderRadius: 1.5,
                cursor: keyValidating ? 'wait' : 'pointer',
                background: '#0a0a0b', border: '1px solid #1f1f23',
                display: 'flex', alignItems: 'center', gap: 1,
                '&:hover': !keyValidating ? { borderColor: '#fbbf2466', background: '#fbbf2408' } : {},
                transition: 'all 0.15s',
                opacity: keyValidating ? 0.5 : 1,
              }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7', flex: 1 }}>{k.label}</Typography>
                {k.is_testnet && <Typography sx={{ fontSize: 9, color: '#60a5fa', fontWeight: 700 }}>테스트넷</Typography>}
              </Box>
            ))
          }
        </Box>
        <Box sx={{ px: 2, py: 1, borderTop: '1px solid #18181b', display: 'flex', justifyContent: 'flex-end' }}>
          <Box onClick={() => { setPendingActivation(null); setKeyError(null) }}
            sx={{ px: 1.5, py: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { background: '#27272a' } }}>
            <Typography sx={{ fontSize: 11, color: '#71717a' }}>취소</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  )

  // ── 로딩 ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={24} sx={{ color: '#f59e0b' }} />
      </Box>
    )
  }

  // ── 렌더 ─────────────────────────────────────────────────────

  const firstConfig = configs[0] ?? null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {KeySelectDialog}

      {/* 종료 에러 */}
      {stopError && (
        <Box onClick={() => setStopError(null)} sx={{
          px: 2, py: 1, borderRadius: 2, background: '#450a0a', border: '1px solid #ef444455',
          display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
        }}>
          <Typography sx={{ fontSize: 11, color: '#f87171', flex: 1 }}>{stopError}</Typography>
          <Typography sx={{ fontSize: 10, color: '#52525b' }}>✕</Typography>
        </Box>
      )}
      {/* API 키 관리 */}
      <Box sx={{ px: 1.5, py: 1.5, borderRadius: 2, background: '#0a0a0b', border: '1px solid #1f1f23' }}>
        <ApiKeyManager apiKeys={apiKeys} onRefresh={loadApiKeys} />
      </Box>

      {/* 백테스트 이력 */}
      <HistoryList {...historyListProps} />

      {/* 활성 전략 없을 때 */}
      {configs.length === 0 && (
        <Typography sx={{ fontSize: 11, color: '#3f3f46', textAlign: 'center', py: 2 }}>
          이력에서 ● 버튼으로 전략을 활성화하세요
        </Typography>
      )}

      {/* 청산 내역: 활성 전략 유무와 무관하게 항상 표시 */}
      {closedTrades.length > 0 && (
        <ClosedTradeList trades={closedTrades} configs={configs} />
      )}

      {/* 고아 포지션: active config 없는 OPEN 포지션 — 바이낸스에 여전히 살아있을 수 있음 */}
      {(() => {
        const myKeyIds = new Set(apiKeys.map(k => k.id))
        const orphaned = openPos.filter(p =>
          (p as any).api_key_id && myKeyIds.has((p as any).api_key_id) &&
          !configs.some(cfg => cfg.id === p.backtest_run_id)
        )
        if (orphaned.length === 0) return null
        return (
          <Box sx={{ borderRadius: 2, border: '1px solid #f9731644', background: '#431407', px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0,
                animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#f97316' }}>
                미연결 OPEN 포지션 {orphaned.length}건 — 바이낸스 직접 확인 필요
              </Typography>
            </Box>
            {orphaned.map(pos => (
              <Box key={pos.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 1, py: 0.75, borderRadius: 1.5, background: '#0a0a0b', border: '1px solid #f9731622' }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fafafa', fontFamily: 'monospace', flex: 1 }}>
                  {pos.symbol} {pos.direction} @ ${pos.entry_price}
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#f97316', fontFamily: 'monospace' }}>
                  {pos.target_price == null ? 'TP 없음' : `TP $${pos.target_price}`}
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#ef4444', fontFamily: 'monospace' }}>
                  {pos.stop_loss == null ? 'SL 없음' : `SL $${pos.stop_loss}`}
                </Typography>
              </Box>
            ))}
          </Box>
        )
      })()}

      {/* 활성 전략별 섹션 */}
      {configs.length > 0 && (
        <>
          {configs.map(cfg => {
            const cfgOpenPos     = openPos.filter(p => p.backtest_run_id === cfg.id)
            const cfgClosed      = closedTrades.filter(t => t.backtest_run_id === cfg.id)
            const acct           = cfg.api_key_id ? (accounts[cfg.api_key_id] ?? null) : null
            const price          = cfg.symbol ? (prices[cfg.symbol] ?? null) : null
            const unrealizedPnl  = cfgOpenPos.reduce((sum, pos) => {
              const p        = price ?? pos.entry_price
              const priceChg = (pos.direction === 'SHORT' ? pos.entry_price - p : p - pos.entry_price) * pos.quantity
              return sum + priceChg
            }, 0)
            const effectiveCap   = acct ? acct.capital + unrealizedPnl : null
            const totalReturn    = acct && acct.initial_capital > 0
              ? (effectiveCap! - acct.initial_capital) / acct.initial_capital * 100 : null
            const winCount  = cfgClosed.filter(t => t.net_pnl > 0).length
            const loseCount = cfgClosed.filter(t => t.net_pnl <= 0).length
            const winRate   = cfgClosed.length > 0 ? winCount / cfgClosed.length * 100 : null

            return (
              <Box key={cfg.id} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* 키 라벨 */}
                {cfg.api_key_id && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24' }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>
                      {apiKeys.find(k => k.id === cfg.api_key_id)?.label ?? cfg.api_key_id.slice(0, 8)}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: '#52525b' }}>
                      — {cfg.name ?? `${cfg.symbol} ${cfg.interval}`}
                    </Typography>
                  </Box>
                )}
                <AccountSummary
                  account={acct}
                  config={cfg}
                  effectiveCapital={effectiveCap}
                  unrealizedPnl={unrealizedPnl}
                  totalReturn={totalReturn}
                  winRate={winRate}
                  winCount={winCount}
                  loseCount={loseCount}
                  closedCount={cfgClosed.length}
                  currentPrice={price}
                />
                <OpenPositions openPos={cfgOpenPos} currentPrice={price} symbol={cfg.symbol} latestCandle={latestCandle} fedState={fedState} />
                {cfgOpenPos.length === 0 && (lastClosedCandle ?? latestCandle) && (
                  <IndicatorPanel candle={lastClosedCandle ?? latestCandle!} config={cfg} fedState={fedState} symbol={cfg.symbol} />
                )}
              </Box>
            )
          })}

          {/* 차트: 첫 번째 활성 전략 기준 */}
          {firstConfig && (() => {
            const firstPos = openPos.find(p => p.backtest_run_id === firstConfig.id) ?? null
            return (
              <PaperChart
                ref={chartRef}
                symbol={firstConfig.symbol}
                interval={firstConfig.interval}
                onLatestCandle={(c) => setLatestCandle(c)}
                onLastClosedCandle={(c) => setLastClosedCandle(c)}
                chartConfig={{
                  showMA:        firstConfig.score_use_golden_cross ?? true,
                  showBB:        firstConfig.score_use_bb           ?? false,
                  showRSI:       false,
                  showMACD:      false,
                  showADX:       false,
                  rsiOversold:   firstConfig.rsi_oversold,
                  rsiOverbought: firstConfig.rsi_overbought,
                  adxThreshold:  firstConfig.adx_threshold ?? 20,
                }}
                position={firstPos ? {
                  entry_price:  firstPos.entry_price,
                  target_price: firstPos.target_price,
                  stop_loss:    firstPos.stop_loss,
                  direction:    firstPos.direction,
                } : null}
              />
            )
          })()}
        </>
      )}
    </Box>
  )
}
