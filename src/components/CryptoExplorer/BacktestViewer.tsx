import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import {
  createChart,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type SeriesMarker,
  type Time,
  type ISeriesMarkersPluginApi,
} from 'lightweight-charts'
import { supabase } from '../../lib/supabase'
import { runBacktest as execBacktest, type BacktestParams as LibBacktestParams, type BacktestTrade as LibBacktestTrade } from '../../lib/backtest'
import { CRYPTO_SYMBOLS, SIGNAL_LABELS, type CryptoSymbol } from '../../constants/crypto'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
// symbol은 selectedSymbol로 별도 관리
type BacktestParams = Omit<LibBacktestParams, 'symbol'>

interface BacktestResult {
  symbol: string
  interval: string
  start_date: string
  end_date: string
  initial_capital: number
  final_capital: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  total_return_pct: number
  max_drawdown_pct: number
  sharpe_ratio: number
  profit_factor: number | null
  trade_log: any[]
  equity_curve: number[]
}

interface AddEntry {
  step: number
  price: number
  qty: number
  capital_used: number
  ts: string
}

interface BacktestTrade {
  id: string
  signal_type: string
  direction: 'LONG' | 'SHORT'
  entry_ts: string
  exit_ts: string
  entry_price: number
  avg_entry_price: number | null
  exit_price: number
  tp: number | null
  sl: number | null
  gross_pnl: number | null
  commission: number | null
  net_pnl: number
  pnl_pct: number
  exit_reason: string
  entry_count: number | null
  add_count: number | null
  add_entries: any
  score?: number
}

interface OHLCVCandle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function fmtPrice(v: number | undefined | null): string {
  if (v == null) return '$0.00'
  return v >= 1000
      ? `$${v.toLocaleString('en', { maximumFractionDigits: 2 })}`
      : `$${v.toLocaleString('en', { maximumFractionDigits: 6 })}`
}

function fmtPct(v: number | undefined | null): string {
  if (v == null) return '0.00%'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

function parseAddEntries(trade: BacktestTrade): AddEntry[] {
  try {
    let raw = trade.add_entries

    // 문자열이면 파싱
    if (typeof raw === 'string') {
      raw = raw.trim()
      if (!raw || raw === 'null' || raw === '[]') raw = null
      else raw = JSON.parse(raw)
    }

    // 배열이면 유효한 항목만 필터
    if (Array.isArray(raw) && raw.length > 0) {
      const mapped = raw
          .filter((e: any) => e != null && typeof e === 'object')
          .map((e: any) => ({
            step: e.step || 1,
            price: typeof e.price === 'number' ? e.price : (trade.entry_price ?? 0),
            qty: e.qty ?? 0,
            capital_used: e.capital_used ?? 0,
            ts: e.ts || trade.entry_ts || new Date().toISOString(),
          }))
      if (mapped.length > 0) return mapped
    }
  } catch (e) {
    // 파싱 실패 — fallback
  }

  // fallback: 첫 진입 1건
  return [
    {
      step: 1,
      price: trade.entry_price ?? 0,
      qty: 0,
      capital_used: 0,
      ts: trade.entry_ts ?? new Date().toISOString(),
    },
  ]
}

// ─────────────────────────────────────────────────────────────
// Fetch OHLCV from Binance REST
// ─────────────────────────────────────────────────────────────
async function fetchOHLCV(
    symbol: string,
    interval: string,
    startMs: number,
    endMs: number,
): Promise<OHLCVCandle[]> {
  const candles: OHLCVCandle[] = []
  let cursor = startMs

  while (cursor < endMs) {
    const url = new URL('https://api.binance.com/api/v3/klines')
    url.searchParams.set('symbol', `${symbol}USDT`)
    url.searchParams.set('interval', interval)
    url.searchParams.set('startTime', String(cursor))
    url.searchParams.set('endTime', String(endMs))
    url.searchParams.set('limit', '1000')

    const res = await fetch(url.toString())
    if (!res.ok) break
    const data: number[][] = await res.json()
    if (!data.length) break

    for (const k of data) {
      candles.push({
        time: Math.floor(k[0] / 1000) as UTCTimestamp,
        open: parseFloat(String(k[1])),
        high: parseFloat(String(k[2])),
        low: parseFloat(String(k[3])),
        close: parseFloat(String(k[4])),
      })
    }

    cursor = data[data.length - 1][0] + 1
    if (data.length < 1000) break
  }

  return candles
}

// ─────────────────────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────────────────────
function MetricCard({
                      label,
                      value,
                      sub,
                      color,
                    }: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
      <Box
          sx={{
            px: 2,
            py: 1.5,
            borderRadius: 2,
            background: '#18181b',
            border: '1px solid #27272a',
            minWidth: 100,
          }}
      >
        <Typography
            sx={{
              fontSize: 9,
              color: '#52525b',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              mb: 0.5,
            }}
        >
          {label}
        </Typography>
        <Typography
            sx={{
              fontSize: 15,
              fontWeight: 800,
              color: color ?? '#fafafa',
              fontFamily: 'monospace',
              lineHeight: 1,
            }}
        >
          {value}
        </Typography>
        {sub && (
            <Typography sx={{ fontSize: 10, color: '#52525b', mt: 0.25 }}>
              {sub}
            </Typography>
        )}
      </Box>
  )
}

