import { useState, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Divider from '@mui/material/Divider'
import type { BacktestResult } from './backtest/types'
import type { BacktestParams } from '../../lib/backtest/types'
import { fetchKlines, buildDailyTrendMap, fetchFedLiquidity, attachFedData } from '../../lib/backtest/fetch'
import { computeIndicators } from '../../lib/backtest/indicators'
import { fmtPct } from './backtest/utils'

// ─── 지표별 수치 파라미터 정의 ────────────────────────────────────
interface NumParam {
  key: keyof BacktestParams
  label: string
  start: number
  end: number
  step: number
  fixedValue: number
}

interface IndicatorDef {
  key: keyof BacktestParams
  label: string
  color: string        // 진한 색 (텍스트/테두리)
  bgColor: string      // 연한 배경색
  numParams: Omit<NumParam, 'fixedValue'>[]
  isFed?: boolean
  isDailyTrend?: boolean
}

const INDICATOR_DEFS: IndicatorDef[] = [
  {
    key: 'scoreUseADX', label: 'ADX', color: '#f59e0b', bgColor: '#f59e0b22',
    numParams: [
      { key: 'adxThreshold', label: 'ADX 임계값', start: 20, end: 30, step: 5 },
    ],
  },
  {
    key: 'scoreUseRSI', label: 'RSI', color: '#60a5fa', bgColor: '#60a5fa22',
    numParams: [
      { key: 'rsiOversold',   label: 'RSI 하한', start: 25, end: 40, step: 5 },
      { key: 'rsiOverbought', label: 'RSI 상한', start: 60, end: 75, step: 5 },
    ],
  },
  { key: 'scoreUseMACD',        label: 'MACD',      color: '#a78bfa', bgColor: '#a78bfa22', numParams: [] },
  {
    key: 'scoreUseRVOL', label: 'RVOL', color: '#22d3ee', bgColor: '#22d3ee22',
    numParams: [
      { key: 'rvolThreshold', label: 'RVOL 임계값', start: 1.2, end: 2.0, step: 0.2 },
    ],
  },
  { key: 'scoreUseBB',          label: 'BB',         color: '#f472b6', bgColor: '#f472b622', numParams: [] },
  { key: 'scoreUseIchi',        label: '일목균형표', color: '#2dd4bf', bgColor: '#2dd4bf22', numParams: [] },
  { key: 'scoreUseGoldenCross', label: '골든크로스', color: '#fb923c', bgColor: '#fb923c22', numParams: [] },
  {
    key: 'scoreUseCCI', label: 'CCI', color: '#c084fc', bgColor: '#c084fc22',
    numParams: [
      { key: 'cciMaxEntry', label: 'CCI 진입차단 임계값', start: 100, end: 200, step: 25 },
    ],
  },
  { key: 'scoreUseVWMA',        label: 'VWMA',       color: '#a3e635', bgColor: '#a3e63522', numParams: [] },
  {
    key: 'scoreUseFedLiquidity', label: 'Fed 유동성', color: '#f87171', bgColor: '#f8717122',
    numParams: [], isFed: true,
  },
  {
    key: 'useDailyTrend', label: '일봉 MTF', color: '#34d399', bgColor: '#34d39922',
    numParams: [], isDailyTrend: true,
  },
]

// 파라미터 모드: 'range' = 범위 탐색, 'fixed' = 고정값
type ParamMode = 'range' | 'fixed'

interface NumParamState extends NumParam {
  mode: ParamMode
}

interface IndicatorState {
  def: IndicatorDef
  selected: boolean
  expanded: boolean
  numParams: NumParamState[]
}

interface OptimizerResult {
  params: Partial<BacktestParams>
  result: BacktestResult
}

interface Props {
  symbol: string
  interval: string
  startDate: string
  endDate: string
  baseParams: BacktestParams
  onApplyParams: (params: Partial<BacktestParams>) => void
}

type SortKey = 'total_return_pct' | 'win_rate' | 'max_drawdown_pct' | 'sharpe_ratio' | 'profit_factor'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'total_return_pct', label: '수익률' },
  { key: 'win_rate',         label: '승률' },
  { key: 'max_drawdown_pct', label: 'MDD↓' },
  { key: 'sharpe_ratio',     label: '샤프' },
  { key: 'profit_factor',    label: 'PF' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#09090b',
  border: '1px solid #3f3f46',
  borderRadius: 6,
  color: '#e4e4e7',
  fontSize: 12,
  padding: '5px 8px',
  outline: 'none',
  boxSizing: 'border-box',
}

