// Paper Trade — Supabase Edge Function (Deno)
// Deploy: supabase functions deploy paper-trade

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import type { Candle, BaseConfig, DailyBar } from '../_shared/types.ts'
import { COMMISSION_TAKER, COMMISSION_MAKER, WARMUP_CANDLES, SIGNAL_COOLDOWN } from '../_shared/constants.ts'
import { intervalToMs, fetchKlines } from '../_shared/klines.ts'
import { computeIndicators } from '../_shared/indicators.ts'
import { fetchFedBars, attachFedData } from '../_shared/fed.ts'
import { scoreLong, scoreShort, getDailyBar, detectSignal } from '../_shared/scoring.ts'
import { buildSignalDetails, buildExitDetails } from '../_shared/details.ts'
import { calcTPSL, calcPositionSize } from '../_shared/position.ts'

type PaperConfig = BaseConfig

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // ── 1. 활성 설정 로드 ─────────────────────────────────────
    const { data: config, error: cfgErr } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('paper_trading_enabled', true)
      .maybeSingle()

    if (cfgErr) throw cfgErr
    if (!config) {
      return new Response(JSON.stringify({ message: '활성 페이퍼 설정 없음' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const c = config as PaperConfig

    // ── 2. 인터벌 계산 및 최신 마감 캔들 시간 ────────────────
    const intervalMs      = intervalToMs(c.interval)
    const now             = Date.now()
    const lastCandleEnd   = Math.floor(now / intervalMs) * intervalMs
    const warmupStartTime = lastCandleEnd - WARMUP_CANDLES * intervalMs

    // ── 3. 이미 처리한 캔들인지 확인 ─────────────────────────
    const { data: account } = await supabase
      .from('paper_account')
      .select('*')
      .eq('id', 1)
      .single()

    if (account?.last_processed_ts) {
      const lastProcessed = new Date(account.last_processed_ts).getTime()
      if (lastProcessed >= lastCandleEnd) {
        return new Response(JSON.stringify({
          message: '이미 처리됨',
          last_processed: account.last_processed_ts,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // ── 4. 캔들 + 지표 계산 ──────────────────────────────────
    const rows = await fetchKlines(c.symbol, c.interval, warmupStartTime, lastCandleEnd - 1)
    if (rows.length < 50) {
      return new Response(JSON.stringify({ message: '캔들 데이터 부족', count: rows.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    computeIndicators(rows)

    // ── 4.5. 연준 유동성 데이터 부착 ─────────────────────────
    let fedFetchError: string | null = null
    let fedHttpStatus: number | null = null
    if (c.score_use_fed_liquidity) {
      const fedStartDate = new Date(lastCandleEnd - 30 * 86_400_000).toISOString().slice(0, 10)
      const endDate      = new Date(lastCandleEnd).toISOString().slice(0, 10)
      const maPeriod     = c.fed_liquidity_ma_period ?? 13
      try {
        const fedBars = await fetchFedBars(fedStartDate, endDate, maPeriod)
        if (fedBars.length > 0) {
          attachFedData(rows, fedBars)
          fedHttpStatus = 200
        } else {
          fedFetchError = 'FRED_API_KEY not set or no data returned'
        }
      } catch (err) {
        fedFetchError = String(err)
        console.error('[paper-trade] Fed liquidity fetch error:', err)
      }
    }

    // ── 4.7. 일봉 추세 맵 (MTF) ──────────────────────────────
    let dailyMap: Map<number, DailyBar> | null = null
    if (c.use_daily_trend) {
      const dailyRows = await fetchKlines(c.symbol, '1d', warmupStartTime - 220 * 86_400_000, lastCandleEnd)
      computeIndicators(dailyRows)
      dailyMap = new Map()
      for (const row of dailyRows) {
        dailyMap.set(row.timestamp, { close: row.close, ma120: row.ma120 ?? null })
      }
    }

    const n         = rows.length
    const latestRow = rows[n - 1]!
    const iso       = (ts: number) => new Date(ts).toISOString()

    // ── 4.9. Fed 디버그 ───────────────────────────────────────
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const fedDebug = {
      enabled:         c.score_use_fed_liquidity,
      fed_state:       latestRow.fed_state ?? null,
      http_status:     fedHttpStatus,
      error:           fedFetchError,
      anon_key_prefix: anonKey ? anonKey.substring(0, 10) : 'EMPTY',
    }

    // ── 5. 자본 및 오픈 포지션 로드 ──────────────────────────
    let capital = account?.capital ?? 10000

    const { data: openPositions } = await supabase
      .from('paper_positions')
      .select('*')
      .eq('status', 'OPEN')
      .eq('backtest_run_id', c.id)

    const positions       = openPositions ?? []
    const closedThisCycle: string[] = []

    // ── 6. 오픈 포지션: SL / TP / SCORE_EXIT 체크 ────────────
    let nextCandleOpen: number | null = null
    if (positions.length > 0 && c.score_exit_threshold > 0) {
      try {
        const nextRows = await fetchKlines(c.symbol, c.interval, lastCandleEnd, lastCandleEnd + intervalMs)
        if (nextRows.length > 0) nextCandleOpen = nextRows[0]!.open
      } catch { /* fallback to latestRow.close */ }
    }

    for (const pos of positions) {
      // 진입 캔들에서는 exit 체크 없음
      if (new Date(pos.entry_time).getTime() === latestRow.timestamp) continue

      const isShort    = pos.direction === 'SHORT'
      const tp: number = pos.target_price
      const sl: number = pos.stop_loss

      const liqPrice = isShort
        ? pos.entry_price * (1 + 1 / c.leverage)
        : pos.entry_price * (1 - 1 / c.leverage)
      const liqHit = isShort ? latestRow.high >= liqPrice : latestRow.low <= liqPrice

      const currentScore = isShort ? scoreShort(latestRow, c) : scoreLong(latestRow, c)
      const scoreExitHit = c.score_exit_threshold > 0 && currentScore <= c.score_exit_threshold

      const slHit = isShort ? latestRow.high >= sl : latestRow.low  <= sl
      const tpHit = isShort ? latestRow.low  <= tp : latestRow.high >= tp

      let exitPrice: number | null = null
      let exitReason = ''

      if      (liqHit)       { exitPrice = liqPrice;                          exitReason = 'LIQUIDATED' }
      else if (slHit)        { exitPrice = sl;                                 exitReason = 'SL'         }
      else if (scoreExitHit) { exitPrice = nextCandleOpen ?? latestRow.close;  exitReason = 'SCORE_EXIT' }
      else if (tpHit)        { exitPrice = tp;                                 exitReason = 'TP'         }

      if (exitPrice != null) {
        const qty      = pos.quantity as number
        const grossPnl = exitReason === 'LIQUIDATED'
          ? -pos.capital_used
          : isShort
            ? qty * (pos.entry_price - exitPrice)
            : qty * (exitPrice - pos.entry_price)

        const exitCommRate = (exitReason === 'TP' || exitReason === 'SL') ? COMMISSION_MAKER : COMMISSION_TAKER
        const entryComm    = (pos.entry_price as number) * qty * COMMISSION_TAKER
        const exitComm     = exitPrice * qty * exitCommRate
        const totalComm    = entryComm + exitComm
        const netCapital   = exitReason === 'LIQUIDATED' ? -(pos.capital_used as number) : grossPnl - totalComm
        capital += netCapital

        const pnlPct = (netCapital / (pos.capital_used as number)) * 100

        let exitDetails: string | undefined = undefined
        if (exitReason === 'SCORE_EXIT' && pos.entry_row) {
          try {
            const entryRow = JSON.parse(pos.entry_row as string) as Candle
            exitDetails = buildExitDetails(pos.direction, entryRow, latestRow, c)
          } catch { /* entry_row 파싱 실패 시 무시 */ }
        }

        await supabase
          .from('paper_positions')
          .update({
            status:       'CLOSED',
            exit_price:   Math.round(exitPrice  * 1e6)   / 1e6,
            exit_time:    iso(lastCandleEnd),
            exit_reason:  exitReason,
            exit_details: exitDetails,
            net_pnl:      Math.round(netCapital * 10000) / 10000,
            pnl_pct:      Math.round(pnlPct     * 10000) / 10000,
          })
          .eq('id', pos.id)

        closedThisCycle.push(pos.id)
      }
    }

    // ── 7. 청산 없을 때만 진입 체크 ──────────────────────────
    const stillOpen = positions.filter(p => !closedThisCycle.includes(p.id))

    let newPosition: Record<string, unknown> | null = null
    const debugInfo: Record<string, unknown> = {
      candle_count:      n,
      open_before:       positions.length,
      closed_this_cycle: closedThisCycle.length,
      still_open:        stillOpen.length,
    }

    if (stillOpen.length === 0 && closedThisCycle.length === 0) {
      // ── 8. 쿨다운 확인 ──────────────────────────────────
      const cooldownMs = SIGNAL_COOLDOWN * intervalMs
      const [{ data: lastLongEntry }, { data: lastShortEntry }] = await Promise.all([
        supabase.from('paper_positions')
          .select('entry_time').eq('backtest_run_id', c.id).eq('direction', 'LONG')
          .order('entry_time', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('paper_positions')
          .select('entry_time').eq('backtest_run_id', c.id).eq('direction', 'SHORT')
          .order('entry_time', { ascending: false }).limit(1).maybeSingle(),
      ])
      const longReady  = !lastLongEntry  || (lastCandleEnd - new Date(lastLongEntry.entry_time).getTime())  >= cooldownMs
      const shortReady = !lastShortEntry || (lastCandleEnd - new Date(lastShortEntry.entry_time).getTime()) >= cooldownMs
      debugInfo.long_ready = longReady; debugInfo.short_ready = shortReady

      // ── 9. 신호 감지 ──────────────────────────────────
      const signal = detectSignal(rows, n - 1, c, longReady, shortReady)
      debugInfo.signal = signal ? { type: signal.type, score: signal.score } : null
      debugInfo.latest_indicators = {
        close: latestRow.close, rsi: latestRow.rsi14, adx: latestRow.adx14,
        macd: latestRow.macd_hist, rvol: latestRow.vol_rvol168,
        ma20: latestRow.ma20, ma60: latestRow.ma60, ma120: latestRow.ma120, atr: latestRow.atr14,
        fed_state: latestRow.fed_state ?? null,
      }
      debugInfo.fed_enabled = c.score_use_fed_liquidity

      if (signal) {
        const { type: signalType, score } = signal
        const isShort = signalType === 'SHORT'

        const ma120Blocked =
          latestRow.ma120 != null && (
            ( isShort && latestRow.close > latestRow.ma120) ||
            (!isShort && latestRow.close < latestRow.ma120)
          )
        debugInfo.ma120_blocked = ma120Blocked

        let mtfBlocked = false
        if (dailyMap) {
          const daily = getDailyBar(dailyMap, latestRow.timestamp)
          if (daily && daily.ma120 != null) {
            if (!isShort && daily.close < daily.ma120) mtfBlocked = true
            if ( isShort && daily.close > daily.ma120) mtfBlocked = true
          }
          debugInfo.mtf_blocked = mtfBlocked
        }

        // ── 10. 진입가: 다음 캔들 시가 ───────────────────
        let entryPrice = latestRow.close
        try {
          const nextRows = await fetchKlines(c.symbol, c.interval, lastCandleEnd, lastCandleEnd + intervalMs)
          if (nextRows.length > 0) entryPrice = nextRows[0]!.open
        } catch { /* fallback to close */ }
        debugInfo.entry_price = entryPrice

        const { tp, sl } = (ma120Blocked || mtfBlocked)
          ? { tp: null, sl: null }
          : calcTPSL(signalType, entryPrice, c)

        if (tp != null && sl != null) {
          const { quantity, capitalUsed } = calcPositionSize(capital, entryPrice, c.leverage)
          debugInfo.quantity = quantity; debugInfo.capital_used = capitalUsed

          if (quantity > 0) {
            const signalDetails = buildSignalDetails(latestRow, c, signalType)
            newPosition = {
              backtest_run_id:       c.id,
              symbol:                c.symbol,
              signal_type:           signalType,
              direction:             signalType,
              entry_price:           Math.round(entryPrice  * 1e6) / 1e6,
              avg_entry_price:       Math.round(entryPrice  * 1e6) / 1e6,
              target_price:          tp,
              stop_loss:             sl,
              quantity:              Math.round(quantity    * 1e8) / 1e8,
              capital_used:          Math.round(capitalUsed * 1e4) / 1e4,
              original_quantity:     Math.round(quantity    * 1e8) / 1e8,
              original_capital_used: Math.round(capitalUsed * 1e4) / 1e4,
              entry_time:            iso(lastCandleEnd),
              signal_details:        signalDetails,
              entry_row:             JSON.stringify(latestRow),
              score,
              status:                'OPEN',
              peak_price:            Math.round(entryPrice  * 1e6) / 1e6,
              last_candle_ts:        iso(lastCandleEnd),
            }
            const { error: insertErr } = await supabase.from('paper_positions').insert(newPosition)
            if (insertErr) {
              debugInfo.insert_error = insertErr.message
              newPosition = null
            }
          }
        }
      }
    }

    // ── 11. 자본 및 처리 시각 업데이트 ───────────────────────
    await supabase
      .from('paper_account')
      .upsert({
        id:                1,
        capital:           Math.round(capital * 100) / 100,
        updated_at:        iso(latestRow.timestamp),
        last_processed_ts: iso(lastCandleEnd),
      }, { onConflict: 'id' })

    return new Response(JSON.stringify({
      ok:          true,
      candle_time: iso(latestRow.timestamp),
      closed:      closedThisCycle.length,
      opened:      newPosition ? 1 : 0,
      capital:     Math.round(capital * 100) / 100,
      fed:         fedDebug,
      debug:       debugInfo,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[paper-trade]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})