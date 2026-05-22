import { useState, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import { detectLatestSignal, STOCK_SYMBOLS, STOCK_INTERVALS, type StockSignal } from '../../lib/stock'
import type { BacktestParams } from '../../lib/backtest/types'

const STORAGE_KEY = 'stock-paper-state'

interface PaperPosition {
  id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entryPrice: number
  tp: number | null
  sl: number | null
  quantity: number
  capitalUsed: number
  entryTime: string
  score: number
  signalDetails: string
}

interface PaperTrade extends PaperPosition {
  exitPrice: number
  exitTime: string
  exitReason: string
  netPnl: number
  pnlPct: number
}

interface PaperState {
  initialCapital: number
  capital: number
  positions: PaperPosition[]
  trades: PaperTrade[]
  lastUpdated: string | null
  config: Pick<BacktestParams,
    'symbol' | 'interval' | 'minScore' | 'rsiOversold' | 'rsiOverbought' |
    'scoreUseRSI' | 'scoreUseMACD' | 'scoreUseBB' | 'scoreUseADX' | 'scoreUseGoldenCross' | 'scoreUseRVOL' |
    'adxThreshold' | 'fixedTP' | 'fixedSL'
  >
}

const DEFAULT_CONFIG: PaperState['config'] = {
  symbol: 'AAPL',
  interval: '1d',
  minScore: 3,
  rsiOversold: 35,
  rsiOverbought: 65,
  scoreUseRSI: true,
  scoreUseMACD: true,
  scoreUseBB: false,
  scoreUseADX: true,
  scoreUseGoldenCross: true,
  scoreUseRVOL: false,
  adxThreshold: 20,
  fixedTP: 10,
  fixedSL: 5,
}

const COMMISSION = 0.001  // 0.1%

function loadState(): PaperState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PaperState
  } catch { /* ignore */ }
  return { initialCapital: 10000, capital: 10000, positions: [], trades: [], lastUpdated: null, config: DEFAULT_CONFIG }
}