// ─────────────────────────────────────────────────────────────
// Backtest Chart — candlestick + buy/sell markers
// ─────────────────────────────────────────────────────────────
const BacktestChart = memo(function BacktestChart({
                                                    candles,
                                                    trades,
                                                    scrollToRef,
                                                  }: {
  candles: OHLCVCandle[]
  trades: BacktestTrade[]
  scrollToRef: React.MutableRefObject<((ts: string) => void) | null>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick', any> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  // scrollTo 핸들러 등록
  useEffect(() => {
    scrollToRef.current = (ts: string) => {
      if (!chartRef.current) return
      const t = Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp
      chartRef.current.timeScale().scrollToPosition(0, false)
      chartRef.current.timeScale().setVisibleRange({
        from: (t - 60 * 60 * 48) as UTCTimestamp,
        to: (t + 60 * 60 * 72) as UTCTimestamp,
      })
    }
  }, [scrollToRef])

  // 차트 생성 + 데이터 세팅을 하나로 통합
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    // 이전 차트가 있으면 제거
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
      seriesRef.current = null
      markersRef.current = null
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111113' },
        textColor: '#52525b',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#1f1f23' },
        horzLines: { color: '#1f1f23' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#27272a',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    chartRef.current = chart
    seriesRef.current = series

    // 데이터 세팅
    series.setData(candles)
    chart.timeScale().fitContent()

    // 마커 생성
    const markers: SeriesMarker<Time>[] = []
    for (const t of trades) {
      const exitTime = Math.floor(new Date(t.exit_ts).getTime() / 1000) as UTCTimestamp
      const win = t.net_pnl > 0
      const isShort = t.direction === 'SHORT'

      const entries = parseAddEntries(t)

      for (const e of entries) {
        const eTime = Math.floor(new Date(e.ts).getTime() / 1000) as UTCTimestamp
        const color = isShort ? '#ef4444' : '#3b82f6'

        markers.push({
          time: eTime,
          position: isShort ? 'aboveBar' : 'belowBar',
          color,
          shape: isShort ? 'arrowDown' : 'arrowUp',
          text:
              e.step === 1
                  ? isShort ? '숏진입' : '롱진입'
                  : isShort ? '숏추가' : '롱추가',
        })
      }

      markers.push({
        time: exitTime,
        position: isShort ? 'belowBar' : 'aboveBar',
        color: win ? '#10b981' : '#ec4899',
        shape: isShort ? 'arrowUp' : 'arrowDown',
        text: win ? '익절' : '손절',
      })
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number))
    markersRef.current = createSeriesMarkers(series, markers)

    // 리사이즈 옵저버
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      markersRef.current = null
    }
  }, [candles, trades])

  return (
      <Box
          ref={containerRef}
          sx={{ width: '100%', height: 400, borderRadius: 2, overflow: 'hidden' }}
      />
  )
})

