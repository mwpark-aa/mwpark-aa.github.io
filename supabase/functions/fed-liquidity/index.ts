// Fed Liquidity Proxy — Supabase Edge Function
// Fetches WALCL, TGA(WTREGEN), RRP(RRPONTSYD) from FRED API
// Requires: supabase secrets set FRED_API_KEY=<your_key>
// Free API key: https://fred.stlouisfed.org/docs/api/api_key.html

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FRED_KEY  = Deno.env.get("FRED_API_KEY") ?? "";
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

interface Obs { date: string; value: number }

async function fetchSeries(id: string, start: string, end: string): Promise<Obs[]> {
    if (!FRED_KEY) throw new Error("FRED_API_KEY not set");
    const url = new URL(FRED_BASE);
    url.searchParams.set("series_id", id);
    url.searchParams.set("api_key", FRED_KEY);
    url.searchParams.set("observation_start", start);
    url.searchParams.set("observation_end", end);
    url.searchParams.set("file_type", "json");
    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`FRED ${id} error ${resp.status}`);
    const json = await resp.json();
    return (json.observations as any[])
        .filter((o) => o.value !== ".")
        .map((o) => ({ date: o.date as string, value: parseFloat(o.value) }));
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { startDate, endDate, maPeriod: maPeriodRaw } = await req.json();
        const MA_PERIOD: number = typeof maPeriodRaw === "number" && maPeriodRaw > 0 ? maPeriodRaw : 13;
        if (!startDate || !endDate) {
            return new Response(JSON.stringify({ error: "startDate, endDate required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // MA 계산 + 방향 계산을 위한 충분한 선행 데이터 확보 (MA_PERIOD 주 + 여유)
        const extraDays = (MA_PERIOD + 8) * 7;
        const fetchStart = new Date(new Date(startDate).getTime() - extraDays * 86400000)
            .toISOString().slice(0, 10);

        // WALCL = Fed 총 자산 (주간, billions)
        // WTREGEN = TGA / 재무부 일반계정 (주간, billions)
        // RRPONTSYD = 역레포 (일간, billions)
        const [walcl, tga, rrp] = await Promise.all([
            fetchSeries("WALCL",     fetchStart, endDate),
            fetchSeries("WTREGEN",   fetchStart, endDate),
            fetchSeries("RRPONTSYD", fetchStart, endDate),
        ]);

        // 날짜 집합 — 세 시리즈 합집합
        const allDates = Array.from(
            new Set([...walcl.map(d => d.date), ...tga.map(d => d.date), ...rrp.map(d => d.date)])
        ).sort();

        const walclMap = new Map(walcl.map(d => [d.date, d.value]));
        const tgaMap   = new Map(tga.map(d => [d.date, d.value]));
        const rrpMap   = new Map(rrp.map(d => [d.date, d.value]));

        // 주간 시리즈는 forward-fill, 일간 RRP는 그대로
        let lastWalcl: number | null = null;
        let lastTga:   number | null = null;
        let lastRrp:   number | null = null;

        const series: { date: string; netLiquidity: number }[] = [];

        for (const date of allDates) {
            if (walclMap.has(date)) lastWalcl = walclMap.get(date)!;
            if (tgaMap.has(date))   lastTga   = tgaMap.get(date)!;
            if (rrpMap.has(date))   lastRrp   = rrpMap.get(date)!;

            if (lastWalcl != null && lastTga != null && lastRrp != null) {
                // 연준 순유동성 = 대차대조표 - TGA - 역레포
                series.push({ date, netLiquidity: lastWalcl - lastTga - lastRrp });
            }
        }

        // ── 방향 계산: 4 데이터포인트 전 대비 ────────────────────────────────────
        const LOOKBACK = 4;
        // ── MA 계산: MA_PERIOD 개 데이터포인트 rolling average ───────────────────
        const result = series.map((s, i) => {
            // 방향
            const prev = i >= LOOKBACK ? series[i - LOOKBACK].netLiquidity : null;
            const rising = prev == null ? null
                : s.netLiquidity > prev ? true
                : s.netLiquidity < prev ? false
                : null;

            // MA (MA_PERIOD개 평균)
            let ma: number | null = null;
            if (i >= MA_PERIOD - 1) {
                const slice = series.slice(i - MA_PERIOD + 1, i + 1);
                ma = slice.reduce((acc, x) => acc + x.netLiquidity, 0) / slice.length;
            }

            // state:
            //  1 = 유동성 확장 확정 (MA 위 + 상승)
            // -1 = 유동성 수축 확정 (MA 아래 + 하락)
            //  0 = 혼재 (전환 중)
            const aboveMA = ma != null ? s.netLiquidity > ma : null;
            let state = 0;
            if (aboveMA === true  && rising === true)  state =  1;
            if (aboveMA === false && rising === false) state = -1;

            return {
                date: s.date,
                netLiquidity: Math.round(s.netLiquidity * 100) / 100,
                ma: ma != null ? Math.round(ma * 100) / 100 : null,
                state,
            };
        });

        // startDate 이후 데이터만 반환
        const filtered = result.filter(r => r.date >= startDate);

        return new Response(
            JSON.stringify({ data: filtered }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (e: any) {
        return new Response(
            JSON.stringify({ error: e.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
