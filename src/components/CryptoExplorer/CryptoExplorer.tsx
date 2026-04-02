import { useState, useEffect, useCallback, useRef } from 'react'
import BacktestViewer from './BacktestViewer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import { createChart, ColorType, CrosshairMode, CandlestickSeries, type IChartApi, type ISeriesApi, type UTCTimestamp, type IPriceLine } from 'lightweight-charts'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { CRYPTO_SYMBOLS, SIGNAL_LABELS, type CryptoSymbol } from '../../constants/crypto'

// ─────────────────────────────────────────────────────────────
// Paper Position types
// ─────────────────────────────────────────────────────────────
interface PaperPosition {
  id: string
  symbol: string
  signal_type: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  avg_entry_price: number | null
  target_price: number | null
  stop_loss: number | null
  quantity: number
  capital_used: number
  entry_count: number
  add_count: number
  entry_time: string
  status: string
}

const MAX_ENTRY_COUNT = 3  // ENTRY_SPLITS = (0.2, 0.3, 0.4) — risk_manager와 동기화

const ENTRY_STEP_LABEL: Record<number, { text: string; color: string }> = {
  1: { text: '최초 진입', color: '#10b981' },
  2: { text: '1차 추가매수', color: '#3b82f6' },
  3: { text: '2차 추가매수', color: '#a855f7' },
}

function EntryStepDots({ current, max = MAX_ENTRY_COUNT }: { current: number; max?: number }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.4, alignItems: 'center' }}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < current
        const colors = ['#10b981', '#3b82f6', '#a855f7']
        return (
          <Box
            key={i}
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: filled ? (colors[i] ?? '#71717a') : '#27272a',
              border: `1px solid ${filled ? (colors[i] ?? '#71717a') : '#3f3f46'}`,
              transition: 'all 0.2s',
            }}
          />
        )
      })}
      <Typography sx={{ fontSize: 9, color: '#52525b', ml: 0.25, fontFamily: 'monospace' }}>
        {current}/{max}
      </Typography>
    </Box>
  )
}