// ─────────────────────────────────────────────────────────────
// Trade Row
// ─────────────────────────────────────────────────────────────
const TradeRow = memo(function TradeRow({
                                          trade,
                                          index,
                                          onScrollTo,
                                        }: {
  trade: BacktestTrade
  index: number
  onScrollTo: (ts: string) => void
}) {
  if (!trade) return null

  const win = (trade.net_pnl ?? 0) > 0
  const isShort = trade.direction === 'SHORT'
  const isSL =
      trade.exit_reason?.includes('STOP_LOSS') ||
      trade.exit_reason?.includes('손절')

  const pnlColor = win ? '#10b981' : '#ec4899'
  const dirColor = isShort ? '#ef4444' : '#3b82f6'
  const bg = index % 2 === 0 ? '#111113' : '#18181b'

  const entries = useMemo(() => parseAddEntries(trade), [trade])

  const entryMarkerColor = (step: number) => {
    if (isShort) {
      return step === 1 ? '#ef4444' : step === 2 ? '#ec4899' : '#f59e0b'
    }
    return step === 1 ? '#3b82f6' : step === 2 ? '#a855f7' : '#06b6d4'
  }

  const exitMarkerColor = win ? '#10b981' : isSL ? '#ec4899' : '#ef4444'
  const hasMultiple = entries.length > 1

  return (
      <Box
          onClick={() => trade.entry_ts && onScrollTo(trade.entry_ts)}
          sx={{
            borderRadius: 1.5,
            // overflow: 'hidden',
            borderLeft: `3px solid ${dirColor}66`,
            cursor: 'pointer',
            '&:hover > *': { background: `${dirColor}0a !important` },
            transition: 'opacity 0.15s',
          }}
      >
        {entries.map((e, ei) => {
          const sc = entryMarkerColor(e.step)
          const isFirst = ei === 0
          const isLast = ei === entries.length - 1

          return (
              <Box
                  key={`${index}-${e.step}-${ei}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '20px 36px 52px 1fr 1fr 1fr 90px',
                    gap: 0.75,
                    px: 1.5,
                    py: 0.55,
                    background: bg,
                    alignItems: 'center',
                    borderBottom: !isLast ? '1px solid #ffffff06' : 'none',
                  }}
              >
                {/* # */}
                <Typography
                    sx={{
                      fontSize: 9,
                      color: '#3f3f46',
                      fontFamily: 'monospace',
                      textAlign: 'right',
                    }}
                >
                  {isFirst ? index + 1 : ''}
                </Typography>

                {/* 방향 */}
                {isFirst ? (
                    <Chip
                        label={isShort ? '숏' : '롱'}
                        size="small"
                        sx={{
                          height: 15,
                          fontSize: 8,
                          fontWeight: 800,
                          bgcolor: `${dirColor}18`,
                          color: dirColor,
                          border: `1px solid ${dirColor}44`,
                          '& .MuiChip-label': { px: 0.5 },
                        }}
                    />
                ) : (
                    <Box />
                )}

                {/* 진입 단계 */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                  <Box
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: sc,
                        flexShrink: 0,
                      }}
                  />
                  <Typography sx={{ fontSize: 9, color: sc, fontWeight: 700 }}>
                    {isShort
                        ? e.step === 1
                            ? '숏진입'
                            : '숏추가'
                        : e.step === 1
                            ? '롱진입'
                            : '롱추가'}
                  </Typography>
                </Box>

                {/* 진입 */}
                <Box>
                  <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>
                    {fmtDate(e.ts)}
                  </Typography>
                  <Typography
                      sx={{
                        fontSize: 10,
                        color: '#ffffff',
                        fontFamily: 'monospace',
                      }}
                  >
                    {fmtPrice(e.price)}
                  </Typography>
                </Box>

                {/* 청산 — 마지막 행만 */}
                {isLast ? (
                    <Box>
                      <Typography sx={{ fontSize: 9, color: '#a1a1aa' }}>
                        {fmtDate(trade.exit_ts)}
                      </Typography>
                      <Typography
                          sx={{
                            fontSize: 10,
                            color: exitMarkerColor,
                            fontFamily: 'monospace',
                            fontWeight: 700,
                          }}
                      >
                        {fmtPrice(trade.exit_price)}
                      </Typography>
                      {hasMultiple && trade.avg_entry_price && (
                          <Typography sx={{ fontSize: 8, color: '#71717a' }}>
                            avg {fmtPrice(trade.avg_entry_price)}
                          </Typography>
                      )}
                    </Box>
                ) : (
                    <Box />
                )}

                {/* 시그널 — 첫 행만 */}
                {isFirst ? (
                    <Box>
                      <Typography
                          sx={{
                            fontSize: 9,
                            color: '#a1a1aa',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                      >
                        {SIGNAL_LABELS[trade.signal_type] ?? trade.signal_type}
                      </Typography>
                      <Typography
                          sx={{
                            fontSize: 9,
                            color: win ? '#10b981' : '#ec4899',
                            fontWeight: 600,
                          }}
                      >
                        {win ? '익절' : '손절'}
                      </Typography>
                    </Box>
                ) : (
                    <Box />
                )}

                {/* 손익 — 첫 행만 */}
                {isFirst ? (
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography
                          sx={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: pnlColor,
                            fontFamily: 'monospace',
                            lineHeight: 1.2,
                          }}
                      >
                        {fmtPct(trade.pnl_pct)}
                      </Typography>
                      <Typography
                          sx={{
                            fontSize: 9,
                            color: pnlColor,
                            fontFamily: 'monospace',
                            opacity: 0.75,
                          }}
                      >
                        {win ? '+' : ''}${trade.net_pnl.toFixed(2)}
                      </Typography>
                      {trade.commission != null && trade.commission > 0 && (
                          <Typography
                              sx={{
                                fontSize: 8,
                                color: '#52525b',
                                fontFamily: 'monospace',
                              }}
                          >
                            fee ${trade.commission.toFixed(2)}
                          </Typography>
                      )}
                    </Box>
                ) : (
                    <Box />
                )}
              </Box>
          )
        })}
      </Box>
  )
})

// ─────────────────────────────────────────────────────────────
// Main BacktestViewer
// ─────────────────────────────────────────────────────────────

const defaultEndDate = new Date().toISOString().split('T')[0]
const defaultStartDate = (() => {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().split('T')[0]
})()

interface RunHistory {
  id: string
  created_at: string
  symbol: string
  interval: string
  start_date: string
  end_date: string
  leverage: number
  min_rr: number
  min_rr_ratio: number
  rsi_oversold: number
  rsi_overbought: number
  min_score: number
  initial_capital: number
  score_use_adx: boolean
  score_use_obv: boolean
  score_use_mfi: boolean
  score_use_macd: boolean
  score_use_stoch: boolean
  score_use_rsi: boolean
  score_use_rvol: boolean
  adx_threshold: number
  mfi_threshold: number
  stoch_oversold: number
  stoch_overbought: number
  rvol_threshold: number
  rvol_skip: number
  total_return_pct: number
  win_rate: number
  max_drawdown_pct: number
  sharpe_ratio: number
  total_trades: number
}

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
  const [openHint, setOpenHint] = useState<string | null>(null)
  const scrollToRef = useRef<((ts: string) => void) | null>(null)

  const [params, setParams] = useState<BacktestParams>({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    interval: '1h',
    leverage: 5,
    minRR: 2.2,
    minRRRatio: 1.8,
    rsiOversold: 35,
    rsiOverbought: 65,
    minScore: 4,
    initialCapital: 10000,
    scoreUseADX: true,
    scoreUseOBV: true,
    scoreUseMFI: true,
    scoreUseMACD: true,
    scoreUseStoch: true,
    scoreUseRSI: true,
    scoreUseRVOL: true,
    adxThreshold: 20,
    mfiThreshold: 50,
    stochOversold: 20,
    stochOverbought: 80,
    rvolThreshold: 1.5,
    rvolSkip: 0.4,
    scoreUseIchi: false,
    fixedTP: 0,
    fixedSL: 0,
  })

  // 인풋 표시용 문자열 상태 — 편집 중 빈 값/소수점 등을 자유롭게 허용
  const [draft, setDraft] = useState<Record<string, string>>({
    leverage: '5', minRR: '2.2', minRRRatio: '1.8',
    rsiOversold: '35', rsiOverbought: '65', minScore: '4', initialCapital: '10000',
    adxThreshold: '20', mfiThreshold: '50',
    stochOversold: '20', stochOverbought: '80',
    rvolThreshold: '1.5', rvolSkip: '0.4',
    fixedTP: '0', fixedSL: '0',
  })

  const handleScrollTo = useCallback((ts: string) => {
    scrollToRef.current?.(ts)
  }, [])

  const runBacktest = useCallback(async () => {
    // 실행 시점에 draft 문자열을 숫자로 커밋
    const committed = {
      leverage:       parseFloat(draft.leverage)       || params.leverage,
      minRR:          parseFloat(draft.minRR)          || params.minRR,
      minRRRatio:     parseFloat(draft.minRRRatio)     || params.minRRRatio,
      rsiOversold:    parseFloat(draft.rsiOversold)    || params.rsiOversold,
      rsiOverbought:  parseFloat(draft.rsiOverbought)  || params.rsiOverbought,
      minScore:       parseFloat(draft.minScore)       || params.minScore,
      initialCapital: parseFloat(draft.initialCapital) || params.initialCapital,
      adxThreshold:   parseFloat(draft.adxThreshold)   || params.adxThreshold,
      mfiThreshold:   parseFloat(draft.mfiThreshold)   || params.mfiThreshold,
      stochOversold:  parseFloat(draft.stochOversold)  || params.stochOversold,
      stochOverbought:parseFloat(draft.stochOverbought)|| params.stochOverbought,
      rvolThreshold:  parseFloat(draft.rvolThreshold)  || params.rvolThreshold,
      rvolSkip:       parseFloat(draft.rvolSkip)       || params.rvolSkip,
      fixedTP:        parseFloat(draft.fixedTP)        || 0,
      fixedSL:        parseFloat(draft.fixedSL)        || 0,
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
        data.trade_log.map((t: LibBacktestTrade, i: number) => ({
          ...t,
          id: String(i),
          avg_entry_price: t.entry_price,
          gross_pnl: null,
          commission: null,
          entry_count: null,
          add_count: null,
          add_entries: null,
        })) as BacktestTrade[],
      )

      const startMs = new Date(params.startDate).getTime()
      const endMs = new Date(params.endDate).getTime()
      const candleData = await fetchOHLCV(selectedSymbol, params.interval, startMs, endMs)
      setCandles(candleData)

      // 동일 파라미터 이력이 있으면 결과만 업데이트, 없으면 신규 저장
      const paramFilter = {
        symbol: selectedSymbol,
        interval: params.interval,
        start_date: params.startDate,
        end_date: params.endDate,
        leverage: committed.leverage,
        min_rr: committed.minRR,
        min_rr_ratio: committed.minRRRatio,
        rsi_oversold: committed.rsiOversold,
        rsi_overbought: committed.rsiOverbought,
        min_score: committed.minScore,
        initial_capital: committed.initialCapital,
        score_use_adx: params.scoreUseADX,
        score_use_obv: params.scoreUseOBV,
        score_use_mfi: params.scoreUseMFI,
        score_use_macd: params.scoreUseMACD,
        score_use_stoch: params.scoreUseStoch,
        score_use_rsi: params.scoreUseRSI,
        score_use_rvol: params.scoreUseRVOL,
        adx_threshold: committed.adxThreshold,
        mfi_threshold: committed.mfiThreshold,
        stoch_oversold: committed.stochOversold,
        stoch_overbought: committed.stochOverbought,
        rvol_threshold: committed.rvolThreshold,
        rvol_skip: committed.rvolSkip,
        score_use_ichi: params.scoreUseIchi,
        fixed_tp: committed.fixedTP,
        fixed_sl: committed.fixedSL,
      }
      const resultPayload = {
        total_return_pct: data.total_return_pct,
        win_rate: data.win_rate,
        max_drawdown_pct: data.max_drawdown_pct,
        sharpe_ratio: data.sharpe_ratio,
        profit_factor: data.profit_factor,
        total_trades: data.total_trades,
      }
      const { data: existing } = await supabase
        .from('backtest_runs')
        .select('id')
        .match(paramFilter)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase.from('backtest_runs')
          .update({ ...resultPayload, created_at: new Date().toISOString() })
          .eq('id', existing[0].id)
      } else {
        await supabase.from('backtest_runs').insert({ ...paramFilter, ...resultPayload })
      }
      loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }, [selectedSymbol, params, draft])

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('backtest_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setHistory(data as RunHistory[])
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const applyHistoryParams = (run: RunHistory) => {
    setSelectedSymbol(run.symbol as CryptoSymbol)
    setParams(p => ({
      ...p,
      startDate: run.start_date,
      endDate: run.end_date,
      interval: run.interval,
      leverage: run.leverage,
      minRR: run.min_rr,
      minRRRatio: run.min_rr_ratio ?? p.minRRRatio,
      rsiOversold: run.rsi_oversold,
      rsiOverbought: run.rsi_overbought,
      minScore: run.min_score,
      initialCapital: run.initial_capital ?? p.initialCapital,
      scoreUseADX:  run.score_use_adx  ?? true,
      scoreUseOBV:  run.score_use_obv  ?? true,
      scoreUseMFI:  run.score_use_mfi  ?? true,
      scoreUseMACD: run.score_use_macd ?? true,
      scoreUseStoch:run.score_use_stoch?? true,
      scoreUseRSI:  run.score_use_rsi  ?? true,
      scoreUseRVOL: run.score_use_rvol ?? true,
      scoreUseIchi: (run as any).score_use_ichi ?? false,
      adxThreshold:    run.adx_threshold    ?? 20,
      mfiThreshold:    run.mfi_threshold    ?? 50,
      stochOversold:   run.stoch_oversold   ?? 20,
      stochOverbought: run.stoch_overbought ?? 80,
      rvolThreshold:   run.rvol_threshold   ?? 1.5,
      rvolSkip:        run.rvol_skip        ?? 0.4,
      fixedTP:         (run as any).fixed_tp ?? 0,
      fixedSL:         (run as any).fixed_sl ?? 0,
    }))
    setDraft({
      leverage: String(run.leverage),
      minRR: String(run.min_rr),
      minRRRatio: String(run.min_rr_ratio ?? 1.8),
      rsiOversold: String(run.rsi_oversold),
      rsiOverbought: String(run.rsi_overbought),
      minScore: String(run.min_score),
      initialCapital: String(run.initial_capital ?? 10000),
      adxThreshold: String(run.adx_threshold ?? 20),
      mfiThreshold: String(run.mfi_threshold ?? 50),
      stochOversold: String(run.stoch_oversold ?? 20),
      stochOverbought: String(run.stoch_overbought ?? 80),
      rvolThreshold: String(run.rvol_threshold ?? 1.5),
      rvolSkip: String(run.rvol_skip ?? 0.4),
      fixedTP: String((run as any).fixed_tp ?? 0),
      fixedSL: String((run as any).fixed_sl ?? 0),
    })
    setShowHistory(false)
    setShowParams(true)
  }

  const returnColor = result
      ? result.total_return_pct >= 0
          ? '#10b981'
          : '#ef4444'
      : '#fafafa'

  const HintTooltip = ({ id, text }: { id: string; text: string }) => {
    const isOpen = openHint === id
    return (
      <Box component="span"
        onMouseEnter={() => setOpenHint(id)}
        onMouseLeave={() => setOpenHint(null)}
        onClick={e => { e.stopPropagation(); setOpenHint(isOpen ? null : id) }}
        sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
        <Box component="span" sx={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 13, height: 13, borderRadius: '50%',
          border: '1px solid #3f3f46', color: isOpen ? '#d4d4d8' : '#71717a',
          borderColor: isOpen ? '#a1a1aa' : '#3f3f46',
          fontSize: 8, fontWeight: 700, flexShrink: 0, userSelect: 'none',
          transition: 'all 0.12s',
        }}>?</Box>
        {isOpen && (
          <Box sx={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 220,
            background: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '8px',
            px: 1.5, py: 1,
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            '&::after': {
              content: '""',
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              borderWidth: '5px',
              borderStyle: 'solid',
              borderColor: '#3f3f46 transparent transparent transparent',
            },
          }}>
            <Typography sx={{ fontSize: 11, color: '#d4d4d8', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {text}
            </Typography>
          </Box>
        )}
      </Box>
    )
  }

  const LabelRow = ({ label, hint, hintId }: { label: string; hint?: string; hintId?: string }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
      <Typography sx={labelSx}>{label}</Typography>
      {hint && hintId && <HintTooltip id={hintId} text={hint} />}
    </Box>
  )

  const inputStyle: React.CSSProperties = {
    background: '#0a0a0b',
    border: '1px solid #27272a',
    borderRadius: 4,
    color: '#fafafa',
    fontSize: 11,
    padding: '4px 8px',
    fontFamily: 'monospace',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    colorScheme: 'dark',
  }

  const labelSx = { fontSize: 9, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0 } as const

  return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* ── Controls ── */}
        <Card sx={{ background: '#111113', border: '1px solid #27272a', borderRadius: 3 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            {/* Row 1: symbol + run */}
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
                    onClick={() => { setShowParams((v) => !v); setShowHistory(false) }}
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
              </Box>
            </Box>

            {/* Row 2: history */}
            {showHistory && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #1f1f23' }}>
                  {history.length === 0 ? (
                      <Typography sx={{ fontSize: 12, color: '#3f3f46', textAlign: 'center', py: 2 }}>
                        아직 실행 이력이 없어요
                      </Typography>
                  ) : (
                      <Box sx={{ overflowX: 'auto',
                        '&::-webkit-scrollbar': { height: 3 },
                        '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 } }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 280, overflowY: 'auto', minWidth: 480,
                        '&::-webkit-scrollbar': { width: 3 },
                        '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 } }}>
                        {history.map((run) => {
                          const ret = run.total_return_pct
                          const retColor = ret >= 0 ? '#10b981' : '#ef4444'
                          return (
                              <Box key={run.id} onClick={() => applyHistoryParams(run)}
                                  sx={{ display: 'grid', gridTemplateColumns: '60px 48px 80px 80px 70px 70px 70px 1fr',
                                    gap: 1, px: 1.5, py: 0.75, borderRadius: 1.5,
                                    background: '#0a0a0b', border: '1px solid #1f1f23',
                                    cursor: 'pointer', alignItems: 'center',
                                    '&:hover': { borderColor: '#3b82f644', background: '#3b82f608' } }}>
                                <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                                  {new Date(run.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                                </Typography>
                                <Chip label={run.symbol} size="small" sx={{ height: 16, fontSize: 9, fontWeight: 700,
                                  bgcolor: '#27272a', color: '#a1a1aa', '& .MuiChip-label': { px: 0.75 } }} />
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
                                <Typography sx={{ fontSize: 9, color: '#3b82f680', textAlign: 'right' }}>
                                  RSI {run.rsi_oversold}/{run.rsi_overbought} · {run.leverage}x · 점수{run.min_score}+
                                </Typography>
                              </Box>
                          )
                        })}
                      </Box>
                    </Box>
                  )}
                </Box>
            )}

            {/* Row 3: param form */}
            {showParams && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #1f1f23', display: 'flex', flexDirection: 'column', gap: 2 }}>

                  {/* ── 기간 + 인터벌 ── */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 100px' }, gap: 1.5 }}>
                    <Box>
                      <LabelRow label="시작일" />
                      <input type="date" value={params.startDate} style={inputStyle}
                          onChange={e => setParams(p => ({ ...p, startDate: e.target.value }))} />
                    </Box>
                    <Box>
                      <LabelRow label="종료일" />
                      <input type="date" value={params.endDate} style={inputStyle}
                          onChange={e => setParams(p => ({ ...p, endDate: e.target.value }))} />
                    </Box>
                    <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
                      <LabelRow label="캔들 단위" hintId="interval" hint={'1h = 1시간봉, 4h = 4시간봉, 1d = 일봉.\n짧을수록 거래 횟수 많고 노이즈 많음.'} />
                      <select value={params.interval} style={{ ...inputStyle, cursor: 'pointer' }}
                          onChange={e => setParams(p => ({ ...p, interval: e.target.value }))}>
                        {['1h', '4h', '1d'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </Box>
                  </Box>

                  {/* ── 전략 기본 설정 ── */}
                  <Box>
                    <Typography sx={{ ...labelSx, mb: 1, color: '#71717a' }}>전략 기본 설정</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1.5 }}>
                      <Box>
                        <LabelRow label="레버리지" hintId="leverage" hint={'"얼마나 크게 배팅하냐"\n10x면 $1,000으로 $10,000 포지션.\n높을수록 수익·손실 폭 커지고 청산 위험 증가.'} />
                        <input type="number" min={1} max={200}
                          value={draft.leverage ?? String(params.leverage)} style={inputStyle}
                          onChange={e => setDraft(d => ({ ...d, leverage: e.target.value }))} />
                      </Box>
                      <Box>
                        <LabelRow label="초기 자본금 ($)" hintId="capital" hint={'"백테스트 시작 시 가상 보유금"\n실제 투자금이 아닌 시뮬레이션용.\n수익률·MDD 계산의 기준이 됨.'} />
                        <input type="number" min={100} step={100}
                          value={draft.initialCapital ?? String(params.initialCapital)} style={inputStyle}
                          onChange={e => setDraft(d => ({ ...d, initialCapital: e.target.value }))} />
                      </Box>
                      <Box>
                        <LabelRow label="목표 수익 배율 (TP)" hintId="minRR" hint={'"손실 대비 몇 배를 목표로 잡냐"\n2.0이면 -$100 리스크 → +$200 목표.\n높을수록 익절 자리가 멀어짐.'} />
                        <input type="number" min={1} max={10} step={0.1}
                          value={draft.minRR ?? String(params.minRR)} style={inputStyle}
                          onChange={e => setDraft(d => ({ ...d, minRR: e.target.value }))} />
                      </Box>
                      <Box>
                        <LabelRow label="진입 필터 (손익비)" hintId="minRRRatio" hint={'"이 자리, 진입할 만한가?" 필터\n계산된 손익비가 이 값 미만이면 진입 포기.\n낮출수록 더 많이 진입, 높일수록 신중.'} />
                        <input type="number" min={1} max={10} step={0.1}
                          value={draft.minRRRatio ?? String(params.minRRRatio)} style={inputStyle}
                          onChange={e => setDraft(d => ({ ...d, minRRRatio: e.target.value }))} />
                      </Box>
                      <Box>
                        <LabelRow label="최소 지표 동의 수" hintId="minScore" hint={'"몇 개가 동의해야 진입하냐"\n선택한 지표 중 이 개수 이상 동의해야 실제 진입.\n높을수록 신호 적고 신중, 0이면 조건 없이 진입.'} />
                        <input type="number" min={0} max={7}
                          value={draft.minScore ?? String(params.minScore)} style={inputStyle}
                          onChange={e => setDraft(d => ({ ...d, minScore: e.target.value }))} />
                      </Box>
                    </Box>
                  </Box>

                  {/* ── 고정 익절/손절 % ── */}
                  <Box>
                    <Typography sx={{ ...labelSx, mb: 1, color: '#71717a' }}>고정 익절/손절 % <Typography component="span" sx={{ fontSize: 9, color: '#3f3f46', ml: 0.5 }}>0 = ATR 자동계산</Typography></Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '180px 180px' }, gap: 1.5 }}>
                      <Box>
                        <LabelRow label="익절 % (+N)" hintId="fixedTP" hint={'"진입가 기준 N% 오르면 무조건 익절"\n현물 기준 (레버리지 무관).\n0이면 minRR 기반 ATR 자동계산 사용.'} />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Typography sx={{ fontSize: 11, color: '#10b981', fontWeight: 700, flexShrink: 0 }}>+</Typography>
                          <input type="number" min={0} max={100} step={0.5}
                            value={draft.fixedTP ?? String(params.fixedTP)} style={inputStyle}
                            onChange={e => setDraft(d => ({ ...d, fixedTP: e.target.value }))} />
                          <Typography sx={{ fontSize: 11, color: '#52525b', flexShrink: 0 }}>%</Typography>
                        </Box>
                      </Box>
                      <Box>
                        <LabelRow label="손절 % (-M)" hintId="fixedSL" hint={'"진입가 기준 M% 내리면 무조건 손절"\n현물 기준 (레버리지 무관).\n0이면 스윙로우/ATR 자동계산 사용.'} />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Typography sx={{ fontSize: 11, color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>−</Typography>
                          <input type="number" min={0} max={100} step={0.5}
                            value={draft.fixedSL ?? String(params.fixedSL)} style={inputStyle}
                            onChange={e => setDraft(d => ({ ...d, fixedSL: e.target.value }))} />
                          <Typography sx={{ fontSize: 11, color: '#52525b', flexShrink: 0 }}>%</Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  {/* ── 지표 선택 ── */}
                  <Box>
                    <Typography sx={{ ...labelSx, mb: 1, color: '#a1a1aa' }}>지표 선택 (점수에 반영할 항목)</Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {([
                        { key: 'scoreUseADX',   label: 'ADX',   sub: '추세 강도',    hint: '"지금 추세가 있긴 한가?"\n방향 무관, 추세 강도만 측정 (0~100).\nADX > 설정값이면 점수 +1.' },
                        { key: 'scoreUseOBV',   label: 'OBV',   sub: '스마트머니',   hint: '"큰손이 사고 있냐 팔고 있냐"\n상승 마감 시 거래량 누적, 하락 시 차감.\n이동평균보다 위면 점수 +1.' },
                        { key: 'scoreUseMFI',   label: 'MFI',   sub: '자금 흐름',    hint: '"이 캔들에 돈이 얼마나 들어왔냐"\n거래량 가중 RSI (0~100).\n설정값 미만 = 아직 과열 아님 → 점수 +1.' },
                        { key: 'scoreUseMACD',  label: 'MACD',  sub: '모멘텀',       hint: '"상승 가속도가 붙고 있냐?"\n12봉-26봉 EMA 차이의 방향.\n양수(Long) / 음수(Short)면 점수 +1.' },
                        { key: 'scoreUseStoch', label: 'Stoch', sub: '스토캐스틱',   hint: '"최근 범위에서 위쪽이냐 아래쪽이냐"\n최근 N봉 고-저 박스 안에서 현재가 위치.\nLong은 상한 미만, Short는 하한 초과 시 점수 +1.' },
                        { key: 'scoreUseRSI',   label: 'RSI',   sub: 'RSI 건강구간', hint: '"얼마나 빠르게 올라왔냐"\n14봉 상승폭 vs 하락폭 비율 (0~100).\n과매도~과매수 사이 건강 구간에 있을 때 점수 +1.' },
                        { key: 'scoreUseRVOL',  label: 'RVOL',  sub: '주간 거래량',  hint: '"평소보다 많이 거래되고 있냐?"\n168봉(1주) 평균 대비 현재 거래량 비율.\n설정 배수 이상이면 점수 +1.' },
                        { key: 'scoreUseIchi',  label: '일목',  sub: '구름대 위치',   hint: '"현재 가격이 구름대(스팬A·B) 위/아래에 있냐?"\nLong: 구름 위 → 점수 +1\nShort: 구름 아래 → 점수 +1\n활성화 시 구름 이탈하면 자동 청산.' },
                      ] as { key: keyof BacktestParams; label: string; sub: string; hint: string }[]).map(({ key, label, sub, hint }) => {
                        const on = params[key] as unknown as boolean
                        return (
                          <Box key={String(key)} onClick={() => setParams(p => ({ ...p, [key]: !p[key] }))}
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.75,
                              borderRadius: 2, border: '1px solid', cursor: 'pointer', userSelect: 'none',
                              borderColor: on ? '#3b82f666' : '#27272a',
                              background: on ? '#3b82f614' : 'transparent',
                              transition: 'all 0.15s' }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                              background: on ? '#3b82f6' : '#3f3f46',
                              boxShadow: on ? '0 0 6px #3b82f6aa' : 'none' }} />
                            <Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2,
                                  color: on ? '#93c5fd' : '#71717a' }}>{label}</Typography>
                                <HintTooltip id={`pill-${String(key)}`} text={hint} />
                              </Box>
                              <Typography sx={{ fontSize: 9, color: on ? '#60a5fa88' : '#52525b' }}>{sub}</Typography>
                            </Box>
                          </Box>
                        )
                      })}
                    </Box>
                  </Box>

                  {/* ── 선택된 지표의 세부 설정 ── */}
                  {(params.scoreUseRSI || params.scoreUseADX || params.scoreUseMFI || params.scoreUseStoch || params.scoreUseRVOL) && (
                    <Box>
                      <Typography sx={{ ...labelSx, mb: 1, color: '#71717a' }}>지표 세부 설정</Typography>
                      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>

                        {/* RSI */}
                        {params.scoreUseRSI && (
                          <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid #3b82f622', background: '#3b82f608' }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', mb: 1 }}>RSI 건강 구간</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                              <Box>
                                <LabelRow label="과매도 기준 (하한)" hintId="rsiOversold" hint={'"너무 많이 내린 구간" 기준\nRSI가 이 값 미만이면 건강 구간 밖 → 점수 제외.\nLong / Short 공통 적용.'} />
                                <input type="number" min={10} max={45}
                                  value={draft.rsiOversold ?? String(params.rsiOversold)} style={inputStyle}
                                  onChange={e => setDraft(d => ({ ...d, rsiOversold: e.target.value }))} />
                              </Box>
                              <Box>
                                <LabelRow label="과매수 기준 (상한)" hintId="rsiOverbought" hint={'"너무 많이 오른 구간" 기준\nRSI가 이 값 초과이면 건강 구간 밖 → 점수 제외.\nLong / Short 공통 적용.'} />
                                <input type="number" min={55} max={90}
                                  value={draft.rsiOverbought ?? String(params.rsiOverbought)} style={inputStyle}
                                  onChange={e => setDraft(d => ({ ...d, rsiOverbought: e.target.value }))} />
                              </Box>
                            </Box>
                          </Box>
                        )}

                        {/* ADX */}
                        {params.scoreUseADX && (
                          <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid #3b82f622', background: '#3b82f608' }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', mb: 1 }}>ADX 추세 강도</Typography>
                            <Box>
                              <LabelRow label="최소 ADX 값" hintId="adxThreshold" hint={'"이 정도 추세는 있어야 한다" 기준\n20 미만 = 횡보  20~40 = 약한 추세  40+ = 강한 추세\nLong / Short 공통 적용.'} />
                              <input type="number" min={1} max={60}
                                value={draft.adxThreshold ?? String(params.adxThreshold)} style={inputStyle}
                                onChange={e => setDraft(d => ({ ...d, adxThreshold: e.target.value }))} />
                            </Box>
                          </Box>
                        )}

                        {/* MFI */}
                        {params.scoreUseMFI && (
                          <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid #3b82f622', background: '#3b82f608' }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', mb: 1 }}>MFI 자금 흐름</Typography>
                            <Box>
                              <LabelRow label="상한값 (이 값 미만)" hintId="mfiThreshold" hint={'"아직 과열 아님" 기준\nLong: MFI < 이 값 → 점수 +1\nShort: MFI < 이 값 → 점수 +1 (돈 유입 약함)'} />
                              <input type="number" min={10} max={90}
                                value={draft.mfiThreshold ?? String(params.mfiThreshold)} style={inputStyle}
                                onChange={e => setDraft(d => ({ ...d, mfiThreshold: e.target.value }))} />
                            </Box>
                          </Box>
                        )}

                        {/* Stoch */}
                        {params.scoreUseStoch && (
                          <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid #3b82f622', background: '#3b82f608' }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', mb: 1 }}>Stochastic 구간</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                              <Box>
                                <LabelRow label="과매도 (SHORT 기준)" hintId="stochOversold" hint={'"Short: 박스 바닥을 벗어났냐"\nStoch > 이 값이면 하락 이탈 아님 → 점수 +1.\n(Long에는 사용 안 함)'} />
                                <input type="number" min={0} max={50}
                                  value={draft.stochOversold ?? String(params.stochOversold)} style={inputStyle}
                                  onChange={e => setDraft(d => ({ ...d, stochOversold: e.target.value }))} />
                              </Box>
                              <Box>
                                <LabelRow label="과매수 (LONG 기준)" hintId="stochOverbought" hint={'"Long: 박스 천장에 닿지 않았냐"\nStoch < 이 값이면 아직 과열 아님 → 점수 +1.\n(Short에는 사용 안 함)'} />
                                <input type="number" min={50} max={100}
                                  value={draft.stochOverbought ?? String(params.stochOverbought)} style={inputStyle}
                                  onChange={e => setDraft(d => ({ ...d, stochOverbought: e.target.value }))} />
                              </Box>
                            </Box>
                          </Box>
                        )}

                        {/* RVOL */}
                        {params.scoreUseRVOL && (
                          <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid #3b82f622', background: '#3b82f608' }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', mb: 1 }}>RVOL 주간 거래량</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                              <Box>
                                <LabelRow label="점수 기준 (배수)" hintId="rvolThreshold" hint={'"평소보다 이 정도는 몰려야 한다"\n1.5 = 1주 평균 대비 1.5배 이상 거래됨.\nLong / Short 공통 적용.'} />
                                <input type="number" min={0.5} max={5} step={0.1}
                                  value={draft.rvolThreshold ?? String(params.rvolThreshold)} style={inputStyle}
                                  onChange={e => setDraft(d => ({ ...d, rvolThreshold: e.target.value }))} />
                              </Box>
                              <Box>
                                <LabelRow label="진입 스킵 기준" hintId="rvolSkip" hint={'"거래량이 너무 적으면 신호 자체 무시"\nRVOL < 이 값이면 지표 점수 계산 없이 스킵.\nLong / Short 공통 적용.'} />
                                <input type="number" min={0} max={1} step={0.05}
                                  value={draft.rvolSkip ?? String(params.rvolSkip)} style={inputStyle}
                                  onChange={e => setDraft(d => ({ ...d, rvolSkip: e.target.value }))} />
                              </Box>
                            </Box>
                          </Box>
                        )}

                      </Box>

                    </Box>
                  )}

                </Box>
            )}
          </CardContent>
        </Card>

        {/* ── Error ── */}
        {error && (
            <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  background: '#ef444412',
                  border: '1px solid #ef444433',
                }}
            >
              <Typography sx={{ fontSize: 12, color: '#ef4444' }}>
                {error}
              </Typography>
            </Box>
        )}

        {/* ── Summary Metrics ── */}
        {result && (
            <Card
                sx={{
                  background: '#111113',
                  border: '1px solid #27272a',
                  borderRadius: 3,
                }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 2,
                    }}
                >
                  <Box>
                    <Typography
                        sx={{
                          fontWeight: 800,
                          fontSize: 16,
                          color: '#fafafa',
                          letterSpacing: '-0.01em',
                        }}
                    >
                      {result.symbol}/USDT
                      <Typography
                          component="span"
                          sx={{ fontSize: 11, color: '#52525b', ml: 1, fontWeight: 400 }}
                      >
                        {result.interval} · {result.start_date} ~ {result.end_date}
                      </Typography>
                    </Typography>
                  </Box>
                  <Chip
                      label={`${trades.length}건 거래`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        bgcolor: '#18181b',
                        color: '#71717a',
                        border: '1px solid #27272a',
                        '& .MuiChip-label': { px: 1 },
                      }}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <MetricCard
                      label="총 수익률"
                      value={fmtPct(result.total_return_pct)}
                      sub={`$${result.initial_capital.toLocaleString()} → $${result.final_capital.toLocaleString()}`}
                      color={returnColor}
                  />
                  <MetricCard
                      label="승률"
                      value={`${result.win_rate.toFixed(1)}%`}
                      sub={`${result.winning_trades}승 ${result.losing_trades}패`}
                      color={result.win_rate >= 50 ? '#10b981' : '#ef4444'}
                  />
                  <MetricCard
                      label="최대 낙폭"
                      value={`-${result.max_drawdown_pct.toFixed(2)}%`}
                      color="#f59e0b"
                  />
                  <MetricCard
                      label="샤프 비율"
                      value={result.sharpe_ratio.toFixed(3)}
                  />
                  <MetricCard
                      label="손익 비율"
                      value={
                        result.profit_factor == null || result.profit_factor > 99
                            ? '∞'
                            : result.profit_factor.toFixed(3)
                      }
                  />
                </Box>
              </CardContent>
            </Card>
        )}

        {/* ── Chart ── */}
        {candles.length > 0 && (
            <Card
                sx={{
                  background: '#111113',
                  border: '1px solid #27272a',
                  borderRadius: 3,
                }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1.5,
                    }}
                >
                  <Typography
                      sx={{ fontWeight: 700, fontSize: 13, color: '#fafafa' }}
                  >
                    백테스트 차트
                  </Typography>
                  <Box
                      sx={{
                        display: 'flex',
                        gap: 1.5,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                  >
                    {[
                      { color: '#3b82f6', label: '롱 진입' },
                      { color: '#ef4444', label: '숏 진입' },
                      { color: '#10b981', label: '익절' },
                      { color: '#ec4899', label: '손절' },
                    ].map(({ color, label }) => (
                        <Box
                            key={label}
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                          <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: color,
                              }}
                          />
                          <Typography sx={{ fontSize: 10, color: '#71717a' }}>
                            {label}
                          </Typography>
                        </Box>
                    ))}
                  </Box>
                </Box>
                <BacktestChart
                    candles={candles}
                    trades={trades}
                    scrollToRef={scrollToRef}
                />
              </CardContent>
            </Card>
        )}

        {/* ── Trade Log ── */}
        {trades && (
            <Card
                sx={{
                  background: '#111113',
                  border: '1px solid #27272a',
                  borderRadius: 3,
                }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1.5,
                    }}
                >
                  <Typography
                      sx={{ fontWeight: 700, fontSize: 13, color: '#fafafa' }}
                  >
                    거래 내역 ({trades.length}건)
                  </Typography>
                  {loading && (
                      <CircularProgress size={12} sx={{ color: '#3b82f6' }} />
                  )}
                </Box>

                {/* Scrollable trade table */}
                <Box sx={{ overflowX: 'auto', '&::-webkit-scrollbar': { height: 3 }, '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 } }}>
                {/* Header */}
                <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '20px 36px 52px 1fr 1fr 1fr 90px',
                      gap: 1,
                      px: 1.5,
                      py: 0.75,
                      mb: 0.5,
                      minWidth: 460,
                      borderBottom: '1px solid #27272a',
                    }}
                >
                  {[
                    '#',
                    '방향',
                    '단계',
                    '진입일시/단가',
                    '청산일시/단가',
                    '시그널/청산',
                    '손익(수수료)',
                  ].map((h) => (
                      <Typography
                          key={h}
                          sx={{
                            fontSize: 9,
                            color: '#52525b',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            letterSpacing: '0.06em',
                          }}
                      >
                        {h}
                      </Typography>
                  ))}
                </Box>

                <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                      minHeight: 100,
                      maxHeight: 600,
                      minWidth: 460,
                      overflowY: 'auto',
                      pr: 0.5,
                      '&::-webkit-scrollbar': { width: 3 },
                      '&::-webkit-scrollbar-track': { background: 'transparent' },
                      '&::-webkit-scrollbar-thumb': {
                        background: '#3f3f46',
                        borderRadius: 99,
                      },
                    }}
                >
                  {trades.length > 0 ? (
                      trades.map((t, i) => (
                          <TradeRow
                              key={t.id}
                              trade={t}
                              index={i}
                              onScrollTo={handleScrollTo}
                          />
                      ))
                  ) : (
                      <Box sx={{ py: 4, textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: '#3f3f46' }}>
                          거래 데이터가 존재하지 않습니다.
                        </Typography>
                      </Box>
                  )}
                </Box>
                </Box>{/* end overflowX wrapper */}
              </CardContent>
            </Card>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && !result && (
            <Box
                sx={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', py: 8, gap: 1.5,
                }}
            >
              <Typography sx={{ fontSize: 32 }}>📊</Typography>
              <Typography sx={{ fontSize: 14, color: '#52525b', fontWeight: 600 }}>
                파라미터를 설정하고 백테스트를 실행하세요
              </Typography>
              <Typography sx={{ fontSize: 12, color: '#3f3f46', textAlign: 'center' }}>
                코인 선택 후 <strong style={{ color: '#3b82f6' }}>백테스트 실행</strong> 버튼을 누르세요
              </Typography>
            </Box>
        )}
      </Box>
  )
}
