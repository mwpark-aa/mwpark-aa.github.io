import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Paper,
} from '@mui/material';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import ReactMarkdown from 'react-markdown';
import { supabase } from '../../lib/supabase';

type DataPoint = { date: string; close: number; open?: number; high?: number; low?: number; volume?: number };

const calculateIndicators = (data: DataPoint[]) => {
  const closes = data.map(d => d.close);

  const calculateSMA = (period: number) =>
    closes.map((_, idx) => {
      if (idx < period - 1) return null;
      const sum = closes.slice(idx - period + 1, idx + 1).reduce((a, b) => a + b, 0);
      return parseFloat((sum / period).toFixed(2));
    });

  const ma20 = calculateSMA(20);
  const ma60 = calculateSMA(60);
  const ma200 = calculateSMA(200);

  const calculateRSI = (period = 14) => {
    const rsi = new Array(closes.length).fill(null);
    if (closes.length <= period) return rsi;
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) avgGain += d; else avgLoss -= d;
    }
    avgGain /= period; avgLoss /= period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + (d >= 0 ? d : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
      rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }
    return rsi.map(v => v !== null ? parseFloat(v.toFixed(2)) : null);
  };
  const rsi14 = calculateRSI(14);

  const calculateIchimoku = () => {
    const med = (period: number, idx: number) => {
      if (idx < period - 1) return null;
      const s = closes.slice(idx - period + 1, idx + 1);
      return parseFloat(((Math.max(...s) + Math.min(...s)) / 2).toFixed(2));
    };
    return {
      tenkanSen: closes.map((_, idx) => med(9, idx)),
      kijunSen: closes.map((_, idx) => med(26, idx)),
    };
  };
  const { tenkanSen, kijunSen } = calculateIchimoku();

  const calculateBollingerBands = (period = 20, mult = 2) => {
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      const sl = closes.slice(i - period + 1, i + 1);
      const mean = sl.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(sl.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
      upper[i] = parseFloat((mean + mult * std).toFixed(2));
      lower[i] = parseFloat((mean - mult * std).toFixed(2));
    }
    return { upper, lower };
  };
  const { upper: bbUpper, lower: bbLower } = calculateBollingerBands();

  const calculateATR = (period = 14) => {
    const atr = new Array(data.length).fill(null);
    if (data.length < period + 1) return atr;
    const tr = data.map((d, i) => {
      const h = d.high ?? d.close, l = d.low ?? d.close;
      if (i === 0) return h - l;
      const pc = data[i - 1].close;
      return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    });
    let val = tr.slice(1, period + 1).reduce((a: number, b: number) => a + b, 0) / period;
    atr[period] = parseFloat(val.toFixed(2));
    for (let i = period + 1; i < data.length; i++) {
      val = (val * (period - 1) + tr[i]) / period;
      atr[i] = parseFloat(val.toFixed(2));
    }
    return atr;
  };
  const atrValues = calculateATR();

  // EMA helper
  const calcEMA = (period: number, values: number[]): (number | null)[] => {
    if (values.length < period) return new Array(values.length).fill(null);
    const k = 2 / (period + 1);
    const result: (number | null)[] = new Array(values.length).fill(null);
    result[period - 1] = parseFloat((values.slice(0, period).reduce((a, b) => a + b, 0) / period).toFixed(4));
    for (let i = period; i < values.length; i++) {
      result[i] = parseFloat((values[i] * k + result[i - 1]! * (1 - k)).toFixed(4));
    }
    return result;
  };

  // MACD (12, 26, 9)
  const ema12 = calcEMA(12, closes);
  const ema26 = calcEMA(26, closes);
  const macdLine = closes.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null ? parseFloat((ema12[i]! - ema26[i]!).toFixed(4)) : null
  );
  const macdStart = macdLine.findIndex(v => v !== null);
  const macdSignalArr: (number | null)[] = new Array(closes.length).fill(null);
  if (macdStart !== -1) {
    const valid = macdLine.slice(macdStart) as number[];
    calcEMA(9, valid).forEach((v, i) => { macdSignalArr[macdStart + i] = v; });
  }
  const macdHistogram = closes.map((_, i) =>
    macdLine[i] !== null && macdSignalArr[i] !== null ? parseFloat((macdLine[i]! - macdSignalArr[i]!).toFixed(4)) : null
  );

  // Stochastic (14, 3)
  const stochK: (number | null)[] = new Array(data.length).fill(null);
  for (let i = 13; i < data.length; i++) {
    const sl = data.slice(i - 13, i + 1);
    const hh = Math.max(...sl.map(d => d.high ?? d.close));
    const ll = Math.min(...sl.map(d => d.low ?? d.close));
    stochK[i] = hh === ll ? 50 : parseFloat(((data[i].close - ll) / (hh - ll) * 100).toFixed(2));
  }
  const stochD: (number | null)[] = new Array(data.length).fill(null);
  for (let i = 15; i < data.length; i++) {
    const k3 = [stochK[i], stochK[i - 1], stochK[i - 2]].filter(v => v !== null) as number[];
    if (k3.length === 3) stochD[i] = parseFloat((k3.reduce((a, b) => a + b, 0) / 3).toFixed(2));
  }

  // OBV
  const obvValues: number[] = new Array(data.length).fill(0);
  for (let i = 1; i < data.length; i++) {
    const vol = data[i].volume ?? 0;
    if (data[i].close > data[i - 1].close) obvValues[i] = obvValues[i - 1] + vol;
    else if (data[i].close < data[i - 1].close) obvValues[i] = obvValues[i - 1] - vol;
    else obvValues[i] = obvValues[i - 1];
  }

  return data.map((d, i) => ({
    ...d,
    ma20: ma20[i], ma60: ma60[i], ma200: ma200[i],
    rsi: rsi14[i],
    tenkanSen: tenkanSen[i], kijunSen: kijunSen[i],
    bbUpper: bbUpper[i], bbLower: bbLower[i],
    atr: atrValues[i],
    macdLine: macdLine[i], macdSignal: macdSignalArr[i], macdHistogram: macdHistogram[i],
    stochK: stochK[i], stochD: stochD[i],
    obv: obvValues[i],
  }));
};