function PositionsPanel({ currentPrices }: { currentPrices: Partial<Record<CryptoSymbol, number>> }) {
  const [positions, setPositions] = useState<PaperPosition[]>([])

  const fetchPositions = useCallback(async () => {
    const { data } = await supabase
      .from('paper_positions')
      .select('id, symbol, signal_type, direction, entry_price, avg_entry_price, target_price, stop_loss, quantity, capital_used, entry_count, add_count, entry_time, status')
      .eq('status', 'OPEN')
      .order('entry_time', { ascending: false })
    if (data) setPositions(data as PaperPosition[])
  }, [])

  useEffect(() => {
    fetchPositions()
    const channel = supabase
      .channel('paper-positions-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_positions' }, fetchPositions)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchPositions])

  if (positions.length === 0) return null

  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fafafa', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          오픈 포지션
        </Typography>
        <Chip
          label={`${positions.length}건`}
          size="small"
          sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: '#10b98120', color: '#10b981', border: '1px solid #10b98140', '& .MuiChip-label': { px: 0.75 } }}
        />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {positions.map((pos) => {
          const entryStep = Math.max(1, pos.entry_count ?? 1)
          const stepInfo = ENTRY_STEP_LABEL[entryStep] ?? { text: `${entryStep}차 진입`, color: '#71717a' }
          const isShort = (pos.direction ?? 'LONG') === 'SHORT'
          const avgEntry = pos.avg_entry_price ?? pos.entry_price
          const currentPrice = currentPrices[pos.symbol as CryptoSymbol]
          // SHORT P&L: profit when price falls
          const unrealizedPct = currentPrice && avgEntry
            ? isShort
              ? ((avgEntry - currentPrice) / avgEntry) * 100
              : ((currentPrice - avgEntry) / avgEntry) * 100
            : null
          const pnlColor = unrealizedPct == null ? '#71717a' : unrealizedPct >= 0 ? '#10b981' : '#ef4444'

          // Progress bar: SHORT goes from SL (above) to TP (below)
          const progressPct = pos.stop_loss && pos.target_price
            ? Math.max(0, Math.min(100,
                isShort
                  ? ((pos.stop_loss - (currentPrice ?? avgEntry)) / (pos.stop_loss - pos.target_price)) * 100
                  : ((avgEntry - pos.stop_loss) > 0
                      ? ((currentPrice ?? avgEntry) - pos.stop_loss) / (pos.target_price - pos.stop_loss) * 100
                      : 50)
              ))
            : null

          return (
            <Box
              key={pos.id}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '160px 1fr 1fr auto' },
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderRadius: 2,
                background: '#111113',
                border: `1px solid ${stepInfo.color}33`,
                borderLeft: `3px solid ${stepInfo.color}`,
                alignItems: 'center',
              }}
            >
              {/* 심볼 + 단계 */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#fafafa', fontFamily: 'monospace' }}>
                    {pos.symbol}
                  </Typography>
                  {/* 롱/숏 방향 배지 */}
                  <Chip
                    label={isShort ? '숏' : '롱'}
                    size="small"
                    sx={{
                      height: 16, fontSize: 9, fontWeight: 800,
                      bgcolor: isShort ? '#f9731620' : '#3b82f620',
                      color: isShort ? '#f97316' : '#3b82f6',
                      border: `1px solid ${isShort ? '#f9731640' : '#3b82f640'}`,
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                  <Chip
                    label={stepInfo.text}
                    size="small"
                    sx={{
                      height: 16, fontSize: 9, fontWeight: 700,
                      bgcolor: `${stepInfo.color}18`, color: stepInfo.color,
                      border: `1px solid ${stepInfo.color}44`,
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EntryStepDots current={entryStep} />
                  <Typography sx={{ fontSize: 9, color: '#52525b' }}>
                    {SIGNAL_LABELS[pos.signal_type] ?? pos.signal_type}
                  </Typography>
                </Box>
              </Box>

              {/* 진입가 정보 */}
              <Box>
                <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.25 }}>평균 진입가</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#fafafa', fontFamily: 'monospace' }}>
                  ${avgEntry.toLocaleString('en', { maximumFractionDigits: 4 })}
                </Typography>
                {pos.avg_entry_price && pos.entry_price !== pos.avg_entry_price && (
                  <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                    최초 ${pos.entry_price.toLocaleString('en', { maximumFractionDigits: 4 })}
                  </Typography>
                )}
              </Box>

              {/* 현재 손익 */}
              <Box>
                <Typography sx={{ fontSize: 9, color: '#52525b', mb: 0.25 }}>미실현 손익</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: pnlColor, fontFamily: 'monospace' }}>
                  {unrealizedPct != null
                    ? `${unrealizedPct >= 0 ? '+' : ''}${unrealizedPct.toFixed(2)}%`
                    : '—'}
                </Typography>
                {currentPrice && (
                  <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                    현재 ${currentPrice.toLocaleString('en', { maximumFractionDigits: 4 })}
                  </Typography>
                )}
              </Box>

              {/* TP/SL + 자본 */}
              <Box sx={{ textAlign: 'right' }}>
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mb: 0.5 }}>
                  {pos.target_price && (
                    <Typography sx={{ fontSize: 9, color: '#10b98188', fontFamily: 'monospace' }}>
                      TP ${pos.target_price.toLocaleString('en', { maximumFractionDigits: 4 })}
                    </Typography>
                  )}
                  {pos.stop_loss && (
                    <Typography sx={{ fontSize: 9, color: '#ef444488', fontFamily: 'monospace' }}>
                      SL ${pos.stop_loss.toLocaleString('en', { maximumFractionDigits: 4 })}
                    </Typography>
                  )}
                </Box>
                {/* TP↔SL 진행 바 */}
                {progressPct != null && (
                  <Box sx={{ width: 80, height: 3, bgcolor: '#27272a', borderRadius: 99, overflow: 'hidden', ml: 'auto', mb: 0.5 }}>
                    <Box sx={{ width: `${progressPct}%`, height: '100%', bgcolor: pnlColor, borderRadius: 99, transition: 'width 0.3s' }} />
                  </Box>
                )}
                <Typography sx={{ fontSize: 9, color: '#52525b' }}>
                  ${pos.capital_used.toLocaleString('en', { maximumFractionDigits: 0 })} 사용 · {pos.quantity.toFixed(4)} 수량
                </Typography>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface MarketCandle {
  timestamp: number   // epoch ms (kline open time)
  open: number
  high: number
  low: number
  close: number
  volume: number
  closed: boolean     // whether kline is finalized
}

interface SignalDetails {
  tp?: number
  sl?: number
  risk_reward?: number
  ml_prob?: number
  rsi_value?: number
  bb_upper?: number
  bb_middle?: number
  bb_lower?: number
  ma120?: number
}

interface Signal {
  id: string
  symbol: string
  signal_type: string
  signal_time: string
  price: number
  rsi: number | null
  ma20: number | null
  ma60: number | null
  details?: SignalDetails
}

type Symbol = CryptoSymbol

// Map our symbol names to Binance stream names
const SYMBOL_TO_STREAM: Partial<Record<Symbol, string>> = {
  ETH:  'ethusdt',
  SOL:  'solusdt',
  XRP:  'xrpusdt',
}
const STREAM_TO_SYMBOL: Record<string, Symbol> = Object.fromEntries(
  Object.entries(SYMBOL_TO_STREAM).map(([sym, stream]) => [stream, sym as Symbol])
) as Record<string, Symbol>

type Timeframe = '1m' | '5m'

const buildWsUrl = (tf: Timeframe) =>
  'wss://stream.binance.com:9443/stream?streams=' +
  Object.values(SYMBOL_TO_STREAM).map((s) => `${s}@kline_${tf}`).join('/')

