import type { Candle } from './types.ts'

export function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += values[j]!
    result[i] = sum / period
  }
  return result
}

export function std(values: number[], period: number): (number | null)[] {
  const means = sma(values, period)
  const result: (number | null)[] = Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (values[j]! - means[i]!) ** 2
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
      warmupSum += values[i]!
    } else if (i === span - 1) {
      warmupSum += values[i]!
      current = warmupSum / span
      result[i] = current
    } else {
      current = current! * (1 - alpha) + values[i]! * alpha
      result[i] = current
    }
  }
  return result
}

export function calcRSI14(closes: number[]): (number | null)[] {
  const result: (number | null)[] = Array(closes.length).fill(null)
  const alpha = 1 / 14
  let avgGain = 0, avgLoss = 0

  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i]! - closes[i - 1]!
    const gain = Math.max(delta, 0), loss = Math.max(-delta, 0)
    if (i < 14) {
      avgGain = (avgGain * (i - 1) + gain) / i
      avgLoss = (avgLoss * (i - 1) + loss) / i
    } else {
      avgGain = avgGain * (1 - alpha) + gain * alpha
      avgLoss = avgLoss * (1 - alpha) + loss * alpha
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    }
  }
  return result
}

export function calcATR14(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const result: (number | null)[] = Array(n).fill(null)
  const trs: number[] = []

  for (let i = 1; i < n; i++) {
    const { high, low } = rows[i]!
    const pc = rows[i - 1]!.close
    trs.push(Math.max(high - low, Math.abs(high - pc), Math.abs(low - pc)))
  }

  let atr: number | null = null
  for (let i = 0; i < trs.length; i++) {
    if (i < 13) continue
    atr = i === 13
      ? trs.slice(0, 14).reduce((a, b) => a + b) / 14
      : (atr! * 13 + trs[i]!) / 14
    result[i + 1] = atr
  }
  return result
}

export function calcADX14(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const output: (number | null)[] = Array(n).fill(null)
  const plusDM: number[] = [], minusDM: number[] = [], trValues: number[] = []

  for (let i = 1; i < n; i++) {
    const { high: h, low: l } = rows[i]!
    const { high: ph, low: pl, close: pc } = rows[i - 1]!
    const up = h - ph, dn = pl - l
    plusDM.push(up > dn && up > 0 ? up : 0)
    minusDM.push(dn > up && dn > 0 ? dn : 0)
    trValues.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }

  const wilderSmooth = (lst: number[]): (number | null)[] => {
    const smoothed: (number | null)[] = Array(lst.length).fill(null)
    let current: number | null = null
    for (let i = 0; i < lst.length; i++) {
      if (i < 13) continue
      current = i === 13
        ? lst.slice(0, 14).reduce((a, b) => a + b) / 14
        : (current! * 13 + lst[i]!) / 14
      smoothed[i] = current
    }
    return smoothed
  }

  const sp = wilderSmooth(plusDM), sm = wilderSmooth(minusDM), st = wilderSmooth(trValues)
  const dx: (number | null)[] = Array(trValues.length).fill(null)

  for (let i = 0; i < trValues.length; i++) {
    if (!st[i] || st[i] === 0) continue
    const pdi = 100 * sp[i]! / st[i]!
    const mdi = 100 * sm[i]! / st[i]!
    const sum = pdi + mdi
    dx[i] = sum ? 100 * Math.abs(pdi - mdi) / sum : 0
  }

  const dxValues = dx.filter(x => x != null) as number[]
  let avgDX: number | null = null, count = 0

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

export function calcMACDHist(closes: number[]): (number | null)[] {
  const n = closes.length
  const e12 = ema(closes, 12), e26 = ema(closes, 26)
  const macdLine: (number | null)[] = closes.map((_, i) =>
    e12[i] != null && e26[i] != null ? e12[i]! - e26[i]! : null
  )
  const signalLine = ema(macdLine.map(x => x ?? 0), 9)
  const result: (number | null)[] = Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (macdLine[i] != null && signalLine[i] != null) result[i] = macdLine[i]! - signalLine[i]!
  }
  for (let i = 0; i < Math.min(34, n); i++) result[i] = null
  return result
}

export function calcCCI20(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const result: (number | null)[] = Array(n).fill(null)
  const period = 20
  for (let i = period - 1; i < n; i++) {
    const window = rows.slice(i - period + 1, i + 1)
    const tps    = window.map(r => (r.high + r.low + r.close) / 3)
    const tpMean = tps.reduce((a, b) => a + b, 0) / period
    const meanDev = tps.reduce((a, b) => a + Math.abs(b - tpMean), 0) / period
    if (meanDev === 0) continue
    const currTP = (rows[i]!.high + rows[i]!.low + rows[i]!.close) / 3
    result[i] = (currTP - tpMean) / (0.015 * meanDev)
  }
  return result
}

export function calcVWMA20(rows: Candle[]): (number | null)[] {
  const n = rows.length
  const result: (number | null)[] = Array(n).fill(null)
  const period = 20
  for (let i = period - 1; i < n; i++) {
    let sumPV = 0, sumV = 0
    for (let j = i - period + 1; j <= i; j++) {
      sumPV += rows[j]!.close * rows[j]!.volume
      sumV  += rows[j]!.volume
    }
    if (sumV > 0) result[i] = sumPV / sumV
  }
  return result
}

export function computeIndicators(rows: Candle[]): void {
  const closes  = rows.map(r => r.close)
  const volumes = rows.map(r => r.volume)

  const ma20  = sma(closes, 20)
  const ma60  = sma(closes, 60)
  const ma120 = sma(closes, 120)
  const bbMid = sma(closes, 20)
  const bbStd = std(closes, 20)
  const rsi   = calcRSI14(closes)
  const atr   = calcATR14(rows)
  const adx   = calcADX14(rows)
  const macd  = calcMACDHist(closes)
  const cci   = calcCCI20(rows)
  const vwma  = calcVWMA20(rows)
  const volMA20  = sma(volumes, 20)
  const volMA168 = sma(volumes, 168)

  const hl2    = rows.map(r => (r.high + r.low) / 2)
  const tenkan = sma(hl2, 9)
  const kijun  = sma(hl2, 26)
  const span52 = sma(hl2, 52)
  const SHIFT  = 26

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i]!
    const vol168 = volMA168[i]

    row.ma20  = ma20[i]; row.ma60 = ma60[i]; row.ma120 = ma120[i]
    row.bb_upper = bbMid[i] != null && bbStd[i] != null ? bbMid[i]! + 2 * bbStd[i]! : null
    row.bb_lower = bbMid[i] != null && bbStd[i] != null ? bbMid[i]! - 2 * bbStd[i]! : null
    row.rsi14    = rsi[i]; row.atr14 = atr[i]; row.adx14 = adx[i]
    row.macd_hist = macd[i]; row.cci20 = cci[i]; row.vwma20 = vwma[i]
    row.vol_ma20    = volMA20[i]
    row.vol_rvol168 = vol168 ? Math.round(volumes[i]! / vol168 * 1000) / 1000 : 1.0

    if (i >= SHIFT) {
      const t = tenkan[i - SHIFT], k = kijun[i - SHIFT], s = span52[i - SHIFT]
      row.ichimoku_a = t != null && k != null ? (t + k) / 2 : null
      row.ichimoku_b = s ?? null
    } else {
      row.ichimoku_a = null; row.ichimoku_b = null
    }
  }
}