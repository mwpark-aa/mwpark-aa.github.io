import type { Candle } from './types'

// ── 기본 통계 ────────────────────────────────────────────────────

export function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = Array(values.length).fill(null)

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += values[j]
    }
    result[i] = sum / period
  }

  return result
}

export function std(values: number[], period: number): (number | null)[] {
  const means = sma(values, period)
  const result: (number | null)[] = Array(values.length).fill(null)

  for (let i = period - 1; i < values.length; i++) {
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) {
      variance += (values[j] - means[i]!) ** 2
    }
    result[i] = Math.sqrt(variance / period)
  }

  return result
}

export function ema(values: number[], span: number): (number | null)[] {
  const result: (number | null)[] = Array(values.length).fill(null)
  const alpha = 2 / (span + 1)
  let current: number | null = null
  let warmupSum = 0

  for (let i = 0; i < values.length; i++) {
    if (i < span - 1) {
      warmupSum += values[i]
    } else if (i === span - 1) {
      warmupSum += values[i]
      current = warmupSum / span
      result[i] = current
    } else {
      current = current! * (1 - alpha) + values[i] * alpha
      result[i] = current
    }
  }

  return result
}

// ── RSI (Wilder 스무딩) ──────────────────────────────────────────

export function calcRSI14(closes: number[]): (number | null)[] {
  const result: (number | null)[] = Array(closes.length).fill(null)
  const alpha = 1 / 14
  let avgGain = 0
  let avgLoss = 0

  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1]
    const gain  = Math.max(delta, 0)
    const loss  = Math.max(-delta, 0)

    if (i < 14) {
      // 초기 누적 평균
      avgGain = (avgGain * (i - 1) + gain) / i
      avgLoss = (avgLoss * (i - 1) + loss) / i
    } else {
      // Wilder 스무딩
      avgGain = avgGain * (1 - alpha) + gain * alpha
      avgLoss = avgLoss * (1 - alpha) + loss * alpha
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    }
  }

  return result
}

// ── ATR (Average True Range) ──────────────────────────────────────

export function calcATR14(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const result: (number | null)[] = Array(n).fill(null)
  const trueRanges: number[] = []

  for (let i = 1; i < n; i++) {
    const { high, low } = rows[i]
    const prevClose = rows[i - 1].close
    trueRanges.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low  - prevClose),
    ))
  }

  let atr: number | null = null
  for (let i = 0; i < trueRanges.length; i++) {
    if (i < 13) continue
    atr = i === 13
      ? trueRanges.slice(0, 14).reduce((a, b) => a + b) / 14
      : (atr! * 13 + trueRanges[i]) / 14
    result[i + 1] = atr
  }

  return result
}

// ── ADX (Average Directional Index) ──────────────────────────────

export function calcADX14(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const output: (number | null)[] = Array(n).fill(null)

  const plusDM:  number[] = []
  const minusDM: number[] = []
  const trValues:number[] = []

  for (let i = 1; i < n; i++) {
    const { high: h, low: l } = rows[i]
    const { high: ph, low: pl, close: pc } = rows[i - 1]

    const upMove   = h - ph
    const downMove = pl - l

    plusDM.push(upMove   > downMove && upMove   > 0 ? upMove   : 0)
    minusDM.push(downMove > upMove  && downMove > 0 ? downMove : 0)
    trValues.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }

  // Wilder 스무딩 적용
  const wilderSmooth = (values: number[]): (number | null)[] => {
    const smoothed: (number | null)[] = Array(values.length).fill(null)
    let current: number | null = null

    for (let i = 0; i < values.length; i++) {
      if (i < 13) continue
      current = i === 13
        ? values.slice(0, 14).reduce((a, b) => a + b) / 14
        : (current! * 13 + values[i]) / 14
      smoothed[i] = current
    }
    return smoothed
  }

  const smoothedPlus  = wilderSmooth(plusDM)
  const smoothedMinus = wilderSmooth(minusDM)
  const smoothedTR    = wilderSmooth(trValues)

  // DX 계산
  const dx: (number | null)[] = Array(trValues.length).fill(null)
  for (let i = 0; i < trValues.length; i++) {
    if (!smoothedTR[i] || smoothedTR[i] === 0) continue

    const pdi = 100 * smoothedPlus[i]!  / smoothedTR[i]!
    const mdi = 100 * smoothedMinus[i]! / smoothedTR[i]!
    const sum = pdi + mdi

    dx[i] = sum ? 100 * Math.abs(pdi - mdi) / sum : 0
  }

  // DX → ADX (Wilder 스무딩)
  const dxValues = dx.filter(x => x != null) as number[]
  let avgDX: number | null = null
  let count = 0

  for (let i = 0; i < dx.length; i++) {
    if (dx[i] == null) continue
    count++
    if (count < 14) continue

    avgDX = count === 14
      ? dxValues.slice(0, 14).reduce((a, b) => a + b) / 14
      : (avgDX! * 13 + dx[i]!) / 14

    output[i + 1] = avgDX
  }

  return output
}