type PatternEntry = { type: 'bullish' | 'bearish' | 'neutral'; name: string; description: string };
type PatternResult = { patterns: PatternEntry[]; nearestResistance: number | null; nearestSupport: number | null };

const analyzePatterns = (data: any[]): PatternResult => {
  const detected: PatternEntry[] = [];
  const n = data.length;
  if (n < 5) return { patterns: detected, nearestResistance: null, nearestSupport: null };

  // Golden / Death Cross (MA20 vs MA60, last 30 days)
  for (let i = Math.max(1, n - 30); i < n; i++) {
    const c = data[i], p = data[i - 1];
    if (c.ma20 && c.ma60 && p.ma20 && p.ma60) {
      if (p.ma20 <= p.ma60 && c.ma20 > c.ma60)
        detected.push({ type: 'bullish', name: '골든크로스 (Golden Cross)', description: `${c.date}: MA20이 MA60 상향 돌파 → 중기 상승 전환 신호` });
      else if (p.ma20 >= p.ma60 && c.ma20 < c.ma60)
        detected.push({ type: 'bearish', name: '데드크로스 (Death Cross)', description: `${c.date}: MA20이 MA60 하향 이탈 → 중기 하락 전환 신호` });
    }
  }

  // MACD Cross (last 10 days)
  for (let i = Math.max(1, n - 10); i < n; i++) {
    const c = data[i], p = data[i - 1];
    if (c.macdLine !== null && c.macdSignal !== null && p.macdLine !== null && p.macdSignal !== null) {
      if (p.macdLine <= p.macdSignal && c.macdLine > c.macdSignal)
        detected.push({ type: 'bullish', name: 'MACD 골든크로스', description: `${c.date}: MACD가 시그널선 상향 돌파 → 단기 매수 신호` });
      else if (p.macdLine >= p.macdSignal && c.macdLine < c.macdSignal)
        detected.push({ type: 'bearish', name: 'MACD 데드크로스', description: `${c.date}: MACD가 시그널선 하향 이탈 → 단기 매도 신호` });
    }
  }

  // Candlestick patterns (last 5 candles)
  for (let i = Math.max(1, n - 5); i < n; i++) {
    const c = data[i], p = data[i - 1];
    if (!c.open || !p.open) continue;
    const body = Math.abs(c.close - c.open);
    const range = (c.high ?? c.close) - (c.low ?? c.close);
    const lower = Math.min(c.close, c.open) - (c.low ?? Math.min(c.close, c.open));
    const upper = (c.high ?? Math.max(c.close, c.open)) - Math.max(c.close, c.open);
    const pBody = Math.abs(p.close - p.open);

    if (range > 0 && body / range < 0.1)
      detected.push({ type: 'neutral', name: '도지 (Doji)', description: `${c.date}: 몸통 극소 → 매수/매도 팽팽, 추세 전환 주의` });
    if (body > 0 && lower >= 2 * body && upper <= body * 0.5)
      detected.push({ type: 'bullish', name: '해머 (Hammer)', description: `${c.date}: 긴 아래 꼬리 → 하단 지지 강화, 반등 가능` });
    if (body > 0 && upper >= 2 * body && lower <= body * 0.5)
      detected.push({ type: 'bearish', name: '슈팅스타 (Shooting Star)', description: `${c.date}: 긴 위 꼬리 → 상단 저항 강화, 하락 가능` });
    if (p.close < p.open && c.close > c.open && body > pBody && c.open <= p.close && c.close >= p.open)
      detected.push({ type: 'bullish', name: '강세 장악형 (Bullish Engulfing)', description: `${c.date}: 전 캔들 완전 포위 양봉 → 강한 매수 전환` });
    if (p.close > p.open && c.close < c.open && body > pBody && c.open >= p.close && c.close <= p.open)
      detected.push({ type: 'bearish', name: '약세 장악형 (Bearish Engulfing)', description: `${c.date}: 전 캔들 완전 포위 음봉 → 강한 매도 전환` });
  }

  // Stochastic signals
  const sk = data[n - 1].stochK;
  if (sk !== null) {
    if (sk < 20) detected.push({ type: 'bullish', name: '스토캐스틱 과매도', description: `%K ${sk} — 과매도 구간, 반등 가능성 높음` });
    else if (sk > 80) detected.push({ type: 'bearish', name: '스토캐스틱 과매수', description: `%K ${sk} — 과매수 구간, 조정 가능성 높음` });
  }

  // Double Bottom
  const c60 = data.slice(-60).map((d: any) => d.close);
  const mins: number[] = [];
  for (let i = 5; i < c60.length - 5; i++)
    if (c60[i] === Math.min(...c60.slice(i - 5, i + 6))) mins.push(i);
  if (mins.length >= 2) {
    const [i1, i2] = mins.slice(-2);
    if (i2 - i1 >= 10 && Math.abs(c60[i1] - c60[i2]) / c60[i1] < 0.03 &&
        Math.max(...c60.slice(i1, i2 + 1)) > c60[i1] * 1.03)
      detected.push({ type: 'bullish', name: '더블 바텀 (Double Bottom)', description: '두 유사한 저점 확인 → 강한 지지선 형성, 상승 반전 가능' });
  }

  // Double Top
  const maxes: number[] = [];
  for (let i = 5; i < c60.length - 5; i++)
    if (c60[i] === Math.max(...c60.slice(i - 5, i + 6))) maxes.push(i);
  if (maxes.length >= 2) {
    const [i1, i2] = maxes.slice(-2);
    if (i2 - i1 >= 10 && Math.abs(c60[i1] - c60[i2]) / c60[i1] < 0.03 &&
        Math.min(...c60.slice(i1, i2 + 1)) < c60[i1] * 0.97)
      detected.push({ type: 'bearish', name: '더블 탑 (Double Top)', description: '두 유사한 고점 확인 → 강한 저항선 형성, 하락 반전 가능' });
  }

  // Cup and Handle
  if (n >= 120) {
    const sec = data.slice(-120).map((d: any) => d.close);
    const sMax = Math.max(...sec);
    if (sec[0] >= sMax * 0.9 && sec[sec.length - 1] >= sMax * 0.9 &&
        Math.min(...sec.slice(10, 100)) <= sMax * 0.85) {
      const handle = sec.slice(-20);
      if ((Math.max(...handle) - Math.min(...handle)) / sec[sec.length - 1] < 0.08)
        detected.push({ type: 'bullish', name: '컵앤핸들 (Cup & Handle)', description: 'U형 반등 후 소폭 조정 → 강세 지속, 저항선 돌파 시 강한 상승 가능' });
    }
  }

  // Head and Shoulders
  if (n >= 80) {
    const sec = data.slice(-80).map((d: any) => d.close);
    const lPeak = Math.max(...sec.slice(0, 25));
    const head = Math.max(...sec.slice(25, 55));
    const rPeak = Math.max(...sec.slice(55));
    if (head > lPeak * 1.02 && head > rPeak * 1.02 && Math.abs(lPeak - rPeak) / lPeak < 0.05)
      detected.push({ type: 'bearish', name: '헤드앤숄더 (Head & Shoulders)', description: '머리-어깨 패턴 감지 → 상승 추세 반전, 네크라인 이탈 시 큰 하락 가능' });
  }

  // Support / Resistance
  const recent = data.slice(-60);
  const cp = data[n - 1].close;
  const rHs = recent.map((d: any) => d.high ?? d.close);
  const rLs = recent.map((d: any) => d.low ?? d.close);
  const resLvls: number[] = [], supLvls: number[] = [];
  for (let i = 3; i < recent.length - 3; i++) {
    if (rHs[i] === Math.max(...rHs.slice(i - 3, i + 4))) resLvls.push(parseFloat(rHs[i].toFixed(2)));
    if (rLs[i] === Math.min(...rLs.slice(i - 3, i + 4))) supLvls.push(parseFloat(rLs[i].toFixed(2)));
  }
  const nearestResistance = resLvls.filter(l => l > cp).sort((a, b) => a - b)[0] ?? null;
  const nearestSupport = supLvls.filter(l => l < cp).sort((a, b) => b - a)[0] ?? null;

  return { patterns: detected, nearestResistance, nearestSupport };
};

