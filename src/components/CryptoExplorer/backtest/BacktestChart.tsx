import { useEffect, useRef, memo } from 'react'
import Box from '@mui/material/Box'
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
import type { OHLCVCandle, BacktestTrade } from './types'
import { parseAddEntries, fmtPct } from './utils'

interface Props {
  candles: OHLCVCandle[]
  trades: BacktestTrade[]
  scrollToRef: React.MutableRefObject<((ts: string) => void) | null>
  selectedTradeId: string | null
}

const BacktestChart = memo(function BacktestChart({ candles, trades, scrollToRef, selectedTradeId }: Props) {
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

  // 1차: 차트 초기화 (candles/trades 변경 시, selectedTradeId 제외)
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

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

    series.setData(candles)
    chart.timeScale().fitContent()

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

  // 2차: 마커 업데이트 (selectedTradeId 변경 시 — 차트 유지)
  useEffect(() => {
    if (!seriesRef.current || trades.length === 0) return

    const allMarkers: SeriesMarker<Time>[] = []
    for (const t of trades) {
      const exitTime = Math.floor(new Date(t.exit_ts).getTime() / 1000) as UTCTimestamp
      const win = t.net_pnl > 0
      const isShort = t.direction === 'SHORT'
      const isSelected = t.id === selectedTradeId

      const entries = parseAddEntries(t)
      for (const e of entries) {
        const eTime = Math.floor(new Date(e.ts).getTime() / 1000) as UTCTimestamp
        const color = isSelected ? '#fbbf24' : (isShort ? '#ef4444' : '#3b82f6')
        allMarkers.push({
          time: eTime,
          position: isShort ? 'aboveBar' : 'belowBar',
          color,
          shape: isShort ? 'arrowDown' : 'arrowUp',
          text: e.step === 1 ? (isShort ? '숏진입' : '롱진입') : (isShort ? '숏추가' : '롱추가'),
        })
      }

      allMarkers.push({
        time: exitTime,
        position: isShort ? 'belowBar' : 'aboveBar',
        color: isSelected ? '#fbbf24' : (win ? '#10b981' : '#ec4899'),
        shape: isShort ? 'arrowUp' : 'arrowDown',
        text: `${win ? '익절' : '손절'} ${fmtPct(t.pnl_pct)}`,
      })
    }

    allMarkers.sort((a, b) => (a.time as number) - (b.time as number))
    markersRef.current = createSeriesMarkers(seriesRef.current, allMarkers)
  }, [selectedTradeId, trades])

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: 400, borderRadius: 2, overflow: 'hidden' }} />
  )
})

export default BacktestChart
