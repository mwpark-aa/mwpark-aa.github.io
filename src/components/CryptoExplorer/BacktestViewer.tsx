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
import { CRYPTO_SYMBOLS, SIGNAL_LABELS, type CryptoSymbol } from '../../constants/crypto'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface BacktestResult {
  id: string
  symbol: string
  interval: string
  days: number
  initial_capital: number
  final_capital: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  total_return_pct: number
  max_drawdown_pct: number
  sharpe_ratio: number
  profit_factor: number
  avg_win_pct: number
  avg_loss_pct: number
  longest_drawdown_candles: number
  created_at: string
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
export default function BacktestViewer() {
  const [selectedSymbol, setSelectedSymbol] = useState<CryptoSymbol>('ETH')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [trades, setTrades] = useState<BacktestTrade[]>([])
  const [candles, setCandles] = useState<OHLCVCandle[]>([])
  const scrollToRef = useRef<((ts: string) => void) | null>(null)

  const handleScrollTo = useCallback((ts: string) => {
    scrollToRef.current?.(ts)
  }, [])

  const load = useCallback(async (symbol: CryptoSymbol) => {
    setLoading(true)
    setError(null)
    setResult(null)
    setTrades([])
    setCandles([])

    try {
      const { data: results, error: rErr } = await supabase
          .from('backtest_results')
          .select('*')
          .eq('symbol', symbol)
          .order('created_at', { ascending: false })
          .limit(1)

      if (rErr) throw new Error(rErr.message)
      if (!results || results.length === 0) {
        setError(
            `${symbol}의 백테스트 결과가 없어요. ./bot.sh backtest --symbol ${symbol} 를 먼저 실행하세요.`,
        )
        setLoading(false)
        return
      }

      const bt = results[0] as BacktestResult
      setResult(bt)

      const endMs = new Date(bt.created_at).getTime()
      const startMs = endMs - bt.days * 24 * 60 * 60 * 1000

      const [{ data: tradeData, error: tErr }, candleData] = await Promise.all([
        supabase
            .from('backtest_trades')
            .select('*')
            .eq('backtest_result_id', bt.id)
            .order('entry_ts', { ascending: true }),
        fetchOHLCV(symbol, bt.interval, startMs, endMs),
      ])

      if (tErr) throw new Error(tErr.message)
      setTrades((tradeData ?? []) as BacktestTrade[])
      setCandles(candleData)
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(selectedSymbol)
  }, [selectedSymbol, load])

  const returnColor = result
      ? result.total_return_pct >= 0
          ? '#10b981'
          : '#ef4444'
      : '#fafafa'

  return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* ── Controls ── */}
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
                  alignItems: 'center',
                  gap: 2,
                  flexWrap: 'wrap',
                }}
            >
              <Typography
                  sx={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}
              >
                코인 선택
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {CRYPTO_SYMBOLS.map((sym) => (
                    <Box
                        key={sym}
                        component="button"
                        onClick={() => setSelectedSymbol(sym)}
                        sx={{
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1.5,
                          border: '1px solid',
                          borderColor:
                              selectedSymbol === sym ? '#3b82f6' : '#27272a',
                          background:
                              selectedSymbol === sym ? '#3b82f620' : 'transparent',
                          color: selectedSymbol === sym ? '#3b82f6' : '#71717a',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: '#3b82f666', color: '#a1a1aa' },
                        }}
                    >
                      {sym}
                    </Box>
                ))}
              </Box>
              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                <Box
                    component="button"
                    onClick={() => load(selectedSymbol)}
                    disabled={loading}
                    sx={{
                      px: 2,
                      py: 0.75,
                      borderRadius: 2,
                      border: '1px solid #27272a',
                      background: 'transparent',
                      color: '#71717a',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      '&:hover': { borderColor: '#52525b', color: '#a1a1aa' },
                    }}
                >
                  새로고침
                </Box>
                <Box
                    component="button"
                    onClick={() => {}}
                    sx={{
                      px: 2,
                      py: 0.75,
                      borderRadius: 2,
                      border: '1px solid #3b82f666',
                      background: '#3b82f620',
                      color: '#3b82f6',
                      fontSize: 11,
                      fontWeight: 700,
                      opacity: 0.6,
                      cursor: 'not-allowed',
                    }}
                >
                  백테스트 실행
                </Box>
              </Box>
            </Box>
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
                          sx={{
                            fontSize: 11,
                            color: '#52525b',
                            ml: 1,
                            fontWeight: 400,
                          }}
                      >
                        {result.interval} · {result.days}일 ·{' '}
                        {fmtDate(result.created_at)} 기준
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
                        result.profit_factor === Infinity ||
                        result.profit_factor > 99
                            ? '∞'
                            : result.profit_factor.toFixed(3)
                      }
                  />
                  <MetricCard
                      label="평균 수익/손실"
                      value={`${fmtPct(result.avg_win_pct)} / ${fmtPct(result.avg_loss_pct)}`}
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

                {/* Header */}
                <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '20px 36px 52px 1fr 1fr 1fr 90px',
                      gap: 1,
                      px: 1.5,
                      py: 0.75,
                      mb: 0.5,
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
              </CardContent>
            </Card>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && !result && (
            <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 8,
                  gap: 1.5,
                }}
            >
              <Typography sx={{ fontSize: 32 }}>📊</Typography>
              <Typography
                  sx={{ fontSize: 14, color: '#52525b', fontWeight: 600 }}
              >
                코인을 선택하고 결과를 불러오세요
              </Typography>
              <Typography
                  sx={{ fontSize: 12, color: '#3f3f46', textAlign: 'center' }}
              >
                백테스트를 먼저 실행해야 해요:{' '}
                <code style={{ color: '#71717a' }}>./bot.sh backtest</code>
              </Typography>
            </Box>
        )}
      </Box>
  )
}