export default function StockExplorer() {
  const [ticker, setTicker] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [stockData, setStockData] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patternData, setPatternData] = useState<PatternResult | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [visibleLines, setVisibleLines] = useState({
    close: true, ma20: true, ma60: false, ma200: true, bb: true,
  });

  const toggleLine = (key: keyof typeof visibleLines) =>
    setVisibleLines(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 600);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleSearch = async (targetTicker: string = searchTerm) => {
    if (!targetTicker) return;
    setLoading(true);
    setError(null);
    setPatternData(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('stock-data', {
        body: { symbol: targetTicker.toUpperCase() }
      });

      if (functionError) {
        let msg = '데이터를 가져오지 못했습니다.';
        try {
          const j = typeof functionError.message === 'string' ? JSON.parse(functionError.message) : functionError;
          if (j.error?.includes('429')) msg = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. (Yahoo Finance API 제한)';
          else if (j.error?.includes('404')) msg = '해당 티커를 찾을 수 없습니다. 올바른 티커인지 확인해 주세요.';
          else msg = j.error || msg;
        } catch { msg = functionError.message || msg; }
        throw new Error(msg);
      }
      if (!data || !data.data) throw new Error('데이터를 불러오지 못했습니다.');

      const richData = calculateIndicators(data.data);
      const displayData = richData.slice(-252);
      setStockData(displayData);
      setTicker(targetTicker.toUpperCase());

      const pInfo = analyzePatterns(displayData);
      setPatternData(pInfo);
      handleAnalyze(targetTicker.toUpperCase(), displayData, pInfo);
    } catch (err: any) {
      setError(err.message || '주식 데이터를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (targetTicker: string, indicators: any[], patternInfo?: PatternResult) => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const { data, error: analysisError } = await supabase.functions.invoke('stock-analyze', {
        body: { symbol: targetTicker, indicators, patternInfo }
      });
      if (analysisError) throw new Error(analysisError.message);
      if (data?.analysis) setAnalysis(data.analysis);
    } catch (err: any) {
      setAnalysis('AI 분석을 가져오는 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  const currentPrice = stockData.length > 0 ? stockData[stockData.length - 1].close : 0;
  const prevPrice = stockData.length > 1 ? stockData[stockData.length - 2].close : 0;
  const change = currentPrice - prevPrice;
  const changePercent = (change / prevPrice) * 100;
  const latestData = stockData[stockData.length - 1] || {};

  const IndicatorCard = ({ title, value, description }: { title: string; value: any; description: string }) => (
    <Card sx={{ background: '#18181b', border: '1px solid #27272a', height: '100%' }}>
      <CardContent>
        <Typography variant="caption" sx={{ color: '#71717a', fontWeight: 600 }}>{title}</Typography>
        <Typography variant="h6" sx={{ color: '#fafafa', mt: 0.5 }}>{value ?? 'N/A'}</Typography>
        <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 1, fontSize: '0.75rem' }}>{description}</Typography>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto', color: '#fafafa' }}>
      <Box sx={{ mb: 4, display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          fullWidth variant="outlined" placeholder="티커 입력 (예: AAPL, TSLA)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              color: '#fff', backgroundColor: '#18181b',
              '& fieldset': { borderColor: '#27272a' },
              '&:hover fieldset': { borderColor: '#3f3f46' },
              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
            },
          }}
        />
        <Button
          variant="contained" onClick={() => handleSearch()} disabled={loading}
          sx={{ height: 56, minWidth: { xs: '80px', sm: '120px' }, px: { xs: 2, sm: 4 }, bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' }, whiteSpace: 'nowrap' }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : '조회'}
        </Button>
      </Box>

      {error && (
        <Box sx={{ mb: 4, p: 2, borderRadius: 2, bgcolor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <Typography sx={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</Typography>
        </Box>
      )}

      {stockData.length > 0 && (
        <Box>
          <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 2, sm: 0 } }}>
            <Box sx={{ width: '100%' }}>
              <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5, fontSize: { xs: '1.75rem', sm: '2.125rem' }, whiteSpace: 'nowrap' }}>
                {ticker}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap' }}>
                <Typography variant="h5" sx={{ fontWeight: 600, fontSize: { xs: '1.25rem', sm: '1.5rem' }, whiteSpace: 'nowrap' }}>
                  ${currentPrice.toLocaleString()}
                </Typography>
                <Typography sx={{ display: 'flex', alignItems: 'center', color: change >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: { xs: '0.875rem', sm: '1rem' }, whiteSpace: 'nowrap' }}>
                  {change >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {Math.abs(change).toFixed(2)} ({changePercent.toFixed(2)}%)
                </Typography>
              </Box>
            </Box>
            <Typography variant="body2" sx={{ color: '#71717a', width: '100%', textAlign: { xs: 'left', sm: 'right' }, fontSize: { xs: '0.75rem', sm: '0.875rem' }, whiteSpace: 'nowrap' }}>
              최근 업데이트: {stockData[stockData.length - 1].date}
            </Typography>
          </Box>

          {/* Main Chart */}
          <Paper sx={{ p: 2, mb: 4, background: '#09090b', border: '1px solid #27272a', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h6" sx={{ color: '#fafafa', fontSize: '1rem' }}>1개년 차트</Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {([
                  { key: 'close', label: '종가', color: '#fff' },
                  { key: 'ma20', label: '20일', color: '#3b82f6' },
                  { key: 'ma60', label: '60일', color: '#10b981' },
                  { key: 'ma200', label: '200일', color: '#f59e0b' },
                  { key: 'bb', label: 'BB', color: '#8b5cf6' },
                ] as const).map(({ key, label, color }) => (
                  <Box key={key} onClick={() => toggleLine(key)} sx={{
                    px: 1.5, py: 0.4, borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                    cursor: 'pointer', userSelect: 'none', border: `1px solid ${color}`,
                    color: visibleLines[key] ? '#000' : color,
                    bgcolor: visibleLines[key] ? color : 'transparent',
                    opacity: visibleLines[key] ? 1 : 0.5, transition: 'all 0.15s',
                  }}>
                    {label}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box sx={{ height: 400, width: '100%', '& svg': { outline: 'none' }, '& .recharts-wrapper': { outline: 'none' }, '& *:focus': { outline: 'none' } }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stockData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={12}
                    tickFormatter={(str) => { const d = new Date(str); return d.getDate() <= 7 && d.getMonth() % 2 === 0 ? `${d.getFullYear()}.${d.getMonth() + 1}` : ''; }}
                    minTickGap={30} />
                  <YAxis stroke="#71717a" fontSize={12} domain={['auto', 'auto']} orientation="right"
                    tickFormatter={(val) => `$${val.toLocaleString()}`} hide={isMobile} />
                  <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }}
                    itemStyle={{ fontSize: '12px' }} labelFormatter={(l) => `날짜: ${l}`} />
                  <Line type="monotone" dataKey="bbUpper" name="BB 상단" stroke="#8b5cf6" dot={false} strokeWidth={1} strokeDasharray="4 2" isAnimationActive={false} hide={!visibleLines.bb} />
                  <Line type="monotone" dataKey="bbLower" name="BB 하단" stroke="#8b5cf6" dot={false} strokeWidth={1} strokeDasharray="4 2" isAnimationActive={false} hide={!visibleLines.bb} />
                  <Line type="monotone" dataKey="close" name="종가" stroke="#fff" strokeWidth={2} dot={false} isAnimationActive={false} hide={!visibleLines.close} />
                  <Line type="monotone" dataKey="ma20" name="20일 이평선" stroke="#3b82f6" dot={false} strokeWidth={1} isAnimationActive={false} hide={!visibleLines.ma20} />
                  <Line type="monotone" dataKey="ma60" name="60일 이평선" stroke="#10b981" dot={false} strokeWidth={1} isAnimationActive={false} hide={!visibleLines.ma60} />
                  <Line type="monotone" dataKey="ma200" name="200일 이평선" stroke="#f59e0b" dot={false} strokeWidth={1} isAnimationActive={false} hide={!visibleLines.ma200} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Paper>

          {/* Technical Indicators Grid */}
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard title="RSI (14일)" value={latestData.rsi}
                description={latestData.rsi > 70 ? "과매수 국면 (70 이상)" : latestData.rsi < 30 ? "과매도 국면 (30 이하)" : "중립 국면"} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard title="MACD (12,26,9)"
                value={latestData.macdLine !== null && latestData.macdLine !== undefined ? latestData.macdLine.toFixed(3) : 'N/A'}
                description={latestData.macdLine !== null && latestData.macdSignal !== null && latestData.macdLine !== undefined
                  ? latestData.macdLine > latestData.macdSignal
                    ? `시그널(${latestData.macdSignal?.toFixed(3)}) 위 — 상승 모멘텀`
                    : `시그널(${latestData.macdSignal?.toFixed(3)}) 아래 — 하락 모멘텀`
                  : "데이터 부족"} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard title="스토캐스틱 %K / %D"
                value={latestData.stochK !== null && latestData.stochK !== undefined ? `${latestData.stochK} / ${latestData.stochD ?? '-'}` : 'N/A'}
                description={latestData.stochK > 80 ? "과매수 구간 (80 이상)" : latestData.stochK < 20 ? "과매도 구간 (20 이하)" : "중립 구간"} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard title="20일 이동평균선" value={`$${latestData.ma20}`}
                description={currentPrice > latestData.ma20 ? "단기 상향 추세" : "단기 하향 추세"} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard title="200일 이동평균선" value={`$${latestData.ma200}`}
                description={currentPrice > latestData.ma200 ? "장기 지지선 상회" : "장기 저항선 하회"} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard title="일목균형표 (전환/기준)"
                value={`${latestData.tenkanSen} / ${latestData.kijunSen}`}
                description={latestData.tenkanSen > latestData.kijunSen ? "전환선 > 기준선 (단기 강세)" : "전환선 < 기준선 (단기 약세)"} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard title="볼린저 밴드"
                value={latestData.bbUpper && latestData.bbLower ? `$${latestData.bbLower} ~ $${latestData.bbUpper}` : 'N/A'}
                description={latestData.bbUpper && latestData.bbLower
                  ? currentPrice >= latestData.bbUpper ? "상단 밴드 근접 — 과열 가능성"
                    : currentPrice <= latestData.bbLower ? "하단 밴드 근접 — 반등 가능성"
                    : "밴드 중간 구간"
                  : "데이터 부족"} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard title="ATR (변동성)"
                value={latestData.atr ? `$${latestData.atr}` : 'N/A'}
                description={latestData.atr ? `손절 기준선: $${(currentPrice - latestData.atr * 1.5).toFixed(2)} (ATR×1.5)` : "데이터 부족"} />
            </Grid>
          </Grid>

          {/* Pattern Analysis */}
          {patternData && (patternData.patterns.length > 0 || patternData.nearestResistance || patternData.nearestSupport) && (
            <Paper sx={{ p: 3, mb: 4, background: '#09090b', border: '1px solid #27272a', borderRadius: 2 }}>
              <Typography variant="h6" sx={{ color: '#fafafa', mb: 2, fontSize: '1rem', fontWeight: 700 }}>
                감지된 패턴 & 시그널
              </Typography>
              {patternData.patterns.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  {patternData.patterns.map((p, idx) => (
                    <Box key={idx} sx={{
                      display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, borderRadius: 1,
                      bgcolor: p.type === 'bullish' ? 'rgba(16,185,129,0.08)' : p.type === 'bearish' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                      border: `1px solid ${p.type === 'bullish' ? 'rgba(16,185,129,0.2)' : p.type === 'bearish' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', color: p.type === 'bullish' ? '#10b981' : p.type === 'bearish' ? '#ef4444' : '#f59e0b' }}>
                        {p.type === 'bullish' ? '▲' : p.type === 'bearish' ? '▼' : '◆'} {p.name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', color: '#a1a1aa' }}>{p.description}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
              {(patternData.nearestResistance || patternData.nearestSupport) && (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {patternData.nearestResistance && (
                    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: '#71717a' }}>근접 저항선</Typography>
                      <Typography sx={{ fontSize: '0.9rem', color: '#ef4444', fontWeight: 700 }}>
                        ${patternData.nearestResistance.toLocaleString()}
                      </Typography>
                    </Box>
                  )}
                  {patternData.nearestSupport && (
                    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: '#71717a' }}>근접 지지선</Typography>
                      <Typography sx={{ fontSize: '0.9rem', color: '#10b981', fontWeight: 700 }}>
                        ${patternData.nearestSupport.toLocaleString()}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          )}

          {/* AI Analysis */}
          <Paper sx={{ p: 3, mb: 4, background: '#1e1e24', border: '1px solid #3b82f6', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Info size={20} color="#3b82f6" />
              <Typography variant="h6" sx={{ color: '#fafafa', fontSize: '1.1rem', fontWeight: 700 }}>AI 기술적 분석</Typography>
            </Box>
            {analyzing ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
                <CircularProgress size={20} />
                <Typography sx={{ color: '#a1a1aa' }}>차트 지표와 패턴을 분석 중입니다...</Typography>
              </Box>
            ) : analysis ? (
              <Box sx={{ color: '#e4e4e7', lineHeight: 1.6, '& p': { mb: 2 }, '& h1, & h2, & h3': { color: '#fafafa', mt: 3, mb: 1.5, fontWeight: 700 }, '& ul, & ol': { pl: 2, mb: 2 }, '& li': { mb: 1 }, '& strong': { color: '#3b82f6' }, '& blockquote': { borderLeft: '4px solid #3b82f6', pl: 2, color: '#a1a1aa', my: 2 } }}>
                <ReactMarkdown>{analysis}</ReactMarkdown>
              </Box>
            ) : (
              <Typography sx={{ color: '#71717a' }}>분석 결과가 없습니다.</Typography>
            )}
          </Paper>

          <Typography variant="caption" sx={{ display: 'block', color: '#3f3f46', mt: -2, mb: 3, px: 1, lineHeight: 1.6, fontSize: '0.7rem' }}>
            ※ 이 분석은 차트 지표에 기반한 기술적 분석이며, 실제 투자 결과를 보장하지 않습니다. 모든 투자 결정은 본인 판단하에 신중히 이루어져야 하며, 투자 권유가 아닙니다.
          </Typography>

          <Box sx={{ p: 3, borderRadius: 2, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', gap: 2 }}>
            <Info color="#3b82f6" />
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#3b82f6', fontWeight: 600, mb: 0.5 }}>객관적 지표 요약</Typography>
              <Typography variant="body2" sx={{ color: '#a1a1aa', lineHeight: 1.6 }}>
                현재 주가(${currentPrice.toLocaleString()})는 200일 장기 이동평균선(${latestData.ma200?.toLocaleString()}) 대비 {currentPrice > (latestData.ma200 || 0) ? '위에' : '아래에'} 위치해 있으며,
                RSI {latestData.rsi} / MACD {latestData.macdLine?.toFixed(3) ?? 'N/A'} / 스토캐스틱 %K {latestData.stochK ?? 'N/A'}를 기록하고 있습니다.
                {patternData && patternData.patterns.length > 0 && ` 총 ${patternData.patterns.length}개의 패턴/시그널이 감지되었습니다.`}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
