import { useState, useRef, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import type { UTCTimestamp } from 'lightweight-charts'
import { runStockBacktest, STOCK_SYMBOLS } from '../../lib/stock'
import type { BacktestParams, BacktestResult, BacktestTrade, OHLCVCandle } from '../CryptoExplorer/backtest/types'
import BacktestChart from '../CryptoExplorer/backtest/BacktestChart'
import TradeList from '../CryptoExplorer/backtest/TradeList'
import ResultSummary from '../CryptoExplorer/backtest/ResultSummary'
import ParamsPanel from '../CryptoExplorer/backtest/ParamsPanel'

const today = new Date().toISOString().slice(0, 10)
const oneYearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)

const INTERVALS = ['15m', '1h', '1d', '1wk']

const dateInputStyle: React.CSSProperties = {
  background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6,
  color: '#e4e4e7', fontSize: 12, padding: '4px 8px', outline: 'none', colorScheme: 'dark',
}

export default function StockBacktest() {
  const [symbol, setSymbol] = useState('AAPL')
  const [symbolInput, setSymbolInput] = useState('AAPL')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [trades, setTrades] = useState<BacktestTrade[]>([])
  const [candles, setCandles] = useState<OHLCVCandle[]>([])
  const [showParams, setShowParams] = useState(false)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const scrollToRef = useRef<((ts: string) => void) | null>(null)

  const [params, setParams] = useState<BacktestParams>({
    startDate: oneYearAgo,
    endDate: today,
    interval: '1d',
    leverage: 2,
    minScore: 3,
    initialCapital: 10000,
    rsiOversold: 35,
    rsiOverbought: 65,
    scoreUseADX: true,
    scoreUseRSI: true,
    scoreUseMACD: true,
    scoreUseRVOL: false,
    scoreUseBB: false,
    adxThreshold: 30,
    rvolThreshold: 1.5,
    rvolSkip: 0.4,
    scoreUseIchi: false,
    scoreUseGoldenCross: true,
    scoreUseFedLiquidity: true,
    scoreUseCCI: false,
    scoreUseVWMA: false,
    fedLiquidityMAPeriod: 13,
    cciOversold: -100,
    cciOverbought: 100,
    cciMaxEntry: 0,
    fixedTP: 5,
    fixedSL: 3,
    tpslMode: 'fixed',
    scoreUseMA120: true,
    scoreExitThreshold: 1,
  })

  const [draft, setDraft] = useState<Record<string, string>>({
    leverage: '1',
    minScore: '3',
    rsiOversold: '35', rsiOverbought: '65',
    adxThreshold: '20',
    rvolThreshold: '1.5', rvolSkip: '0.4',
    fixedTP: '10', fixedSL: '5',
    scoreExitThreshold: '1',
    cciOversold: '-100', cciOverbought: '100', cciMaxEntry: '0',
  })

  const handleScrollTo = useCallback((ts: string) => {
    scrollToRef.current?.(ts)
  }, [])

  const runBacktest = useCallback(async () => {
    const ticker = symbolInput.trim().toUpperCase()
    if (!ticker) return
    setSymbol(ticker)

    const committed = {
      leverage: 1,
      rsiOversold:        parseFloat(draft.rsiOversold)        || params.rsiOversold,
      rsiOverbought:      parseFloat(draft.rsiOverbought)       || params.rsiOverbought,
      minScore:           isNaN(parseFloat(draft.minScore)) ? params.minScore : parseFloat(draft.minScore),
      initialCapital:     10000,
      adxThreshold:       parseFloat(draft.adxThreshold)        || params.adxThreshold,
      rvolThreshold:      parseFloat(draft.rvolThreshold)       || params.rvolThreshold,
      rvolSkip:           parseFloat(draft.rvolSkip)            || params.rvolSkip,
      fedLiquidityMAPeriod: params.fedLiquidityMAPeriod,
      fixedTP:            parseFloat(draft.fixedTP)             || 0,
      fixedSL:            parseFloat(draft.fixedSL)             || 0,
      scoreExitThreshold: parseFloat(draft.scoreExitThreshold)  || 0,
      cciOversold:        parseFloat(draft.cciOversold)         || -100,
      cciOverbought:      parseFloat(draft.cciOverbought)       || 100,
      cciMaxEntry:        parseFloat(draft.cciMaxEntry)         || 0,
      tpslMode:           params.tpslMode,
      scoreUseMA120:      params.scoreUseMA120,
    }
    setParams(p => ({ ...p, ...committed }))
    setLoading(true)
    setError(null)
    setResult(null)
    setTrades([])
    setCandles([])

    try {
      const { result: res, rows, startMs } = await runStockBacktest({
        ...params, ...committed, symbol: ticker,
      } as any)

      setResult(res)
      setTrades(
        (res.trade_log as any[]).map((t, idx) => ({
          id: String(idx),
          avg_entry_price: t.entry_price,
          gross_pnl: null,
          commission: t.commission ?? null,
          entry_count: 1,
          add_count: 0,
          add_entries: [],
          ...t,
        }))
      )

      const KST_OFFSET_S = 9 * 3600
      const chartCandles: OHLCVCandle[] = rows
        .filter(r => r.timestamp >= startMs)
        .map(r => ({
          time: (Math.floor(r.timestamp / 1000) + KST_OFFSET_S) as UTCTimestamp,
          open: r.open, high: r.high, low: r.low, close: r.close,
        }))
      setCandles(chartCandles)
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }, [symbolInput, params, draft])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      <Card sx={{ background: '#111113', border: '1px solid #27272a', borderRadius: 3 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

            {/* Row 1: ticker + 추천 종목 + buttons */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              {/* 티커 입력 */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>티커</Typography>
                <input
                  value={symbolInput}
                  onChange={e => setSymbolInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && runBacktest()}
                  placeholder="AAPL"
                  style={{
                    background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6,
                    color: '#e4e4e7', fontSize: 13, padding: '4px 10px', outline: 'none',
                    width: 90, fontFamily: 'monospace', fontWeight: 700,
                  }}
                />
              </Box>

              {/* 추천 종목 칩 */}
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {STOCK_SYMBOLS.map(s => (
                  <Box
                    key={s}
                    component="button"
                    onClick={() => { setSymbolInput(s); setSymbol(s) }}
                    sx={{
                      px: 1.25, py: 0.4, borderRadius: 1.5, border: '1px solid',
                      borderColor: symbol === s ? '#3b82f6' : '#27272a',
                      background: symbol === s ? '#3b82f620' : 'transparent',
                      color: symbol === s ? '#3b82f6' : '#52525b',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                      '&:hover': { borderColor: '#3b82f655', color: '#a1a1aa' },
                    }}
                  >{s}</Box>
                ))}
              </Box>

              <Box sx={{ ml: { xs: 0, sm: 'auto' }, display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box
                  component="button"
                  onClick={() => setShowParams(v => !v)}
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
                    display: 'flex', alignItems: 'center', gap: 0.75, transition: 'all 0.15s',
                    '&:hover:not(:disabled)': { background: '#3b82f630', borderColor: '#3b82f6' },
                  }}
                >
                  {loading && <CircularProgress size={10} sx={{ color: '#3b82f6' }} />}
                  {loading ? '실행 중...' : '백테스트 실행'}
                </Box>
              </Box>
            </Box>

            {/* Row 2: date + interval */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: 11, color: '#71717a', fontWeight: 600 }}>시작</Typography>
                <input
                  type="date"
                  value={params.startDate}
                  onChange={e => setParams(p => ({ ...p, startDate: e.target.value }))}
                  style={dateInputStyle}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: 11, color: '#71717a', fontWeight: 600 }}>종료</Typography>
                <input
                  type="date"
                  value={params.endDate}
                  onChange={e => setParams(p => ({ ...p, endDate: e.target.value }))}
                  style={dateInputStyle}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: 11, color: '#71717a', fontWeight: 600, whiteSpace: 'nowrap' }}>캔들</Typography>
                <select
                  value={params.interval}
                  onChange={e => {
                    const iv = e.target.value
                    if (iv === '15m') {
                      const end = new Date().toISOString().slice(0, 10)
                      const start = new Date(Date.now() - 59 * 86_400_000).toISOString().slice(0, 10)
                      setParams(p => ({ ...p, interval: iv, startDate: start, endDate: end }))
                    } else {
                      setParams(p => ({ ...p, interval: iv }))
                    }
                  }}
                  style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, color: '#e4e4e7', fontSize: 11, padding: '4px 8px', outline: 'none', cursor: 'pointer' }}
                >
                  {INTERVALS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </Box>
            </Box>
          </Box>

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

      {error && (
        <Box sx={{ px: 2, py: 1.5, borderRadius: 2, background: '#ef444412', border: '1px solid #ef444433' }}>
          <Typography sx={{ fontSize: 12, color: '#ef4444' }}>{error}</Typography>
        </Box>
      )}

      {result && <ResultSummary result={result} trades={trades} />}

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

      {trades && (
        <TradeList
          trades={trades}
          loading={loading}
          selectedTradeId={selectedTradeId}
          onScrollTo={handleScrollTo}
          onSelectTrade={setSelectedTradeId}
        />
      )}

      {!loading && !error && !result && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 1.5 }}>
          <Typography sx={{ fontSize: 32 }}>📈</Typography>
          <Typography sx={{ fontSize: 14, color: '#52525b', fontWeight: 600 }}>
            티커를 입력하고 백테스트를 실행하세요
          </Typography>
          <Typography sx={{ fontSize: 12, color: '#3f3f46', textAlign: 'center' }}>
            예: AAPL, TSLA, NVDA, SPY 등 — Enter 또는 <strong style={{ color: '#3b82f6' }}>백테스트 실행</strong>
          </Typography>
        </Box>
      )}
    </Box>
  )
}