// ── MFI (Money Flow Index) ────────────────────────────────────────

export function calcMFI14(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const result: (number | null)[] = Array(n).fill(null)

  const typicalPrice = rows.map(c => (c.high + c.low + c.close) / 3)
  const moneyFlow    = rows.map((c, i) => typicalPrice[i] * c.volume)

  for (let i = 14; i < n; i++) {
    let posFlow = 0
    let negFlow = 0

    for (let j = i - 13; j <= i; j++) {
      if (j === 0) continue
      if (typicalPrice[j] > typicalPrice[j - 1]) {
        posFlow += moneyFlow[j]
      } else if (typicalPrice[j] < typicalPrice[j - 1]) {
        negFlow += moneyFlow[j]
      }
    }

    result[i] = negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow)
  }

  return result
}

// ── MACD 히스토그램 ───────────────────────────────────────────────

export function calcMACDHist(closes: number[]): (number | null)[] {
  const n = closes.length
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)

  // MACD 라인 (EMA12 - EMA26)
  const macdLine: (number | null)[] = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i]! - ema26[i]! : null
  )

  // 시그널 라인 (MACD EMA9)
  const signalLine = ema(macdLine.map(x => x ?? 0), 9)

  // 히스토그램 = MACD - Signal
  const result: (number | null)[] = Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (macdLine[i] != null && signalLine[i] != null) {
      result[i] = macdLine[i]! - signalLine[i]!
    }
  }

  // 초기 워밍업 구간 null 처리 (EMA26 + EMA9 = 34봉 필요)
  for (let i = 0; i < Math.min(34, n); i++) result[i] = null

  return result
}

// ── 모든 지표를 캔들 배열에 계산해서 부착 ────────────────────────

export function computeIndicators(rows: Candle[]): void {
  const closes  = rows.map(r => r.close)
  const volumes = rows.map(r => r.volume)

  // 이동평균
  const ma20  = sma(closes, 20)
  const ma60  = sma(closes, 60)
  const ma120 = sma(closes, 120)

  // 볼린저밴드
  const bbMid = sma(closes, 20)
  const bbStd = std(closes, 20)

  // 모멘텀 지표
  const rsi  = calcRSI14(closes)
  const atr  = calcATR14(rows)
  const adx  = calcADX14(rows)
  const mfi  = calcMFI14(rows)
  const macd = calcMACDHist(closes)

  // 거래량
  const volMA20  = sma(volumes, 20)
  const volMA168 = sma(volumes, 168)

  // 일목균형표 (스팬A/B는 26봉 후행 이동)
  const hl2    = rows.map(r => (r.high + r.low) / 2)
  const tenkan = sma(hl2, 9)
  const kijun  = sma(hl2, 26)
  const span52 = sma(hl2, 52)
  const ICHI_SHIFT = 26

  for (let i = 0; i < rows.length; i++) {
    const row     = rows[i]
    const vol168  = volMA168[i]

    // 이동평균
    row.ma20  = ma20[i]
    row.ma60  = ma60[i]
    row.ma120 = ma120[i]

    // 볼린저밴드
    row.bb_upper = bbMid[i] != null && bbStd[i] != null ? bbMid[i]! + 2 * bbStd[i]! : null
    row.bb_lower = bbMid[i] != null && bbStd[i] != null ? bbMid[i]! - 2 * bbStd[i]! : null

    // 모멘텀
    row.rsi14     = rsi[i]
    row.atr14     = atr[i]
    row.adx14     = adx[i]
    row.mfi14     = mfi[i]
    row.macd_hist = macd[i]

    // 거래량
    row.vol_ma20    = volMA20[i]
    row.vol_rvol168 = vol168 ? Math.round(volumes[i] / vol168 * 1000) / 1000 : 1.0

    // 일목균형표: 현재봉 구름은 ICHI_SHIFT 전 값으로 계산
    if (i >= ICHI_SHIFT) {
      const t = tenkan[i - ICHI_SHIFT]
      const k = kijun[i - ICHI_SHIFT]
      const s = span52[i - ICHI_SHIFT]
      row.ichimoku_a = t != null && k != null ? (t + k) / 2 : null
      row.ichimoku_b = s ?? null
    } else {
      row.ichimoku_a = null
      row.ichimoku_b = null
    }
  }
}