export default function BacktestOptimizer({ symbol, interval, startDate, endDate, baseParams, onApplyParams }: Props) {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [totalSteps, setTotalSteps] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [results, setResults] = useState<OptimizerResult[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('total_return_pct')

  const [indicators, setIndicators] = useState<IndicatorState[]>(() =>
    INDICATOR_DEFS.map(def => ({
      def,
      selected: false,
      expanded: false,
      numParams: def.numParams.map(p => ({
        ...p,
        fixedValue: p.start,
        mode: 'range' as ParamMode,
      })),
    }))
  )

  const handleChipClick = (idx: number) => {
    setIndicators(prev => prev.map((ind, i) => {
      if (i !== idx) return ind
      const nextSelected = !ind.selected
      return { ...ind, selected: nextSelected, expanded: nextSelected && ind.def.numParams.length > 0 }
    }))
  }

  const handlePanelToggle = (idx: number) => {
    setIndicators(prev => prev.map((ind, i) =>
      i === idx ? { ...ind, expanded: !ind.expanded } : ind
    ))
  }

  const toggleParamMode = (indIdx: number, paramIdx: number) => {
    setIndicators(prev => prev.map((ind, i) => {
      if (i !== indIdx) return ind
      return {
        ...ind,
        numParams: ind.numParams.map((p, j) =>
          j === paramIdx ? { ...p, mode: p.mode === 'range' ? 'fixed' : 'range' } : p
        ),
      }
    }))
  }

  const updateNumParam = (indIdx: number, paramIdx: number, field: 'start' | 'end' | 'step' | 'fixedValue', value: number) => {
    setIndicators(prev => prev.map((ind, i) => {
      if (i !== indIdx) return ind
      return {
        ...ind,
        numParams: ind.numParams.map((p, j) =>
          j === paramIdx ? { ...p, [field]: value } : p
        ),
      }
    }))
  }

  const selectedCount = indicators.filter(ind => ind.selected).length

  const estimatedCount = (() => {
    if (selectedCount === 0) return 0
    const selectedInds = indicators.filter(ind => ind.selected)
    const N = selectedInds.length

    // 수치 파라미터 조합 수
    let numCount = 1
    for (const ind of selectedInds) {
      for (const p of ind.numParams) {
        if (p.mode === 'range') {
          const steps = Math.floor((p.end - p.start) / p.step) + 1
          numCount *= Math.max(1, steps)
        }
      }
    }

    // bool 조합별 activeCount에 따른 점수 조합 수를 정확히 합산
    let total = 0
    const boolTotal = Math.pow(2, N)
    for (let mask = 0; mask < boolTotal; mask++) {
      const activeCount = Array.from({ length: N }, (_, i) => (mask >> i) & 1).reduce((a, b) => a + b, 0)
      const maxScore = Math.max(activeCount, 1)
      total += maxScore * maxScore * numCount
    }
    return total
  })()

  const runOptimization = useCallback(async () => {
    setLoading(true)
    setProgress(0)
    setCurrentStep(0)
    setResults([])

    try {
      const selectedInds = indicators.filter(ind => ind.selected)
      const N = selectedInds.length

      let boolCombos: Record<string, boolean>[] = [{}]
      for (const ind of selectedInds) {
        const next: Record<string, boolean>[] = []
        for (const val of [true, false]) {
          for (const combo of boolCombos) next.push({ ...combo, [ind.def.key]: val })
        }
        boolCombos = next
      }

      let numCombos: Record<string, number>[] = [{}]
      for (const ind of selectedInds) {
        for (const p of ind.numParams) {
          const next: Record<string, number>[] = []
          if (p.mode === 'fixed') {
            for (const combo of numCombos) next.push({ ...combo, [p.key]: p.fixedValue })
          } else {
            for (let val = p.start; val <= p.end + 1e-9; val += p.step) {
              const rounded = Math.round(val * 1000) / 1000
              for (const combo of numCombos) next.push({ ...combo, [p.key]: rounded })
            }
          }
          numCombos = next
        }
      }

      const scoreValues = Array.from({ length: Math.max(N, 1) }, (_, i) => i + 1)

      const combinations: Partial<BacktestParams>[] = []
      for (const bc of boolCombos) {
        const activeCount = Object.values(bc).filter(Boolean).length
        const maxScore = Math.max(activeCount, 1)
        const validScores = scoreValues.filter(s => s <= maxScore)

        for (const nc of numCombos) {
          for (const minScore of validScores) {
            for (const scoreExit of validScores) {
              combinations.push({
                ...bc, ...nc, minScore, scoreExitThreshold: scoreExit,
              } as Partial<BacktestParams>)
            }
          }
        }
      }

      setTotalSteps(combinations.length)

      const startMs = new Date(startDate).getTime()
      const endMs   = new Date(endDate).getTime() + 15 * 3_600_000

      const needFed        = selectedInds.some(ind => ind.def.isFed)
      const needDailyTrend = selectedInds.some(ind => ind.def.isDailyTrend)

      const [candles, dailyMap] = await Promise.all([
        fetchKlines(symbol, interval, startMs - 200 * 3_600_000, endMs),
        needDailyTrend ? buildDailyTrendMap(symbol, startMs, endMs) : Promise.resolve(null),
      ])
      computeIndicators(candles)

      if (needFed) {
        const fedBars = await fetchFedLiquidity(startDate, endDate, baseParams.fedLiquidityMAPeriod)
        attachFedData(candles, fedBars)
      }

      const { simulate } = await import('../../lib/backtest/simulate')

      const optResults: OptimizerResult[] = []
      for (let i = 0; i < combinations.length; i++) {
        const testParams: BacktestParams = { ...baseParams, ...combinations[i], startDate, endDate, symbol, interval }
        const result = simulate(candles, testParams, dailyMap)
        optResults.push({ params: combinations[i], result })

        if (i % 20 === 0) {
          setCurrentStep(i + 1)
          setProgress(Math.round(((i + 1) / combinations.length) * 100))
          await new Promise(r => setTimeout(r, 0))
        }
      }
      setCurrentStep(combinations.length)
      setProgress(100)

      optResults.sort((a, b) => b.result.total_return_pct - a.result.total_return_pct)
      setResults(optResults)

    } catch (e) {
      console.error(e)
      alert('최적화 중 오류 발생: ' + String(e))
    } finally {
      setLoading(false)
    }
  }, [indicators, symbol, interval, startDate, endDate, baseParams])

  const sorted = [...results].sort((a, b) => {
    if (sortKey === 'max_drawdown_pct') return a.result.max_drawdown_pct - b.result.max_drawdown_pct
    if (sortKey === 'profit_factor') return (b.result.profit_factor ?? 0) - (a.result.profit_factor ?? 0)
    return (b.result[sortKey] as number) - (a.result[sortKey] as number)
  })

  const paramSummary = (p: Partial<BacktestParams>) => {
    const parts: string[] = []
    if (p.minScore !== undefined) parts.push(`진입:${p.minScore}`)
    if (p.scoreExitThreshold !== undefined) parts.push(`퇴장:${p.scoreExitThreshold}`)
    for (const [k, v] of Object.entries(p)) {
      if (k === 'minScore' || k === 'scoreExitThreshold') continue
      if (typeof v === 'boolean') {
        const label = INDICATOR_DEFS.find(d => d.key === k)?.label ?? k
        parts.push(v ? `✓${label}` : `✗${label}`)
      } else if (typeof v === 'number') {
        parts.push(`${k.replace(/^(score|fixed|use|rvol|rsi|adx)/i, '')}:${v}`)
      }
    }
    return parts.join('  ')
  }

  const tooMany = estimatedCount > 50000

  // 수치 파라미터가 있고 선택된 지표들
  const expandableInds = indicators.filter(ind => ind.selected && ind.def.numParams.length > 0)

  return (
    <Box sx={{ mt: 2 }}>
      {/* ── 헤더 ── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        mb: 2.5, pb: 1.5, borderBottom: '1px solid #27272a',
      }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#fafafa', letterSpacing: '-0.02em' }}>
            파라미터 최적화
          </Typography>
          <Typography sx={{ fontSize: 11, color: '#52525b', mt: 0.3 }}>
            지표 조합 × 진입/퇴장 점수를 브루트포스로 탐색합니다
          </Typography>
        </Box>
        {selectedCount > 0 && (
          <Box sx={{
            px: 2, py: 0.75, borderRadius: 2,
            bgcolor: tooMany ? '#ef444418' : '#10b98118',
            border: `1.5px solid ${tooMany ? '#ef444450' : '#10b98150'}`,
            textAlign: 'right',
          }}>
            <Typography sx={{ fontSize: 10, color: tooMany ? '#ef4444' : '#10b981', fontWeight: 700 }}>
              예상 조합
            </Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: tooMany ? '#ef4444' : '#10b981', lineHeight: 1.2 }}>
              {estimatedCount.toLocaleString()}
            </Typography>
            {tooMany && (
              <Typography sx={{ fontSize: 9, color: '#ef4444' }}>50,000개 초과</Typography>
            )}
          </Box>
        )}
      </Box>

      {/* ── 지표 선택 ── */}
      <Box sx={{ mb: 2.5 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#71717a', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          탐색할 지표 선택
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {indicators.map((ind, idx) => (
            <Box
              key={ind.def.key}
              component="button"
              onClick={() => handleChipClick(idx)}
              sx={{
                display: 'inline-flex', alignItems: 'center',
                px: 1.75, py: 0.875, borderRadius: 2,
                border: `2px solid ${ind.selected ? ind.def.color : '#3f3f46'}`,
                bgcolor: ind.selected ? ind.def.bgColor : '#18181b',
                color: ind.selected ? ind.def.color : '#a1a1aa',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.12s',
                '&:hover': {
                  border: `2px solid ${ind.def.color}`,
                  bgcolor: ind.def.bgColor,
                  color: ind.def.color,
                },
              }}
            >
              {ind.def.label}
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── 수치 파라미터 패널 ── */}
      {expandableInds.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#71717a', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            파라미터 범위 설정
          </Typography>

          <Box sx={{ border: '1px solid #3f3f46', borderRadius: 2, overflow: 'hidden' }}>
            {expandableInds.map((ind, arrIdx) => {
              const idx = indicators.indexOf(ind)
              return (
                <Box key={ind.def.key}>
                  {/* 패널 헤더 */}
                  <Box
                    component="button"
                    onClick={() => handlePanelToggle(idx)}
                    sx={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      px: 2, py: 1.25, bgcolor: '#111113', border: 'none', cursor: 'pointer',
                      borderBottom: ind.expanded ? `1px solid ${ind.def.color}30` : 'none',
                      '&:hover': { bgcolor: '#18181b' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ind.def.color }} />
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: ind.def.color }}>
                        {ind.def.label}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 11, color: '#52525b' }}>
                      {ind.expanded ? '▲' : '▼'}
                    </Typography>
                  </Box>

                  {/* 파라미터 내용 */}
                  {ind.expanded && (
                    <Box sx={{ px: 2, py: 1.75, bgcolor: '#0d0d0f', display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                      {ind.numParams.map((p, pIdx) => {
                        const isFixed = p.mode === 'fixed'
                        return (
                          <Box key={p.key} sx={{
                            flex: '1 1 220px', p: 1.75, borderRadius: 1.5,
                            border: `1px solid ${isFixed ? ind.def.color + '50' : '#3f3f46'}`,
                            bgcolor: isFixed ? ind.def.color + '0a' : 'transparent',
                          }}>
                            {/* 파라미터 헤더 */}
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                              <Typography sx={{ fontSize: 12, fontWeight: 700, color: isFixed ? ind.def.color : '#e4e4e7' }}>
                                {p.label}
                              </Typography>
                              {/* 탐색 / 고정 토글 */}
                              <Box sx={{ display: 'flex', borderRadius: 1, overflow: 'hidden', border: '1px solid #3f3f46' }}>
                                <Box
                                  component="button"
                                  onClick={() => { if (isFixed) toggleParamMode(idx, pIdx) }}
                                  sx={{
                                    px: 1.25, py: 0.4, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
                                    bgcolor: !isFixed ? ind.def.color : 'transparent',
                                    color: !isFixed ? '#000' : '#71717a',
                                    transition: 'all 0.1s',
                                  }}
                                >
                                  탐색
                                </Box>
                                <Box
                                  component="button"
                                  sx={{
                                    px: 1.25, py: 0.4, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
                                    bgcolor: isFixed ? ind.def.color : 'transparent',
                                    color: isFixed ? '#000' : '#71717a',
                                    transition: 'all 0.1s',
                                  }}
                                  onClick={() => { if (!isFixed) toggleParamMode(idx, pIdx) }}
                                >
                                  고정
                                </Box>
                              </Box>
                            </Box>

                            {/* 입력 필드 */}
                            {isFixed ? (
                              <Box>
                                <Typography sx={{ fontSize: 9, color: '#71717a', mb: 0.5, textTransform: 'uppercase' }}>
                                  고정값
                                </Typography>
                                <input
                                  type="number"
                                  value={p.fixedValue}
                                  style={inputStyle}
                                  onChange={e => updateNumParam(idx, pIdx, 'fixedValue', parseFloat(e.target.value))}
                                />
                              </Box>
                            ) : (
                              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.75 }}>
                                {(['start', 'end', 'step'] as const).map(field => (
                                  <Box key={field}>
                                    <Typography sx={{ fontSize: 9, color: '#71717a', mb: 0.5, textTransform: 'uppercase' }}>
                                      {field === 'start' ? '시작' : field === 'end' ? '종료' : '간격'}
                                    </Typography>
                                    <input
                                      type="number"
                                      value={p[field]}
                                      style={inputStyle}
                                      onChange={e => updateNumParam(idx, pIdx, field, parseFloat(e.target.value))}
                                    />
                                  </Box>
                                ))}
                              </Box>
                            )}
                          </Box>
                        )
                      })}
                    </Box>
                  )}

                  {arrIdx < expandableInds.length - 1 && (
                    <Divider sx={{ borderColor: '#27272a' }} />
                  )}
                </Box>
              )
            })}
          </Box>
        </Box>
      )}

      {/* ── 점수 안내 + 실행 버튼 ── */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch', mb: 2, flexWrap: 'wrap' }}>
        {selectedCount > 0 && (
          <Box sx={{
            flex: 1, minWidth: 180, px: 2, py: 1.25, borderRadius: 2,
            bgcolor: '#18181b', border: '1px solid #3f3f46',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.5,
          }}>
            <Typography sx={{ fontSize: 10, color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              자동 순회 점수
            </Typography>
            <Box sx={{ display: 'flex', gap: 2.5 }}>
              <Box>
                <Typography sx={{ fontSize: 9, color: '#71717a' }}>진입 점수</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#34d399' }}>
                  1 ~ {selectedCount}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 9, color: '#71717a' }}>퇴장 점수</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>
                  1 ~ {selectedCount}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        <Box
          component="button"
          onClick={runOptimization}
          disabled={loading || tooMany || selectedCount === 0}
          sx={{
            flex: selectedCount > 0 ? '0 0 auto' : 1,
            px: 4, py: 1.5, borderRadius: 2,
            bgcolor: loading ? '#27272a' : (tooMany || selectedCount === 0) ? '#18181b' : '#3b82f6',
            color: (tooMany || selectedCount === 0) ? '#52525b' : '#fff',
            border: `1.5px solid ${(tooMany || selectedCount === 0) ? '#3f3f46' : '#3b82f6'}`,
            fontWeight: 800, fontSize: 13, cursor: (loading || tooMany || selectedCount === 0) ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            '&:hover': {
              bgcolor: (loading || tooMany || selectedCount === 0) ? undefined : '#2563eb',
            },
          }}
        >
          {loading ? '최적화 중...' : selectedCount === 0 ? '지표를 먼저 선택하세요' : tooMany ? '조합 수 초과 (50,000개 제한)' : '🚀 최적화 시작'}
        </Box>
      </Box>

      {/* ── 진행 바 ── */}
      {loading && (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, bgcolor: '#18181b', border: '1px solid #3f3f46' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontSize: 11, color: '#71717a', fontWeight: 700 }}>
              최적화 진행 중...
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#e4e4e7', fontWeight: 700 }}>
              {currentStep.toLocaleString()} / {totalSteps.toLocaleString()} ({progress}%)
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 6, borderRadius: 3, bgcolor: '#27272a',
              '& .MuiLinearProgress-bar': { bgcolor: '#3b82f6', borderRadius: 3 },
            }}
          />
        </Box>
      )}

      {/* ── 결과 테이블 ── */}
      {results.length > 0 && (
        <Box>
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            mb: 1.5, flexWrap: 'wrap', gap: 1,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#fafafa' }}>결과</Typography>
              <Box sx={{ px: 1, py: 0.2, borderRadius: 1, bgcolor: '#10b98120', border: '1px solid #10b98140' }}>
                <Typography sx={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>
                  {results.length.toLocaleString()}개
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 10, color: '#52525b' }}>상위 30개 표시</Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: 10, color: '#52525b' }}>정렬:</Typography>
              {SORT_OPTIONS.map(opt => (
                <Box
                  key={opt.key}
                  component="button"
                  onClick={() => setSortKey(opt.key)}
                  sx={{
                    px: 1.25, py: 0.4, borderRadius: 1.5, fontSize: 10, fontWeight: 700,
                    border: `1px solid ${sortKey === opt.key ? '#10b98160' : '#3f3f46'}`,
                    bgcolor: sortKey === opt.key ? '#10b98118' : 'transparent',
                    color: sortKey === opt.key ? '#10b981' : '#71717a',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#27272a', color: '#e4e4e7' },
                  }}
                >
                  {opt.label}
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ border: '1px solid #3f3f46', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#111113', borderBottom: '1px solid #3f3f46' }}>
                    {['#', '파라미터 조합', '수익률', '승률', 'MDD', '샤프', 'PF', '거래수', ''].map((h, i) => (
                      <th key={i} style={{
                        padding: '10px 10px', color: '#71717a', textAlign: i === 0 ? 'center' : 'left',
                        fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, 30).map((res, i) => {
                    const r = res.result
                    const isTop = i === 0
                    const isGood = r.total_return_pct > 0
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid #1c1c1f',
                          background: isTop ? '#10b98108' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {isTop ? (
                            <Box sx={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 22, height: 22, borderRadius: '50%',
                              bgcolor: '#10b98125', border: '1px solid #10b98150',
                            }}>
                              <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#10b981' }}>1</Typography>
                            </Box>
                          ) : (
                            <Typography sx={{ fontSize: 10, color: '#52525b', fontWeight: 700 }}>
                              {i + 1}
                            </Typography>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', maxWidth: 320, wordBreak: 'break-all' }}>
                          <Typography sx={{ fontSize: 10, color: '#a1a1aa', fontFamily: 'monospace', lineHeight: 1.5 }}>
                            {paramSummary(res.params)}
                          </Typography>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <Typography sx={{ fontSize: 12, fontWeight: 800, color: isGood ? '#34d399' : '#f87171' }}>
                            {fmtPct(r.total_return_pct)}
                          </Typography>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <Typography sx={{ fontSize: 11, color: '#e4e4e7' }}>{r.win_rate}%</Typography>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <Typography sx={{ fontSize: 11, color: '#f87171' }}>-{r.max_drawdown_pct}%</Typography>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <Typography sx={{ fontSize: 11, color: '#e4e4e7' }}>{r.sharpe_ratio}</Typography>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <Typography sx={{ fontSize: 11, color: '#e4e4e7' }}>{r.profit_factor ?? '—'}</Typography>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <Typography sx={{ fontSize: 11, color: '#71717a' }}>{r.total_trades}</Typography>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <Box
                            component="button"
                            onClick={() => onApplyParams(res.params)}
                            sx={{
                              px: 1.5, py: 0.5, borderRadius: 1.5,
                              border: '1px solid #3b82f650', bgcolor: '#3b82f612',
                              color: '#60a5fa', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              '&:hover': { bgcolor: '#3b82f625', border: '1px solid #3b82f680' },
                            }}
                          >
                            적용
                          </Box>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
