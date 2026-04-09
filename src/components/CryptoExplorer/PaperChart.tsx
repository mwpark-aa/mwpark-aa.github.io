import { useEffect, useRef, memo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
} from 'lightweight-charts'
import type { Candle } from '../../lib/backtest/types'
import { computeIndicators } from '../../lib/backtest/indicators'

// ── Props ─────────────────────────────────────────────────────

interface OpenPos {
  entry_price:  number
  target_price: number | null
  stop_loss:    number | null
  direction:    'LONG' | 'SHORT'
}

export interface ChartConfig {
  showMA:    boolean   // scoreUseGoldenCross
  showBB:    boolean   // scoreUseBB
  showRSI:   boolean   // scoreUseRSI
  showMACD:  boolean   // scoreUseMACD
  showADX:   boolean   // scoreUseADX
  rsiOversold:  number
  rsiOverbought: number
  adxThreshold:  number
}

interface Props {
  symbol:      string
  interval:    string
  position:    OpenPos | null
  chartConfig: ChartConfig
}

// ── Binance REST fetch ────────────────────────────────────────

async function fetchCandles(symbol: string, interval: string, limit = 280): Promise<Candle[]> {
  const resp = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`
  )
  if (!resp.ok) return []
  const data = await resp.json() as unknown[][]
  return data.map(k => ({
    timestamp: Number(k[0]),
    open:      parseFloat(k[1] as string),
    high:      parseFloat(k[2] as string),
    low:       parseFloat(k[3] as string),
    close:     parseFloat(k[4] as string),
    volume:    parseFloat(k[5] as string),
  }))
}

// ── 캔들 → lightweight-charts 포맷 ───────────────────────────

const toT = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp

// ── 컴포넌트 ─────────────────────────────────────────────────

const PaperChart = memo(function PaperChart({ symbol, interval, position, chartConfig }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const wsRef        = useRef<WebSocket | null>(null)
  const candlesRef   = useRef<Candle[]>([])

  // 시리즈 refs
  const candleSeriesRef  = useRef<ISeriesApi<'Candlestick', any> | null>(null)
  const volumeSeriesRef  = useRef<ISeriesApi<'Histogram', any>   | null>(null)
  const ma20Ref          = useRef<ISeriesApi<'Line', any>        | null>(null)
  const ma60Ref          = useRef<ISeriesApi<'Line', any>        | null>(null)
  const ma120Ref         = useRef<ISeriesApi<'Line', any>        | null>(null)
  const bbUpperRef       = useRef<ISeriesApi<'Line', any>        | null>(null)
  const bbMidRef         = useRef<ISeriesApi<'Line', any>        | null>(null)
  const bbLowerRef       = useRef<ISeriesApi<'Line', any>        | null>(null)
  const rsiSeriesRef     = useRef<ISeriesApi<'Line', any>        | null>(null)
  const macdSeriesRef    = useRef<ISeriesApi<'Histogram', any>   | null>(null)
  const adxSeriesRef     = useRef<ISeriesApi<'Line', any>        | null>(null)
  const posLinesRef      = useRef<IPriceLine[]>([])

  // ── 모든 시리즈에 데이터 세팅 ─────────────────────────────

  function applyAllData(candles: Candle[]) {
    const n = candles.length

    candleSeriesRef.current?.setData(
      candles.map(c => ({ time: toT(c.timestamp), open: c.open, high: c.high, low: c.low, close: c.close }))
    )

    volumeSeriesRef.current?.setData(
      candles.map(c => ({
        time:  toT(c.timestamp),
        value: c.volume,
        color: c.close >= c.open ? '#10b98155' : '#ef444455',
      }))
    )

    if (chartConfig.showMA) {
      ma20Ref.current?.setData(candles.filter(c => c.ma20 != null).map(c => ({ time: toT(c.timestamp), value: c.ma20! })))
      ma60Ref.current?.setData(candles.filter(c => c.ma60 != null).map(c => ({ time: toT(c.timestamp), value: c.ma60! })))
      ma120Ref.current?.setData(candles.filter(c => c.ma120 != null).map(c => ({ time: toT(c.timestamp), value: c.ma120! })))
    }

    if (chartConfig.showBB) {
      bbUpperRef.current?.setData(candles.filter(c => c.bb_upper != null).map(c => ({ time: toT(c.timestamp), value: c.bb_upper! })))
      bbMidRef.current?.setData(candles.filter(c => c.bb_upper != null).map(c => ({ time: toT(c.timestamp), value: (c.bb_upper! + c.bb_lower!) / 2 })))
      bbLowerRef.current?.setData(candles.filter(c => c.bb_lower != null).map(c => ({ time: toT(c.timestamp), value: c.bb_lower! })))
    }

    if (chartConfig.showRSI) {
      rsiSeriesRef.current?.setData(candles.filter(c => c.rsi14 != null).map(c => ({ time: toT(c.timestamp), value: c.rsi14! })))
    }

    if (chartConfig.showMACD) {
      macdSeriesRef.current?.setData(
        candles.filter(c => c.macd_hist != null).map(c => ({
          time:  toT(c.timestamp),
          value: c.macd_hist!,
          color: c.macd_hist! >= 0 ? '#10b981aa' : '#ef4444aa',
        }))
      )
    }

    if (chartConfig.showADX) {
      adxSeriesRef.current?.setData(candles.filter(c => c.adx14 != null).map(c => ({ time: toT(c.timestamp), value: c.adx14! })))
    }

    // 마지막 캔들로 스크롤
    if (n > 0) chartRef.current?.timeScale().scrollToRealTime()
  }

  // ── 마지막 캔들 1건만 업데이트 ────────────────────────────

  function updateLast(candles: Candle[]) {
    const n = candles.length
    if (n === 0) return
    const c = candles[n - 1]!
    const t = toT(c.timestamp)

    candleSeriesRef.current?.update({ time: t, open: c.open, high: c.high, low: c.low, close: c.close })
    volumeSeriesRef.current?.update({ time: t, value: c.volume, color: c.close >= c.open ? '#10b98155' : '#ef444455' })

    if (chartConfig.showMA) {
      if (c.ma20  != null) ma20Ref.current?.update({ time: t, value: c.ma20  })
      if (c.ma60  != null) ma60Ref.current?.update({ time: t, value: c.ma60  })
      if (c.ma120 != null) ma120Ref.current?.update({ time: t, value: c.ma120 })
    }
    if (chartConfig.showBB && c.bb_upper != null && c.bb_lower != null) {
      bbUpperRef.current?.update({ time: t, value: c.bb_upper })
      bbMidRef.current?.update({ time: t, value: (c.bb_upper + c.bb_lower) / 2 })
      bbLowerRef.current?.update({ time: t, value: c.bb_lower })
    }
    if (chartConfig.showRSI   && c.rsi14     != null) rsiSeriesRef.current?.update({ time: t, value: c.rsi14 })
    if (chartConfig.showMACD  && c.macd_hist != null) macdSeriesRef.current?.update({ time: t, value: c.macd_hist, color: c.macd_hist >= 0 ? '#10b981aa' : '#ef4444aa' })
    if (chartConfig.showADX   && c.adx14     != null) adxSeriesRef.current?.update({ time: t, value: c.adx14 })
  }

  // ── 차트 초기화 + WebSocket (symbol / interval 변경 시) ───

  useEffect(() => {
    if (!containerRef.current) return
    let mounted = true

    // 기존 리소스 정리
    wsRef.current?.close()
    wsRef.current = null
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    // 차트 높이 계산
    const extraPanes = (chartConfig.showRSI ? 1 : 0) + (chartConfig.showMACD ? 1 : 0) + (chartConfig.showADX ? 1 : 0)
    const totalHeight = 300 + 70 + extraPanes * 80  // main + volume + extras

    // 차트 생성
    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: totalHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#111113' },
        textColor: '#52525b',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#1a1a1e' },
        horzLines: { color: '#1a1a1e' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#27272a', scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: '#27272a', timeVisible: true, secondsVisible: false },
      handleScroll: true, handleScale: true,
    })

    chartRef.current = chart

    // ── pane 0: 캔들스틱 + 지표 overlay ──────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    }, 0)
    candleSeriesRef.current = candleSeries

    if (chartConfig.showMA) {
      ma20Ref.current  = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0)
      ma60Ref.current  = chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0)
      ma120Ref.current = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0)
    }

    if (chartConfig.showBB) {
      bbUpperRef.current = chart.addSeries(LineSeries, { color: '#3b82f666', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0)
      bbMidRef.current   = chart.addSeries(LineSeries, { color: '#3b82f633', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0)
      bbLowerRef.current = chart.addSeries(LineSeries, { color: '#3b82f666', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0)
    }

    // ── pane 1: 거래량 ────────────────────────────────────────
    chart.addPane()
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    }, 1)
    chart.priceScale('volume', 1).applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } })
    volumeSeriesRef.current = volSeries
    chart.panes()[1]?.setHeight(70)

    // ── 추가 pane: RSI / MACD / ADX ──────────────────────────
    let nextPane = 2

    if (chartConfig.showRSI) {
      chart.addPane()
      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#e2e8f0', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
      }, nextPane)
      // Oversold / Overbought 기준선
      rsiSeries.createPriceLine({ price: chartConfig.rsiOverbought, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' })
      rsiSeries.createPriceLine({ price: 50,                        color: '#3f3f46', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' })
      rsiSeries.createPriceLine({ price: chartConfig.rsiOversold,   color: '#10b981', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' })
      rsiSeriesRef.current = rsiSeries
      chart.panes()[nextPane]?.setHeight(80)
      nextPane++
    }

    if (chartConfig.showMACD) {
      chart.addPane()
      const macdSeries = chart.addSeries(HistogramSeries, {
        priceLineVisible: false, lastValueVisible: true,
      }, nextPane)
      macdSeriesRef.current = macdSeries
      chart.panes()[nextPane]?.setHeight(80)
      nextPane++
    }

    if (chartConfig.showADX) {
      chart.addPane()
      const adxSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: true,
      }, nextPane)
      adxSeries.createPriceLine({ price: chartConfig.adxThreshold, color: '#f59e0b66', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' })
      adxSeriesRef.current = adxSeries
      chart.panes()[nextPane]?.setHeight(80)
    }

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(containerRef.current)

    // ── 초기 캔들 로드 + 지표 계산 ───────────────────────────
    fetchCandles(symbol, interval).then(candles => {
      if (!mounted) return
      computeIndicators(candles)
      candlesRef.current = candles
      applyAllData(candles)
      chart.timeScale().fitContent()

      // ── WebSocket 연결 ──────────────────────────────────────
      const stream = `${symbol.toLowerCase()}usdt@kline_${interval}`
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`)

      ws.onmessage = (e) => {
        if (!mounted) return
        try {
          const msg  = JSON.parse(e.data as string)
          const k    = msg.k
          if (!k) return

          const rows = candlesRef.current
          const last = rows[rows.length - 1]!
          const ts   = Number(k.t)

          const updated: Candle = {
            timestamp: ts,
            open:   parseFloat(k.o), high:   parseFloat(k.h),
            low:    parseFloat(k.l), close:  parseFloat(k.c),
            volume: parseFloat(k.v),
          }

          if (last.timestamp === ts) {
            // 현재 캔들 업데이트
            rows[rows.length - 1] = updated
          } else {
            // 새 캔들 추가 (이전 캔들 확정)
            rows.push(updated)
            if (rows.length > 300) rows.shift()
          }

          // 지표 재계산 후 마지막 캔들만 업데이트
          computeIndicators(rows)
          updateLast(rows)
        } catch {
          // 무시
        }
      }

      ws.onerror = () => ws.close()
      wsRef.current = ws
    })

    return () => {
      mounted = false
      ro.disconnect()
      wsRef.current?.close()
      wsRef.current = null
      chart.remove()
      chartRef.current      = null
      candleSeriesRef.current  = null
      volumeSeriesRef.current  = null
      ma20Ref.current = ma60Ref.current = ma120Ref.current = null
      bbUpperRef.current = bbMidRef.current = bbLowerRef.current = null
      rsiSeriesRef.current = macdSeriesRef.current = adxSeriesRef.current = null
      posLinesRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval, chartConfig.showMA, chartConfig.showBB, chartConfig.showRSI, chartConfig.showMACD, chartConfig.showADX])

  // ── 포지션 가격선 업데이트 ────────────────────────────────

  useEffect(() => {
    if (!candleSeriesRef.current) return

    posLinesRef.current.forEach(l => candleSeriesRef.current?.removePriceLine(l))
    posLinesRef.current = []

    if (!position) return

    const lines: IPriceLine[] = []

    lines.push(candleSeriesRef.current.createPriceLine({
      price: position.entry_price, color: '#a1a1aa',
      lineWidth: 1, lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: position.direction === 'LONG' ? '롱 진입' : '숏 진입',
    }))
    if (position.target_price != null) {
      lines.push(candleSeriesRef.current.createPriceLine({
        price: position.target_price, color: '#10b981',
        lineWidth: 1, lineStyle: LineStyle.Dashed,
        axisLabelVisible: true, title: 'TP',
      }))
    }
    if (position.stop_loss != null) {
      lines.push(candleSeriesRef.current.createPriceLine({
        price: position.stop_loss, color: '#ef4444',
        lineWidth: 1, lineStyle: LineStyle.Dashed,
        axisLabelVisible: true, title: 'SL',
      }))
    }

    posLinesRef.current = lines
  }, [position])

  // ── 범례 레이블 ───────────────────────────────────────────

  const legendItems = [
    ...(chartConfig.showMA ? [
      { color: '#f59e0b', label: 'MA20' },
      { color: '#f97316', label: 'MA60' },
      { color: '#a855f7', label: 'MA120' },
    ] : []),
    ...(chartConfig.showBB ? [{ color: '#3b82f6', label: 'BB' }] : []),
  ]

  return (
    <Box sx={{ position: 'relative' }}>
      <Box ref={containerRef} sx={{ width: '100%', borderRadius: 2, overflow: 'hidden' }} />

      {/* LIVE 배지 + 범례 */}
      <Box sx={{
        position: 'absolute', top: 10, left: 10,
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1, py: 0.4, borderRadius: 1, background: '#0a0a0bcc',
        pointerEvents: 'none',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{
            width: 5, height: 5, borderRadius: '50%', bgcolor: '#4ade80',
            animation: 'pulse 2s infinite',
            '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
          }} />
          <Typography sx={{ fontSize: 9, color: '#4ade80', fontWeight: 700, letterSpacing: '0.08em' }}>LIVE</Typography>
          <Typography sx={{ fontSize: 9, color: '#52525b' }}>{symbol} · {interval}</Typography>
        </Box>
        {legendItems.map(({ color, label }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
            <Box sx={{ width: 12, height: 2, bgcolor: color, borderRadius: 1 }} />
            <Typography sx={{ fontSize: 8, color: '#52525b' }}>{label}</Typography>
          </Box>
        ))}
      </Box>

      {/* 하단 인디케이터 레이블 */}
      {(chartConfig.showRSI || chartConfig.showMACD || chartConfig.showADX) && (
        <Box sx={{
          position: 'absolute', bottom: 8, left: 10,
          display: 'flex', gap: 1, pointerEvents: 'none',
        }}>
          {chartConfig.showRSI  && <Typography sx={{ fontSize: 8, color: '#e2e8f066', fontWeight: 600 }}>RSI</Typography>}
          {chartConfig.showMACD && <Typography sx={{ fontSize: 8, color: '#a1a1aa66', fontWeight: 600 }}>MACD</Typography>}
          {chartConfig.showADX  && <Typography sx={{ fontSize: 8, color: '#f59e0b66', fontWeight: 600 }}>ADX</Typography>}
        </Box>
      )}
    </Box>
  )
})

export default PaperChart
