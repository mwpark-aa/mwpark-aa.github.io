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
import { Search, TrendingUp, TrendingDown, Info } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { supabase } from '../../lib/supabase';

// Technical Indicator Calculations
const calculateIndicators = (data: { date: string, close: number }[]) => {
  const closes = data.map(d => d.close);

  const calculateSMA = (period: number) => {
    return closes.map((_, idx) => {
      if (idx < period - 1) return null;
      const sum = closes.slice(idx - period + 1, idx + 1).reduce((a, b) => a + b, 0);
      return parseFloat((sum / period).toFixed(2));
    });
  };

  const sma20 = calculateSMA(20);
  const sma60 = calculateSMA(60);
  const sma200 = calculateSMA(200);

  // RSI calculation
  const calculateRSI = (period: number = 14) => {
    const rsi = new Array(closes.length).fill(null);
    if (closes.length <= period) return rsi;

    let avgGain = 0;
    let avgLoss = 0;

    // Initial RSI
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) avgGain += diff;
      else avgLoss -= diff;
    }
    avgGain /= period;
    avgLoss /= period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

    // Smooth RSI
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }
    return rsi.map(v => v !== null ? parseFloat(v.toFixed(2)) : null);
  };

  const rsi14 = calculateRSI(14);

  // Ichimoku Cloud (Simplified for 1 year view)
  const calculateIchimoku = () => {
    const calculateMedian = (period: number, idx: number) => {
      if (idx < period - 1) return null;
      const slice = closes.slice(idx - period + 1, idx + 1);
      return parseFloat(((Math.max(...slice) + Math.min(...slice)) / 2).toFixed(2));
    };

    const tenkanSen = closes.map((_, idx) => calculateMedian(9, idx));
    const kijunSen = closes.map((_, idx) => calculateMedian(26, idx));

    return { tenkanSen, kijunSen };
  };

  const { tenkanSen, kijunSen } = calculateIchimoku();

  return data.map((d, i) => ({
    ...d,
    sma20: sma20[i],
    sma60: sma60[i],
    sma200: sma200[i],
    rsi: rsi14[i],
    tenkanSen: tenkanSen[i],
    kijunSen: kijunSen[i],
  }));
};

