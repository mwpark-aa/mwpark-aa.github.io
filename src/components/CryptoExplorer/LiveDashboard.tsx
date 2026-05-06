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

  const [configs,           setConfigs]           = useState<ActiveConfig[]>([])
  const [history,           setHistory]           = useState<RunHistory[]>([])
  const [accounts,          setAccounts]          = useState<Record<string, PaperAccount>>({})
  const [openPos,           setOpenPos]           = useState<PaperPos[]>([])
  const [closedTrades,      setClosedTrades]      = useState<ClosedTrade[]>([])
  const [apiKeys,           setApiKeys]           = useState<ApiKey[]>([])
  const apiKeysRef = useRef<ApiKey[]>([])           // loadConfigs 의존성 cycle 방지용
  const [pendingActivation, setPendingActivation] = useState<RunHistory | null>(null)
  const [prices,            setPrices]            = useState<Record<string, number>>({})
  const [loading,           setLoading]           = useState(true)
  const [activating,        setActivating]        = useState<string | null>(null)
  const priceTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const chartRef   = useRef<PaperChartHandle>(null)
  const [latestCandle, setLatestCandle] = useState<Candle | null>(null)

  // ── 데이터 로드 ──────────────────────────────────────────────

  const loadConfigs = useCallback(async (keys?: ApiKey[]) => {
    if (!user) return
    const keyIds = (keys ?? apiKeysRef.current).map(k => k.id)
    if (keyIds.length === 0) { setConfigs([]); return }
    const { data } = await supabase
      .from('backtest_runs')
      .select('id, name, symbol, interval, leverage, min_score, rsi_oversold, rsi_overbought, fixed_tp, fixed_sl, initial_capital, score_exit_threshold, adx_threshold, score_use_adx, score_use_rsi, score_use_macd, score_use_bb, score_use_golden_cross, api_key_id')
      .eq('live_trading_enabled', true)
      .in('api_key_id', keyIds)
    setConfigs((data ?? []) as ActiveConfig[])
  }, [user])

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('backtest_runs')
      .select('*')
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
    const { data } = await supabase
      .from('live_positions')
      .select('id, backtest_run_id, symbol, direction, entry_price, target_price, stop_loss, quantity, capital_used, entry_time, signal_details, score, status')
      .eq('status', 'OPEN')
      .order('entry_time', { ascending: false })
    if (data) setOpenPos(data as PaperPos[])
  }, [])

  const loadClosedTrades = useCallback(async () => {
    const { data } = await supabase
      .from('live_positions')
      .select('id, backtest_run_id, symbol, direction, entry_price, exit_price, net_pnl, pnl_pct, exit_reason, entry_time, exit_time, score, signal_details, exit_details, capital_used')
      .eq('status', 'CLOSED')
      .order('exit_time', { ascending: false })
      .limit(200)
    if (data) setClosedTrades(data as ClosedTrade[])
  }, [])

  const loadApiKeys = useCallback(async () => {
    if (!user) return []
    const { data } = await supabase
      .from('user_api_keys')
      .select('id, label, is_testnet, created_at')
      .order('created_at', { ascending: true })
    const keys = (data ?? []) as ApiKey[]
    apiKeysRef.current = keys
    setApiKeys(keys)
    return keys
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

    // 같은 api_key_id 를 쓰는 run만 비활성화 (다른 키는 유지)
    if (run.api_key_id) {
      await supabase.from('backtest_runs')
        .update({ live_trading_enabled: false })
        .eq('api_key_id', run.api_key_id)
        .eq('live_trading_enabled', true)
    }
    await supabase.from('backtest_runs')
      .update({ live_trading_enabled: willActivate })
      .eq('id', run.id)

    await Promise.all([loadConfigs(), loadHistory()])
    setActivating(null)
  }, [user, loadConfigs, loadHistory])

  const activateLive = useCallback(async (run: RunHistory) => {
    if (!user) return
    // 활성화: api_key_id가 없으면 키 선택 다이얼로그
    // 비활성화: 본인 api_key인지 확인
    if (run.live_trading_enabled && run.api_key_id && !apiKeysRef.current.some(k => k.id === run.api_key_id)) return
    if (!run.api_key_id) { setPendingActivation(run); return }
    await doActivateLive(run)
  }, [user, doActivateLive])

  const confirmActivateWithKey = useCallback(async (keyId: string) => {
    if (!pendingActivation || !user) return
    await supabase.from('backtest_runs').update({ api_key_id: keyId }).eq('id', pendingActivation.id)
    setPendingActivation(null)
    await doActivateLive({ ...pendingActivation, api_key_id: keyId })
  }, [pendingActivation, user, doActivateLive])

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
      // loadConfigs는 apiKeys에 의존하므로 loadApiKeys 반환값을 직접 전달
      const [keys] = await Promise.all([loadApiKeys(), loadHistory(), loadOpenPos(), loadClosedTrades()])
      await loadConfigs(keys ?? [])
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
        if (mounted) loadConfigs().then(async () => {
          setConfigs(prev => { loadAccounts(prev); return prev })
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'backtest_runs' }, () => {
        if (mounted) { loadConfigs(); loadHistory() }
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
    priceTimer.current = setInterval(() => symbols.forEach(s => fetchPrice(s)), 10_000)
    return () => { if (priceTimer.current) clearInterval(priceTimer.current) }
  }, [configs, loadAccounts, fetchPrice])

  useEffect(() => {
    const timer = setInterval(() => {
      if (chartRef.current?.latestCandle) setLatestCandle(chartRef.current.latestCandle)
    }, 500)
    return () => clearInterval(timer)
  }, [])

  // ── 렌더 헬퍼 ────────────────────────────────────────────────

  const historyListProps = {
    history,
    activating,
    onActivate:    activateLive,
    onDelete:      deleteHistory,
    activeKey:     'live_trading_enabled' as const,
    activateLabel: '이 설정으로 실제 거래 시작',
    activeColor:   '#fbbf24',
    activeBgColor: '#92400e',
    currentUserId: user?.id,
    userApiKeyIds: apiKeys.map(k => k.id),
  }

  // ── 키 선택 다이얼로그 ────────────────────────────────────────

  const KeySelectDialog = pendingActivation && (
    <Box sx={{
      position: 'fixed', inset: 0, zIndex: 1300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#00000088',
    }}>
      <Box sx={{ width: 320, borderRadius: 2, overflow: 'hidden', background: '#09090b', border: '1px solid #27272a' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #18181b' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>사용할 Binance API 키 선택</Typography>
          <Typography sx={{ fontSize: 11, color: '#71717a', mt: 0.3 }}>
            {pendingActivation.name ?? pendingActivation.symbol}
          </Typography>
        </Box>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {apiKeys.length === 0
            ? <Typography sx={{ fontSize: 11, color: '#52525b', textAlign: 'center', py: 2 }}>
                등록된 API 키가 없습니다. 먼저 키를 추가해주세요.
              </Typography>
            : apiKeys.map(k => (
              <Box key={k.id} onClick={() => confirmActivateWithKey(k.id)} sx={{
                px: 1.5, py: 1, borderRadius: 1.5, cursor: 'pointer',
                background: '#0a0a0b', border: '1px solid #1f1f23',
                display: 'flex', alignItems: 'center', gap: 1,
                '&:hover': { borderColor: '#fbbf2466', background: '#fbbf2408' },
                transition: 'all 0.15s',
              }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7', flex: 1 }}>{k.label}</Typography>
                {k.is_testnet && <Typography sx={{ fontSize: 9, color: '#60a5fa', fontWeight: 700 }}>테스트넷</Typography>}
              </Box>
            ))
          }
        </Box>
        <Box sx={{ px: 2, py: 1, borderTop: '1px solid #18181b', display: 'flex', justifyContent: 'flex-end' }}>
          <Box onClick={() => setPendingActivation(null)}
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

      {/* 실거래 경고 */}
      <Box sx={{
        px: 2, py: 1, borderRadius: 2, background: '#431407', border: '1px solid #c2410c55',
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        {configs.length > 0
          ? <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0,
              animation: 'pulse 2s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
          : null}
        <Typography sx={{ fontSize: 11, color: '#fb923c', fontWeight: 700 }}>
          {configs.length > 0
            ? `실제 거래 진행 중 (${configs.length}개 전략) — 바이낸스 선물 계정의 실제 자금이 사용됩니다`
            : '실제 거래 모드 — 활성화된 전략이 없습니다'}
        </Typography>
      </Box>

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

      {/* 활성 전략별 섹션 */}
      {configs.length > 0 && (
        <>
          <ConfigBanner configs={configs} account={accounts[firstConfig?.api_key_id ?? ''] ?? null} />

          {configs.map(cfg => {
            const cfgOpenPos     = openPos.filter(p => p.backtest_run_id === cfg.id)
            const cfgClosed      = closedTrades.filter(t => t.backtest_run_id === cfg.id)
            const acct           = cfg.api_key_id ? (accounts[cfg.api_key_id] ?? null) : null
            const price          = cfg.symbol ? (prices[cfg.symbol] ?? null) : null
            const unrealizedPnl  = cfgOpenPos.reduce((sum, pos) => {
              const p = price ?? pos.entry_price
              return sum + (pos.direction === 'SHORT' ? pos.entry_price - p : p - pos.entry_price) * pos.quantity
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
                <OpenPositions openPos={cfgOpenPos} currentPrice={price} symbol={cfg.symbol} latestCandle={latestCandle} />
                <ClosedTradeList trades={cfgClosed} configs={[cfg]} />
              </Box>
            )
          })}

          {/* 차트: 첫 번째 활성 전략 기준 */}
          {firstConfig && (
            <PaperChart
              ref={chartRef}
              symbol={firstConfig.symbol}
              interval={firstConfig.interval}
              chartConfig={{
                showMA:        firstConfig.score_use_golden_cross ?? true,
                showBB:        firstConfig.score_use_bb           ?? false,
                showRSI:       firstConfig.score_use_rsi          ?? true,
                showMACD:      firstConfig.score_use_macd         ?? true,
                showADX:       firstConfig.score_use_adx          ?? false,
                rsiOversold:   firstConfig.rsi_oversold,
                rsiOverbought: firstConfig.rsi_overbought,
                adxThreshold:  firstConfig.adx_threshold ?? 20,
              }}
              position={openPos.filter(p => p.backtest_run_id === firstConfig.id)[0]
                ? {
                  entry_price:  openPos.filter(p => p.backtest_run_id === firstConfig.id)[0].entry_price,
                  target_price: openPos.filter(p => p.backtest_run_id === firstConfig.id)[0].target_price,
                  stop_loss:    openPos.filter(p => p.backtest_run_id === firstConfig.id)[0].stop_loss,
                  direction:    openPos.filter(p => p.backtest_run_id === firstConfig.id)[0].direction,
                } : null}
            />
          )}
        </>
      )}
    </Box>
  )
}