function saveState(s: PaperState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

const fmtUSD = (v: number) => `$${v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })

function PnlText({ value }: { value: number }) {
  return <Typography component="span" sx={{ color: value >= 0 ? '#10b981' : '#ef4444', fontFamily: 'monospace', fontSize: 13 }}>
    {fmtPct(value)}
  </Typography>
}

export default function StockPaper() {
  const [state, setState] = useState<PaperState>(loadState)
  const [loading, setLoading] = useState(false)
  const [, setLastSignal] = useState<StockSignal | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const update = useCallback((updater: (s: PaperState) => PaperState) => {
    setState(prev => {
      const next = updater(prev)
      saveState(next)
      return next
    })
  }, [])

  const setConfig = (key: keyof PaperState['config'], value: unknown) =>
    update(s => ({ ...s, config: { ...s.config, [key]: value } }))

  const fullParams: BacktestParams = {
    ...state.config,
    leverage: 1,
    initialCapital: state.initialCapital,
    startDate: '', endDate: '',
    scoreUseIchi: false, scoreUseFedLiquidity: false, scoreUseCCI: false, scoreUseVWMA: false,
    rvolThreshold: 1.5, rvolSkip: 0.4, fedLiquidityMAPeriod: 13,
    cciOversold: -100, cciOverbought: 100, cciMaxEntry: 0,
    tpslMode: 'fixed', useDailyTrend: false, scoreExitThreshold: 1,
  }

  async function handleRefresh() {
    setLoading(true)
    setMessage(null)
    setLastSignal(null)
    try {
      const { signal, rows } = await detectLatestSignal(state.config.symbol, fullParams)
      const now = new Date().toISOString()
      const latestRow = rows[rows.length - 1]

      let msg = ''

      update(s => {
        let { capital, positions, trades } = s

        // 기존 포지션 TP/SL 체크
        const still: PaperPosition[] = []
        for (const pos of positions) {
          const { high, low } = latestRow ?? { high: pos.entryPrice, low: pos.entryPrice }
          let exitPrice: number | null = null
          let exitReason = ''

          if (pos.direction === 'LONG') {
            if (pos.sl != null && low <= pos.sl) { exitPrice = pos.sl; exitReason = 'SL' }
            else if (pos.tp != null && high >= pos.tp) { exitPrice = pos.tp; exitReason = 'TP' }
          } else {
            if (pos.sl != null && high >= pos.sl) { exitPrice = pos.sl; exitReason = 'SL' }
            else if (pos.tp != null && low <= pos.tp) { exitPrice = pos.tp; exitReason = 'TP' }
          }

          if (exitPrice != null) {
            const isShort  = pos.direction === 'SHORT'
            const grossPnl = isShort
              ? pos.quantity * (pos.entryPrice - exitPrice)
              : pos.quantity * (exitPrice - pos.entryPrice)
            const commission = (pos.entryPrice + exitPrice) * pos.quantity * COMMISSION
            const netPnl = grossPnl - commission
            const pnlPct = (netPnl / pos.capitalUsed) * 100

            capital += pos.capitalUsed + netPnl
            trades = [{ ...pos, exitPrice, exitTime: now, exitReason, netPnl, pnlPct }, ...trades]
            msg += `${pos.symbol} ${pos.direction} ${exitReason} @ $${exitPrice.toFixed(2)} (${fmtPct(pnlPct)})\n`
          } else {
            still.push(pos)
          }
        }
        positions = still

        // 새 신호 진입
        if (signal && !positions.some(p => p.symbol === state.config.symbol)) {
          const qty = (capital * 0.95) / signal.entryPrice
          const capitalUsed = qty * signal.entryPrice
          if (capitalUsed > 0 && capitalUsed <= capital) {
            capital -= capitalUsed
            positions = [...positions, {
              id: crypto.randomUUID(),
              symbol: state.config.symbol,
              direction: signal.direction,
              entryPrice: signal.entryPrice,
              tp: signal.tp,
              sl: signal.sl,
              quantity: qty,
              capitalUsed,
              entryTime: signal.ts,
              score: signal.score,
              signalDetails: signal.signalDetails,
            }]
            msg += `진입: ${state.config.symbol} ${signal.direction} @ $${signal.entryPrice.toFixed(2)} (score ${signal.score})\n`
          }
        } else if (!signal) {
          msg = msg || `신호 없음`
        }

        return { ...s, capital, positions, trades, lastUpdated: now }
      })

      setLastSignal(signal)
      setMessage(msg.trim() || '포지션 변화 없음')
    } catch (err) {
      setMessage(`오류: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    if (!confirm('페이퍼 트레이딩을 초기화할까요?')) return
    const fresh: PaperState = {
      initialCapital: state.initialCapital,
      capital: state.initialCapital,
      positions: [],
      trades: [],
      lastUpdated: null,
      config: state.config,
    }
    saveState(fresh)
    setState(fresh)
    setLastSignal(null)
    setMessage(null)
  }

  const totalValue = state.capital + state.positions.reduce((s, p) => s + p.capitalUsed, 0)
  const totalReturn = ((totalValue - state.initialCapital) / state.initialCapital) * 100

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 설정 패널 */}
      <Card sx={{ background: '#141417', border: '1px solid #27272a' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              label="Symbol"
              size="small"
              value={state.config.symbol}
              onChange={e => setConfig('symbol', e.target.value.toUpperCase())}
              sx={{ width: 100 }}
              inputProps={{ style: { textTransform: 'uppercase', fontFamily: 'monospace' } }}
            />
            {STOCK_SYMBOLS.map(s => (
              <Chip key={s} label={s} size="small"
                onClick={() => setConfig('symbol', s)}
                variant={state.config.symbol === s ? 'filled' : 'outlined'}
                sx={{ fontSize: 11, cursor: 'pointer', borderColor: '#3f3f46' }}
              />
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ width: 100 }}>
              <InputLabel>Interval</InputLabel>
              <Select label="Interval" value={state.config.interval} onChange={e => setConfig('interval', e.target.value)}>
                {STOCK_INTERVALS.map(i => <MenuItem key={i} value={i}>{i}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Capital ($)" type="number" size="small"
              value={state.initialCapital}
              onChange={e => update(s => ({ ...s, initialCapital: Number(e.target.value) }))}
              sx={{ width: 120 }} inputProps={{ min: 100, step: 1000 }}
            />
            <TextField label="Min Score" type="number" size="small"
              value={state.config.minScore} onChange={e => setConfig('minScore', Number(e.target.value))}
              sx={{ width: 100 }} inputProps={{ min: 1, max: 8 }}
            />
            <TextField label="TP %" type="number" size="small"
              value={state.config.fixedTP} onChange={e => setConfig('fixedTP', Number(e.target.value))}
              sx={{ width: 90 }} inputProps={{ min: 1, step: 0.5 }}
            />
            <TextField label="SL %" type="number" size="small"
              value={state.config.fixedSL} onChange={e => setConfig('fixedSL', Number(e.target.value))}
              sx={{ width: 90 }} inputProps={{ min: 0.5, step: 0.5 }}
            />
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {(['scoreUseRSI', 'scoreUseMACD', 'scoreUseBB', 'scoreUseADX', 'scoreUseGoldenCross', 'scoreUseRVOL'] as const).map(key => (
              <FormControlLabel key={key}
                control={<Switch size="small" checked={state.config[key] as boolean} onChange={e => setConfig(key, e.target.checked)} />}
                label={<Typography sx={{ fontSize: 12, color: '#a1a1aa' }}>{key.replace('scoreUse', '')}</Typography>}
                sx={{ m: 0 }}
              />
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={handleRefresh} disabled={loading}
              sx={{ background: '#3b82f6', '&:hover': { background: '#2563eb' }, minWidth: 120 }}>
              {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : '새로고침'}
            </Button>
            <Button variant="outlined" onClick={handleReset} color="error" size="small">초기화</Button>
          </Box>
        </CardContent>
      </Card>

      {/* 포트폴리오 요약 */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        {[
          { label: 'Total Value', value: fmtUSD(totalValue) },
          { label: 'Cash', value: fmtUSD(state.capital) },
          { label: 'Return', value: fmtPct(totalReturn), color: totalReturn >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Trades', value: String(state.trades.length) },
        ].map(({ label, value, color }) => (
          <Box key={label} sx={{ px: 2, py: 1.5, borderRadius: 2, background: '#18181b', border: '1px solid #27272a', flex: 1 }}>
            <Typography sx={{ fontSize: 9, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>{label}</Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: color ?? '#fafafa' }}>{value}</Typography>
          </Box>
        ))}
      </Box>

      {message && (
        <Card sx={{ background: '#0f1f0f', border: '1px solid #166534' }}>
          <CardContent sx={{ py: '8px !important' }}>
            <Typography sx={{ fontSize: 12, color: '#86efac', whiteSpace: 'pre-line' }}>{message}</Typography>
            {state.lastUpdated && (
              <Typography sx={{ fontSize: 10, color: '#52525b', mt: 0.5 }}>
                Updated: {new Date(state.lastUpdated).toLocaleString('en')}
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* 오픈 포지션 */}
      <Card sx={{ background: '#141417', border: '1px solid #27272a' }}>
        <CardContent>
          <Typography sx={{ fontSize: 12, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5 }}>
            Open Positions ({state.positions.length})
          </Typography>
          {state.positions.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: '#52525b' }}>포지션 없음</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {state.positions.map(pos => (
                <Box key={pos.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', p: 1.5, borderRadius: 1.5, background: '#18181b' }}>
                  <Chip label={pos.symbol} size="small" sx={{ fontFamily: 'monospace', fontWeight: 700 }} />
                  <Chip label={pos.direction} size="small" color={pos.direction === 'LONG' ? 'success' : 'error'} variant="outlined" />
                  <Typography sx={{ fontSize: 13, fontFamily: 'monospace', color: '#a1a1aa' }}>
                    Entry: <span style={{ color: '#fafafa' }}>${pos.entryPrice.toFixed(2)}</span>
                  </Typography>
                  {pos.tp && <Typography sx={{ fontSize: 12, color: '#10b981', fontFamily: 'monospace' }}>TP: ${pos.tp.toFixed(2)}</Typography>}
                  {pos.sl && <Typography sx={{ fontSize: 12, color: '#ef4444', fontFamily: 'monospace' }}>SL: ${pos.sl.toFixed(2)}</Typography>}
                  <Typography sx={{ fontSize: 12, color: '#52525b' }}>{fmtDate(pos.entryTime)}</Typography>
                  <Typography sx={{ fontSize: 11, color: '#71717a' }}>score: {pos.score}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* 거래 내역 */}
      <Card sx={{ background: '#141417', border: '1px solid #27272a' }}>
        <CardContent>
          <Typography sx={{ fontSize: 12, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5 }}>
            Trade History ({state.trades.length})
          </Typography>
          {state.trades.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: '#52525b' }}>거래 없음</Typography>
          ) : (
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' }}>
              <Box component="thead">
                <Box component="tr" sx={{ '& th': { color: '#52525b', textAlign: 'left', pb: 1, pr: 3, fontWeight: 400, fontSize: 10, textTransform: 'uppercase' } }}>
                  <th>Date</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Reason</th><th>P&L</th>
                </Box>
              </Box>
              <Box component="tbody">
                {state.trades.map(t => (
                  <Box component="tr" key={t.id} sx={{ '& td': { py: 0.75, pr: 3, borderTop: '1px solid #27272a' } }}>
                    <td><Typography sx={{ fontSize: 11, color: '#71717a' }}>{fmtDate(t.exitTime)}</Typography></td>
                    <td><Typography sx={{ fontSize: 12, fontWeight: 700 }}>{t.symbol}</Typography></td>
                    <td><Typography sx={{ fontSize: 12, color: t.direction === 'LONG' ? '#10b981' : '#ef4444' }}>{t.direction}</Typography></td>
                    <td>${t.entryPrice.toFixed(2)}</td>
                    <td>${t.exitPrice.toFixed(2)}</td>
                    <td><Typography sx={{ fontSize: 11, color: '#a1a1aa' }}>{t.exitReason}</Typography></td>
                    <td><PnlText value={t.pnlPct} /></td>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