export default function StockExplorer() {
  const [ticker, setTicker] = useState('AAPL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleSearch('AAPL');
  }, []);

  const handleSearch = async (targetTicker: string = searchTerm) => {
    if (!targetTicker) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('stock-data', {
        body: { symbol: targetTicker.toUpperCase() }
      });

      if (functionError) {
        let errorMessage = '데이터를 가져오지 못했습니다.';
        try {
          const errorJson = typeof functionError.message === 'string' ? JSON.parse(functionError.message) : functionError;
          if (errorJson.error?.includes('429')) {
            errorMessage = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. (Yahoo Finance API 제한)';
          } else if (errorJson.error?.includes('404')) {
            errorMessage = '해당 티커를 찾을 수 없습니다. 올바른 티커인지 확인해 주세요.';
          } else {
            errorMessage = errorJson.error || errorMessage;
          }
        } catch (e) {
          errorMessage = functionError.message || errorMessage;
        }
        throw new Error(errorMessage);
      }
      if (!data || !data.data) throw new Error('데이터를 불러오지 못했습니다.');

      const richData = calculateIndicators(data.data);
      setStockData(richData);
      setTicker(targetTicker.toUpperCase());
    } catch (err: any) {
      console.error('Stock search error:', err);
      setError(err.message || '주식 데이터를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const currentPrice = stockData.length > 0 ? stockData[stockData.length - 1].close : 0;
  const prevPrice = stockData.length > 1 ? stockData[stockData.length - 2].close : 0;
  const change = currentPrice - prevPrice;
  const changePercent = (change / prevPrice) * 100;

  const latestData = stockData[stockData.length - 1] || {};

  const IndicatorCard = ({ title, value, description }: { title: string, value: any, status?: 'bull' | 'bear' | 'neutral', description: string }) => (
    <Card sx={{ background: '#18181b', border: '1px solid #27272a', height: '100%' }}>
      <CardContent>
        <Typography variant="caption" sx={{ color: '#71717a', fontWeight: 600 }}>{title}</Typography>
        <Typography variant="h6" sx={{ color: '#fafafa', mt: 0.5 }}>
          {value ?? 'N/A'}
        </Typography>
        <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 1, fontSize: '0.75rem' }}>
          {description}
        </Typography>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto', color: '#fafafa' }}>
      {/* Search Header */}
      <Box sx={{ mb: 4, display: 'flex', gap: 2, alignItems: 'center', flexDirection: { xs: 'column', sm: 'row' } }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="티커 또는 종목명 입력 (예: AAPL, TSLA, 삼성전자)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          sx={{
            '& .MuiOutlinedInput-root': {
              color: '#fff',
              backgroundColor: '#18181b',
              '& fieldset': { borderColor: '#27272a' },
              '&:hover fieldset': { borderColor: '#3f3f46' },
              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
            },
          }}
        />
        <Button
          variant="contained"
          onClick={() => handleSearch()}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : <Search size={20} />}
          sx={{
            height: 56,
            px: 4,
            bgcolor: '#3b82f6',
            '&:hover': { bgcolor: '#2563eb' },
            whiteSpace: 'nowrap'
          }}
        >
          조회하기
        </Button>
      </Box>

          {error && (
            <Box sx={{ mb: 4, p: 2, borderRadius: 2, bgcolor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <Typography sx={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</Typography>
            </Box>
          )}

          {stockData.length > 0 && (
            <Box>
              {/* Header Info */}
              <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
                    {ticker}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      ${currentPrice.toLocaleString()}
                    </Typography>
                    <Typography
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        color: change >= 0 ? '#10b981' : '#ef4444',
                        fontWeight: 600
                      }}
                    >
                      {change >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      {Math.abs(change).toFixed(2)} ({changePercent.toFixed(2)}%)
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: '#71717a' }}>
                  최근 업데이트: {stockData[stockData.length - 1].date}
                </Typography>
              </Box>

              {/* Main Chart */}
              <Paper sx={{ p: 2, mb: 4, background: '#09090b', border: '1px solid #27272a', borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 2, color: '#fafafa', fontSize: '1rem' }}>1개년 가격 및 이동평균선</Typography>
                <Box sx={{ height: 400, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stockData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#71717a"
                        fontSize={12}
                        tickFormatter={(str) => {
                          const date = new Date(str);
                          // Show month only when it's the first data point of the month or every 2 months
                          return date.getDate() <= 7 && date.getMonth() % 2 === 0 ? `${date.getFullYear()}.${date.getMonth() + 1}` : '';
                        }}
                        minTickGap={30}
                      />
                      <YAxis
                        stroke="#71717a"
                        fontSize={12}
                        domain={['auto', 'auto']}
                        orientation="right"
                        tickFormatter={(val) => `$${val.toLocaleString()}`}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }}
                        itemStyle={{ fontSize: '12px' }}
                        labelFormatter={(label) => `날짜: ${label}`}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Line type="monotone" dataKey="close" name="종가" stroke="#fff" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="sma20" name="20일선" stroke="#3b82f6" dot={false} strokeWidth={1} isAnimationActive={false} />
                      <Line type="monotone" dataKey="sma60" name="60일선" stroke="#10b981" dot={false} strokeWidth={1} isAnimationActive={false} />
                      <Line type="monotone" dataKey="sma200" name="200일선" stroke="#f59e0b" dot={false} strokeWidth={1} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

          {/* Technical Indicators Grid */}
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard
                title="RSI (14일)"
                value={latestData.rsi}
                description={latestData.rsi > 70 ? "과매수 국면 (70 이상)" : latestData.rsi < 30 ? "과매도 국면 (30 이하)" : "중립 국면"}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard
                title="20일 이동평균선"
                value={`$${latestData.sma20}`}
                description={currentPrice > latestData.sma20 ? "단기 상향 추세" : "단기 하향 추세"}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard
                title="일목균형표 (전환/기준)"
                value={`${latestData.tenkanSen} / ${latestData.kijunSen}`}
                description="주가와 지표 간의 균형 관계"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <IndicatorCard
                title="200일 이동평균선"
                value={`$${latestData.sma200}`}
                description={currentPrice > latestData.sma200 ? "장기 지지선 상회" : "장기 저항선 하회"}
              />
            </Grid>
          </Grid>

          {/* Summary Alert (Objective Only) */}
          <Box sx={{
            p: 3,
            borderRadius: 2,
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            display: 'flex',
            gap: 2
          }}>
            <Info color="#3b82f6" />
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#3b82f6', fontWeight: 600, mb: 0.5 }}>객관적 지표 요약</Typography>
              <Typography variant="body2" sx={{ color: '#a1a1aa', lineHeight: 1.6 }}>
                현재 주가(${currentPrice.toLocaleString()})는 200일 장기 이동평균선($${latestData.sma200?.toLocaleString()}) 대비 {currentPrice > (latestData.sma200 || 0) ? '위에' : '아래에'} 위치해 있으며,
                RSI 지수는 {latestData.rsi}를 기록하고 있습니다.
                단기적으로는 20일선($${latestData.sma20?.toLocaleString()})과 {currentPrice > (latestData.sma20 || 0) ? '정배열' : '역배열'} 상태를 보이고 있습니다.
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
