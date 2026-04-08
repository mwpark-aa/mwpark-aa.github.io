// Crypto Backtest — browser-side execution
// Real implementation. git update-index --skip-worktree keeps this local.

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BacktestParams {
  symbol: string
  startDate: string
  endDate: string
  interval: string
  leverage: number
  minRR: number
  minRRRatio: number
  rsiOversold: number
  rsiOverbought: number
  minScore: number
  initialCapital: number
  scoreUseADX: boolean
  scoreUseOBV: boolean
  scoreUseMFI: boolean
  scoreUseMACD: boolean
  scoreUseStoch: boolean
  scoreUseRSI: boolean
  scoreUseRVOL: boolean
  adxThreshold: number
  mfiThreshold: number
  stochOversold: number
  stochOverbought: number
  rvolThreshold: number
  rvolSkip: number
  scoreUseIchi: boolean
  scoreUseGoldenCross: boolean
  scoreUseFedLiquidity: boolean
  fedLiquidityMAPeriod: number  // MA 기간 (주 단위 데이터포인트, 기본 13 ≈ 3개월)
  fixedTP: number   // 고정 익절 % (현물 기준, 0 = ATR 자동)
  fixedSL: number   // 고정 손절 % (현물 기준, 0 = ATR 자동)
  tpslMode: 'auto' | 'fixed'  // auto=손익비 필터, fixed=고정 TP/SL
  useDailyTrend: boolean  // 일봉 추세 필터 (MTF): 일봉 MA120 방향과 일치할 때만 진입
}

export interface BacktestTrade {
  signal_type: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  exit_price: number
  tp: number
  sl: number
  quantity: number
  capital_used: number
  net_pnl: number
  pnl_pct: number
  exit_reason: string
  score: number
  entry_ts: string
  exit_ts: string
}

export interface BacktestResult {
  symbol: string
  interval: string
  start_date: string
  end_date: string
  initial_capital: number
  final_capital: number
  total_return_pct: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  max_drawdown_pct: number
  sharpe_ratio: number
  profit_factor: number | null
  trade_log: BacktestTrade[]
  equity_curve: number[]
  fed_latest_net_liquidity?: number | null  // 백테스트 기간 중 가장 최근 순유동성 (B 단위)
}

// ── Candle ─────────────────────────────────────────────────────────────────────

interface Candle {
  timestamp: number
  open: number; high: number; low: number; close: number; volume: number
  ma20?: number | null; ma60?: number | null; ma120?: number | null
  bb_upper?: number | null; bb_lower?: number | null
  rsi14?: number | null; atr14?: number | null
  vol_ma20?: number | null; vol_rvol168?: number
  adx14?: number | null; obv?: number; obv_ma20?: number | null
  mfi14?: number | null; macd_hist?: number | null; stoch_k?: number | null
  ichimoku_a?: number | null; ichimoku_b?: number | null
  swing_low?: number; swing_high?: number
  // 연준 유동성 (대차대조표 - TGA - 역레포)
  fed_net_liquidity?: number | null
  fed_state?: number | null  // 1=확장 확정(MA위+상승), -1=수축 확정(MA아래+하락), 0=혼재
}

// ── Constants ──────────────────────────────────────────────────────────────────

const COMMISSION       = 0.001
const MAX_CAPITAL_PCT  = 0.20
const RISK_PER_TRADE   = 0.04
const SL_ATR_MIN       = 0.6
const SL_ATR_MAX       = 2.6
const SWING_LOOKBACK   = 4
const VOLUME_MULT      = 1.1
const SIGNAL_COOLDOWN  = 4
const PARTIAL_TP_FACTOR    = 0.5
const PARTIAL_FRACTION     = 0.65
const TRAILING_STOP_PCT    = 0.025
const BELOW_TP1_BUFFER     = 0.01
const DAILY_LOSS_LIMIT_PCT = 0.06

const LONG_SIGNALS  = ['MA20_PULLBACK', 'RSI_OVERSOLD', 'BB_LOWER_TOUCH']
const SHORT_SIGNALS = ['MA20_BREAKDOWN', 'RSI_OVERBOUGHT', 'BB_UPPER_TOUCH', 'DEATH_CROSS']
// GOLDEN_CROSS 제거됨 (scoreUseGoldenCross로 이미 추세 반영)
const HIGH_CONF     = new Set(['DEATH_CROSS'])
const SELL_SIGNALS  = new Set(['DEATH_CROSS', 'RSI_OVERBOUGHT', 'BB_UPPER_TOUCH', 'MA20_BREAKDOWN'])

// ── Binance fetch ──────────────────────────────────────────────────────────────

