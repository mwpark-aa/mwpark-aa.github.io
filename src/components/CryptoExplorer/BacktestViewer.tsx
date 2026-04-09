import { useState, useEffect, useRef, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import { supabase } from '../../lib/supabase'
import { runBacktest as execBacktest, type BacktestParams as LibBacktestParams, type BacktestTrade as LibBacktestTrade } from '../../lib/backtest'
import { CRYPTO_SYMBOLS, type CryptoSymbol } from '../../constants/crypto'

import type { BacktestParams, BacktestResult, BacktestTrade, OHLCVCandle, RunHistory } from './backtest/types'
import { fetchOHLCV } from './backtest/utils'
import BacktestChart from './backtest/BacktestChart'
import TradeList from './backtest/TradeList'
import ResultSummary from './backtest/ResultSummary'
import HistoryPanel from './backtest/HistoryPanel'
import ParamsPanel from './backtest/ParamsPanel'
import SaveDialog from './backtest/SaveDialog'

// ─────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────
const defaultEndDate = new Date().toISOString().split('T')[0]
const defaultStartDate = (() => {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().split('T')[0]
})()

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
export default function BacktestViewer() {
  const [selectedSymbol, setSelectedSymbol] = useState<CryptoSymbol>('ETH')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [trades, setTrades] = useState<BacktestTrade[]>([])
  const [candles, setCandles] = useState<OHLCVCandle[]>([])
  const [showParams, setShowParams] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<RunHistory[]>([])
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [testName, setTestName] = useState('')
  const [lastCommittedParams, setLastCommittedParams] = useState<any>(null)

  const scrollToRef = useRef<((ts: string) => void) | null>(null)

  const [params, setParams] = useState<BacktestParams>({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    interval: '1h',
    leverage: 5,
    minRR: 1.5,
    minScore: 4,
    initialCapital: 10000,
    rsiOversold: 35,
    rsiOverbought: 65,
    scoreUseADX: true,
    scoreUseRSI: true,
    scoreUseMACD: true,
    scoreUseRVOL: true,
    scoreUseBB: false,
    adxThreshold: 20,
    rvolThreshold: 1.5,
    rvolSkip: 0.4,
    scoreUseIchi: false,
    scoreUseGoldenCross: true,
    scoreUseFedLiquidity: false,
    fedLiquidityMAPeriod: 13,
    fixedTP: 2,
    fixedSL: 1,
    tpslMode: 'fixed' as const,
    useDailyTrend: false,
    scoreExitThreshold: 0,
  })

  const [draft, setDraft] = useState<Record<string, string>>({
    leverage: '5', minRR: '1.5',
    minScore: '4', initialCapital: '10000',
    rsiOversold: '35', rsiOverbought: '65',
    adxThreshold: '20',
    rvolThreshold: '1.5', rvolSkip: '0.4',
    fixedTP: '2', fixedSL: '1',
    scoreExitThreshold: '0',
  })

  const handleScrollTo = useCallback((ts: string) => {
    scrollToRef.current?.(ts)
  }, [])

  // ── 백테스트 실행 ───────────────────────────────────────────
  const runBacktest = useCallback(async () => {
    const committed = {
      leverage:            parseFloat(draft.leverage)            || params.leverage,
      minRR:               parseFloat(draft.minRR)               || params.minRR,
      rsiOversold:         parseFloat(draft.rsiOversold)         || params.rsiOversold,
      rsiOverbought:       parseFloat(draft.rsiOverbought)       || params.rsiOverbought,
      minScore:            isNaN(parseFloat(draft.minScore)) ? params.minScore : parseFloat(draft.minScore),
      initialCapital:      parseFloat(draft.initialCapital)      || params.initialCapital,
      adxThreshold:        parseFloat(draft.adxThreshold)        || params.adxThreshold,
      rvolThreshold:       parseFloat(draft.rvolThreshold)       || params.rvolThreshold,
      rvolSkip:            parseFloat(draft.rvolSkip)            || params.rvolSkip,
      fedLiquidityMAPeriod: parseInt(draft.fedLiquidityMAPeriod) || params.fedLiquidityMAPeriod,
      fixedTP:             parseFloat(draft.fixedTP)             || 0,
      fixedSL:             parseFloat(draft.fixedSL)             || 0,
      scoreExitThreshold:  parseFloat(draft.scoreExitThreshold)  || 0,
      tpslMode:            params.tpslMode,
      useDailyTrend:       params.useDailyTrend,
    }
    setParams(p => ({ ...p, ...committed }))
    setLoading(true)
    setError(null)
    setResult(null)
    setTrades([])
    setCandles([])

    try {
      const libParams: LibBacktestParams = { symbol: selectedSymbol, ...params, ...committed }
      const data = await execBacktest(libParams)

      setResult(data)
      setTrades(
        data.trade_log.map((t: LibBacktestTrade, i: number) => {
          const entryTs = new Date(t.entry_ts).getTime()
          const exitTs = new Date(t.exit_ts).getTime()
          const shouldSwap = entryTs > exitTs
          return {
            ...t,
            id: String(i),
            entry_ts: shouldSwap ? t.exit_ts : t.entry_ts,
            exit_ts: shouldSwap ? t.entry_ts : t.exit_ts,
            avg_entry_price: t.entry_price,
            gross_pnl: null,
            entry_count: null,
            add_count: null,
            add_entries: null,
          }
        }) as any as BacktestTrade[],
      )

      const startMs = new Date(params.startDate).getTime()
      const endMs = new Date(params.endDate).getTime()
      const candleData = await fetchOHLCV(selectedSymbol, params.interval, startMs, endMs)
      setCandles(candleData)
      setLastCommittedParams(committed)
      setTestName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }, [selectedSymbol, params, draft])

  // ── 저장 ────────────────────────────────────────────────────
  const saveBacktest = useCallback(async () => {
    if (!result || !lastCommittedParams || !testName.trim()) return
    try {
      await supabase.from('backtest_runs').insert({
        name: testName.trim(),
        symbol: selectedSymbol,
        interval: params.interval,
        start_date: params.startDate,
        end_date: params.endDate,
        leverage: lastCommittedParams.leverage,
        min_rr: lastCommittedParams.minRR,
        rsi_oversold: lastCommittedParams.rsiOversold,
        rsi_overbought: lastCommittedParams.rsiOverbought,
        min_score: lastCommittedParams.minScore,
        initial_capital: lastCommittedParams.initialCapital,
        score_use_adx: params.scoreUseADX,
        score_use_rsi: params.scoreUseRSI,
        score_use_macd: params.scoreUseMACD,
        score_use_rvol: params.scoreUseRVOL,
        adx_threshold: lastCommittedParams.adxThreshold,
        rvol_threshold: lastCommittedParams.rvolThreshold,
        rvol_skip: lastCommittedParams.rvolSkip,
        score_use_bb: params.scoreUseBB,
        score_use_ichi: params.scoreUseIchi,
        score_use_golden_cross: params.scoreUseGoldenCross,
        score_use_fed_liquidity: params.scoreUseFedLiquidity,
        fed_liquidity_ma_period: params.fedLiquidityMAPeriod,
        fixed_tp: lastCommittedParams.fixedTP,
        fixed_sl: lastCommittedParams.fixedSL,
        score_exit_threshold: lastCommittedParams.scoreExitThreshold,
        use_daily_trend: params.useDailyTrend,
        total_return_pct: result.total_return_pct,
        win_rate: result.win_rate,
        max_drawdown_pct: result.max_drawdown_pct,
        sharpe_ratio: result.sharpe_ratio,
        profit_factor: result.profit_factor,
        total_trades: result.total_trades,
      })
      setShowSaveDialog(false)
      setTestName('')
      await loadHistory()
    } catch (err) {
      console.error('저장 실패:', err)
      alert('저장에 실패했습니다')
    }
  }, [result, lastCommittedParams, testName, selectedSymbol, params])

  // ── 이력 적용 ────────────────────────────────────────────────
  const applyBestParams = useCallback((runs: RunHistory[]) => {
    if (runs.length === 0) return
    const best = runs.reduce((a, b) =>
      (a.total_return_pct ?? -Infinity) >= (b.total_return_pct ?? -Infinity) ? a : b
    )
    setSelectedSymbol(best.symbol as CryptoSymbol)
    setParams(p => ({
      ...p,
      interval: best.interval, leverage: best.leverage, minRR: best.min_rr,
      rsiOversold: best.rsi_oversold ?? 35, rsiOverbought: best.rsi_overbought ?? 65,
      minScore: best.min_score, initialCapital: best.initial_capital ?? p.initialCapital,
      scoreUseADX: best.score_use_adx ?? true, scoreUseRSI: best.score_use_rsi ?? true,
      scoreUseMACD: best.score_use_macd ?? true, scoreUseRVOL: best.score_use_rvol ?? true,
      adxThreshold: best.adx_threshold ?? 20, rvolThreshold: best.rvol_threshold ?? 1.5,
      rvolSkip: best.rvol_skip ?? 0.4,
      scoreUseBB: (best as any).score_use_bb ?? false,
      scoreUseIchi: (best as any).score_use_ichi ?? false,
      scoreUseGoldenCross: (best as any).score_use_golden_cross ?? true,
      scoreUseFedLiquidity: (best as any).score_use_fed_liquidity ?? false,
      fedLiquidityMAPeriod: (best as any).fed_liquidity_ma_period ?? 13,
      fixedTP: (best as any).fixed_tp ?? 0, fixedSL: (best as any).fixed_sl ?? 0,
      scoreExitThreshold: (best as any).score_exit_threshold ?? 0,
      useDailyTrend: (best as any).use_daily_trend ?? false,
    }))
    setDraft(d => ({
      ...d,
      leverage: String(best.leverage), minRR: String(best.min_rr),
      rsiOversold: String(best.rsi_oversold ?? 35), rsiOverbought: String(best.rsi_overbought ?? 65),
      minScore: String(best.min_score), initialCapital: String(best.initial_capital ?? 10000),
      adxThreshold: String(best.adx_threshold ?? 20),
      rvolThreshold: String(best.rvol_threshold ?? 1.5), rvolSkip: String(best.rvol_skip ?? 0.4),
      fixedTP: String((best as any).fixed_tp ?? 0), fixedSL: String((best as any).fixed_sl ?? 0),
      scoreExitThreshold: String((best as any).score_exit_threshold ?? 0),
    }))
  }, [])

  const loadHistory = useCallback(async (applyBest = false) => {
    const { data } = await supabase
      .from('backtest_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) {
      const runs = data as RunHistory[]
      setHistory(runs)
      if (applyBest) applyBestParams(runs)
    }
  }, [applyBestParams])

  useEffect(() => { loadHistory(true) }, [loadHistory])

  const applyHistoryParams = (run: RunHistory) => {
    setSelectedSymbol(run.symbol as CryptoSymbol)
    setParams(p => ({
      ...p,
      startDate: run.start_date, endDate: run.end_date, interval: run.interval,
      leverage: run.leverage, minRR: run.min_rr,
      rsiOversold: run.rsi_oversold ?? 35, rsiOverbought: run.rsi_overbought ?? 65,
      minScore: run.min_score, initialCapital: run.initial_capital ?? p.initialCapital,
      scoreUseADX: run.score_use_adx ?? true, scoreUseRSI: run.score_use_rsi ?? true,
      scoreUseMACD: run.score_use_macd ?? true, scoreUseRVOL: run.score_use_rvol ?? true,
      scoreUseBB: (run as any).score_use_bb ?? false,
      scoreUseIchi: (run as any).score_use_ichi ?? false,
      scoreUseGoldenCross: (run as any).score_use_golden_cross ?? true,
      scoreUseFedLiquidity: (run as any).score_use_fed_liquidity ?? false,
      fedLiquidityMAPeriod: (run as any).fed_liquidity_ma_period ?? 13,
      adxThreshold: run.adx_threshold ?? 20, rvolThreshold: run.rvol_threshold ?? 1.5,
      rvolSkip: run.rvol_skip ?? 0.4,
      fixedTP: (run as any).fixed_tp ?? 0, fixedSL: (run as any).fixed_sl ?? 0,
      scoreExitThreshold: (run as any).score_exit_threshold ?? 0,
      useDailyTrend: (run as any).use_daily_trend ?? false,
    }))
    setDraft({
      leverage: String(run.leverage), minRR: String(run.min_rr),
      rsiOversold: String(run.rsi_oversold ?? 35), rsiOverbought: String(run.rsi_overbought ?? 65),
      minScore: String(run.min_score), initialCapital: String(run.initial_capital ?? 10000),
      adxThreshold: String(run.adx_threshold ?? 20),
      rvolThreshold: String(run.rvol_threshold ?? 1.5), rvolSkip: String(run.rvol_skip ?? 0.4),
      fixedTP: String((run as any).fixed_tp ?? 0), fixedSL: String((run as any).fixed_sl ?? 0),
      scoreExitThreshold: String((run as any).score_exit_threshold ?? 0),
    })
    setShowHistory(false)
    setShowParams(true)
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* ── Controls Card ── */}
      <Card sx={{ background: '#111113', border: '1px solid #27272a', borderRadius: 3 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>

          {/* Row 1: symbol + buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>코인</Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {CRYPTO_SYMBOLS.map((sym) => (
                  <Box
                    key={sym}
                    component="button"
                    onClick={() => setSelectedSymbol(sym)}
                    sx={{
                      px: 1.5, py: 0.5, borderRadius: 1.5, border: '1px solid',
                      borderColor: selectedSymbol === sym ? '#3b82f6' : '#27272a',
                      background: selectedSymbol === sym ? '#3b82f620' : 'transparent',
                      color: selectedSymbol === sym ? '#3b82f6' : '#71717a',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                      '&:hover': { borderColor: '#3b82f666', color: '#a1a1aa' },
                    }}
                  >{sym}</Box>
                ))}
              </Box>
            </Box>

            <Box sx={{ ml: { xs: 0, sm: 'auto' }, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Box
                component="button"
                onClick={() => { setShowHistory(v => !v); setShowParams(false) }}
                sx={{
                  px: 2, py: 0.75, borderRadius: 2, border: '1px solid #27272a',
                  background: showHistory ? '#27272a' : 'transparent',
                  color: showHistory ? '#a1a1aa' : '#71717a', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  '&:hover': { borderColor: '#52525b', color: '#a1a1aa' },
                }}
              >
                이력 {history.length > 0 && `(${history.length})`}
              </Box>
              <Box
                component="button"
                onClick={() => { setShowParams(v => !v); setShowHistory(false) }}
                sx={{
                  px: 2, py: 0.75, borderRadius: 2, border: '1px solid #27272a',
                  background: showParams ? '#27272a' : 'transparent',
                  color: '#71717a', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  '&:hover': { borderColor: '#52525b', color: '#a1a1aa' },
                }}
              >
                파라미터 {showParams ? '접기' : '설정'}
              </Box>
              <Box
                component="button"
                onClick={runBacktest}
                disabled={loading}
                sx={{
                  px: 2, py: 0.75, borderRadius: 2,
                  border: '1px solid #3b82f6aa',
                  background: loading ? '#3b82f610' : '#3b82f620',
                  color: loading ? '#52525b' : '#3b82f6',
                  fontSize: 11, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  transition: 'all 0.15s',
                  '&:hover:not(:disabled)': { background: '#3b82f630', borderColor: '#3b82f6' },
                }}
              >
                {loading && <CircularProgress size={10} sx={{ color: '#3b82f6' }} />}
                {loading ? '실행 중...' : '백테스트 실행'}
              </Box>
              {result && !loading && (
                <Box
                  component="button"
                  onClick={() => setShowSaveDialog(true)}
                  sx={{
                    px: 2, py: 0.75, borderRadius: 2,
                    border: '1px solid #10b98144', background: '#10b98120', color: '#10b981',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 0.75, transition: 'all 0.15s',
                    '&:hover': { background: '#10b98130', borderColor: '#10b981' },
                  }}
                >
                  💾 결과 저장
                </Box>
              )}
            </Box>
          </Box>

          {/* Row 2: History */}
          {showHistory && (
            <HistoryPanel history={history} onApply={applyHistoryParams} />
          )}

          {/* Row 3: Params */}
          {showParams && (
            <ParamsPanel
              params={params}
              setParams={setParams}
              draft={draft}
              setDraft={setDraft}
              result={result}
            />
          )}

        </CardContent>
      </Card>

      {/* ── Error ── */}
      {error && (
        <Box sx={{ px: 2, py: 1.5, borderRadius: 2, background: '#ef444412', border: '1px solid #ef444433' }}>
          <Typography sx={{ fontSize: 12, color: '#ef4444' }}>{error}</Typography>
        </Box>
      )}

      {/* ── Result Summary ── */}
      {result && <ResultSummary result={result} trades={trades} />}

      {/* ── Chart ── */}
      {candles.length > 0 && (
        <Card sx={{ background: '#111113', border: '1px solid #27272a', borderRadius: 3 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#fafafa' }}>백테스트 차트</Typography>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                {[
                  { color: '#3b82f6', label: '롱 진입' },
                  { color: '#ef4444', label: '숏 진입' },
                  { color: '#10b981', label: '익절' },
                  { color: '#ec4899', label: '손절' },
                ].map(({ color, label }) => (
                  <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                    <Typography sx={{ fontSize: 10, color: '#71717a' }}>{label}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
            <BacktestChart
              candles={candles}
              trades={trades}
              scrollToRef={scrollToRef}
              selectedTradeId={selectedTradeId}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Trade List ── */}
      {trades && (
        <TradeList
          trades={trades}
          loading={loading}
          result={result}
          params={params}
          selectedTradeId={selectedTradeId}
          onScrollTo={handleScrollTo}
          onSelectTrade={setSelectedTradeId}
        />
      )}

      {/* ── Empty state ── */}
      {!loading && !error && !result && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 1.5 }}>
          <Typography sx={{ fontSize: 32 }}>📊</Typography>
          <Typography sx={{ fontSize: 14, color: '#52525b', fontWeight: 600 }}>
            파라미터를 설정하고 백테스트를 실행하세요
          </Typography>
          <Typography sx={{ fontSize: 12, color: '#3f3f46', textAlign: 'center' }}>
            코인 선택 후 <strong style={{ color: '#3b82f6' }}>백테스트 실행</strong> 버튼을 누르세요
          </Typography>
        </Box>
      )}

      {/* ── Save Dialog ── */}
      <SaveDialog
        open={showSaveDialog}
        testName={testName}
        onNameChange={setTestName}
        onSave={saveBacktest}
        onClose={() => setShowSaveDialog(false)}
      />

    </Box>
  )
}
