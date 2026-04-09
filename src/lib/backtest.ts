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
  rsiOversold: number
  rsiOverbought: number
  minScore: number
  initialCapital: number
  scoreUseADX: boolean
  scoreUseRSI: boolean
  scoreUseMACD: boolean
  scoreUseRVOL: boolean
  scoreUseBB: boolean
  adxThreshold: number
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
  scoreExitThreshold: number  // 점수 기반 청산: 점수가 이 값 이하로 내려가면 매도 (0 = 비활성화)
}

export interface BacktestTrade {
  signal_type: string
  signal_details: string  // 신호 조건 상세 정보
  exit_details?: string   // SCORE_EXIT 시 청산 시점의 점수 상태
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
  adx14?: number | null
  mfi14?: number | null; macd_hist?: number | null
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
const SWING_LOOKBACK   = 4
const SIGNAL_COOLDOWN  = 4
const DAILY_LOSS_LIMIT_PCT = 0.06


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


function computeIndicators(rows: Candle[]): void {
  const closes = rows.map(r => r.close), vols = rows.map(r => r.volume)
  const ma20 = sma(closes, 20), ma60 = sma(closes, 60), ma120 = sma(closes, 120)
  const bbMid = sma(closes, 20), bbStd = std(closes, 20)
  const rsi = rsi14(closes), atr = atr14(rows)
  const vm20 = sma(vols, 20), vm168 = sma(vols, 168)
  const adx = adx14(rows)
  const mfi = mfi14(rows), macd = macdHist(closes)

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
    rows[i].adx14 = adx[i]
    rows[i].mfi14 = mfi[i]; rows[i].macd_hist = macd[i]
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

// ── Fixed 모드 TP/SL 계산 ──────────────────────────────────────────────────────

function calcTPSL(type: string, close: number, p: BacktestParams) {
  const isLong = type === 'LONG'
  const isShort = type === 'SHORT'
  let tp: number | null = null, sl: number | null = null

  // Fixed 모드: 고정 TP/SL (%)
  if (p.fixedTP > 0 && p.fixedSL > 0) {
    if (isLong) {
      sl = Math.round(close * (1 - p.fixedSL / 100) * 1e6) / 1e6
      tp = Math.round(close * (1 + p.fixedTP / 100) * 1e6) / 1e6
    } else if (isShort) {
      sl = Math.round(close * (1 + p.fixedSL / 100) * 1e6) / 1e6
      tp = Math.round(close * (1 - p.fixedTP / 100) * 1e6) / 1e6
    }
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
  // RSI: 과매도(반등 신호) → +1
  if (p.scoreUseRSI   && row.rsi14 != null && row.rsi14 < p.rsiOversold) s++
  // MACD: 상승 모멘텀 → +1
  if (p.scoreUseMACD  && row.macd_hist != null && row.macd_hist > 0) s++
  // RVOL: 거래량 급증 → +1
  if (p.scoreUseRVOL  && rv >= p.rvolThreshold) s++
  // 볼린저밴드: 하단 터치 → +1
  if (p.scoreUseBB && row.bb_lower != null && row.close <= row.bb_lower) s++
  // 일목: 구름 위 → +1
  if (p.scoreUseIchi  && row.ichimoku_a != null && row.ichimoku_b != null
    && row.close > row.ichimoku_a && row.close > row.ichimoku_b) s++
  // MA 추세: 상승 추세(MA20 > MA60) → +1
  if (p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null && row.ma20 > row.ma60) s++
  // 연준 유동성 확장 확정(MA 위 + 상승) → +1
  if (p.scoreUseFedLiquidity && row.fed_state === 1) s++
  return s
}

function scoreShort(row: Candle, p: BacktestParams): number {
  let s = 0; const rv = row.vol_rvol168 ?? 1.0
  // ADX: 추세 존재 → +1
  if (p.scoreUseADX   && row.adx14 != null && row.adx14 > p.adxThreshold) s++
  // RSI: 과매수(하락 신호) → +1
  if (p.scoreUseRSI   && row.rsi14 != null && row.rsi14 > p.rsiOverbought) s++
  // MACD: 하락 모멘텀 → +1
  if (p.scoreUseMACD  && row.macd_hist != null && row.macd_hist < 0) s++
  // RVOL: 거래량 급증 → +1
  if (p.scoreUseRVOL  && rv >= p.rvolThreshold) s++
  // 볼린저밴드: 상단 터치 → +1
  if (p.scoreUseBB && row.bb_upper != null && row.close >= row.bb_upper) s++
  // 일목: 구름 아래 → +1
  if (p.scoreUseIchi  && row.ichimoku_a != null && row.ichimoku_b != null
    && row.close < row.ichimoku_a && row.close < row.ichimoku_b) s++
  // MA 추세: 하락 추세(MA20 < MA60) → +1
  if (p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null && row.ma20 < row.ma60) s++
  // 연준 유동성 수축 확정(MA 아래 + 하락) → +1
  if (p.scoreUseFedLiquidity && row.fed_state === -1) s++
  return s
}

// ── Signal detection ───────────────────────────────────────────────────────────

function detectSignals(rows: Candle[], i: number, cd: Record<string, number>, p: BacktestParams) {
  if (i < 1) return []
  const curr = rows[i]

  // RVOL 필터: scoreUseRVOL이 활성화된 경우에만 적용
  if (p.scoreUseRVOL && (curr.vol_rvol168 ?? 1.0) < p.rvolSkip) return []

  const ready = (t: string) => (cd[t] ?? 0) <= 0

  const lb = Math.min(SWING_LOOKBACK, i), win = rows.slice(i - lb, i + 1)
  const swL = Math.min(...win.map(r => r.low)), swH = Math.max(...win.map(r => r.high))
  const rL: Candle = { ...curr, swing_low: swL }, rS: Candle = { ...curr, swing_high: swH }

  const close = curr.close

  // MA 추세 필터: scoreUseGoldenCross가 활성화되고 MA 데이터가 있을 때만 적용
  const hasValidMA = curr.ma20 != null && curr.ma60 != null
  const checkMA = p.scoreUseGoldenCross && hasValidMA
  const isUptrend = !checkMA || (curr.ma20! > curr.ma60! && close > curr.ma60!)
  const isDowntrend = !checkMA || (curr.ma20! < curr.ma60! && close < curr.ma60!)

  const fired: any[] = []
  const add = (type: string, score: number) => {
    const { tp, sl, rr } = calcTPSL(type, close, p)
    fired.push({ signal_type: type, tp, sl, rr, score })
  }

  // LONG: 상승추세 + 점수 확인
  if (isUptrend && ready('LONG')) {
    const score = scoreLong(rL, p)
    if (score > 0) add('LONG', score)
  }

  // SHORT: 하락추세 + 점수 확인
  if (isDowntrend && ready('SHORT')) {
    const score = scoreShort(rS, p)
    if (score > 0) add('SHORT', score)
  }

  return fired
}

// ── Signal Details Builder ────────────────────────────────────────────────────────

function buildSignalDetails(_signal_type: string, row: Candle, _score: number, rr: number | null, p: BacktestParams): string {
  const parts: string[] = []

  // MA 상태 (골든크로스/데스크로스 활성화 시만)
  if (p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null) {
    const maState = row.ma20 > row.ma60 ? '상승' : '하락'
    parts.push(`MA: ${maState}`)
  }

  // RSI (활성화 시만)
  if (p.scoreUseRSI && row.rsi14 != null) {
    parts.push(`RSI: ${Math.round(row.rsi14)}`)
  }

  // ADX (활성화 시만)
  if (p.scoreUseADX && row.adx14 != null) {
    parts.push(`ADX: ${Math.round(row.adx14 * 10) / 10}`)
  }

  // MACD (활성화 시만)
  if (p.scoreUseMACD && row.macd_hist != null) {
    parts.push(`MACD: ${row.macd_hist > 0 ? '+' : ''}${Math.round(row.macd_hist * 1000) / 1000}`)
  }

  // RVOL (활성화 시만)
  if (p.scoreUseRVOL && row.vol_rvol168 != null) {
    parts.push(`RVOL: ${Math.round(row.vol_rvol168 * 10) / 10}x`)
  }

  // 손익비 (고정TP/SL이 아닐 때만)
  if (rr != null && (p.fixedTP === 0 && p.fixedSL === 0)) {
    parts.push(`RR: ${rr.toFixed(2)}`)
  }

  return parts.join(' | ')
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

  // 사용자 지정 시작 시간 (warmup 데이터는 제외)
  const startMs = new Date(p.startDate).getTime()

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

        // 수수료: 실제 거래액 기준 (진입가 × 거래량 × 수수료율)
        const entryComm = pos.entryPrice * pos.quantity * COMMISSION
        const exitComm = liqPrice * pos.quantity * COMMISSION
        const comm = entryComm + exitComm

        trades.push({
          signal_type: pos.signal_type, signal_details: pos.signal_details, direction: pos.direction,
          entry_price: pos.entryPrice, exit_price: liqPrice,
          tp: pos.tp, sl: pos.sl, quantity: pos.origQuantity,
          capital_used: pos.capitalUsed,
          net_pnl: Math.round(-pos.capitalUsed * 10000) / 10000,
          pnl_pct: -100,
          exit_reason: 'LIQUIDATED', score: pos.score,
          entry_ts: pos.entryTs, exit_ts: iso(row.timestamp),
          commission: Math.round(comm * 10000) / 10000,
        } as any)
        losses++
        equity.push(capital)
        if (capital > peakEq) peakEq = capital
        else { const dd = (peakEq - capital) / peakEq * 100; if (dd > maxDD) maxDD = dd }
        pos = null
        continue
      }

      // Exit conditions
      const slHit  = short ? row.high >= pos.sl : row.low  <= pos.sl
      const tpHit  = short ? row.low  <= pos.tp : row.high >= pos.tp
      // 점수 기반 청산
      const currentScore = short ? scoreShort(row, p) : scoreLong(row, p)
      const scoreExit = p.scoreExitThreshold > 0 && currentScore <= p.scoreExitThreshold

      let exitPrice: number | null = null, exitReason = ''
      if      (slHit)    { exitPrice = pos.sl; exitReason = 'SL' }
      else if (scoreExit) { exitPrice = row.close; exitReason = 'SCORE_EXIT' }
      else if (tpHit)    { exitPrice = pos.tp; exitReason = 'TP' }

      if (exitPrice != null) {
        const gross = short ? pos.quantity * (pos.avgEntry - exitPrice) : pos.quantity * (exitPrice - pos.avgEntry)

        // 수수료: 실제 거래액 기준 (레버리지 제외)
        const tradedQuantity = pos.quantity / p.leverage
        const entryComm = pos.entryPrice * tradedQuantity * COMMISSION
        const exitComm = exitPrice * tradedQuantity * COMMISSION
        const comm = entryComm + exitComm

        // capital에는 수수료 차감 반영
        const netCapital = gross - comm
        capital += netCapital

        // UI 표시: pnl은 순수 포지션 손익만, commission은 별도
        const pnlPct = gross / pos.capitalUsed * 100

        // SCORE_EXIT 시 exit_details 생성: 점수가 감소한 지표들만 표시
        let exitDetails: string | undefined
        if (scoreExit && pos.entryRow) {
          const exitDetailsParts: string[] = []
          const entryRow = pos.entryRow
          const short = pos.direction === 'SHORT'

          // RSI 점수 변화 확인
          if (p.scoreUseRSI && row.rsi14 != null && entryRow.rsi14 != null) {
            const entryRSIScore = short ? (entryRow.rsi14 > p.rsiOverbought ? 1 : 0) : (entryRow.rsi14 < p.rsiOversold ? 1 : 0)
            const currentRSIScore = short ? (row.rsi14 > p.rsiOverbought ? 1 : 0) : (row.rsi14 < p.rsiOversold ? 1 : 0)
            if (currentRSIScore < entryRSIScore) {
              exitDetailsParts.push(`RSI: ${Math.round(entryRow.rsi14)} → ${Math.round(row.rsi14)}`)
            }
          }

          // ADX 점수 변화 확인
          if (p.scoreUseADX && row.adx14 != null && entryRow.adx14 != null) {
            const entryADXScore = entryRow.adx14 >= p.adxThreshold ? 1 : 0
            const currentADXScore = row.adx14 >= p.adxThreshold ? 1 : 0
            if (currentADXScore < entryADXScore) {
              exitDetailsParts.push(`ADX: ${Math.round(entryRow.adx14 * 10) / 10} → ${Math.round(row.adx14 * 10) / 10}`)
            }
          }

          // MACD 점수 변화 확인
          if (p.scoreUseMACD && row.macd_hist != null && entryRow.macd_hist != null) {
            const entryMACDScore = short ? (entryRow.macd_hist < 0 ? 1 : 0) : (entryRow.macd_hist > 0 ? 1 : 0)
            const currentMACDScore = short ? (row.macd_hist < 0 ? 1 : 0) : (row.macd_hist > 0 ? 1 : 0)
            if (currentMACDScore < entryMACDScore) {
              const entryMACD = Math.round(entryRow.macd_hist * 1000) / 1000
              const currentMACD = Math.round(row.macd_hist * 1000) / 1000
              exitDetailsParts.push(`MACD: ${entryMACD > 0 ? '+' : ''}${entryMACD} → ${currentMACD > 0 ? '+' : ''}${currentMACD}`)
            }
          }

          // RVOL 점수 변화 확인
          if (p.scoreUseRVOL && row.vol_rvol168 != null && entryRow.vol_rvol168 != null) {
            const entryRVOLScore = entryRow.vol_rvol168 >= p.rvolThreshold ? 1 : 0
            const currentRVOLScore = row.vol_rvol168 >= p.rvolThreshold ? 1 : 0
            if (currentRVOLScore < entryRVOLScore) {
              exitDetailsParts.push(`RVOL: ${Math.round(entryRow.vol_rvol168 * 10) / 10}x → ${Math.round(row.vol_rvol168 * 10) / 10}`)
            }
          }

          // Golden Cross 점수 변화 확인
          if (p.scoreUseGoldenCross && row.ma20 != null && row.ma60 != null && entryRow.ma20 != null && entryRow.ma60 != null) {
            const entryMA = entryRow.ma20 > entryRow.ma60 ? '상승' : '하락'
            const currentMA = row.ma20 > row.ma60 ? '상승' : '하락'
            const entryMAScore = short ? (entryMA === '하락' ? 1 : 0) : (entryMA === '상승' ? 1 : 0)
            const currentMAScore = short ? (currentMA === '하락' ? 1 : 0) : (currentMA === '상승' ? 1 : 0)
            if (currentMAScore < entryMAScore) {
              exitDetailsParts.push(`MA: ${entryMA} → ${currentMA}`)
            }
          }

          exitDetails = exitDetailsParts.length > 0 ? exitDetailsParts.join(' | ') : undefined
        }

        trades.push({
          signal_type: pos.signal_type, signal_details: pos.signal_details, exit_details: exitDetails,
          direction: pos.direction,
          entry_price: pos.entryPrice, exit_price: exitPrice,
          tp: pos.tp, sl: pos.sl, quantity: pos.origQuantity,
          capital_used: pos.capitalUsed,
          net_pnl: Math.round(gross * 10000) / 10000,
          pnl_pct: Math.round(pnlPct * 10000) / 10000,
          exit_reason: exitReason, score: pos.score,
          entry_ts: pos.entryTs, exit_ts: iso(row.timestamp),
          commission: Math.round(comm * 10000) / 10000,
        } as any)
        if (netCapital > 0) wins++; else losses++
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

    // ── 신호 감지: 이전 캔들 (rows[i-1]) 기반 ── (실시간 매매와 동기화)
    // 진입은 현재 캔들 (rows[i]).open에서 발생
    if (i < 1) continue  // 이전 캔들 필요
    if (row.timestamp < startMs) continue  // 사용자 지정 시작 시간 이전 데이터 스킵

    const signals = detectSignals(rows, i - 1, cd, p)
    for (const sig of signals) {
      const { signal_type, score } = sig
      if (score < p.minScore) continue
      const short = signal_type === 'SHORT'

      // ── 추세 필터 (현재 캔들 기준) ──
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

      // ── 현재 캔들 시가에서 진입 (실시간과 동기화) ──
      const entryPrice = row.open

      // SL/TP를 진입가 기준으로 계산 (Fixed 모드)
      const { tp: newTp, sl: newSl, rr: newRr } = calcTPSL(signal_type, entryPrice, p)
      if (newTp == null || newSl == null) continue
      if (short ? newSl <= entryPrice : newSl >= entryPrice) continue


      // 모든 필터 통과 후 쿨다운 소모
      cd[signal_type] = SIGNAL_COOLDOWN
      const { quantity, capitalUsed } = positionSize(capital, entryPrice, newSl, p.leverage)
      if (quantity <= 0) continue

      const signalDetails = buildSignalDetails(signal_type, rows[i - 1], score, newRr, p)
      // 진입 시간: 실제 진입하는 캔들 (rows[i]) - 진입가와 동기화
      // 신호는 rows[i-1]에서 감지하지만, 표시는 rows[i]에서 진입하는 시간으로
      const entryTs = iso(row.timestamp)
      pos = {
        signal_type, signal_details: signalDetails,
        direction: short ? 'SHORT' : 'LONG',
        entryPrice, avgEntry: entryPrice,
        tp: newTp, sl: newSl, quantity, origQuantity: quantity,
        capitalUsed, peakPrice: entryPrice,
        score, entryTs,
        entryRow: rows[i - 1],  // 진입 시 캔들 저장 (SCORE_EXIT 비교용)
        entryScore: score,
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

    // 수수료: 실제 거래액 기준 (레버리지 제외)
    const tradedQuantity = pos.quantity / p.leverage
    const entryComm = pos.entryPrice * tradedQuantity * COMMISSION
    const exitComm = ep * tradedQuantity * COMMISSION
    const comm = entryComm + exitComm

    // capital에는 수수료 차감 반영
    const netCapital = gross - comm + (pos.partialPnl || 0)
    capital += netCapital

    // 진입/청산 순서 검증: entry_ts > exit_ts면 스왑 (데이터 순서 문제 대응)
    const exitTs = iso(last.timestamp)
    const entryTime = new Date(pos.entryTs).getTime()
    const exitTime = new Date(exitTs).getTime()
    const [finalEntry, finalExit] = entryTime > exitTime
      ? [exitTs, pos.entryTs]
      : [pos.entryTs, exitTs]

    // UI 표시: pnl은 순수 포지션 손익만
    const pnlPct = gross / pos.capitalUsed * 100

    trades.push({
      signal_type: pos.signal_type, signal_details: pos.signal_details, direction: pos.direction,
      entry_price: pos.entryPrice, exit_price: ep,
      tp: pos.tp, sl: pos.sl, quantity: pos.origQuantity,
      capital_used: pos.capitalUsed,
      net_pnl: Math.round(gross * 10000) / 10000,
      pnl_pct: Math.round(pnlPct * 10000) / 10000,
      exit_reason: 'DATA_END', score: pos.score,
      entry_ts: finalEntry, exit_ts: finalExit,
      commission: Math.round(comm * 10000) / 10000,
      signal_candle_ts: iso(pos.entryRow.timestamp),
      entry_candle_ts: pos.entryTs,
    } as any)
    if (netCapital > 0) wins++; else losses++
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