const MAX_CANDLES = 240  // 1m: 4시간 / 5m: 20시간

type CandleMap = Record<Symbol, MarketCandle[]>

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const SIGNAL_COLORS: Record<string, string> = {
  // 롱 (녹색 계열)
  GOLDEN_CROSS:   '#10b981',
  RSI_OVERSOLD:   '#10b981',
  BB_LOWER_TOUCH: '#10b981',
  MA20_PULLBACK:  '#10b981',
  ML_BUY:         '#a855f7',
  RL_BUY:         '#3b82f6',
  // 숏 (적색/주황 계열)
  DEATH_CROSS:    '#ef4444',
  RSI_OVERBOUGHT: '#ef4444',
  BB_UPPER_TOUCH: '#ef4444',
  MA20_BREAKDOWN: '#ef4444',
  RL_SELL:        '#f97316',
}


const ALL_SIGNAL_TYPES = [
  'GOLDEN_CROSS', 'RSI_OVERSOLD', 'BB_LOWER_TOUCH', 'MA20_PULLBACK', 'ML_BUY', 'RL_BUY',
  'DEATH_CROSS', 'RSI_OVERBOUGHT', 'BB_UPPER_TOUCH', 'MA20_BREAKDOWN', 'RL_SELL',
] as const

const BULL_TYPES = ['GOLDEN_CROSS', 'RSI_OVERSOLD', 'BB_LOWER_TOUCH', 'MA20_PULLBACK', 'ML_BUY', 'RL_BUY']

