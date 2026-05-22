import { useState, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import { runStockBacktest, STOCK_SYMBOLS, STOCK_INTERVALS } from '../../lib/stock'
import BacktestChart from '../CryptoExplorer/backtest/BacktestChart'
import ResultSummary from '../CryptoExplorer/backtest/ResultSummary'
import TradeList from '../CryptoExplorer/backtest/TradeList'
import type { BacktestResult, BacktestTrade, OHLCVCandle } from '../CryptoExplorer/backtest/types'
import type { BacktestParams } from '../../lib/backtest/types'

const today = new Date().toISOString().slice(0, 10)
const oneYearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)

const DEFAULT_PARAMS: BacktestParams = {
  symbol: 'AAPL',
  startDate: oneYearAgo,
  endDate: today,
  interval: '1d',
  leverage: 1,
  initialCapital: 10000,
  minScore: 3,
  rsiOversold: 35,
  rsiOverbought: 65,
  scoreUseRSI: true,
  scoreUseMACD: true,
  scoreUseBB: false,
  scoreUseADX: true,
  scoreUseRVOL: false,
  scoreUseGoldenCross: true,
  scoreUseIchi: false,
  scoreUseFedLiquidity: false,
  scoreUseCCI: false,
  scoreUseVWMA: false,
  adxThreshold: 20,
  rvolThreshold: 1.5,
  rvolSkip: 0.4,
  fedLiquidityMAPeriod: 13,
  cciOversold: -100,
  cciOverbought: 100,
  cciMaxEntry: 0,
  fixedTP: 10,
  fixedSL: 5,
  tpslMode: 'fixed',
  useDailyTrend: false,
  scoreExitThreshold: 1,
}

function NumField({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      inputProps={{ min, max, step }}
      sx={{ width: 110, '& .MuiInputBase-input': { fontSize: 13 } }}
    />
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <FormControlLabel
      control={<Switch checked={checked} onChange={e => onChange(e.target.checked)} size="small" />}
      label={<Typography sx={{ fontSize: 12, color: '#a1a1aa' }}>{label}</Typography>}
      sx={{ m: 0 }}
    />
  )
}