async function fetchKlines(symbol: string, interval: string, startMs: number, endMs: number): Promise<Candle[]> {
  const rows: Candle[] = []
  let cursor = startMs
  while (cursor < endMs) {
    const url = new URL('https://api.binance.com/api/v3/klines')
    url.searchParams.set('symbol', `${symbol}USDT`)
    url.searchParams.set('interval', interval)
    url.searchParams.set('startTime', String(cursor))
    url.searchParams.set('endTime', String(endMs))
    url.searchParams.set('limit', '1000')
    const resp = await fetch(url.toString())
    if (!resp.ok) throw new Error(`Binance ${resp.status}`)
    const data: any[][] = await resp.json()
    if (!data.length) break
    for (const k of data) {
      rows.push({ timestamp: Number(k[0]), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] })
    }
    cursor = data[data.length - 1][0] + 1
    if (data.length < 1000) break
    await new Promise(r => setTimeout(r, 120))
  }
  return rows
}

// ── Fed Liquidity fetch ────────────────────────────────────────────────────────

interface FedBar { date: string; netLiquidity: number; ma: number | null; state: number }

async function fetchFedLiquidity(startDate: string, endDate: string, maPeriod: number): Promise<FedBar[]> {
  const base = import.meta.env.VITE_SUPABASE_URL as string
  if (!base) return []
  try {
    const resp = await fetch(`${base}/functions/v1/fed-liquidity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
      },
      body: JSON.stringify({ startDate, endDate, maPeriod }),
    })
    if (!resp.ok) return []
    const json = await resp.json()
    return (json.data ?? []) as FedBar[]
  } catch {
    return []
  }
}

/** Fed 데이터를 캔들에 forward-fill로 부착 */
function attachFedData(rows: Candle[], fedBars: FedBar[]): void {
  if (!fedBars.length) return
  // 날짜 순 정렬된 Fed 데이터
  const sorted = [...fedBars].sort((a, b) => a.date.localeCompare(b.date))

  let lastBar: FedBar | null = null
  let fedIdx = 0

  for (const row of rows) {
    const dateStr = new Date(row.timestamp).toISOString().slice(0, 10)
    // sorted에서 현재 날짜 이하인 최신 bar를 찾아 forward-fill
    while (fedIdx < sorted.length && sorted[fedIdx].date <= dateStr) {
      lastBar = sorted[fedIdx]
      fedIdx++
    }
    if (lastBar) {
      row.fed_net_liquidity = lastBar.netLiquidity
      row.fed_state         = lastBar.state
    }
  }
}

// ── Indicators ─────────────────────────────────────────────────────────────────

function sma(v: number[], w: number): (number | null)[] {
  const r: (number | null)[] = Array(v.length).fill(null)
  for (let i = w - 1; i < v.length; i++) {
    let s = 0; for (let j = i - w + 1; j <= i; j++) s += v[j]; r[i] = s / w
  }
  return r
}

function std(v: number[], w: number): (number | null)[] {
  const m = sma(v, w)
  const r: (number | null)[] = Array(v.length).fill(null)
  for (let i = w - 1; i < v.length; i++) {
    let variance = 0; for (let j = i - w + 1; j <= i; j++) variance += (v[j] - m[i]!) ** 2
    r[i] = Math.sqrt(variance / w)
  }
  return r
}

function ema(v: number[], span: number): (number | null)[] {
  const r: (number | null)[] = Array(v.length).fill(null)
  const a = 2 / (span + 1); let val: number | null = null; let ws = 0
  for (let i = 0; i < v.length; i++) {
    if (i < span - 1) { ws += v[i] }
    else if (i === span - 1) { ws += v[i]; val = ws / span; r[i] = val }
    else { val = val! * (1 - a) + v[i] * a; r[i] = val }
  }
  return r
}

function rsi14(closes: number[]): (number | null)[] {
  const r: (number | null)[] = Array(closes.length).fill(null)
  const a = 1 / 14; let ag = 0, al = 0
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    const g = Math.max(d, 0), l = Math.max(-d, 0)
    if (i < 14) { ag = (ag * (i - 1) + g) / i; al = (al * (i - 1) + l) / i }
    else {
      ag = ag * (1 - a) + g * a; al = al * (1 - a) + l * a
      r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
    }
  }
  return r
}

function atr14(rows: Candle[]): (number | null)[] {
  const n = rows.length; const r: (number | null)[] = Array(n).fill(null)
  const trs: number[] = []
  for (let i = 1; i < n; i++) {
    const { high: h, low: l } = rows[i]; const pc = rows[i - 1].close
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  let v: number | null = null
  for (let idx = 0; idx < trs.length; idx++) {
    if (idx < 13) continue
    v = idx === 13 ? trs.slice(0, 14).reduce((a, b) => a + b) / 14 : (v! * 13 + trs[idx]) / 14
    r[idx + 1] = v
  }
  return r
}

function adx14(rows: Candle[]): (number | null)[] {
  const n = rows.length; const out: (number | null)[] = Array(n).fill(null)
  const pdm: number[] = [], mdm: number[] = [], tr: number[] = []
  for (let i = 1; i < n; i++) {
    const h = rows[i].high, l = rows[i].low, ph = rows[i-1].high, pl = rows[i-1].low, pc = rows[i-1].close
    const up = h - ph, dn = pl - l
    pdm.push(up > dn && up > 0 ? up : 0)
    mdm.push(dn > up && dn > 0 ? dn : 0)
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  const wilder = (lst: number[]) => {
    const o: (number | null)[] = Array(lst.length).fill(null); let v: number | null = null
    for (let i = 0; i < lst.length; i++) {
      if (i < 13) continue
      v = i === 13 ? lst.slice(0, 14).reduce((a, b) => a + b) / 14 : (v! * 13 + lst[i]) / 14
      o[i] = v
    }; return o
  }
  const sp = wilder(pdm), sm = wilder(mdm), st = wilder(tr)
  const dx: (number | null)[] = Array(tr.length).fill(null)
  for (let i = 0; i < tr.length; i++) {
    if (!st[i] || st[i] === 0) continue
    const pdi = 100 * sp[i]! / st[i]!, mdi = 100 * sm[i]! / st[i]!, den = pdi + mdi
    dx[i] = den ? 100 * Math.abs(pdi - mdi) / den : 0
  }
  const vdx = dx.filter(x => x != null) as number[]
  let av: number | null = null, vc = 0
  for (let i = 0; i < dx.length; i++) {
    if (dx[i] == null) continue; vc++
    if (vc < 14) continue
    av = vc === 14 ? vdx.slice(0, 14).reduce((a, b) => a + b) / 14 : (av! * 13 + dx[i]!) / 14
    out[i + 1] = av
  }
  return out
}

function obv(rows: Candle[]): number[] {
  const r = [0]
  for (let i = 1; i < rows.length; i++) {
    r.push(rows[i].close > rows[i-1].close ? r[i-1] + rows[i].volume
         : rows[i].close < rows[i-1].close ? r[i-1] - rows[i].volume
         : r[i-1])
  }
  return r
}

function mfi14(rows: Candle[]): (number | null)[] {
  const n = rows.length; const r: (number | null)[] = Array(n).fill(null)
  const tp = rows.map(c => (c.high + c.low + c.close) / 3)
  const mf = rows.map((c, i) => tp[i] * c.volume)
  for (let i = 14; i < n; i++) {
    let pos = 0, neg = 0
    for (let j = i - 13; j <= i; j++) {
      if (j === 0) continue
      if (tp[j] > tp[j-1]) pos += mf[j]; else if (tp[j] < tp[j-1]) neg += mf[j]
    }
    r[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg)
  }
  return r
}

function macdHist(closes: number[]): (number | null)[] {
  const n = closes.length
  const e12 = ema(closes, 12), e26 = ema(closes, 26)
  const ml: (number | null)[] = closes.map((_, i) => e12[i] != null && e26[i] != null ? e12[i]! - e26[i]! : null)
  const sig = ema(ml.map(x => x ?? 0), 9)
  const r: (number | null)[] = Array(n).fill(null)
  for (let i = 0; i < n; i++) { if (ml[i] != null && sig[i] != null) r[i] = ml[i]! - sig[i]! }
  for (let i = 0; i < Math.min(34, n); i++) r[i] = null
  return r
}

function stochK(rows: Candle[], p = 14): (number | null)[] {
  const r: (number | null)[] = Array(rows.length).fill(null)
  for (let i = p - 1; i < rows.length; i++) {
    let lo = Infinity, hi = -Infinity
    for (let j = i - p + 1; j <= i; j++) { lo = Math.min(lo, rows[j].low); hi = Math.max(hi, rows[j].high) }
    r[i] = hi !== lo ? (rows[i].close - lo) / (hi - lo) * 100 : 50
  }
  return r
}

function computeIndicators(rows: Candle[]): void {
  const closes = rows.map(r => r.close), vols = rows.map(r => r.volume)
  const ma20 = sma(closes, 20), ma60 = sma(closes, 60), ma120 = sma(closes, 120)
  const bbMid = sma(closes, 20), bbStd = std(closes, 20)
  const rsi = rsi14(closes), atr = atr14(rows)
  const vm20 = sma(vols, 20), vm168 = sma(vols, 168)
  const adx = adx14(rows)
  const obvRaw = obv(rows), obvMa = sma(obvRaw, 20)
  const mfi = mfi14(rows), macd = macdHist(closes), stoch = stochK(rows)

  // 일목균형표: Span A/B (26봉 뒤에 그려지므로 현재봉 기준 26봉 전 값)
  const hl2 = rows.map(r => (r.high + r.low) / 2)
  const tenkan = sma(hl2, 9), kijun = sma(hl2, 26), sma52 = sma(hl2, 52)

  for (let i = 0; i < rows.length; i++) {
    const b168 = vm168[i]
    rows[i].ma20 = ma20[i]; rows[i].ma60 = ma60[i]; rows[i].ma120 = ma120[i]
    rows[i].bb_upper = bbMid[i] != null && bbStd[i] != null ? bbMid[i]! + 2 * bbStd[i]! : null
    rows[i].bb_lower = bbMid[i] != null && bbStd[i] != null ? bbMid[i]! - 2 * bbStd[i]! : null
    rows[i].rsi14 = rsi[i]; rows[i].atr14 = atr[i]
    rows[i].vol_ma20 = vm20[i]
    rows[i].vol_rvol168 = b168 ? Math.round(vols[i] / b168 * 1000) / 1000 : 1.0
    rows[i].adx14 = adx[i]; rows[i].obv = obvRaw[i]; rows[i].obv_ma20 = obvMa[i]
    rows[i].mfi14 = mfi[i]; rows[i].macd_hist = macd[i]; rows[i].stoch_k = stoch[i]
    // 일목 스팬: 현재봉의 구름은 26봉 전 tenkan/kijun으로 계산
    const shift = 26
    if (i >= shift) {
      const ta = tenkan[i - shift], ka = kijun[i - shift], sb = sma52[i - shift]
      rows[i].ichimoku_a = ta != null && ka != null ? (ta + ka) / 2 : null
      rows[i].ichimoku_b = sb ?? null
    } else {
      rows[i].ichimoku_a = null
      rows[i].ichimoku_b = null
    }
  }
}

// ── SL/TP ──────────────────────────────────────────────────────────────────────

function longSL(close: number, swingLow: number | null, atr: number | null): number {
  if (atr && atr > 0) {
    const floor = close - SL_ATR_MAX * atr, ceil = close - SL_ATR_MIN * atr
    return Math.round(Math.max(Math.min(swingLow ? swingLow * 0.998 : ceil, ceil), floor) * 1e6) / 1e6
  }
  return Math.round((swingLow ? swingLow * 0.998 : close * 0.98) * 1e6) / 1e6
}

function shortSL(close: number, swingHigh: number | null, atr: number | null): number {
  if (atr && atr > 0) {
    const ceil = close + SL_ATR_MAX * atr, floor = close + SL_ATR_MIN * atr
    return Math.round(Math.min(Math.max(swingHigh ? swingHigh * 1.002 : floor, floor), ceil) * 1e6) / 1e6
  }
  return Math.round((swingHigh ? swingHigh * 1.002 : close * 1.02) * 1e6) / 1e6
}

function calcTPSL(type: string, close: number, row: Candle, p: BacktestParams) {
  const isLong = LONG_SIGNALS.includes(type)
  const isShort = SHORT_SIGNALS.includes(type)
  let tp: number | null = null, sl: number | null = null

  if (isLong) {
    sl = p.fixedSL > 0
      ? Math.round(close * (1 - p.fixedSL / 100) * 1e6) / 1e6
      : longSL(close, row.swing_low ?? null, row.atr14 ?? null)
    tp = p.fixedTP > 0
      ? Math.round(close * (1 + p.fixedTP / 100) * 1e6) / 1e6
      : Math.round((close + (close - sl) * p.minRR) * 1e6) / 1e6
  } else if (isShort) {
    sl = p.fixedSL > 0
      ? Math.round(close * (1 + p.fixedSL / 100) * 1e6) / 1e6
      : shortSL(close, row.swing_high ?? null, row.atr14 ?? null)
    tp = p.fixedTP > 0
      ? Math.round(close * (1 - p.fixedTP / 100) * 1e6) / 1e6
      : Math.round((close - (sl - close) * p.minRR) * 1e6) / 1e6
  }
  const rr = tp != null && sl != null && sl !== close
    ? Math.round(Math.abs(tp - close) / Math.abs(close - sl) * 100) / 100 : null
  return { tp, sl, rr }
}

// ── Scoring ────────────────────────────────────────────────────────────────────

function scoreLong(row: Candle, p: BacktestParams): number {
  let s = 0; const rv = row.vol_rvol168 ?? 1.0
  // ADX: 추세 존재 → +1
  if (p.scoreUseADX   && row.adx14 != null && row.adx14 > p.adxThreshold) s++
  // OBV: 스마트머니 매집 → +1
  if (p.scoreUseOBV   && row.obv != null && row.obv_ma20 != null && row.obv > row.obv_ma20) s++
  // MFI: 자금 과열 아님 → +1
  if (p.scoreUseMFI   && row.mfi14 != null && row.mfi14 < p.mfiThreshold) s++
  // MACD: 상승 모멘텀 → +1
  if (p.scoreUseMACD  && row.macd_hist != null && row.macd_hist > 0) s++
  // Stoch: 과매수 아님 → +1
  if (p.scoreUseStoch && row.stoch_k != null && row.stoch_k < p.stochOverbought) s++
  // RSI: 건강 구간 → +1 (UI 파라미터 사용)
  if (p.scoreUseRSI   && row.rsi14 != null && row.rsi14 > p.rsiOversold && row.rsi14 < p.rsiOverbought) s++
  // RVOL: 거래량 급증 → +1
  if (p.scoreUseRVOL  && rv >= p.rvolThreshold) s++
  // 일목: 구름 위 → +1
  if (p.scoreUseIchi  && row.ichimoku_a != null && row.ichimoku_b != null
    && row.close > row.ichimoku_a && row.close > row.ichimoku_b) s++
  // 골든크로스 영역(MA20 > MA60) → +1
  if (p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null && row.ma20 > row.ma60) s++
  // 연준 유동성 확장 확정(MA 위 + 상승) → +1
  if (p.scoreUseFedLiquidity && row.fed_state === 1) s++
  return s
}

function scoreShort(row: Candle, p: BacktestParams): number {
  let s = 0; const rv = row.vol_rvol168 ?? 1.0
  // ADX: 추세 존재 → +1
  if (p.scoreUseADX   && row.adx14 != null && row.adx14 > p.adxThreshold) s++
  // OBV: 스마트머니 분산 → +1
  if (p.scoreUseOBV   && row.obv != null && row.obv_ma20 != null && row.obv < row.obv_ma20) s++
  // MFI: 자금 과열 → +1
  if (p.scoreUseMFI   && row.mfi14 != null && row.mfi14 > p.mfiThreshold) s++
  // MACD: 하락 모멘텀 → +1
  if (p.scoreUseMACD  && row.macd_hist != null && row.macd_hist < 0) s++
  // Stoch: 과매도 아님 → +1
  if (p.scoreUseStoch && row.stoch_k != null && row.stoch_k > p.stochOversold) s++
  // RSI: 건강 구간 → +1 (UI 파라미터 사용)
  if (p.scoreUseRSI   && row.rsi14 != null && row.rsi14 > p.rsiOversold && row.rsi14 < p.rsiOverbought) s++
  // RVOL: 거래량 급증 → +1
  if (p.scoreUseRVOL  && rv >= p.rvolThreshold) s++
  // 일목: 구름 아래 → +1
  if (p.scoreUseIchi  && row.ichimoku_a != null && row.ichimoku_b != null
    && row.close < row.ichimoku_a && row.close < row.ichimoku_b) s++
  // 데드크로스 영역(MA20 < MA60) → +1
  if (p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null && row.ma20 < row.ma60) s++
  // 연준 유동성 수축 확정(MA 아래 + 하락) → +1
  if (p.scoreUseFedLiquidity && row.fed_state === -1) s++
  return s
}

// ── Signal detection ───────────────────────────────────────────────────────────

function detectSignals(rows: Candle[], i: number, cd: Record<string, number>, p: BacktestParams) {
  if (i < 1) return []
  const prev = rows[i - 1], curr = rows[i], close = curr.close
  if ((curr.vol_rvol168 ?? 1.0) < p.rvolSkip) return []
  const ready = (t: string) => (cd[t] ?? 0) <= 0

  const lb = Math.min(SWING_LOOKBACK, i), win = rows.slice(i - lb, i + 1)
  const swL = Math.min(...win.map(r => r.low)), swH = Math.max(...win.map(r => r.high))
  const rL: Candle = { ...curr, swing_low: swL }, rS: Candle = { ...curr, swing_high: swH }

  const up = curr.ma20 != null && curr.ma60 != null && curr.ma20 > curr.ma60 && close > curr.ma60
  const dn = curr.ma20 != null && curr.ma60 != null && curr.ma20 < curr.ma60 && close < curr.ma60
  const volOk = curr.vol_ma20 == null || curr.volume >= curr.vol_ma20 * VOLUME_MULT

  const fired: any[] = []
  const add = (type: string, row: Candle, score: number) => {
    const { tp, sl, rr } = calcTPSL(type, close, row, p)
    fired.push({ signal_type: type, tp, sl, rr, score })
  }

  if (up && curr.ma20 != null && prev.ma20 != null
    && prev.close <= prev.ma20 && close > curr.ma20
    && curr.rsi14 != null && curr.rsi14 > p.rsiOversold && curr.rsi14 < p.rsiOverbought
    && volOk && ready('MA20_PULLBACK'))
    add('MA20_PULLBACK', rL, scoreLong(rL, p))

  if (up && curr.rsi14 != null && prev.rsi14 != null
    && prev.rsi14 < p.rsiOversold && curr.rsi14 > prev.rsi14 && curr.rsi14 < p.rsiOverbought - 15
    && ready('RSI_OVERSOLD'))
    add('RSI_OVERSOLD', rL, scoreLong(rL, p))

  if (up && prev.bb_lower != null && prev.close <= prev.bb_lower
    && curr.bb_lower != null && close > curr.bb_lower
    && curr.rsi14 != null && curr.rsi14 < p.rsiOverbought - 15 && volOk && ready('BB_LOWER_TOUCH'))
    add('BB_LOWER_TOUCH', rL, scoreLong(rL, p))

  if (dn && curr.ma20 != null && prev.ma20 != null
    && prev.close >= prev.ma20 && close < curr.ma20
    && curr.rsi14 != null && curr.rsi14 > p.rsiOversold + 15 && curr.rsi14 < p.rsiOverbought
    && volOk && ready('MA20_BREAKDOWN'))
    add('MA20_BREAKDOWN', rS, scoreShort(rS, p))

  if (dn && curr.rsi14 != null && prev.rsi14 != null
    && prev.rsi14 > p.rsiOverbought && curr.rsi14 < prev.rsi14 && curr.rsi14 > 50 && ready('RSI_OVERBOUGHT'))
    add('RSI_OVERBOUGHT', rS, scoreShort(rS, p))

  if (dn && prev.bb_upper != null && prev.close >= prev.bb_upper
    && curr.bb_upper != null && close < curr.bb_upper
    && curr.rsi14 != null && curr.rsi14 > 50 && volOk && ready('BB_UPPER_TOUCH'))
    add('BB_UPPER_TOUCH', rS, scoreShort(rS, p))

  if (curr.ma20 != null && curr.ma60 != null && prev.ma20 != null && prev.ma60 != null
    && prev.ma20 >= prev.ma60 && curr.ma20 < curr.ma60 && close < curr.ma60 && ready('DEATH_CROSS'))
    add('DEATH_CROSS', rS, scoreShort(rS, p))

  return fired
}

// ── Position sizing ────────────────────────────────────────────────────────────

function positionSize(capital: number, entry: number, sl: number, leverage: number) {
  const risk = Math.abs(entry - sl)
  if (risk <= 0 || entry <= 0 || capital <= 0) return { quantity: 0, capitalUsed: 0 }
  let qty = (capital * RISK_PER_TRADE) / risk
  const maxQty = (capital * MAX_CAPITAL_PCT * leverage) / entry
  if (qty > maxQty) qty = maxQty
  return { quantity: qty, capitalUsed: (qty * entry) / leverage }
}

// ── Main backtest ──────────────────────────────────────────────────────────────

function simulate(rows: Candle[], p: BacktestParams, dailyMap: Map<number, DailyBar> | null = null): BacktestResult {
  const n = rows.length
  let capital = p.initialCapital
  const trades: BacktestTrade[] = []
  const equity: number[] = [capital]
  let pos: any = null
  const cd: Record<string, number> = {}
  let wins = 0, losses = 0, peakEq = capital, maxDD = 0

  const iso = (ts: number) => new Date(ts).toISOString()

  for (let i = 168; i < n; i++) {
    for (const k of Object.keys(cd)) cd[k] = Math.max(0, cd[k] - 1)
    const row = rows[i]

    if (pos) {
      const short = pos.direction === 'SHORT'
      pos.peakPrice = short ? Math.min(pos.peakPrice, row.low) : Math.max(pos.peakPrice, row.high)

      // Liquidation check (before SL/TP)
      const liqPrice = short
        ? pos.entryPrice * (1 + 1 / p.leverage)
        : pos.entryPrice * (1 - 1 / p.leverage)
      const liqHit = short ? row.high >= liqPrice : row.low <= liqPrice

      if (liqHit) {
        capital -= pos.capitalUsed
        trades.push({
          signal_type: pos.signal_type, direction: pos.direction,
          entry_price: pos.entryPrice, exit_price: liqPrice,
          tp: pos.tp, sl: pos.sl, quantity: pos.origQuantity,
          capital_used: pos.capitalUsed,
          net_pnl: Math.round(-pos.capitalUsed * 10000) / 10000,
          pnl_pct: -100,
          exit_reason: 'LIQUIDATED', score: pos.score,
          entry_ts: pos.entryTs, exit_ts: iso(row.timestamp),
        })
        losses++
        equity.push(capital)
        if (capital > peakEq) peakEq = capital
        else { const dd = (peakEq - capital) / peakEq * 100; if (dd > maxDD) maxDD = dd }
        pos = null
        continue
      }

      // Partial exit (high confidence only)
      if (HIGH_CONF.has(pos.signal_type) && !pos.partialDone) {
        const tp1 = short
          ? pos.avgEntry - (pos.avgEntry - pos.tp) * PARTIAL_TP_FACTOR
          : pos.avgEntry + (pos.tp - pos.avgEntry) * PARTIAL_TP_FACTOR
        const tp1Hit = short ? row.low <= tp1 : row.high >= tp1
        if (tp1Hit) {
          const pQty = pos.quantity * PARTIAL_FRACTION
          const gross = short ? pQty * (pos.avgEntry - tp1) : pQty * (tp1 - pos.avgEntry)
          const comm = pQty * tp1 * COMMISSION * 2
          capital += gross - comm
          pos.partialPnl = (pos.partialPnl || 0) + gross - comm
          pos.quantity -= pQty
          pos.partialDone = true
          equity.push(capital)
        }
      }

      // Full exit
      const slHit  = short ? row.high >= pos.sl : row.low  <= pos.sl
      const tpHit  = short ? row.low  <= pos.tp : row.high >= pos.tp
      const trailHit = pos.partialDone && (short
        ? row.high >= pos.peakPrice * (1 + TRAILING_STOP_PCT)
        : row.low  <= pos.peakPrice * (1 - TRAILING_STOP_PCT))
      const tp1Val = short
        ? pos.avgEntry - (pos.avgEntry - pos.tp) * PARTIAL_TP_FACTOR
        : pos.avgEntry + (pos.tp - pos.avgEntry) * PARTIAL_TP_FACTOR
      const belowTp1 = pos.partialDone && (short
        ? row.high >= tp1Val * (1 + BELOW_TP1_BUFFER)
        : row.low  <= tp1Val * (1 - BELOW_TP1_BUFFER))

      let exitPrice: number | null = null, exitReason = ''
      if      (slHit)    { exitPrice = pos.sl; exitReason = 'SL' }
      else if (tpHit)    { exitPrice = pos.tp; exitReason = 'TP' }
      else if (trailHit) { exitPrice = short ? pos.peakPrice * (1 + TRAILING_STOP_PCT) : pos.peakPrice * (1 - TRAILING_STOP_PCT); exitReason = 'TRAIL' }
      else if (belowTp1) { exitPrice = tp1Val; exitReason = 'BELOW_TP1' }

      if (exitPrice != null) {
        const gross = short ? pos.quantity * (pos.avgEntry - exitPrice) : pos.quantity * (exitPrice - pos.avgEntry)
        const comm = pos.quantity * exitPrice * COMMISSION * 2
        const net = gross - comm + (pos.partialPnl || 0)
        capital += gross - comm
        const pnlPct = net / pos.capitalUsed * 100

        trades.push({
          signal_type: pos.signal_type, direction: pos.direction,
          entry_price: pos.entryPrice, exit_price: exitPrice,
          tp: pos.tp, sl: pos.sl, quantity: pos.origQuantity,
          capital_used: pos.capitalUsed,
          net_pnl: Math.round(net * 10000) / 10000,
          pnl_pct: Math.round(pnlPct * 10000) / 10000,
          exit_reason: exitReason, score: pos.score,
          entry_ts: pos.entryTs, exit_ts: iso(row.timestamp),
        })
        if (net > 0) wins++; else losses++
        equity.push(capital)
        if (capital > peakEq) peakEq = capital
        else { const dd = (peakEq - capital) / peakEq * 100; if (dd > maxDD) maxDD = dd }
        pos = null
      }
    }

    if (pos) continue

    // Daily loss limit
    const today = new Date(row.timestamp).toDateString()
    const dailyPnl = trades.filter(t => new Date(t.exit_ts).toDateString() === today).reduce((s, t) => s + t.net_pnl, 0)
    if (dailyPnl < -p.initialCapital * DAILY_LOSS_LIMIT_PCT) continue

    const signals = detectSignals(rows, i, cd, p)
    for (const sig of signals) {
      const { signal_type, score } = sig
      if (score < p.minScore) continue
      const short = SELL_SIGNALS.has(signal_type)

      // 인터벌 MA120 추세 필터 (단일 타임프레임)
      if (row.ma120 != null) {
        if (short && row.close > row.ma120) continue
        if (!short && row.close < row.ma120) continue
      }
      // 일봉 추세 필터 (MTF): 일봉 MA120 방향 확인
      if (dailyMap) {
        const daily = getDailyBar(dailyMap, row.timestamp)
        if (daily && daily.ma120 != null) {
          if (!short && daily.close < daily.ma120) continue   // 일봉 하락장 → 롱 스킵
          if (short  && daily.close > daily.ma120) continue   // 일봉 상승장 → 숏 스킵
        }
      }

      // 다음 캔들에서 진입 (현실적인 시뮬레이션)
      const nextRow = rows[i + 1]
      if (!nextRow) continue

      const entryPrice = nextRow.open

      // SL/TP를 진입가(next open) 기준으로 재계산
      const { tp: newTp, sl: newSl, rr: newRr } = calcTPSL(signal_type, entryPrice, row, p)
      if (newTp == null || newSl == null) continue
      if (short ? newSl <= entryPrice : newSl >= entryPrice) continue

      // 고정 TP/SL 설정 시 사용자가 직접 지정한 것이므로 minRRRatio 필터 스킵
      if (p.fixedTP === 0 && p.fixedSL === 0 && newRr != null && newRr < p.minRRRatio) continue

      // 모든 필터 통과 후 쿨다운 소모
      cd[signal_type] = SIGNAL_COOLDOWN
      const { quantity, capitalUsed } = positionSize(capital, entryPrice, newSl, p.leverage)
      if (quantity <= 0) continue

      pos = {
        signal_type, direction: short ? 'SHORT' : 'LONG',
        entryPrice, avgEntry: entryPrice,
        tp: newTp, sl: newSl, quantity, origQuantity: quantity,
        capitalUsed, peakPrice: entryPrice,
        score, entryTs: iso(nextRow.timestamp),
        partialDone: false, partialPnl: 0,
      }
      break
    }
  }

  // Force-close at end
  if (pos) {
    const last = rows[n - 1]
    const short = pos.direction === 'SHORT'
    const ep = last.close
    const gross = short ? pos.quantity * (pos.avgEntry - ep) : pos.quantity * (ep - pos.avgEntry)
    const comm = pos.quantity * ep * COMMISSION * 2
    const net = gross - comm + (pos.partialPnl || 0)
    capital += gross - comm
    trades.push({
      signal_type: pos.signal_type, direction: pos.direction,
      entry_price: pos.entryPrice, exit_price: ep,
      tp: pos.tp, sl: pos.sl, quantity: pos.origQuantity,
      capital_used: pos.capitalUsed,
      net_pnl: Math.round(net * 10000) / 10000,
      pnl_pct: Math.round(net / pos.capitalUsed * 100 * 10000) / 10000,
      exit_reason: 'TIMEOUT', score: pos.score,
      entry_ts: pos.entryTs, exit_ts: iso(last.timestamp),
    })
    if (net > 0) wins++; else losses++
  }

  const total = wins + losses
  const winRate = total > 0 ? wins / total * 100 : 0
  const totalRet = (capital - p.initialCapital) / p.initialCapital * 100
  const grossProfit = trades.filter(t => t.net_pnl > 0).reduce((s, t) => s + t.net_pnl, 0)
  const grossLoss = Math.abs(trades.filter(t => t.net_pnl < 0).reduce((s, t) => s + t.net_pnl, 0))

  let sharpe = 0
  if (total > 1) {
    const rets = trades.map(t => t.net_pnl / t.capital_used)
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)
    const sd = Math.sqrt(variance)
    if (sd > 0) sharpe = mean / sd * Math.sqrt(252)
  }

  return {
    symbol: p.symbol, interval: p.interval,
    start_date: p.startDate, end_date: p.endDate,
    initial_capital: p.initialCapital,
    final_capital: Math.round(capital * 100) / 100,
    total_return_pct: Math.round(totalRet * 100) / 100,
    total_trades: total, winning_trades: wins, losing_trades: losses,
    win_rate: Math.round(winRate * 100) / 100,
    max_drawdown_pct: Math.round(maxDD * 100) / 100,
    sharpe_ratio: Math.round(sharpe * 1000) / 1000,
    profit_factor: grossLoss > 0 ? Math.round(grossProfit / grossLoss * 1000) / 1000 : null,
    trade_log: trades,
    equity_curve: equity,
  }
}

// ── Daily trend map (MTF) ──────────────────────────────────────────────────────

interface DailyBar {
  close: number
  ma120: number | null
  ichimoku_a: number | null
  ichimoku_b: number | null
}

async function buildDailyTrendMap(symbol: string, startMs: number, endMs: number): Promise<Map<number, DailyBar>> {
  // MA120 + 일목 워밍업: 220일
  const warmup = 220 * 86400000
  const rows = await fetchKlines(symbol, '1d', startMs - warmup, endMs)

  const closes = rows.map(r => r.close)
  const ma120arr = sma(closes, 120)
  const hl2 = rows.map(r => (r.high + r.low) / 2)
  const tenkan = sma(hl2, 9), kijun = sma(hl2, 26), sma52arr = sma(hl2, 52)

  const map = new Map<number, DailyBar>()
  for (let i = 0; i < rows.length; i++) {
    const shift = 26
    const ia = i >= shift && tenkan[i - shift] != null && kijun[i - shift] != null
      ? (tenkan[i - shift]! + kijun[i - shift]!) / 2 : null
    const ib = i >= shift ? (sma52arr[i - shift] ?? null) : null
    map.set(rows[i].timestamp, { close: rows[i].close, ma120: ma120arr[i], ichimoku_a: ia, ichimoku_b: ib })
  }
  return map
}

// 해당 봉 시각 기준 직전 완료 일봉 반환 (당일 미완성 봉 제외)
function getDailyBar(map: Map<number, DailyBar>, ts: number): DailyBar | null {
  const d = new Date(ts)
  let dayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 86400000
  for (let i = 0; i < 7; i++) {
    const bar = map.get(dayMs - i * 86400000)
    if (bar) return bar
  }
  return null
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function runBacktest(p: BacktestParams): Promise<BacktestResult> {
  const startMs = new Date(p.startDate).getTime()
  const endMs   = new Date(p.endDate).getTime()

  // 168봉 워밍업 구간 추가 (RVOL168 계산용)
  const warmup = p.interval === '1d' ? 168 * 86400000
               : p.interval === '4h' ? 168 * 4 * 3600000
               :                       168 * 3600000
  const rows = await fetchKlines(p.symbol, p.interval, startMs - warmup, endMs)
  if (rows.length < 200) throw new Error('데이터 부족: 날짜 범위를 넓혀주세요.')
  computeIndicators(rows)

  // 연준 유동성 데이터 부착 (scoreUseFedLiquidity ON 시)
  let fedLatest: number | null = null
  if (p.scoreUseFedLiquidity) {
    const fedBars = await fetchFedLiquidity(p.startDate, p.endDate, p.fedLiquidityMAPeriod)
    attachFedData(rows, fedBars)
    // 가장 최근 순유동성 값 추출 (UI 표시용)
    const lastWithFed = [...rows].reverse().find(r => r.fed_net_liquidity != null)
    fedLatest = lastWithFed?.fed_net_liquidity ?? null
  }

  // MTF: 1d가 아닐 때만 일봉 추세 맵 별도 fetch
  const dailyMap = (p.useDailyTrend && p.interval !== '1d')
    ? await buildDailyTrendMap(p.symbol, startMs, endMs)
    : null

  const result = simulate(rows, p, dailyMap)
  result.fed_latest_net_liquidity = fedLatest
  return result
}