// ─────────────────────────────────────────────────────────────
// TP/SL Panel (shows algo-calculated take profit & stop loss)
// ─────────────────────────────────────────────────────────────
function TpSlPanel({ signal, currentPrice }: { signal: Signal; currentPrice: number | undefined }) {
  const { tp, sl, risk_reward } = signal.details ?? {}
  if (!tp && !sl) return null

  const isBull = BULL_TYPES.includes(signal.signal_type)
  const fmt = (v: number) =>
    v >= 1000
      ? `$${v.toLocaleString('en', { maximumFractionDigits: 2 })}`
      : `$${v.toLocaleString('en', { maximumFractionDigits: 6 })}`
  const pct = (target: number) => {
    const p = ((target - signal.price) / signal.price) * 100
    return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`
  }
  const distPct = (target: number) =>
    currentPrice
      ? ` (현재 ${(((target - currentPrice) / currentPrice) * 100) >= 0 ? '+' : ''}${(((target - currentPrice) / currentPrice) * 100).toFixed(2)}%)`
      : ''

  return (
    <Box
      sx={{
        mt: 1,
        p: 1.25,
        borderRadius: 2,
        background: '#18181b',
        border: '1px solid #27272a',
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {tp != null && (
        <Box>
          <Typography sx={{ fontSize: 9, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
            목표가 (TP)
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>
            {fmt(tp)}
          </Typography>
          <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
            {pct(tp)}{distPct(tp)}
          </Typography>
        </Box>
      )}
      {sl != null && (
        <Box>
          <Typography sx={{ fontSize: 9, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
            손절가 (SL)
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>
            {fmt(sl)}
          </Typography>
          <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
            {pct(sl)}{distPct(sl)}
          </Typography>
        </Box>
      )}
      {risk_reward != null && (
        <Box sx={{ ml: 'auto' }}>
          <Typography sx={{ fontSize: 9, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
            R/R
          </Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: isBull ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>
            1:{risk_reward}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────
// Signal Badge
// ─────────────────────────────────────────────────────────────
function SignalBadge({ type, detail }: { type: string; detail?: SignalDetails }) {
  const color = SIGNAL_COLORS[type] ?? '#71717a'
  const label = SIGNAL_LABELS[type] ?? type
  const isBull = BULL_TYPES.includes(type)
  const mlProb =
    type === 'ML_BUY' && detail?.ml_prob != null
      ? ` ${(Number(detail.ml_prob) * 100).toFixed(0)}%`
      : ''

  return (
    <Chip
      label={`${label}${mlProb}`}
      size="small"
      sx={{
        bgcolor: `${color}18`,
        color,
        border: `1px solid ${color}44`,
        fontWeight: 600,
        fontSize: 11,
        height: 20,
        '& .MuiChip-label': { px: 1 },
      }}
      icon={
        <span style={{ fontSize: 9, paddingLeft: 4, lineHeight: 1 }}>
          {type === 'ML_BUY' ? '🤖' : isBull ? '▲' : '▼'}
        </span>
      }
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Live Dot — now reflects WebSocket connection state
// ─────────────────────────────────────────────────────────────
function LiveDot({ active, reconnecting }: { active: boolean; reconnecting?: boolean }) {
  const label = reconnecting ? '재연결 중' : active ? 'LIVE' : '연결 중'
  const color = reconnecting ? '#f59e0b' : active ? '#10b981' : '#52525b'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          animation: active && !reconnecting ? 'livePulse 2s infinite' : 'none',
          '@keyframes livePulse': {
            '0%':   { boxShadow: '0 0 0 0 #10b98166' },
            '70%':  { boxShadow: '0 0 0 6px #10b98100' },
            '100%': { boxShadow: '0 0 0 0 #10b98100' },
          },
        }}
      />
      <Typography
        sx={{
          fontSize: 10,
          color,
          fontWeight: 600,
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </Typography>
    </Box>
  )
}


// ─────────────────────────────────────────────────────────────
// Candlestick Chart — lightweight-charts
// ─────────────────────────────────────────────────────────────
function CandleChart({
  candles,
  signals,
}: {
  candles: MarketCandle[]
  signals: Signal[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef    = useRef<ISeriesApi<'Candlestick', any> | null>(null)
  const tpLineRef    = useRef<IPriceLine | null>(null)
  const slLineRef    = useRef<IPriceLine | null>(null)
  const prevLenRef   = useRef(0)

  const latestSig = signals[0]
  const tp = latestSig?.details?.tp ?? null
  const sl = latestSig?.details?.sl ?? null

  useEffect(() => {
    if (!containerRef.current) return

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
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
        tickMarkFormatter: (time: number) => {
          const d = new Date((time + 9 * 3600) * 1000)
          const h = String(d.getUTCHours()).padStart(2, '0')
          const m = String(d.getUTCMinutes()).padStart(2, '0')
          return `${h}:${m}`
        },
      },
      localization: {
        timeFormatter: (time: number) => {
          const d = new Date((time + 9 * 3600) * 1000)
          const mo = d.getUTCMonth() + 1
          const day = d.getUTCDate()
          const h = String(d.getUTCHours()).padStart(2, '0')
          const mi = String(d.getUTCMinutes()).padStart(2, '0')
          return `${mo}/${day} ${h}:${mi} KST`
        },
      },
      handleScroll: true,
      handleScale: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor:          '#10b981',
      downColor:        '#ef4444',
      borderUpColor:    '#10b981',
      borderDownColor:  '#ef4444',
      wickUpColor:      '#10b981',
      wickDownColor:    '#ef4444',
    })

    chartRef.current  = chart
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current  = null
      seriesRef.current = null
    }
  }, [])

  // Update candle data — always setData (lightweight-charts handles diffing efficiently)
  useEffect(() => {
    const s = seriesRef.current
    if (!s || candles.length === 0) return

    const lwData = candles.map((c) => ({
      time: (Math.floor(c.timestamp / 1000)) as UTCTimestamp,
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    }))

    s.setData(lwData)
    // 새 캔들 추가 시에만 오른쪽 끝으로 스크롤
    if (candles.length !== prevLenRef.current) {
      chartRef.current?.timeScale().scrollToRealTime()
      prevLenRef.current = candles.length
    }
  }, [candles])

  // TP / SL price lines
  useEffect(() => {
    const s = seriesRef.current
    if (!s) return

    if (tpLineRef.current) { s.removePriceLine(tpLineRef.current); tpLineRef.current = null }
    if (slLineRef.current) { s.removePriceLine(slLineRef.current); slLineRef.current = null }

    if (tp != null) {
      tpLineRef.current = s.createPriceLine({
        price: tp, color: '#10b981', lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true,
        title: `TP ${tp >= 1000 ? tp.toLocaleString('en', { maximumFractionDigits: 1 }) : tp.toFixed(4)}`,
      })
    }
    if (sl != null) {
      slLineRef.current = s.createPriceLine({
        price: sl, color: '#ef4444', lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true,
        title: `SL ${sl >= 1000 ? sl.toLocaleString('en', { maximumFractionDigits: 1 }) : sl.toFixed(4)}`,
      })
    }
  }, [tp, sl])

  return <div ref={containerRef} style={{ width: '100%', height: 180 }} />
}

// ─────────────────────────────────────────────────────────────
// Coin Card — receives candles from parent (WebSocket state)
// ─────────────────────────────────────────────────────────────
function CoinCard({
  symbol,
  candles,
  allSignals,
}: {
  symbol: Symbol
  candles: MarketCandle[]
  allSignals: Signal[]
}) {
  const signals = allSignals.filter((s) => s.symbol === symbol).slice(0, 5)
  const latestSignal = signals[0]

  const lastCandle  = candles[candles.length - 1]
  const firstCandle = candles[0]
  const change =
    lastCandle && firstCandle
      ? ((lastCandle.close - firstCandle.close) / firstCandle.close) * 100
      : null
  const isUp = change !== null && change >= 0

  const currentPrice = lastCandle?.close
  const hasTpSl = latestSignal?.details?.tp != null || latestSignal?.details?.sl != null
  const borderAccent = hasTpSl
    ? (BULL_TYPES.includes(latestSignal.signal_type) ? '#10b981' : '#ef4444')
    : '#27272a'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card
        sx={{
          background: '#111113',
          border: `1px solid ${hasTpSl ? `${borderAccent}44` : '#27272a'}`,
          borderRadius: 3,
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {hasTpSl && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 16,
              right: 16,
              height: 2,
              borderRadius: '0 0 2px 2px',
              background: borderAccent,
              opacity: 0.7,
            }}
          />
        )}

        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          {/* Header Row */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              mb: 1.5,
            }}
          >
            {/* Left: symbol + rolling change */}
            <Box>
              <Typography
                sx={{ fontWeight: 800, fontSize: 15, color: '#fafafa', letterSpacing: '-0.01em' }}
              >
                {symbol}
                <Typography
                  component="span"
                  sx={{ fontSize: 12, color: '#52525b', fontWeight: 400, ml: 0.5 }}
                >
                  /USDT
                </Typography>
              </Typography>
              {change !== null && (
                <Typography
                  sx={{
                    fontSize: 11,
                    color: isUp ? '#10b981' : '#ef4444',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    mt: 0.25,
                  }}
                >
                  {isUp ? '+' : ''}{change.toFixed(2)}%
                  <Typography
                    component="span"
                    sx={{ fontSize: 10, color: '#52525b', fontWeight: 400, ml: 0.5 }}
                  >
                    60봉
                  </Typography>
                </Typography>
              )}
            </Box>

            {/* Right: live price */}
            <Box sx={{ textAlign: 'right' }}>
              {currentPrice != null && (
                <Typography
                  sx={{ fontWeight: 700, fontSize: 15, color: '#fafafa', fontFamily: 'monospace' }}
                >
                  ${currentPrice >= 1000
                    ? currentPrice.toLocaleString('en', { maximumFractionDigits: 2 })
                    : currentPrice.toLocaleString('en', { maximumFractionDigits: 4 })}
                </Typography>
              )}
            </Box>
          </Box>

          {/* Algo TP/SL panel — from latest signal */}
          {latestSignal && (
            <TpSlPanel signal={latestSignal} currentPrice={currentPrice} />
          )}

          {/* Chart */}
          {candles.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 180, mt: 1 }}>
              <CircularProgress size={22} sx={{ color: '#3b82f6' }} />
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <CandleChart candles={candles} signals={signals} />
            </Box>
          )}

          {/* Recent Signals */}
          {signals.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography
                sx={{
                  fontSize: 9,
                  color: '#52525b',
                  mb: 0.75,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                최근 시그널
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {signals.map((s) => (
                  <Tooltip
                    key={s.id}
                    title={`$${s.price.toLocaleString('en', { maximumFractionDigits: 6 })}${s.rsi != null ? ` · RSI ${s.rsi.toFixed(1)}` : ''}`}
                    placement="top"
                    arrow
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <SignalBadge type={s.signal_type} detail={s.details} />
                      <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                        {new Date(s.signal_time).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Typography>
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Signal Feed
// ─────────────────────────────────────────────────────────────
function SignalFeed({ signals }: { signals: Signal[] }) {
  return (
    <Card
      sx={{
        background: '#111113',
        border: '1px solid #27272a',
        borderRadius: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent
        sx={{
          p: 2,
          '&:last-child': { pb: 2 },
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1.5,
          }}
        >
          <Typography
            sx={{ fontWeight: 700, fontSize: 13, color: '#fafafa', letterSpacing: '-0.01em' }}
          >
            시그널 피드
          </Typography>
          <Chip
            label={`${signals.length}건`}
            size="small"
            sx={{
              height: 18,
              fontSize: 10,
              fontWeight: 700,
              bgcolor: '#18181b',
              color: '#71717a',
              border: '1px solid #27272a',
              '& .MuiChip-label': { px: 1 },
            }}
          />
        </Box>

        {signals.length === 0 ? (
          <Box
            sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Typography sx={{ color: '#52525b', fontSize: 12 }}>아직 시그널이 없어요</Typography>
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
              maxHeight: 520,
              overflowY: 'auto',
              pr: 0.5,
              '&::-webkit-scrollbar': { width: 3 },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': { background: '#3f3f46', borderRadius: 99 },
            }}
          >
            <AnimatePresence initial={false}>
              {signals.map((s, i) => {
                const isBull = BULL_TYPES.includes(s.signal_type)
                const accentColor = SIGNAL_COLORS[s.signal_type] ?? '#71717a'
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i < 5 ? i * 0.03 : 0 }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        p: 1.25,
                        borderRadius: 2,
                        background: '#18181b',
                        border: '1px solid #27272a',
                        borderLeft: `3px solid ${accentColor}66`,
                        gap: 1,
                        transition: 'border-color 0.2s',
                        '&:hover': { borderLeftColor: accentColor },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.4 }}>
                          <Typography
                            sx={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: '#d4d4d8',
                              fontFamily: 'monospace',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {s.symbol}
                          </Typography>
                          <SignalBadge type={s.signal_type} detail={s.details} />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography sx={{ fontSize: 10, color: '#52525b', fontFamily: 'monospace' }}>
                            진입 ${s.price.toLocaleString('en', { maximumFractionDigits: 4 })}
                          </Typography>
                          {s.rsi != null && (
                            <Typography sx={{ fontSize: 10, color: '#52525b', fontFamily: 'monospace' }}>
                              RSI {s.rsi.toFixed(1)}
                            </Typography>
                          )}
                        </Box>
                        {(s.details?.tp != null || s.details?.sl != null) && (
                          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
                            {s.details?.tp != null && (
                              <Typography sx={{ fontSize: 10, color: '#10b981', fontFamily: 'monospace', fontWeight: 600 }}>
                                TP ${s.details.tp >= 1000
                                  ? s.details.tp.toLocaleString('en', { maximumFractionDigits: 1 })
                                  : s.details.tp.toFixed(4)}
                                {' '}
                                <span style={{ color: '#52525b', fontWeight: 400 }}>
                                  ({(((s.details.tp - s.price) / s.price) * 100) >= 0 ? '+' : ''}{(((s.details.tp - s.price) / s.price) * 100).toFixed(1)}%)
                                </span>
                              </Typography>
                            )}
                            {s.details?.sl != null && (
                              <Typography sx={{ fontSize: 10, color: '#ef4444', fontFamily: 'monospace', fontWeight: 600 }}>
                                SL ${s.details.sl >= 1000
                                  ? s.details.sl.toLocaleString('en', { maximumFractionDigits: 1 })
                                  : s.details.sl.toFixed(4)}
                                {' '}
                                <span style={{ color: '#52525b', fontWeight: 400 }}>
                                  ({(((s.details.sl - s.price) / s.price) * 100).toFixed(1)}%)
                                </span>
                              </Typography>
                            )}
                            {s.details?.risk_reward != null && (
                              <Typography sx={{ fontSize: 10, color: '#a1a1aa', fontFamily: 'monospace' }}>
                                R/R 1:{s.details.risk_reward}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography sx={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace' }}>
                          {new Date(s.signal_time).toLocaleString('ko-KR', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Typography>
                        <Box
                          sx={{
                            mt: 0.5,
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: isBull ? '#10b981' : '#ef4444',
                            ml: 'auto',
                            opacity: 0.7,
                          }}
                        />
                      </Box>
                    </Box>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// Stats Bar
// ─────────────────────────────────────────────────────────────
function StatsBar({ signals }: { signals: Signal[] }) {
  const bullCount = signals.filter((s) => BULL_TYPES.includes(s.signal_type)).length
  const bearCount = signals.filter((s) => !BULL_TYPES.includes(s.signal_type)).length

  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
      {signals.length > 0 && (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.75,
              borderRadius: 2,
              background: '#10b98112',
              border: '1px solid #10b98133',
            }}
          >
            <Typography sx={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>▲ 매수</Typography>
            <Typography
              sx={{ fontSize: 14, fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}
            >
              {bullCount}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.75,
              borderRadius: 2,
              background: '#ef444412',
              border: '1px solid #ef444433',
            }}
          >
            <Typography sx={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>▼ 매도</Typography>
            <Typography
              sx={{ fontSize: 14, fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}
            >
              {bearCount}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ borderColor: '#27272a', mx: 0.5 }} />
        </>
      )}

      {ALL_SIGNAL_TYPES.map((type) => {
        const count = signals.filter((s) => s.signal_type === type).length
        if (count === 0) return null
        return (
          <Box
            key={type}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.25,
              py: 0.5,
              borderRadius: 2,
              background: '#18181b',
              border: '1px solid #27272a',
            }}
          >
            <SignalBadge type={type} />
            <Typography
              sx={{ fontSize: 12, fontWeight: 700, color: '#a1a1aa', fontFamily: 'monospace' }}
            >
              {count}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────
// Binance WebSocket hook
// Returns candle buffers per symbol, connection state, and
// a manual reconnect trigger for consumers that need it.
// ─────────────────────────────────────────────────────────────
type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

async function fetchInitialCandles(tf: Timeframe): Promise<CandleMap> {
  const result: CandleMap = { ETH: [], SOL: [], XRP: [] }
  await Promise.all(
    CRYPTO_SYMBOLS.map(async (sym) => {
      try {
        const pair = (SYMBOL_TO_STREAM[sym] ?? sym.toLowerCase() + 'usdt').toUpperCase()
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${tf}&limit=${MAX_CANDLES}`
        )
        const data: number[][] = await res.json()
        result[sym] = data.map((k) => ({
          timestamp: k[0],
          open:   parseFloat(String(k[1])),
          high:   parseFloat(String(k[2])),
          low:    parseFloat(String(k[3])),
          close:  parseFloat(String(k[4])),
          volume: parseFloat(String(k[5])),
          closed: true,
        }))
      } catch {
        // leave empty — WebSocket will fill in
      }
    })
  )
  return result
}