export default function StockBacktest() {
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [trades, setTrades] = useState<BacktestTrade[]>([])
  const [candles, setCandles] = useState<OHLCVCandle[]>([])
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const scrollToRef = useRef<((ts: string) => void) | null>(null)

  const set = (key: keyof BacktestParams, value: unknown) =>
    setParams(p => ({ ...p, [key]: value }))

  async function handleRun() {
    setLoading(true)
    setError(null)
    setResult(null)
    setTrades([])
    setCandles([])
    try {
      const { result: res, rows, startMs } = await runStockBacktest(params)
      setResult(res)

      // simulate의 BacktestTrade → UI BacktestTrade 변환 (누락 필드 기본값 채움)
      const uiTrades: BacktestTrade[] = (res.trade_log as any[]).map((t, idx) => ({
        id: String(idx),
        avg_entry_price: t.entry_price,
        gross_pnl: null,
        commission: (t as any).commission ?? null,
        entry_count: 1,
        add_count: 0,
        add_entries: [],
        ...t,
      }))
      setTrades(uiTrades)

      // 워밍업 제외한 실제 백테스트 기간 캔들만 차트에 표시
      const KST_OFFSET_S = 9 * 3600
      const chartCandles: OHLCVCandle[] = rows
        .filter(r => r.timestamp >= startMs)
        .map(r => ({
          time: (Math.floor(r.timestamp / 1000) + KST_OFFSET_S) as import('lightweight-charts').UTCTimestamp,
          open:  r.open,
          high:  r.high,
          low:   r.low,
          close: r.close,
        }))
      setCandles(chartCandles)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ── 파라미터 패널 ── */}
      <Card sx={{ background: '#141417', border: '1px solid #27272a' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Symbol */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              label="Symbol"
              size="small"
              value={params.symbol}
              onChange={e => set('symbol', e.target.value.toUpperCase())}
              sx={{ width: 110 }}
              inputProps={{ style: { textTransform: 'uppercase', fontFamily: 'monospace' } }}
            />
            {STOCK_SYMBOLS.map(s => (
              <Chip
                key={s}
                label={s}
                size="small"
                onClick={() => set('symbol', s)}
                variant={params.symbol === s ? 'filled' : 'outlined'}
                sx={{ fontSize: 11, cursor: 'pointer', borderColor: '#3f3f46' }}
              />
            ))}
          </Box>

          {/* Interval + Dates */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ width: 100 }}>
              <InputLabel>Interval</InputLabel>
              <Select
                label="Interval"
                value={params.interval}
                onChange={e => set('interval', e.target.value)}
              >
                {STOCK_INTERVALS.map(i => <MenuItem key={i} value={i}>{i}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Start" type="date" size="small" value={params.startDate}
              onChange={e => set('startDate', e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
            <TextField label="End" type="date" size="small" value={params.endDate}
              onChange={e => set('endDate', e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
            <NumField label="Capital ($)" value={params.initialCapital} onChange={v => set('initialCapital', v)} min={100} step={1000} />
          </Box>

          {/* 지표 토글 */}
          <Box>
            <Typography sx={{ fontSize: 11, color: '#52525b', mb: 1, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Indicators
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Toggle label="RSI" checked={params.scoreUseRSI} onChange={v => set('scoreUseRSI', v)} />
              <Toggle label="MACD" checked={params.scoreUseMACD} onChange={v => set('scoreUseMACD', v)} />
              <Toggle label="BB" checked={params.scoreUseBB} onChange={v => set('scoreUseBB', v)} />
              <Toggle label="ADX" checked={params.scoreUseADX} onChange={v => set('scoreUseADX', v)} />
              <Toggle label="Golden Cross" checked={params.scoreUseGoldenCross} onChange={v => set('scoreUseGoldenCross', v)} />
              <Toggle label="RVOL" checked={params.scoreUseRVOL} onChange={v => set('scoreUseRVOL', v)} />
            </Box>
          </Box>

          {/* 수치 파라미터 */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <NumField label="Min Score" value={params.minScore} onChange={v => set('minScore', v)} min={1} max={8} />
            {params.scoreUseRSI && <>
              <NumField label="RSI OS" value={params.rsiOversold} onChange={v => set('rsiOversold', v)} min={10} max={50} />
              <NumField label="RSI OB" value={params.rsiOverbought} onChange={v => set('rsiOverbought', v)} min={50} max={90} />
            </>}
            {params.scoreUseADX &&
              <NumField label="ADX Thresh" value={params.adxThreshold} onChange={v => set('adxThreshold', v)} min={10} max={40} />
            }
            <NumField label="TP %" value={params.fixedTP} onChange={v => set('fixedTP', v)} min={1} max={50} step={0.5} />
            <NumField label="SL %" value={params.fixedSL} onChange={v => set('fixedSL', v)} min={0.5} max={30} step={0.5} />
          </Box>

          <Button
            variant="contained"
            onClick={handleRun}
            disabled={loading}
            sx={{ alignSelf: 'flex-start', minWidth: 120, background: '#3b82f6', '&:hover': { background: '#2563eb' } }}
          >
            {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Run Backtest'}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card sx={{ background: '#1c0f0f', border: '1px solid #7f1d1d' }}>
          <CardContent>
            <Typography sx={{ color: '#f87171', fontSize: 13 }}>{error}</Typography>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <ResultSummary result={result} trades={trades} />
          {candles.length > 0 && (
            <BacktestChart
              candles={candles}
              trades={trades}
              scrollToRef={scrollToRef}
              selectedTradeId={selectedTradeId}
            />
          )}
          <TradeList
            trades={trades}
            loading={false}
            selectedTradeId={selectedTradeId}
            onScrollTo={ts => scrollToRef.current?.(ts)}
            onSelectTrade={id => setSelectedTradeId(id === selectedTradeId ? null : id)}
          />
        </>
      )}
    </Box>
  )
}
