import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import MuiTooltip from '@mui/material/Tooltip'
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
import { CRYPTO_SYMBOLS, type CryptoSymbol } from '../../constants/crypto'

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
  fed_latest_net_liquidity?: number | null
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
  signal_details: string
  exit_details?: string
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
  capital_used: number
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
                  ? (isShort ? '숏진입' : '롱진입')
                  : isShort ? '숏추가' : '롱추가',
        })
      }

      markers.push({
        time: exitTime,
        position: isShort ? 'belowBar' : 'aboveBar',
        color: win ? '#10b981' : '#ec4899',
        shape: isShort ? 'arrowUp' : 'arrowDown',
        text: `${win ? '익절' : '손절'} ${fmtPct(t.pnl_pct)}`,
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
                                          initialCapital,
                                        }: {
  trade: BacktestTrade
  index: number
  onScrollTo: (ts: string) => void
  initialCapital: number
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
          const isFirst = ei === 0
          const isLast = ei === entries.length - 1

          const exitReasonMap: Record<string, string> = {
            'TP': '목표가 달성',
            'SL': '손절가 달성',
            'TRAIL': '추적손절',
            'BELOW_TP1': '부분익절',
            'TIMEOUT': '최대 보유기간 종료',
            'LIQUIDATED': '청산',
            'SCORE_EXIT': '신호약화'
          }

          return (
              <Box
                  key={`${index}-${e.step}-${ei}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '36px 100px 100px 1.5fr 100px 80px 80px',
                    gap: 0.75,
                    px: 1.5,
                    py: 0.55,
                    background: bg,
                    alignItems: 'center',
                    borderBottom: !isLast ? '1px solid #ffffff06' : 'none',
                  }}
              >
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
                {isFirst ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2, fontSize: 8, color: '#64748b' }}>
                        <Typography sx={{ fontSize: 10, color: '#ffffff' }}>
                          목표: {fmtPrice(trade.tp)}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: '#ffffff' }}>
                          손절: {fmtPrice(trade.sl)}
                        </Typography>
                      </Box>
                    </Box>
                ) : (
                    <Box/>
                )}

                {/* 시그널 — 첫 행만 */}
                {isFirst ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                      {/* 진입 이유 */}
                      {trade.signal_details && (
                        <Typography sx={{ fontSize: 8, color: '#f59e0b', fontFamily: 'monospace', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal' }}>
                          진입: {trade.signal_details}
                        </Typography>
                      )}

                      {/* 매도 이유 (새로운 행) */}
                      <Typography sx={{ fontSize: 9, color: win ? '#10b981' : '#ec4899', lineHeight: 1.3 }}>
                        매도: {exitReasonMap[trade.exit_reason]}
                        {trade.exit_reason === 'TP' && ` : $${trade.tp?.toFixed(2)}`}
                        {trade.exit_reason === 'SL' && ` : $${trade.sl?.toFixed(2)}`}
                        {trade.exit_reason === 'TRAIL' && ` : $${trade.exit_price?.toFixed(2)}`}
                        {trade.exit_reason === 'BELOW_TP1' && ` : $${trade.exit_price?.toFixed(2)}`}
                        {trade.exit_reason === 'DATA_END' && ` : $${trade.exit_price?.toFixed(2)}`}
                        {trade.exit_reason === 'TIMEOUT' && ` : $${trade.exit_price?.toFixed(2)}`}
                        {trade.exit_reason === 'LIQUIDATED' && ` : $${trade.entry_price?.toFixed(2)}, 청산가: $${trade.exit_price?.toFixed(2)}`}
                        {!['TP', 'SL', 'TRAIL', 'BELOW_TP1', 'DATA_END', 'TIMEOUT', 'LIQUIDATED'].includes(trade.exit_reason) && ` ${trade.exit_reason} : $${trade.exit_price?.toFixed(2)}`}
                      </Typography>

                      {/* SCORE_EXIT 상세 정보 (세 번째 행) */}
                      {trade.exit_reason === 'SCORE_EXIT' && trade.exit_details && (
                        <Typography sx={{ fontSize: 8, color: '#ec4899', fontFamily: 'monospace', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal' }}>
                          {trade.exit_details}
                        </Typography>
                      )}
                    </Box>
                ) : (
                    <Box />
                )}

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
                      {trade.capital_used > 0 && initialCapital > 0 && (
                          <Typography
                              sx={{
                                fontSize: 8,
                                color: '#3b82f6',
                                fontFamily: 'monospace',
                                opacity: 0.7,
                              }}
                          >
                          </Typography>
                      )}
                    </Box>
                ) : (
                    <Box />
                )}

                {/* 수수료 — 첫 행만 */}
                {isFirst ? (
                    <Box sx={{ textAlign: 'right' }}>
                      {trade.commission != null && trade.commission > 0 ? (
                          <Typography
                              sx={{
                                fontSize: 9,
                                color: '#dc2626',
                                fontFamily: 'monospace',
                                fontWeight: 600,
                              }}
                          >
                            -${trade.commission.toFixed(2)}
                          </Typography>
                      ) : (
                          <Typography sx={{ fontSize: 9, color: '#52525b' }}>-</Typography>
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
  rsi_oversold: number
  rsi_overbought: number
  min_score: number
  initial_capital: number
  score_use_adx: boolean
  score_use_rsi: boolean
  score_use_macd: boolean
  score_use_rvol: boolean
  adx_threshold: number
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

  // 인풋 표시용 문자열 상태 — 편집 중 빈 값/소수점 등을 자유롭게 허용
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

  const runBacktest = useCallback(async () => {
    // 실행 시점에 draft 문자열을 숫자로 커밋
    const committed = {
      leverage:       parseFloat(draft.leverage)       || params.leverage,
      minRR:          parseFloat(draft.minRR)          || params.minRR,
      rsiOversold:    parseFloat(draft.rsiOversold)    || params.rsiOversold,
      rsiOverbought:  parseFloat(draft.rsiOverbought)  || params.rsiOverbought,
      minScore:       isNaN(parseFloat(draft.minScore)) ? params.minScore : parseFloat(draft.minScore),
      initialCapital: parseFloat(draft.initialCapital) || params.initialCapital,
      adxThreshold:   parseFloat(draft.adxThreshold)   || params.adxThreshold,
      rvolThreshold:  parseFloat(draft.rvolThreshold)  || params.rvolThreshold,
      rvolSkip:             parseFloat(draft.rvolSkip)             || params.rvolSkip,
      fedLiquidityMAPeriod: parseInt(draft.fedLiquidityMAPeriod)   || params.fedLiquidityMAPeriod,
      fixedTP:        parseFloat(draft.fixedTP)        || 0,
      fixedSL:        parseFloat(draft.fixedSL)        || 0,
      scoreExitThreshold: parseFloat(draft.scoreExitThreshold) || 0,
      tpslMode:       params.tpslMode,
      useDailyTrend:  params.useDailyTrend,
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
          // 진입/청산 순서 검증: entry_ts > exit_ts면 스왑 (데이터 버그 방지)
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

      // DB 저장은 백테스트 결과와 독립적으로 처리 (실패해도 결과는 표시)
      try {
        // match용 핵심 파라미터 (중복 감지)
        const matchFilter = {
          symbol: selectedSymbol,
          interval: params.interval,
          start_date: params.startDate,
          end_date: params.endDate,
          leverage: committed.leverage,
          min_rr: committed.minRR,
          rsi_oversold: committed.rsiOversold,
          rsi_overbought: committed.rsiOverbought,
          min_score: committed.minScore,
          initial_capital: committed.initialCapital,
          score_use_adx: params.scoreUseADX,
          score_use_rsi: params.scoreUseRSI,
          score_use_macd: params.scoreUseMACD,
          score_use_rvol: params.scoreUseRVOL,
          adx_threshold: committed.adxThreshold,
          rvol_threshold: committed.rvolThreshold,
          rvol_skip: committed.rvolSkip,
        }
        // insert용 전체 파라미터 (신규 컬럼 포함)
        const insertPayload = {
          ...matchFilter,
          score_use_bb: params.scoreUseBB,
          score_use_ichi: params.scoreUseIchi,
          score_use_golden_cross: params.scoreUseGoldenCross,
          score_use_fed_liquidity: params.scoreUseFedLiquidity,
          fed_liquidity_ma_period: params.fedLiquidityMAPeriod,
          fixed_tp: committed.fixedTP,
          fixed_sl: committed.fixedSL,
          score_exit_threshold: committed.scoreExitThreshold,
          use_daily_trend: params.useDailyTrend,
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
          .match(matchFilter)
          .limit(1)

        if (existing && existing.length > 0) {
          await supabase.from('backtest_runs')
            .update({ ...insertPayload, ...resultPayload, created_at: new Date().toISOString() })
            .eq('id', existing[0].id)
        } else {
          await supabase.from('backtest_runs').insert({ ...insertPayload, ...resultPayload })
        }
        loadHistory()
      } catch (dbErr) {
        console.warn('[backtest] DB 저장 실패 (백테스트 결과에는 영향 없음):', dbErr)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }, [selectedSymbol, params, draft])

  const applyBestParams = useCallback((runs: RunHistory[]) => {
    if (runs.length === 0) return
    const best = runs.reduce((a, b) =>
      (a.total_return_pct ?? -Infinity) >= (b.total_return_pct ?? -Infinity) ? a : b
    )
    setSelectedSymbol(best.symbol as CryptoSymbol)
    setParams(p => ({
      ...p,
      interval: best.interval,
      leverage: best.leverage,
      minRR: best.min_rr,
      rsiOversold: best.rsi_oversold ?? 35,
      rsiOverbought: best.rsi_overbought ?? 65,
      minScore: best.min_score,
      initialCapital: best.initial_capital ?? p.initialCapital,
      scoreUseADX:  best.score_use_adx  ?? true,
      scoreUseRSI:  best.score_use_rsi  ?? true,
      scoreUseMACD: best.score_use_macd ?? true,
      scoreUseRVOL: best.score_use_rvol ?? true,
      adxThreshold:    best.adx_threshold    ?? 20,
      rvolThreshold:   best.rvol_threshold   ?? 1.5,
      rvolSkip:        best.rvol_skip        ?? 0.4,
      scoreUseBB:      (best as any).score_use_bb ?? false,
      scoreUseIchi:    (best as any).score_use_ichi ?? false,
      scoreUseGoldenCross: (best as any).score_use_golden_cross ?? true,
      scoreUseFedLiquidity: (best as any).score_use_fed_liquidity ?? false,
      fedLiquidityMAPeriod: (best as any).fed_liquidity_ma_period ?? 13,
      fixedTP:         (best as any).fixed_tp ?? 0,
      fixedSL:         (best as any).fixed_sl ?? 0,
      scoreExitThreshold: (best as any).score_exit_threshold ?? 0,
      useDailyTrend:   (best as any).use_daily_trend ?? false,
      // 날짜는 유지 (현재 선택된 날짜 사용)
    }))
    setDraft(d => ({
      ...d,
      leverage: String(best.leverage),
      minRR: String(best.min_rr),
      rsiOversold: String(best.rsi_oversold ?? 35),
      rsiOverbought: String(best.rsi_overbought ?? 65),
      minScore: String(best.min_score),
      initialCapital: String(best.initial_capital ?? 10000),
      adxThreshold: String(best.adx_threshold ?? 20),
      rvolThreshold: String(best.rvol_threshold ?? 1.5),
      rvolSkip: String(best.rvol_skip ?? 0.4),
      fixedTP: String((best as any).fixed_tp ?? 0),
      fixedSL: String((best as any).fixed_sl ?? 0),
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
      startDate: run.start_date,
      endDate: run.end_date,
      interval: run.interval,
      leverage: run.leverage,
      minRR: run.min_rr,
      rsiOversold: run.rsi_oversold ?? 35,
      rsiOverbought: run.rsi_overbought ?? 65,
      minScore: run.min_score,
      initialCapital: run.initial_capital ?? p.initialCapital,
      scoreUseADX:  run.score_use_adx  ?? true,
      scoreUseRSI:  run.score_use_rsi  ?? true,
      scoreUseMACD: run.score_use_macd ?? true,
      scoreUseRVOL: run.score_use_rvol ?? true,
      scoreUseBB:   (run as any).score_use_bb ?? false,
      scoreUseIchi: (run as any).score_use_ichi ?? false,
      scoreUseGoldenCross: (run as any).score_use_golden_cross ?? true,
      scoreUseFedLiquidity: (run as any).score_use_fed_liquidity ?? false,
      fedLiquidityMAPeriod: (run as any).fed_liquidity_ma_period ?? 13,
      adxThreshold:    run.adx_threshold    ?? 20,
      rvolThreshold:   run.rvol_threshold   ?? 1.5,
      rvolSkip:        run.rvol_skip        ?? 0.4,
      fixedTP:         (run as any).fixed_tp ?? 0,
      fixedSL:         (run as any).fixed_sl ?? 0,
      scoreExitThreshold: (run as any).score_exit_threshold ?? 0,
      useDailyTrend:   (run as any).use_daily_trend ?? false,
    }))
    setDraft({
      leverage: String(run.leverage),
      minRR: String(run.min_rr),
      rsiOversold: String(run.rsi_oversold ?? 35),
      rsiOverbought: String(run.rsi_overbought ?? 65),
      minScore: String(run.min_score),
      initialCapital: String(run.initial_capital ?? 10000),
      adxThreshold: String(run.adx_threshold ?? 20),
      rvolThreshold: String(run.rvol_threshold ?? 1.5),
      rvolSkip: String(run.rvol_skip ?? 0.4),
      fixedTP: String((run as any).fixed_tp ?? 0),
      fixedSL: String((run as any).fixed_sl ?? 0),
      scoreExitThreshold: String((run as any).score_exit_threshold ?? 0),
    })
    setShowHistory(false)
    setShowParams(true)
  }

  const returnColor = result
      ? result.total_return_pct >= 0
          ? '#10b981'
          : '#ef4444'
      : '#fafafa'

  const HintTooltip = ({ id: _id, text }: { id: string; text: string }) => (
    <MuiTooltip
      placement="top"
      arrow
      title={<Typography sx={{ fontSize: 11, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{text}</Typography>}
      componentsProps={{
        tooltip: { sx: { bgcolor: '#18181b', border: '1px solid #52525b', borderRadius: 2, p: 1.5, maxWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' } },
        arrow:   { sx: { color: '#52525b' } },
      }}>
      <Box component="span" onClick={e => e.stopPropagation()}
        sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%', border: '1px solid #3f3f46',
          color: '#71717a', fontSize: 8, fontWeight: 700, cursor: 'help', flexShrink: 0,
          userSelect: 'none', '&:hover': { borderColor: '#a1a1aa', color: '#d4d4d8' } }}>?</Box>
    </MuiTooltip>
  )

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
      <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
        {/* ── Controls ── */}
        <Card sx={{background: '#111113', border: '1px solid #27272a', borderRadius: 3}}>
          <CardContent sx={{p: 2, '&:last-child': {pb: 2}}}>
            {/* Row 1: symbol + run */}
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap'}}>
              <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                <Typography sx={{fontSize: 12, color: '#71717a', fontWeight: 600}}>코인</Typography>
                <Box sx={{display: 'flex', gap: 0.75}}>
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
                            '&:hover': {borderColor: '#3b82f666', color: '#a1a1aa'},
                          }}
                      >{sym}</Box>
                  ))}
                </Box>
              </Box>
              <Box sx={{ml: {xs: 0, sm: 'auto'}, display: 'flex', gap: 1, flexWrap: 'wrap'}}>
                <Box
                    component="button"
                    onClick={() => {
                      setShowHistory(v => !v);
                      setShowParams(false)
                    }}
                    sx={{
                      px: 2, py: 0.75, borderRadius: 2, border: '1px solid #27272a',
                      background: showHistory ? '#27272a' : 'transparent',
                      color: showHistory ? '#a1a1aa' : '#71717a', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      '&:hover': {borderColor: '#52525b', color: '#a1a1aa'},
                    }}
                >
                  이력 {history.length > 0 && `(${history.length})`}
                </Box>
                <Box
                    component="button"
                    onClick={() => {
                      setShowParams((v) => !v);
                      setShowHistory(false)
                    }}
                    sx={{
                      px: 2, py: 0.75, borderRadius: 2, border: '1px solid #27272a',
                      background: showParams ? '#27272a' : 'transparent',
                      color: '#71717a', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      '&:hover': {borderColor: '#52525b', color: '#a1a1aa'},
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
                      '&:hover:not(:disabled)': {background: '#3b82f630', borderColor: '#3b82f6'},
                    }}
                >
                  {loading && <CircularProgress size={10} sx={{color: '#3b82f6'}}/>}
                  {loading ? '실행 중...' : '백테스트 실행'}
                </Box>
              </Box>
            </Box>

            {/* Row 2: history */}
            {showHistory && (
                <Box sx={{mt: 2, pt: 2, borderTop: '1px solid #1f1f23'}}>
                  {history.length === 0 ? (
                      <Typography sx={{fontSize: 12, color: '#3f3f46', textAlign: 'center', py: 2}}>
                        아직 실행 이력이 없어요
                      </Typography>
                  ) : (
                      <Box sx={{
                        overflowX: 'auto',
                        '&::-webkit-scrollbar': {height: 3},
                        '&::-webkit-scrollbar-thumb': {background: '#3f3f46', borderRadius: 99}
                      }}>
                        <Box sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.5,
                          maxHeight: 280,
                          overflowY: 'auto',
                          minWidth: 480,
                          '&::-webkit-scrollbar': {width: 3},
                          '&::-webkit-scrollbar-thumb': {background: '#3f3f46', borderRadius: 99}
                        }}>
                          {history.map((run) => {
                            const ret = run.total_return_pct
                            const retColor = ret >= 0 ? '#10b981' : '#ef4444'
                            return (
                                <Box key={run.id} onClick={() => applyHistoryParams(run)}
                                     sx={{
                                       display: 'grid', gridTemplateColumns: '60px 48px 80px 80px 70px 70px 70px 1fr',
                                       gap: 1, px: 1.5, py: 0.75, borderRadius: 1.5,
                                       background: '#0a0a0b', border: '1px solid #1f1f23',
                                       cursor: 'pointer', alignItems: 'center',
                                       '&:hover': {borderColor: '#3b82f644', background: '#3b82f608'}
                                     }}>
                                  <Typography sx={{fontSize: 9, color: '#52525b', fontFamily: 'monospace'}}>
                                    {new Date(run.created_at).toLocaleDateString('ko-KR', {
                                      month: '2-digit',
                                      day: '2-digit'
                                    })}
                                  </Typography>
                                  <Chip label={run.symbol} size="small" sx={{
                                    height: 16, fontSize: 9, fontWeight: 700,
                                    bgcolor: '#27272a', color: '#a1a1aa', '& .MuiChip-label': {px: 0.75}
                                  }}/>
                                  <Typography sx={{fontSize: 9, color: '#52525b', fontFamily: 'monospace'}}>
                                    {run.start_date} ~
                                  </Typography>
                                  <Typography
                                      sx={{fontSize: 9, color: retColor, fontFamily: 'monospace', fontWeight: 700}}>
                                    {ret >= 0 ? '+' : ''}{ret?.toFixed(1)}%
                                  </Typography>
                                  <Typography sx={{fontSize: 9, color: '#71717a', fontFamily: 'monospace'}}>
                                    승률 {run.win_rate?.toFixed(0)}%
                                  </Typography>
                                  <Typography sx={{fontSize: 9, color: '#71717a', fontFamily: 'monospace'}}>
                                    MDD -{run.max_drawdown_pct?.toFixed(1)}%
                                  </Typography>
                                  <Typography sx={{fontSize: 9, color: '#52525b', fontFamily: 'monospace'}}>
                                    {run.total_trades}건 · {run.interval}
                                  </Typography>
                                  <Typography sx={{fontSize: 9, color: '#3b82f680', textAlign: 'right'}}>
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
                <Box sx={{
                  mt: 2,
                  pt: 2,
                  borderTop: '1px solid #1f1f23',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}>

                  {/* ── 기간 + 인터벌 ── */}
                  <Box sx={{display: 'grid', gridTemplateColumns: {xs: '1fr 1fr', sm: '1fr 1fr 100px'}, gap: 1.5}}>
                    <Box>
                      <LabelRow label="시작일"/>
                      <input type="date" value={params.startDate} style={inputStyle}
                             onChange={e => setParams(p => ({...p, startDate: e.target.value}))}/>
                    </Box>
                    <Box>
                      <LabelRow label="종료일"/>
                      <input type="date" value={params.endDate} style={inputStyle}
                             onChange={e => setParams(p => ({...p, endDate: e.target.value}))}/>
                    </Box>
                    <Box sx={{gridColumn: {xs: '1 / -1', sm: 'auto'}}}>
                      <LabelRow label="캔들 단위" hintId="interval"
                                hint={'1h = 1시간봉, 4h = 4시간봉, 1d = 일봉.\n짧을수록 거래 횟수 많고 노이즈 많음.'}/>
                      <select value={params.interval} style={{...inputStyle, cursor: 'pointer'}}
                              onChange={e => setParams(p => ({...p, interval: e.target.value}))}>
                        {['15m', '30m', '1h', '4h', '1d'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </Box>
                  </Box>

                  {/* ── 전략 기본 설정 ── */}
                  <Box>
                    <Typography sx={{...labelSx, mb: 1, color: '#71717a'}}>전략 기본 설정</Typography>
                    <Box sx={{
                      display: 'grid',
                      gridTemplateColumns: {xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)'},
                      gap: 1.5
                    }}>
                      <Box>
                        <LabelRow label="레버리지" hintId="leverage"
                                  hint={'"얼마나 크게 배팅하냐"\n10x면 $1,000으로 $10,000 포지션.\n높을수록 수익·손실 폭 커지고 청산 위험 증가.'}/>
                        <input type="number" min={1} max={200}
                               value={draft.leverage ?? String(params.leverage)} style={inputStyle}
                               onChange={e => setDraft(d => ({...d, leverage: e.target.value}))}/>
                      </Box>
                      <Box>
                        <LabelRow label="초기 자본금 ($)" hintId="capital"
                                  hint={'"백테스트 시작 시 가상 보유금"\n실제 투자금이 아닌 시뮬레이션용.\n수익률·MDD 계산의 기준이 됨.'}/>
                        <input type="number" min={100} step={100}
                               value={draft.initialCapital ?? String(params.initialCapital)} style={inputStyle}
                               onChange={e => setDraft(d => ({...d, initialCapital: e.target.value}))}/>
                      </Box>
                    </Box>
                  </Box>

                  {/* ── TP/SL 모드 선택 ── */}
                  <Box>
                    <Typography sx={{...labelSx, mb: 1, color: '#a1a1aa'}}>TP / SL 설정</Typography>
                    <Box sx={{display: 'grid', gridTemplateColumns: {xs: '1fr 1fr', sm: '180px 180px'}, gap: 1.5}}>
                      <Box>
                        <LabelRow label="익절 % (+N)" hintId="fixedTP"
                                  hint={'"진입가 기준 N% 오르면 무조건 익절"\n현물 기준 (레버리지 무관).\nRR 필터 없이 무조건 해당 %로 익절.'}/>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75}}>
                          <Typography
                              sx={{fontSize: 11, color: '#10b981', fontWeight: 700, flexShrink: 0}}>+</Typography>
                          <input type="number" min={0.1} max={100} step={0.5}
                                 value={draft.fixedTP ?? String(params.fixedTP)} style={inputStyle}
                                 onChange={e => setDraft(d => ({...d, fixedTP: e.target.value}))}/>
                          <Typography sx={{fontSize: 11, color: '#52525b', flexShrink: 0}}>%</Typography>
                        </Box>
                      </Box>
                      <Box>
                        <LabelRow label="손절 % (-M)" hintId="fixedSL"
                                  hint={'"진입가 기준 M% 내리면 무조건 손절"\n현물 기준 (레버리지 무관).\nRR 필터 없이 무조건 해당 %로 손절.'}/>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75}}>
                          <Typography
                              sx={{fontSize: 11, color: '#ef4444', fontWeight: 700, flexShrink: 0}}>−</Typography>
                          <input type="number" min={0.1} max={100} step={0.5}
                                 value={draft.fixedSL ?? String(params.fixedSL)} style={inputStyle}
                                 onChange={e => setDraft(d => ({...d, fixedSL: e.target.value}))}/>
                          <Typography sx={{fontSize: 11, color: '#52525b', flexShrink: 0}}>%</Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  {/* ── MTF 일봉 추세 필터 ── */}
                  <Box sx={{
                    p: 1.5, borderRadius: 2, border: '1px solid',
                    borderColor: params.useDailyTrend ? '#f59e0b44' : '#27272a',
                    background: params.useDailyTrend ? '#f59e0b08' : 'transparent',
                    cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s'
                  }}
                       onClick={() => setParams(p => ({...p, useDailyTrend: !p.useDailyTrend}))}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                      <Box sx={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: params.useDailyTrend ? '#f59e0b' : '#3f3f46',
                        boxShadow: params.useDailyTrend ? '0 0 8px #f59e0baa' : 'none'
                      }}/>
                      <Box sx={{flex: 1}}>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75}}>
                          <Typography sx={{
                            fontSize: 12, fontWeight: 700,
                            color: params.useDailyTrend ? '#fcd34d' : '#71717a'
                          }}>
                            일봉 추세 필터 (MTF)
                          </Typography>
                          <HintTooltip id="useDailyTrend"
                                       text={'"거시 방향과 맞는 진입만 허용"\n일봉 MA120 기준: 일봉 종가 > MA120이면 롱만, < MA120이면 숏만 허용.\n1d 인터벌에서는 자동으로 비활성화.'}/>
                        </Box>
                        <Typography
                            sx={{fontSize: 10, color: params.useDailyTrend ? '#f59e0b88' : '#52525b', mt: 0.25}}>
                          일봉 MA120 방향과 일치하는 신호만 진입 · 캔들 단위가 1d면 무효
                        </Typography>
                      </Box>
                      <Typography sx={{
                        fontSize: 10, fontWeight: 700,
                        color: params.useDailyTrend ? '#fcd34d' : '#3f3f46'
                      }}>
                        {params.useDailyTrend ? 'ON' : 'OFF'}
                      </Typography>
                    </Box>
                  </Box>

                  {/* ── 매수 기준 점수 + 지표 선택 ── */}
                  {(() => {
                    const smInput: React.CSSProperties = {
                      ...inputStyle,
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 11,
                      padding: '3px 6px'
                    }
                    const indicatorList = [
                      {
                        key: 'scoreUseADX', label: 'ADX', sub: '추세 강도 필터',
                        hint: '"지금 추세가 있긴 한가?"\n방향 무관, 추세 강도만 측정 (0~100).\n\n✅ ADX > 설정값 → +1 (추세 존재)\n⛔ ADX ≤ 설정값 → 가감점 없음 (횡보)\n\n💡 20 미만 = 횡보(추세 없음)\n💡 20~40 = 약한 추세\n💡 40 이상 = 강한 추세',
                        desc: '추세 방향(롱/숏)은 무관하고 "추세가 존재하는가"만 판단. 횡보장에서 불필요한 진입을 막아줌.',
                        settings: (
                            <Box sx={{display: 'grid', gridTemplateColumns: '1fr', gap: 0.5}}>
                              <Typography sx={{fontSize: 9, color: '#60a5fa99'}}>최소 ADX 값 <Typography component="span"
                                                                                                      sx={{
                                                                                                        fontSize: 8,
                                                                                                        color: '#52525b'
                                                                                                      }}>(20미만=횡보,
                                20~40=약한추세)</Typography></Typography>
                              <input type="number" min={1} max={60}
                                     value={draft.adxThreshold ?? String(params.adxThreshold)} style={smInput}
                                     onChange={e => setDraft(d => ({...d, adxThreshold: e.target.value}))}/>
                            </Box>
                        ),
                        svg: (() => {
                          const v = Number(draft.adxThreshold ?? params.adxThreshold) || 25
                          const thY = 4 + (1 - v / 100) * 34
                          return (
                              <svg viewBox="0 0 72 42" style={{width: '100%', height: '100%'}}
                                   preserveAspectRatio="xMidYMid meet">
                                <rect x="4" y="4" width="64" height={thY - 4} fill="#10b98108" rx="1"/>
                                <rect x="4" y={thY} width="64" height={38 - thY} fill="#ef444408" rx="1"/>
                                <line x1="4" y1={thY} x2="68" y2={thY} stroke="#f59e0b88" strokeWidth="0.8"
                                      strokeDasharray="3,2"/>
                                <text x="56" y={thY - 1.5} fill="#f59e0b" fontSize="3.5">{v}</text>
                                <text x="8" y={thY - 2} fill="#10b981" fontSize="3" opacity="0.8">롱숏 +1</text>
                                <text x="8" y={thY + 5} fill="#71717a" fontSize="3" opacity="0.6">가감점 없음</text>
                                <polyline
                                    points="4,22 8,20 12,23 16,21 20,24 24,21 28,22 34,19 40,15 48,11 56,8 64,6 68,5"
                                    fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
                                <polyline points="4,30 10,30 18,29 26,27 32,23 40,17 50,12 60,9 68,8"
                                          fill="none" stroke="#f59e0b" strokeWidth="1.5"/>
                                <circle cx="32" cy="23" r="2.5" fill="#10b981" opacity="0.9"/>
                              </svg>
                          )
                        })(),
                      },
                      {
                        key: 'scoreUseRSI', label: 'RSI', sub: '과열/침체 필터',
                        hint: '"지금 과열이냐 침체냐?"\n14봉 동안 상승폭 vs 하락폭 비율 (0~100).\n\n✅ 하한 이하 → 롱 +1 (과매도, 반등 신호)\n⛔ 점수 없음 (사이 범위)\n✅ 상한 이상 → 숏 +1 (과매수, 하락 신호)\n\n💡 기본값: 35~65 (온건) / 30~70 (적극) / 20~80 (공격적)\n💡 범위가 좁을수록 극단적 신호만 포착, 넓을수록 넓은 신호 포착',
                        desc: '과매도 구간에서 롱 진입, 과매수 구간에서 숏 진입. 중립 구간에는 점수 없음.',
                        settings: (
                            <Box sx={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75}}>
                              <Box>
                                <Typography sx={{fontSize: 9, color: '#60a5fa99', mb: 0.5}}>하한 <Typography
                                    component="span"
                                    sx={{fontSize: 8, color: '#52525b'}}>(과매도)</Typography></Typography>
                                <input type="number" min={10} max={45}
                                       value={draft.rsiOversold ?? String(params.rsiOversold)} style={smInput}
                                       onChange={e => setDraft(d => ({...d, rsiOversold: e.target.value}))}/>
                              </Box>
                              <Box>
                                <Typography sx={{fontSize: 9, color: '#60a5fa99', mb: 0.5}}>상한 <Typography
                                    component="span"
                                    sx={{fontSize: 8, color: '#52525b'}}>(과매수)</Typography></Typography>
                                <input type="number" min={55} max={90}
                                       value={draft.rsiOverbought ?? String(params.rsiOverbought)} style={smInput}
                                       onChange={e => setDraft(d => ({...d, rsiOverbought: e.target.value}))}/>
                              </Box>
                            </Box>
                        ),
                        svg: (() => {
                          const os = Number(draft.rsiOversold ?? params.rsiOversold) || 35
                          const ob = Number(draft.rsiOverbought ?? params.rsiOverbought) || 65
                          const osY = 4 + (1 - os / 100) * 34
                          const obY = 4 + (1 - ob / 100) * 34
                          return (
                              <svg viewBox="0 0 72 42" style={{width: '100%', height: '100%'}}
                                   preserveAspectRatio="xMidYMid meet">
                                <rect x="4" y="4" width="64" height={osY - 4} fill="#10b98118" rx="1"/>
                                <rect x="4" y={osY} width="64" height={obY - osY} fill="#52525b18" rx="1"/>
                                <rect x="4" y={obY} width="64" height={38 - obY} fill="#ef444418" rx="1"/>
                                <line x1="4" y1={osY} x2="68" y2={osY} stroke="#10b98155" strokeWidth="0.7"
                                      strokeDasharray="3,2"/>
                                <text x="56" y={osY - 1.5} fill="#10b981" fontSize="3.5">{os}</text>
                                <line x1="4" y1={obY} x2="68" y2={obY} stroke="#ef444455" strokeWidth="0.7"
                                      strokeDasharray="3,2"/>
                                <text x="56" y={obY + 4} fill="#ef4444" fontSize="3.5">{ob}</text>
                                <text x="8" y="8" fill="#10b981" fontSize="3" opacity="0.8">롱 +1 (반등)</text>
                                <text x="8" y={(osY + obY) / 2} fill="#52525b" fontSize="3" opacity="0.6">점수 없음</text>
                                <text x="8" y="37" fill="#ef4444" fontSize="3" opacity="0.6">숏 +1 (하락)</text>
                                <path d="M4,10 C12,12 18,15 26,18 C34,20 42,20 50,15 C58,10 64,8 68,6"
                                      fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.7"/>
                                <circle cx="26" cy="18" r="2.5" fill="#10b981" opacity="0.9"/>
                                <circle cx="50" cy="15" r="2.5" fill="#ef4444" opacity="0.9"/>
                              </svg>
                          )
                        })(),
                      },
                      {
                        key: 'scoreUseMACD', label: 'MACD', sub: '추세 모멘텀',
                        hint: '"상승/하락 가속도가 붙고 있냐?"\n단기(12봉) EMA - 장기(26봉) EMA = MACD선.\n\n✅ 히스토그램 > 0 → 롱 +1 / ⛔ 숏 -1 (상승 모멘텀)\n✅ 히스토그램 < 0 → 숏 +1 / ⛔ 롱 -1 (하락 모멘텀)\n\n💡 막대가 점점 커지면 → 추세 가속 중\n💡 막대가 줄어들면 → 추세 약화, 전환 임박',
                        desc: '단기-장기 이평선 차이로 "추세의 가속도"를 측정. 0선 돌파가 핵심 신호.',
                        settings: null,
                        svg: (
                            <svg viewBox="0 0 72 42" style={{width: '100%', height: '100%'}}
                                 preserveAspectRatio="xMidYMid meet">
                              <line x1="4" y1="21" x2="68" y2="21" stroke="#52525b" strokeWidth="0.6"/>
                              <text x="62" y="19" fill="#52525b" fontSize="3">0</text>
                              <text x="34" y="8" fill="#10b981" fontSize="3" opacity="0.8">롱 +1 / 숏 -1</text>
                              <text x="6" y="38" fill="#ef4444" fontSize="3" opacity="0.8">숏 +1 / 롱 -1</text>
                              {[8, 14, 20].map((x, i) => {
                                const h = [6, 8, 5][i]
                                return <rect key={x} x={x - 3} y={21} width={6} height={h} fill="#ef444466" rx="0.5"/>
                              })}
                              {[30, 38, 46, 54, 62].map((x, i) => {
                                const h = [3, 6, 9, 7, 5][i]
                                return <rect key={x} x={x - 3} y={21 - h} width={6} height={h} fill="currentColor"
                                             rx="0.5" opacity={0.85}/>
                              })}
                              <circle cx="28" cy="21" r="2.5" fill="#10b981" opacity="0.9"/>
                            </svg>
                        ),
                      },
                      {
                        key: 'scoreUseRVOL', label: 'RVOL', sub: '거래량 급등 감지',
                        hint: '"평소보다 거래가 활발한가?"\n최근 1주(168봉) 평균 거래량 대비 현재 거래량 비율.\n설정 배수(기본 1.5x) 이상이면 점수 +1.\n\n💡 1.5x = 평소의 1.5배 이상 거래 → 관심 급증\n💡 스킵 기준 이하 = 거래량 너무 적어 무시\n💡 거래량 급등 = 세력/기관 개입 가능성',
                        desc: '1주 평균 대비 거래량 폭증 여부 감지. 거래량 없는 가짜 움직임을 걸러냄.',
                        settings: (
                            <Box sx={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75}}>
                              <Box>
                                <Typography sx={{fontSize: 9, color: '#60a5fa99', mb: 0.5}}>점수 기준 <Typography
                                    component="span" sx={{fontSize: 8, color: '#52525b'}}>(배수)</Typography></Typography>
                                <input type="number" min={0.5} max={5} step={0.1}
                                       value={draft.rvolThreshold ?? String(params.rvolThreshold)} style={smInput}
                                       onChange={e => setDraft(d => ({...d, rvolThreshold: e.target.value}))}/>
                              </Box>
                              <Box>
                                <Typography sx={{fontSize: 9, color: '#60a5fa99', mb: 0.5}}>스킵 기준 <Typography
                                    component="span" sx={{fontSize: 8, color: '#52525b'}}>(이하
                                  무시)</Typography></Typography>
                                <input type="number" min={0} max={1} step={0.05}
                                       value={draft.rvolSkip ?? String(params.rvolSkip)} style={smInput}
                                       onChange={e => setDraft(d => ({...d, rvolSkip: e.target.value}))}/>
                              </Box>
                            </Box>
                        ),
                        svg: (() => {
                          const rv = Number(draft.rvolThreshold ?? params.rvolThreshold) || 1.5
                          const sk = Number(draft.rvolSkip ?? params.rvolSkip) || 0.4
                          const avgH = 12
                          const spikeH = Math.min(avgH * rv, 28)
                          const skipH = Math.max(avgH * sk, 2)
                          const avgY = 34 - avgH
                          const skipY = 34 - skipH
                          return (
                              <svg viewBox="0 0 72 42" style={{width: '100%', height: '100%'}}
                                   preserveAspectRatio="xMidYMid meet">
                                <rect x="4" y={skipY} width="64" height={34 - skipY} fill="#ef444406" rx="1"/>
                                <line x1="4" y1="34" x2="68" y2="34" stroke="#3f3f46" strokeWidth="0.5"/>
                                {[8, 16, 24, 32, 40, 56, 64].map((x, i) => {
                                  const h = [9, 7, 10, 8, 6, 11, 8][i]
                                  return <rect key={x} x={x - 4} y={34 - h} width={8} height={h} fill="#52525b"
                                               opacity={0.6} rx="0.5"/>
                                })}
                                <rect x="44" y={34 - spikeH} width="8" height={spikeH} fill="currentColor"
                                      opacity={0.85} rx="0.5"/>
                                <line x1="4" y1={avgY} x2="68" y2={avgY} stroke="#f59e0b55" strokeWidth="0.8"
                                      strokeDasharray="3,2"/>
                                <text x="5" y={avgY - 1.5} fill="#f59e0b88" fontSize="3.5">avg</text>
                                <line x1="4" y1={skipY} x2="68" y2={skipY} stroke="#ef444455" strokeWidth="0.7"
                                      strokeDasharray="2,2"/>
                                <text x="5" y={skipY - 1.5} fill="#ef444488" fontSize="3">skip {sk}x</text>
                                <circle cx="48" cy={34 - spikeH} r="2.5" fill="#10b981" opacity="0.9"/>
                                <text x="52" y={34 - spikeH + 1} fill="#10b981" fontSize="3">롱숏 +1 ({rv}x)</text>
                              </svg>
                          )
                        })(),
                      },
                      {
                        key: 'scoreUseBB', label: 'BB', sub: '볼린저밴드 극값',
                        hint: '"극단적인 가격 움직임인가?"\n볼린저밴드는 20일 이평선±2표준편차.\n\n✅ 하단 터치 → 롱 +1 (극도의 약세, 반등 신호)\n⛔ 점수 없음 (중간)\n✅ 상단 터치 → 숏 +1 (극도의 강세, 조정 신호)\n\n💡 밴드가 좁을수록 변동성 낮음\n💡 밴드가 넓을수록 변동성 높음\n💡 극값에서 역추적 가능성 높음',
                        desc: '가격이 BB 상단/하단 극값에 닿을 때만 점수 부여. 변동성 극값에서의 반전 신호.',
                        settings: null,
                        svg: (
                            <svg viewBox="0 0 72 42" style={{width: '100%', height: '100%'}}
                                 preserveAspectRatio="xMidYMid meet">
                              <line x1="4" y1="8" x2="68" y2="8" stroke="#10b98155" strokeWidth="1"
                                    strokeDasharray="2,2"/>
                              <line x1="4" y1="34" x2="68" y2="34" stroke="#ef444455" strokeWidth="1"
                                    strokeDasharray="2,2"/>
                              <line x1="4" y1="21" x2="68" y2="21" stroke="#52525b77" strokeWidth="0.8"/>
                              <text x="8" y="6" fill="#10b981" fontSize="3" opacity="0.8">롱 +1</text>
                              <text x="8" y="36" fill="#ef4444" fontSize="3" opacity="0.6">숏 +1</text>
                              <text x="54" y="22" fill="#52525b" fontSize="3" opacity="0.6">20MA</text>
                              <path d="M4,21 L12,18 L20,15 L28,17 L36,14 L44,16 L52,18 L60,15 L68,17"
                                    fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.7"/>
                              <circle cx="28" cy="8" r="2.5" fill="#10b981" opacity="0.9"/>
                              <circle cx="44" cy="34" r="2.5" fill="#ef4444" opacity="0.9"/>
                            </svg>
                        ),
                      },
                      {
                        key: 'scoreUseIchi', label: '일목', sub: '구름대 지지/저항',
                        hint: '"가격이 구름 위냐 아래냐?"\n일목균형표의 스팬A·B가 만드는 구름대가 지지/저항 역할.\n\n✅ 구름 위 → 롱 +1 / ⛔ 숏 -1 (상승 지지)\n✅ 구름 아래 → 숏 +1 / ⛔ 롱 -1 (하락 저항)\n\n💡 구름이 두꺼울수록 지지/저항이 강함\n💡 구름 안에 있으면 방향 불확실 → 가감점 없음',
                        desc: '일목균형표 구름대로 "가격이 지지 위인지 저항 아래인지" 판단. 추세 방향 확인용.',
                        settings: null,
                        svg: (
                            <svg viewBox="0 0 72 42" style={{width: '100%', height: '100%'}}
                                 preserveAspectRatio="xMidYMid meet">
                              <defs>
                                <linearGradient id="ichiG" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.3"/>
                                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.05"/>
                                </linearGradient>
                              </defs>
                              <path
                                  d="M4,22 C20,21 36,20 52,19 C60,19 64,19 68,19 L68,28 C64,28 60,28 52,27 C36,26 20,26 4,26 Z"
                                  fill="url(#ichiG)"/>
                              <path d="M4,22 C20,21 36,20 52,19 L68,19" fill="none" stroke="#10b98177" strokeWidth="1"/>
                              <path d="M4,26 C20,26 36,26 52,27 L68,28" fill="none" stroke="#ef444455" strokeWidth="1"/>
                              <path d="M4,18 C14,15 26,12 38,10 C50,8 60,7 68,7"
                                    fill="none" stroke="currentColor" strokeWidth="2"/>
                              <circle cx="38" cy="10" r="2.5" fill="#10b981" opacity="0.9"/>
                              <text x="38" y="9" fill="#10b981" fontSize="3">롱 +1 / 숏 -1</text>
                              <text x="38" y="36" fill="#ef4444" fontSize="3" opacity="0.5">숏 +1 / 롱 -1</text>
                            </svg>
                        ),
                      },
                      {
                        key: 'scoreUseGoldenCross', label: 'MA 추세', sub: 'MA20 vs MA60 방향',
                        hint: '"MA20이 MA60 위냐 아래냐? — 현재 추세가 어느 방향인가?"\n\n✅ 롱 점수: MA20 > MA60 → +1 (상승 추세 영역)\n✅ 숏 점수: MA20 < MA60 → +1 (하락 추세 영역)\n\n💡 신호 발생 여부와 무관하게, 항상 현재 MA 관계를 평가\n💡 역추세 진입 억제 역할 (진입 조건 필터로도 사용)',
                        desc: 'MA20과 MA60의 상대 위치로 현재 추세를 판정. 상승 추세(MA20>MA60)면 롱 +1, 하락 추세면 숏 +1.',
                        settings: null,
                        svg: (
                            <svg viewBox="0 0 72 42" style={{width: '100%', height: '100%'}}
                                 preserveAspectRatio="xMidYMid meet">
                              {/* MA60 */}
                              <polyline points="4,30 16,28 28,26 40,24 52,22 68,20"
                                        fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="3,2"/>
                              {/* MA20 — crosses over MA60 */}
                              <polyline points="4,34 12,32 22,28 32,23 44,18 56,14 68,12"
                                        fill="none" stroke="currentColor" strokeWidth="1.8"/>
                              {/* cross point */}
                              <circle cx="26" cy="26" r="2.5" fill="#10b981" opacity="0.9"/>
                              <text x="28" y="25" fill="#10b981" fontSize="3">골든크로스</text>
                              <text x="28" y="30" fill="#10b981" fontSize="3">롱 +1</text>
                              <text x="5" y="10" fill="currentColor" fontSize="3.5" opacity="0.6">━ MA20</text>
                              <text x="5" y="16" fill="#f59e0b" fontSize="3.5">┅ MA60</text>
                              <text x="5" y="38" fill="#ef4444" fontSize="3" opacity="0.5">데드크로스 → 숏 +1</text>
                            </svg>
                        ),
                      },
                      {
                        key: 'scoreUseFedLiquidity', label: '연준 유동성', sub: '대차대조표·TGA·역레포',
                        hint: '"연준이 시중에 유동성을 공급 중인가, 회수 중인가?"\n순유동성 = Fed 대차대조표(WALCL) − TGA(재무부 계좌) − 역레포(RRP)\n\n📊 판단 기준 (MA 기준선)\n  ✅ 순유동성이 MA 위 + 상승 중 → 확실한 유동성 확장 → 롱 +1\n  ✅ 순유동성이 MA 아래 + 하락 중 → 확실한 유동성 수축 → 숏 +1\n  ⬜ 한쪽만 해당 (MA 위이지만 하락, 또는 MA 아래이지만 상승) → 혼재 → 0점\n\n💡 MA 기간 설정으로 기준선 민감도 조절 가능 (기본 13주 ≈ 분기)\n💡 FRED API 키 필요: Supabase secrets에 FRED_API_KEY 설정',
                        desc: '순유동성(대차대조표−TGA−역레포)이 MA 기준선 대비 높은 수준이면서 상승 중일 때만 롱 +1. 낮은 수준이면서 하락 중일 때만 숏 +1. 혼재 시 0.',
                        settings: (() => {
                          const fedVal = result?.fed_latest_net_liquidity
                          return (
                              <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.5}}>
                                <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75}}>
                                  <Typography sx={{fontSize: 9, color: '#60a5fa99', whiteSpace: 'nowrap'}}>MA
                                    기간</Typography>
                                  <input type="number" min={4} max={52}
                                         value={draft.fedLiquidityMAPeriod ?? String(params.fedLiquidityMAPeriod)}
                                         style={{...inputStyle, width: 44}}
                                         onChange={e => setDraft(d => ({...d, fedLiquidityMAPeriod: e.target.value}))}/>
                                  <Typography sx={{fontSize: 9, color: '#52525b'}}>주</Typography>
                                </Box>
                                {fedVal != null && (
                                    <Typography sx={{fontSize: 9, color: '#a3e63566', lineHeight: 1.4}}>
                                      최근 순유동성: <span style={{
                                      color: '#a3e635',
                                      fontWeight: 700
                                    }}>{fedVal.toLocaleString('en-US', {maximumFractionDigits: 0})} B</span>
                                      {' '}({(fedVal / 1000).toFixed(1)} T)
                                    </Typography>
                                )}
                              </Box>
                          )
                        })(),
                        svg: null,
                      },
                    ] as {
                      key: keyof BacktestParams;
                      label: string;
                      sub: string;
                      hint: string;
                      desc: string;
                      settings: React.ReactNode;
                      svg: React.ReactNode
                    }[]

                    const activeCount = indicatorList.filter(({key}) => params[key] as unknown as boolean).length
                    // 추천 점수: 활성 지표의 약 55% (최소 1)
                    const recommendedScore = Math.max(1, Math.round(activeCount * 0.55))
                    const currentMinScore = parseInt(draft.minScore ?? String(params.minScore)) || params.minScore

                    return (
                        <Box>
                          <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            mb: 1.5,
                            justifyContent: 'space-between',
                            flexWrap: 'wrap'
                          }}>
                            <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                              <Typography sx={{...labelSx, color: '#a1a1aa'}}>지표 선택</Typography>
                              <Box sx={{
                                px: 1,
                                py: 0.25,
                                borderRadius: 10,
                                background: activeCount > 0 ? '#3b82f620' : '#27272a',
                                border: '1px solid',
                                borderColor: activeCount > 0 ? '#3b82f644' : '#3f3f46'
                              }}>
                                <Typography sx={{
                                  fontSize: 10,
                                  color: activeCount > 0 ? '#93c5fd' : '#52525b',
                                  fontWeight: 700
                                }}>
                                  {activeCount} / {indicatorList.length} 활성화
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                          <Box sx={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2}}>
                            {/* 매수 기준 점수 */}
                            <Box>
                              <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75}}>
                                <LabelRow label="매수 기준 점수" hintId="minScore"
                                          hint={'"진입에 필요한 최소 점수"\n활성화된 지표들이 각각 +1/-1 점수를 부여.\n합산 점수가 이 값 이상이어야 실제 진입.\n높을수록 신중한 진입, 0이면 조건 없이 진입.'}/>
                                <input type="number" min={0} max={7}
                                       value={draft.minScore ?? String(params.minScore)}
                                       style={{...inputStyle, width: 48}}
                                       onChange={e => setDraft(d => ({...d, minScore: e.target.value}))}/>
                              </Box>
                              {/* 추천 점수 칩 */}
                              <Box
                                  onClick={() => setDraft(d => ({...d, minScore: String(recommendedScore)}))}
                                  sx={{
                                    px: 0.9, py: 0.3, borderRadius: 10, cursor: 'pointer', userSelect: 'none',
                                    background: currentMinScore === recommendedScore ? '#a3e63520' : '#27272a',
                                    border: '1px solid',
                                    borderColor: currentMinScore === recommendedScore ? '#a3e63566' : '#3f3f46',
                                    transition: 'all 0.15s',
                                    '&:hover': {borderColor: '#a3e63599', background: '#a3e63518'},
                                    width: 'fit-content',
                                  }}>
                                <Typography sx={{
                                  fontSize: 9, fontWeight: 700,
                                  color: currentMinScore === recommendedScore ? '#a3e635' : '#71717a'
                                }}>
                                  추천 {recommendedScore}
                                </Typography>
                              </Box>
                            </Box>
                            {/* 신호약화 임계값 */}
                            <Box>
                              <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75}}>
                                <LabelRow label="신호약화 임계값" hintId="scoreExitThreshold"
                                          hint={'"점수가 떨어지면 매도"\n진입 후 현재 점수가 이 값 이하로 내려가면\n신호 약화로 판단하여 즉시 청산 (손절/익절 전).\n0 = 비활성화'}/>
                                <input type="number" min={0} max={7}
                                       value={draft.scoreExitThreshold ?? String(params.scoreExitThreshold)}
                                       style={{...inputStyle, width: 48}}
                                       onChange={e => setDraft(d => ({...d, scoreExitThreshold: e.target.value}))}/>
                              </Box>
                            </Box>
                          </Box>
                          <Box sx={{display: 'grid', gridTemplateColumns: {xs: '1fr', sm: 'repeat(2,1fr)'}, gap: 1}}>
                            {indicatorList.map(({key, label, sub, hint, desc, svg, settings}) => {
                              const on = params[key] as unknown as boolean
                              return (
                                  <Box key={String(key)}
                                       onClick={() => setParams(p => ({...p, [key]: !p[key]}))}
                                       sx={{
                                         display: 'flex', flexDirection: 'row', gap: 0,
                                         borderRadius: 2, border: '1px solid', cursor: 'pointer', userSelect: 'none',
                                         borderColor: on ? '#3b82f666' : '#27272a',
                                         background: on ? '#3b82f610' : '#18181b',
                                         overflow: 'hidden',
                                         transition: 'all 0.15s',
                                         '&:hover': {
                                           borderColor: on ? '#3b82f699' : '#3f3f46',
                                           background: on ? '#3b82f618' : '#1c1c1f'
                                         },
                                       }}>
                                    {/* 좌측: 텍스트 + 설정 */}
                                    <Box sx={{
                                      flex: '0 0 52%',
                                      p: 1.25,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 0.4,
                                      minWidth: 0
                                    }}>
                                      <Box
                                          sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                                          <Box sx={{
                                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                            background: on ? '#3b82f6' : '#3f3f46',
                                            boxShadow: on ? '0 0 6px #3b82f6aa' : 'none', transition: 'all 0.15s'
                                          }}/>
                                          <Typography sx={{
                                            fontSize: 13, fontWeight: 800, lineHeight: 1,
                                            color: on ? '#93c5fd' : '#71717a'
                                          }}>{label}</Typography>
                                        </Box>
                                        <HintTooltip id={`pill-${String(key)}`} text={hint}/>
                                      </Box>
                                      <Typography sx={{
                                        fontSize: 9,
                                        fontWeight: 600,
                                        color: on ? '#60a5fa99' : '#52525b'
                                      }}>{sub}</Typography>
                                      <Typography sx={{
                                        fontSize: 9,
                                        color: on ? '#71717a' : '#3f3f46',
                                        lineHeight: 1.45,
                                        flex: 1
                                      }}>{desc}</Typography>
                                      {settings && on && (
                                          <Box onClick={e => e.stopPropagation()}
                                               sx={{pt: 0.75, mt: 0.25, borderTop: '1px solid #3b82f622'}}>
                                            {settings}
                                          </Box>
                                      )}
                                    </Box>
                                    {/* 우측: 차트 (svg 없으면 숨김) */}
                                    {svg && (
                                        <Box sx={{
                                          flex: 1, minWidth: 0, alignSelf: 'stretch',
                                          color: on ? '#60a5fa' : '#3f3f46', transition: 'color 0.15s',
                                          borderLeft: '1px solid', borderColor: on ? '#3b82f622' : '#27272a',
                                          background: on ? '#0a1628' : '#111113',
                                          display: 'flex', alignItems: 'stretch',
                                        }}>
                                          <Box component="span"
                                               sx={{display: 'flex', width: '100%', height: '100%', minHeight: 100}}>
                                            {svg}
                                          </Box>
                                        </Box>
                                    )}
                                  </Box>
                              )
                            })}
                          </Box>
                        </Box>
                    )
                  })()}


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
              <Typography sx={{fontSize: 12, color: '#ef4444'}}>
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
              <CardContent sx={{p: 2, '&:last-child': {pb: 2}}}>
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
                          sx={{fontSize: 11, color: '#52525b', ml: 1, fontWeight: 400}}
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
                        '& .MuiChip-label': {px: 1},
                      }}
                  />
                </Box>

                <Box sx={{display: 'flex', gap: 1.5, flexWrap: 'wrap'}}>
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
              <CardContent sx={{p: 2, '&:last-child': {pb: 2}}}>
                <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1.5,
                    }}
                >
                  <Typography
                      sx={{fontWeight: 700, fontSize: 13, color: '#fafafa'}}
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
                      {color: '#3b82f6', label: '롱 진입'},
                      {color: '#ef4444', label: '숏 진입'},
                      {color: '#10b981', label: '익절'},
                      {color: '#ec4899', label: '손절'},
                    ].map(({color, label}) => (
                        <Box
                            key={label}
                            sx={{display: 'flex', alignItems: 'center', gap: 0.5}}
                        >
                          <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: color,
                              }}
                          />
                          <Typography sx={{fontSize: 10, color: '#71717a'}}>
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
              <CardContent sx={{p: 2, '&:last-child': {pb: 2}}}>
                <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1.5,
                    }}
                >
                  <Typography
                      sx={{fontWeight: 700, fontSize: 13, color: '#fafafa'}}
                  >
                    거래 내역 ({trades.length}건)
                  </Typography>
                  {loading && (
                      <CircularProgress size={12} sx={{color: '#3b82f6'}}/>
                  )}
                </Box>

                {/* Scrollable trade table */}
                <Box sx={{
                  overflowX: 'auto',
                  '&::-webkit-scrollbar': {height: 3},
                  '&::-webkit-scrollbar-thumb': {background: '#3f3f46', borderRadius: 99}
                }}>
                  {/* Header */}
                  <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '36px 100px 100px 1.5fr 100px 80px 80px',
                        gap: 1,
                        px: 1.5,
                        py: 0.75,
                        mb: 0.5,
                        minWidth: 540,
                        borderBottom: '1px solid #27272a',
                      }}
                  >
                    {[
                      '방향',
                      '진입',
                      '목표/손절',
                      '청산',
                      '시그널/청산',
                      '손익',
                      '수수료',
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
                        '&::-webkit-scrollbar': {width: 3},
                        '&::-webkit-scrollbar-track': {background: 'transparent'},
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
                                initialCapital={result?.initial_capital ?? params.initialCapital}
                            />
                        ))
                    ) : (
                        <Box sx={{py: 4, textAlign: 'center'}}>
                          <Typography sx={{fontSize: 12, color: '#3f3f46'}}>
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
              <Typography sx={{fontSize: 32}}>📊</Typography>
              <Typography sx={{fontSize: 14, color: '#52525b', fontWeight: 600}}>
                파라미터를 설정하고 백테스트를 실행하세요
              </Typography>
              <Typography sx={{fontSize: 12, color: '#3f3f46', textAlign: 'center'}}>
                코인 선택 후 <strong style={{color: '#3b82f6'}}>백테스트 실행</strong> 버튼을 누르세요
              </Typography>
            </Box>
        )}
      </Box>
  );
}