function useBinanceKlines(tf: Timeframe): {
  candleMap: CandleMap
  wsStatus: WsStatus
} {
  const emptyMap = (): CandleMap => ({
    ETH: [], SOL: [], XRP: [],
  })

  const [candleMap, setCandleMap] = useState<CandleMap>(emptyMap)
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')

  const bufferRef = useRef<CandleMap>(emptyMap())
  const wsRef     = useRef<WebSocket | null>(null)
  const retryRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted = useRef(false)
  const retryDelay = useRef(2000)

  // 타임프레임 변경 or 마운트 시 REST로 초기 240개 캔들 로드
  useEffect(() => {
    bufferRef.current = emptyMap()
    setCandleMap(emptyMap())
    fetchInitialCandles(tf).then((initial) => {
      if (unmounted.current) return
      bufferRef.current = initial
      setCandleMap({ ...initial })
    })
  }, [tf])  // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback((currentTf: Timeframe) => {
    if (unmounted.current) return

    setWsStatus((prev) => (prev === 'connected' ? 'reconnecting' : 'connecting'))

    const ws = new WebSocket(buildWsUrl(currentTf))
    wsRef.current = ws

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return }
      retryDelay.current = 2000
      setWsStatus('connected')
    }

    ws.onmessage = (event: MessageEvent) => {
      if (unmounted.current) return
      try {
        const msg = JSON.parse(event.data as string) as {
          stream: string
          data: {
            k: {
              t: number
              o: string
              h: string
              l: string
              c: string
              v: string
              x: boolean
            }
          }
        }

        const streamName = msg.stream.replace(/@kline_\w+$/, '')
        const symbol = STREAM_TO_SYMBOL[streamName]
        if (!symbol) return

        const k = msg.data.k
        const candle: MarketCandle = {
          timestamp: k.t,
          open:      parseFloat(k.o),
          high:      parseFloat(k.h),
          low:       parseFloat(k.l),
          close:     parseFloat(k.c),
          volume:    parseFloat(k.v),
          closed:    k.x,
        }

        const prev = bufferRef.current[symbol]
        let next: MarketCandle[]

        // Replace the last candle if it has the same open time (live update),
        // otherwise append and keep rolling MAX_CANDLES window.
        if (prev.length > 0 && prev[prev.length - 1].timestamp === candle.timestamp) {
          next = [...prev.slice(0, -1), candle]
        } else {
          next = [...prev, candle].slice(-MAX_CANDLES)
        }

        bufferRef.current = { ...bufferRef.current, [symbol]: next }

        // Batch state update — spread so React sees a new object reference
        setCandleMap({ ...bufferRef.current })
      } catch {
        // malformed frame — ignore
      }
    }

    ws.onerror = () => {
      // onclose will fire immediately after, handle reconnect there
    }

    ws.onclose = () => {
      if (unmounted.current) return
      setWsStatus('reconnecting')
      const delay = retryDelay.current
      retryDelay.current = Math.min(delay * 1.5, 30000)
      retryRef.current = setTimeout(() => connect(currentTf), delay)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    unmounted.current = false
    // 타임프레임 바뀌면 기존 소켓 닫고 새로 연결
    if (wsRef.current) {
      wsRef.current.onclose = null  // 재연결 루프 방지
      wsRef.current.close()
    }
    if (retryRef.current) clearTimeout(retryRef.current)
    retryDelay.current = 2000
    connect(tf)

    return () => {
      unmounted.current = true
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect, tf])  // eslint-disable-line react-hooks/exhaustive-deps

  return { candleMap, wsStatus }
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
type DashTab = 'live' | 'backtest'

