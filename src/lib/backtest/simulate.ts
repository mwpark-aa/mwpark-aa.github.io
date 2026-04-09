import type { Candle, BacktestParams, BacktestResult, BacktestTrade } from './types'
import type { DailyBar } from './types'
import {
  COMMISSION,
  SIGNAL_COOLDOWN,
  DAILY_LOSS_LIMIT_PCT,
  WARMUP_CANDLES,
} from './types'
import {
  calcTPSL,
  scoreLong,
  scoreShort,
  detectSignals,
  buildSignalDetails,
  calcPositionSize,
} from './scoring'
import { getDailyBar } from './fetch'

// ── 포지션 내부 상태 ─────────────────────────────────────────────

interface Position {
  signal_type:    string
  signal_details: string
  direction:      'LONG' | 'SHORT'
  entryPrice:     number
  avgEntry:       number
  tp:             number
  sl:             number
  quantity:       number
  origQuantity:   number
  capitalUsed:    number
  peakPrice:      number
  score:          number
  entryTs:        string
  entryRow:       Candle   // 진입 직전 캔들 (SCORE_EXIT 비교용)
  entryScore:     number
}

// ── SCORE_EXIT 청산 시 지표 변화 요약 ────────────────────────────

function buildExitDetails(
  direction: 'LONG' | 'SHORT',
  entryRow:  Candle,
  exitRow:   Candle,
  p:         BacktestParams,
): string | undefined {
  const isShort = direction === 'SHORT'
  const parts: string[] = []

  // RSI 점수 변화
  if (p.scoreUseRSI && entryRow.rsi14 != null && exitRow.rsi14 != null) {
    const entryScore   = isShort ? (entryRow.rsi14 > p.rsiOverbought ? 1 : 0) : (entryRow.rsi14 < p.rsiOversold ? 1 : 0)
    const currentScore = isShort ? (exitRow.rsi14  > p.rsiOverbought ? 1 : 0) : (exitRow.rsi14  < p.rsiOversold ? 1 : 0)
    if (currentScore < entryScore) {
      parts.push(`RSI: ${Math.round(entryRow.rsi14)} → ${Math.round(exitRow.rsi14)}`)
    }
  }

  // ADX 점수 변화
  if (p.scoreUseADX && entryRow.adx14 != null && exitRow.adx14 != null) {
    const entryScore   = entryRow.adx14 >= p.adxThreshold ? 1 : 0
    const currentScore = exitRow.adx14  >= p.adxThreshold ? 1 : 0
    if (currentScore < entryScore) {
      parts.push(`ADX: ${Math.round(entryRow.adx14 * 10) / 10} → ${Math.round(exitRow.adx14 * 10) / 10}`)
    }
  }

  // MACD 점수 변화
  if (p.scoreUseMACD && entryRow.macd_hist != null && exitRow.macd_hist != null) {
    const entryScore   = isShort ? (entryRow.macd_hist < 0 ? 1 : 0) : (entryRow.macd_hist > 0 ? 1 : 0)
    const currentScore = isShort ? (exitRow.macd_hist  < 0 ? 1 : 0) : (exitRow.macd_hist  > 0 ? 1 : 0)
    if (currentScore < entryScore) {
      const fmt = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 1000}`
      parts.push(`MACD: ${fmt(entryRow.macd_hist)} → ${fmt(exitRow.macd_hist)}`)
    }
  }

  // RVOL 점수 변화
  if (p.scoreUseRVOL && entryRow.vol_rvol168 != null && exitRow.vol_rvol168 != null) {
    const entryScore   = entryRow.vol_rvol168 >= p.rvolThreshold ? 1 : 0
    const currentScore = exitRow.vol_rvol168  >= p.rvolThreshold ? 1 : 0
    if (currentScore < entryScore) {
      parts.push(`RVOL: ${Math.round(entryRow.vol_rvol168 * 10) / 10}x → ${Math.round(exitRow.vol_rvol168 * 10) / 10}x`)
    }
  }

  // MA 추세 점수 변화
  if (
    p.scoreUseGoldenCross
    && entryRow.ma20 != null && entryRow.ma60 != null
    && exitRow.ma20  != null && exitRow.ma60  != null
  ) {
    const entryTrend   = entryRow.ma20 > entryRow.ma60 ? '상승' : '하락'
    const currentTrend = exitRow.ma20  > exitRow.ma60  ? '상승' : '하락'
    const entryScore   = isShort ? (entryTrend   === '하락' ? 1 : 0) : (entryTrend   === '상승' ? 1 : 0)
    const currentScore = isShort ? (currentTrend === '하락' ? 1 : 0) : (currentTrend === '상승' ? 1 : 0)
    if (currentScore < entryScore) {
      parts.push(`MA: ${entryTrend} → ${currentTrend}`)
    }
  }

  return parts.length > 0 ? parts.join(' | ') : undefined
}

// ── 메인 시뮬레이션 ───────────────────────────────────────────────

export function simulate(
  rows:     Candle[],
  p:        BacktestParams,
  dailyMap: Map<number, DailyBar> | null = null,
): BacktestResult {
  const n = rows.length
  let capital  = p.initialCapital
  const trades: BacktestTrade[] = []
  const equity: number[]        = [capital]

  let pos:    Position | null           = null
  const cd:   Record<string, number>    = {}   // 신호 쿨다운 카운터
  let wins    = 0
  let losses  = 0
  let peakEq  = capital
  let maxDD   = 0

  // 사용자 지정 시작 시간 (워밍업 구간 이전 봉은 신호 탐색에서 제외)
  const startMs = new Date(p.startDate).getTime()
  const iso = (ts: number) => new Date(ts).toISOString()

  // ── 메인 루프 ────────────────────────────────────────────────────
  for (let i = WARMUP_CANDLES; i < n; i++) {

    // 쿨다운 카운트 감소
    for (const key of Object.keys(cd)) {
      cd[key] = Math.max(0, cd[key] - 1)
    }

    const row = rows[i]

    // ── 오픈 포지션 청산 조건 확인 ─────────────────────────────────
    if (pos) {
      const isShort = pos.direction === 'SHORT'

      // 최고/최저가 추적 (미래 기능 대비)
      pos.peakPrice = isShort
        ? Math.min(pos.peakPrice, row.low)
        : Math.max(pos.peakPrice, row.high)

      // ── 강제 청산 (레버리지 초과 손실) ───────────────────────────
      const liqPrice = isShort
        ? pos.entryPrice * (1 + 1 / p.leverage)
        : pos.entryPrice * (1 - 1 / p.leverage)
      const isLiquidated = isShort
        ? row.high >= liqPrice
        : row.low  <= liqPrice

      if (isLiquidated) {
        // 강제 청산: 증거금 전액 손실
        capital -= pos.capitalUsed

        const entryComm = pos.entryPrice * pos.quantity * COMMISSION
        const exitComm  = liqPrice       * pos.quantity * COMMISSION
        const totalComm = entryComm + exitComm

        const trade: BacktestTrade = {
          signal_type:    pos.signal_type,
          signal_details: pos.signal_details,
          direction:      pos.direction,
          entry_price:    pos.entryPrice,
          exit_price:     liqPrice,
          tp:             pos.tp,
          sl:             pos.sl,
          quantity:       pos.origQuantity,
          capital_used:   pos.capitalUsed,
          net_pnl:        Math.round(-pos.capitalUsed * 10000) / 10000,
          pnl_pct:        -100,
          exit_reason:    'LIQUIDATED',
          score:          pos.score,
          entry_ts:       pos.entryTs,
          exit_ts:        iso(row.timestamp),
        };
        (trade as any).commission = Math.round(totalComm * 10000) / 10000
        trades.push(trade)

        losses++
        equity.push(capital)
        const dd = (peakEq - capital) / peakEq * 100
        if (capital > peakEq) peakEq = capital
        else if (dd > maxDD) maxDD = dd
        pos = null
        continue
      }

      // ── SL / TP / SCORE_EXIT 조건 ────────────────────────────────
      const slHit = isShort ? row.high >= pos.sl : row.low  <= pos.sl
      const tpHit = isShort ? row.low  <= pos.tp : row.high >= pos.tp

      const currentScore = isShort ? scoreShort(row, p) : scoreLong(row, p)
      const scoreExitHit = p.scoreExitThreshold > 0 && currentScore <= p.scoreExitThreshold

      let exitPrice:  number | null = null
      let exitReason: string        = ''

      // SL → SCORE_EXIT → TP 순서로 우선순위 처리
      if      (slHit)        { exitPrice = pos.sl;    exitReason = 'SL'         }
      else if (scoreExitHit) { exitPrice = row.close; exitReason = 'SCORE_EXIT' }
      else if (tpHit)        { exitPrice = pos.tp;    exitReason = 'TP'         }

      if (exitPrice != null) {
        const grossPnl = isShort
          ? pos.quantity * (pos.avgEntry - exitPrice)
          : pos.quantity * (exitPrice    - pos.avgEntry)

        // 수수료: 명목 거래액 기준 (레버리지 제외)
        const notionalQty = pos.quantity / p.leverage
        const entryComm   = pos.entryPrice * notionalQty * COMMISSION
        const exitComm    = exitPrice       * notionalQty * COMMISSION
        const totalComm   = entryComm + exitComm

        const netCapital = grossPnl - totalComm
        capital += netCapital

        const pnlPct   = grossPnl / pos.capitalUsed * 100
        const exitDetails = scoreExitHit
          ? buildExitDetails(pos.direction, pos.entryRow, row, p)
          : undefined

        const trade: BacktestTrade = {
          signal_type:    pos.signal_type,
          signal_details: pos.signal_details,
          exit_details:   exitDetails,
          direction:      pos.direction,
          entry_price:    pos.entryPrice,
          exit_price:     exitPrice,
          tp:             pos.tp,
          sl:             pos.sl,
          quantity:       pos.origQuantity,
          capital_used:   pos.capitalUsed,
          net_pnl:        Math.round(grossPnl * 10000) / 10000,
          pnl_pct:        Math.round(pnlPct   * 10000) / 10000,
          exit_reason:    exitReason,
          score:          pos.score,
          entry_ts:       pos.entryTs,
          exit_ts:        iso(row.timestamp),
        };
        (trade as any).commission = Math.round(totalComm * 10000) / 10000
        trades.push(trade)

        if (netCapital > 0) wins++; else losses++
        equity.push(capital)
        if (capital > peakEq) peakEq = capital
        else { const dd = (peakEq - capital) / peakEq * 100; if (dd > maxDD) maxDD = dd }
        pos = null
      }
    }

    // 포지션이 있으면 신규 진입 스킵
    if (pos) continue

    // ── 일일 손실 한도 초과 시 거래 중단 ─────────────────────────
    const today     = new Date(row.timestamp).toDateString()
    const dailyLoss = trades
      .filter(t => new Date(t.exit_ts).toDateString() === today)
      .reduce((sum, t) => sum + t.net_pnl, 0)
    if (dailyLoss < -p.initialCapital * DAILY_LOSS_LIMIT_PCT) continue

    // 워밍업 구간 및 사용자 지정 시작일 이전 봉은 진입하지 않음
    if (i < 1) continue
    if (row.timestamp < startMs) continue

    // ── 신호 감지: 직전 캔들(i-1) 기준 ──────────────────────────
    // 실시간 봇과 동기화: 완성된 봉에서 신호를 감지하고, 다음 봉 시가에 진입
    const signals = detectSignals(rows, i - 1, cd, p)

    for (const sig of signals) {
      const { signal_type, score } = sig
      if (score < p.minScore) continue

      const isShort = signal_type === 'SHORT'

      // ── MA120 추세 필터 (현재 인터벌 기준) ───────────────────────
      if (row.ma120 != null) {
        if (isShort  && row.close > row.ma120) continue   // 상승장 → 숏 스킵
        if (!isShort && row.close < row.ma120) continue   // 하락장 → 롱 스킵
      }

      // ── 일봉 추세 필터 (MTF): 일봉 MA120 방향 확인 ──────────────
      if (dailyMap) {
        const daily = getDailyBar(dailyMap, row.timestamp)
        if (daily && daily.ma120 != null) {
          if (!isShort && daily.close < daily.ma120) continue   // 일봉 하락장 → 롱 스킵
          if (isShort  && daily.close > daily.ma120) continue   // 일봉 상승장 → 숏 스킵
        }
      }

      // ── 진입: 현재 봉 시가 기준 ──────────────────────────────────
      const entryPrice = row.open

      // 진입가 기준으로 TP/SL 재계산 (Fixed 모드)
      const { tp: newTp, sl: newSl, rr: newRr } = calcTPSL(signal_type, entryPrice, p)
      if (newTp == null || newSl == null) continue

      // SL이 진입가와 같은 방향이면 스킵 (잘못된 설정 방어)
      if (isShort  ? newSl <= entryPrice : newSl >= entryPrice) continue

      // 쿨다운 설정
      cd[signal_type] = SIGNAL_COOLDOWN

      // 포지션 크기 계산
      const { quantity, capitalUsed } = calcPositionSize(capital, entryPrice, newSl, p.leverage)
      if (quantity <= 0) continue

      const signalDetails = buildSignalDetails(signal_type, rows[i - 1], score, newRr, p)

      pos = {
        signal_type,
        signal_details: signalDetails,
        direction:      isShort ? 'SHORT' : 'LONG',
        entryPrice,
        avgEntry:       entryPrice,
        tp:             newTp,
        sl:             newSl,
        quantity,
        origQuantity:   quantity,
        capitalUsed,
        peakPrice:      entryPrice,
        score,
        entryTs:        iso(row.timestamp),
        entryRow:       rows[i - 1],
        entryScore:     score,
      }
      break  // 한 봉에서 첫 번째 유효 신호만 사용
    }
  }

  // ── 기간 종료 시 강제 청산 ────────────────────────────────────────
  if (pos) {
    const lastRow  = rows[n - 1]
    const isShort  = pos.direction === 'SHORT'
    const exitPrice = lastRow.close

    const grossPnl = isShort
      ? pos.quantity * (pos.avgEntry - exitPrice)
      : pos.quantity * (exitPrice    - pos.avgEntry)

    const notionalQty = pos.quantity / p.leverage
    const entryComm   = pos.entryPrice * notionalQty * COMMISSION
    const exitComm    = exitPrice       * notionalQty * COMMISSION
    const totalComm   = entryComm + exitComm
    const netCapital  = grossPnl - totalComm
    capital += netCapital

    const pnlPct = grossPnl / pos.capitalUsed * 100
    const exitTs = iso(lastRow.timestamp)

    // entry_ts > exit_ts 역전 방어 (데이터 순서 문제)
    const entryTime = new Date(pos.entryTs).getTime()
    const exitTime  = new Date(exitTs).getTime()
    const [finalEntry, finalExit] = entryTime > exitTime
      ? [exitTs, pos.entryTs]
      : [pos.entryTs, exitTs]

    const trade: BacktestTrade = {
      signal_type:    pos.signal_type,
      signal_details: pos.signal_details,
      direction:      pos.direction,
      entry_price:    pos.entryPrice,
      exit_price:     exitPrice,
      tp:             pos.tp,
      sl:             pos.sl,
      quantity:       pos.origQuantity,
      capital_used:   pos.capitalUsed,
      net_pnl:        Math.round(grossPnl * 10000) / 10000,
      pnl_pct:        Math.round(pnlPct   * 10000) / 10000,
      exit_reason:    'DATA_END',
      score:          pos.score,
      entry_ts:       finalEntry,
      exit_ts:        finalExit,
    };
    (trade as any).commission = Math.round(totalComm * 10000) / 10000
    trades.push(trade)

    if (netCapital > 0) wins++; else losses++
  }

  // ── 통계 계산 ─────────────────────────────────────────────────────
  const total      = wins + losses
  const winRate    = total > 0 ? wins / total * 100 : 0
  const totalRet   = (capital - p.initialCapital) / p.initialCapital * 100

  const grossProfit = trades
    .filter(t => t.net_pnl > 0)
    .reduce((sum, t) => sum + t.net_pnl, 0)
  const grossLoss = Math.abs(
    trades
      .filter(t => t.net_pnl < 0)
      .reduce((sum, t) => sum + t.net_pnl, 0)
  )

  // Sharpe ratio (거래별 수익률 기준, 연율화 계수 √252)
  let sharpe = 0
  if (total > 1) {
    const returns  = trades.map(t => t.net_pnl / t.capital_used)
    const mean     = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1)
    const sd       = Math.sqrt(variance)
    if (sd > 0) sharpe = mean / sd * Math.sqrt(252)
  }

  return {
    symbol:             p.symbol,
    interval:           p.interval,
    start_date:         p.startDate,
    end_date:           p.endDate,
    initial_capital:    p.initialCapital,
    final_capital:      Math.round(capital  * 100) / 100,
    total_return_pct:   Math.round(totalRet * 100) / 100,
    total_trades:       total,
    winning_trades:     wins,
    losing_trades:      losses,
    win_rate:           Math.round(winRate * 100) / 100,
    max_drawdown_pct:   Math.round(maxDD   * 100) / 100,
    sharpe_ratio:       Math.round(sharpe  * 1000) / 1000,
    profit_factor:      grossLoss > 0
      ? Math.round(grossProfit / grossLoss * 1000) / 1000
      : null,
    trade_log:    trades,
    equity_curve: equity,
  }
}
