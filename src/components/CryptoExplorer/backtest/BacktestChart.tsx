import { useEffect, useRef, memo } from 'react'

const KST_OFFSET_S = 9 * 3600
const toKST = (ms: number) => (Math.floor(ms / 1000) + KST_OFFSET_S) as UTCTimestamp
const tsToKST = (iso: string) => toKST(new Date(iso).getTime())
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
      const t = tsToKST(ts)
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
      localization: {
        timeFormatter: (t: number) => {
          // t는 KST 기준 UTCTimestamp(초) → UTC getter로 KST 시각 읽기
          const d = new Date(t * 1000)
          const y  = d.getUTCFullYear()
          const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
          const dd = String(d.getUTCDate()).padStart(2, '0')
          const hh = String(d.getUTCHours()).padStart(2, '0')
          const mm = String(d.getUTCMinutes()).padStart(2, '0')
          return `${y}-${mo}-${dd} ${hh}:${mm}`
        },
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

    // 마커 시각을 가장 가까운 캔들 open time에 스냅 (floor)
    const candleTimes = candles.map(c => c.time as number).sort((a, b) => a - b)
    const snapToCandle = (kstTs: number): UTCTimestamp => {
      let lo = 0, hi = candleTimes.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (candleTimes[mid] <= kstTs) lo = mid
        else hi = mid - 1
      }
      return candleTimes[lo] as UTCTimestamp
    }

    const allMarkers: SeriesMarker<Time>[] = []
    for (const t of trades) {
      const exitTime = snapToCandle(tsToKST(t.exit_ts) as number)
      const win = t.net_pnl > 0
      const isShort = t.direction === 'SHORT'
      const isSelected = t.id === selectedTradeId

      const entries = parseAddEntries(t)
      for (const e of entries) {
        const eTime = snapToCandle(tsToKST(e.ts) as number)
        const color = isSelected ? '#fbbf24' : (isShort ? '#ef4444' : '#3b82f6')
        allMarkers.push({
          time: eTime,
          position: isShort ? 'aboveBar' : 'belowBar',
          color,
          shape: isShort ? 'arrowUp' : 'arrowDown',
          text: e.step === 1 ? (isShort ? '숏진입' : '롱진입') : (isShort ? '숏추가' : '롱추가'),
        })
      }

      allMarkers.push({
        time: exitTime,
        position: isShort ? 'belowBar' : 'aboveBar',
        color: isSelected ? '#fbbf24' : (win ? '#10b981' : '#ec4899'),
        shape: isShort ? 'arrowDown' : 'arrowUp',
        text: `${win ? '익절' : '손절'} ${fmtPct(t.pnl_pct)}`,
      })
    }

    allMarkers.sort((a, b) => (a.time as number) - (b.time as number))
    markersRef.current = createSeriesMarkers(seriesRef.current, allMarkers)
  }, [selectedTradeId, trades, candles])

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: 400, borderRadius: 2, overflow: 'hidden' }} />
  )
})

export default BacktestChart