export default function CryptoExplorer() {
  const [tab, setTab] = useState<DashTab>('backtest')
  const [signals, setSignals]               = useState<Signal[]>([])
  const [loadingSignals, setLoadingSignals] = useState(true)
  const [lastUpdated, setLastUpdated]       = useState<Date | null>(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const signalsRef = useRef<Signal[]>([])

  // ── Binance WebSocket ──
  const { candleMap, wsStatus } = useBinanceKlines(timeframe)
  const wsConnected    = wsStatus === 'connected'
  const wsReconnecting = wsStatus === 'reconnecting'

  // ── Supabase: initial signal fetch ──
  const fetchSignals = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('signals')
      .select('id, symbol, signal_type, signal_time, price, rsi, ma20, ma60, details')
      .gte('signal_time', since)
      .order('signal_time', { ascending: false })
      .limit(100)

    if (data) {
      signalsRef.current = data as Signal[]
      setSignals(data as Signal[])
      setLastUpdated(new Date())
    }
    setLoadingSignals(false)
  }, [])

  useEffect(() => {
    fetchSignals()
  }, [fetchSignals])

  // ── Supabase Realtime: signal inserts ──
  useEffect(() => {
    const channel = supabase
      .channel('signals-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signals' },
        (payload) => {
          const newSignal = payload.new as Signal
          const updated = [newSignal, ...signalsRef.current].slice(0, 100)
          signalsRef.current = updated
          setSignals([...updated])
          setLastUpdated(new Date())
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: '#09090b',
        p: { xs: 2, sm: 3 },
        maxWidth: 1440,
        mx: 'auto',
      }}
    >
      {/* ── Reconnecting banner ── */}
      <AnimatePresence>
        {wsReconnecting && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Box
              sx={{
                mb: 2,
                px: 2,
                py: 1,
                borderRadius: 2,
                background: '#f59e0b12',
                border: '1px solid #f59e0b44',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <CircularProgress size={12} sx={{ color: '#f59e0b' }} />
              <Typography sx={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                Binance 웹소켓 재연결 중... 차트 데이터가 잠시 멈출 수 있어요.
              </Typography>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          mb: 3,
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { xs: 20, sm: 24 },
                color: '#fafafa',
                letterSpacing: '-0.02em',
              }}
            >
              크립토 봇 대시보드
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
            <Typography sx={{ fontSize: 12, color: '#52525b' }}>
              ETH · SOL · XRP
            </Typography>
            {(['1m', '5m'] as Timeframe[]).map((tf) => (
              <Box
                key={tf}
                component="button"
                onClick={() => setTimeframe(tf)}
                sx={{
                  px: 1.25, py: 0.25,
                  borderRadius: 1,
                  border: `1px solid ${timeframe === tf ? '#3b82f6' : '#27272a'}`,
                  background: timeframe === tf ? '#3b82f618' : 'transparent',
                  color: timeframe === tf ? '#3b82f6' : '#52525b',
                  fontSize: 11, fontWeight: timeframe === tf ? 700 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tf}
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
          {/* WebSocket status (price feed) */}
          <LiveDot active={wsConnected} reconnecting={wsReconnecting} />
          {/* Supabase Realtime status (signals) */}
          {realtimeConnected && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box
                sx={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#a855f7',
                  opacity: 0.8,
                }}
              />
              <Typography sx={{ fontSize: 9, color: '#a855f766', fontWeight: 600, letterSpacing: '0.08em' }}>
                SIGNALS
              </Typography>
            </Box>
          )}
          {loadingSignals && <CircularProgress size={13} sx={{ color: '#3b82f6' }} />}
          {lastUpdated && (
            <Typography sx={{ fontSize: 10, color: '#52525b', fontFamily: 'monospace' }}>
              {lastUpdated.toLocaleTimeString('ko-KR')}
            </Typography>
          )}
        </Box>
      </Box>

      {/* ── Tab bar ── */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2.5 }}>
        {(['live', 'backtest'] as DashTab[]).map((t) => (
          <Box
            key={t}
            component="button"
            onClick={() => setTab(t)}
            sx={{
              px: 2, py: 0.75,
              borderRadius: 2,
              border: '1px solid',
              borderColor: tab === t ? '#3b82f6' : '#27272a',
              background: tab === t ? '#3b82f620' : 'transparent',
              color: tab === t ? '#3b82f6' : '#52525b',
              fontSize: 12,
              fontWeight: tab === t ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
              '&:hover': { borderColor: '#3b82f666', color: '#a1a1aa' },
            }}
          >
            {t === 'live' ? '실시간 대시보드' : '백테스트 뷰어'}
          </Box>
        ))}
      </Box>

      {tab === 'backtest' ? (
        <BacktestViewer />
      ) : (
        <>

      {/* ── Stats bar ── */}
      <StatsBar signals={signals} />

      {/* ── Open positions (진입/추가매수 구분) ── */}
      <PositionsPanel
        currentPrices={
          Object.fromEntries(
            CRYPTO_SYMBOLS.map(s => [s, candleMap[s]?.slice(-1)[0]?.close])
          ) as Partial<Record<CryptoSymbol, number>>
        }
      />

      {/* ── Main grid: coin cards + signal feed ── */}
      <Grid container spacing={2}>
        {CRYPTO_SYMBOLS.map((sym, i) => (
          <Grid key={sym} item xs={12} sm={6} lg={4}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
            >
              <CoinCard
                symbol={sym}
                candles={candleMap[sym]}
                allSignals={signals}
              />
            </motion.div>
          </Grid>
        ))}

        <Grid item xs={12} sm={6} lg={4}>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: CRYPTO_SYMBOLS.length * 0.06 }}
          >
            <SignalFeed signals={signals} />
          </motion.div>
        </Grid>
      </Grid>
        </>
      )}
    </Box>
  )
}
