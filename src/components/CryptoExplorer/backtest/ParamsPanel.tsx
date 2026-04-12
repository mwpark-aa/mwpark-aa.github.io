import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import MuiTooltip from '@mui/material/Tooltip'
import type { BacktestParams, BacktestResult } from './types'

// ── 공유 스타일 ────────────────────────────────────────────────
export const inputStyle: React.CSSProperties = {
  background: '#0a0a0b',
  border: '1px solid #27272a',
  borderRadius: 4,
  color: '#fafafa',
  fontSize: 11,
  padding: '4px 8px',
  fontFamily: 'monospace',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  colorScheme: 'dark',
}

export const labelSx = {
  fontSize: 9, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0,
} as const

function HintTooltip({ id: _id, text }: { id: string; text: string }) {
  return (
    <MuiTooltip
      placement="top"
      arrow
      title={<Typography sx={{ fontSize: 11, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{text}</Typography>}
      componentsProps={{
        tooltip: { sx: { bgcolor: '#18181b', border: '1px solid #52525b', borderRadius: 2, p: 1.5, maxWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' } },
        arrow: { sx: { color: '#52525b' } },
      }}
    >
      <Box
        component="span"
        onClick={e => e.stopPropagation()}
        sx={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%', border: '1px solid #3f3f46',
          color: '#71717a', fontSize: 8, fontWeight: 700, cursor: 'help', flexShrink: 0,
          userSelect: 'none', '&:hover': { borderColor: '#a1a1aa', color: '#d4d4d8' },
        }}
      >?</Box>
    </MuiTooltip>
  )
}

function LabelRow({ label, hint, hintId }: { label: string; hint?: string; hintId?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
      <Typography sx={labelSx}>{label}</Typography>
      {hint && hintId && <HintTooltip id={hintId} text={hint} />}
    </Box>
  )
}

interface Props {
  params: BacktestParams
  setParams: React.Dispatch<React.SetStateAction<BacktestParams>>
  draft: Record<string, string>
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>
  result: BacktestResult | null
}

export default function ParamsPanel({ params, setParams, draft, setDraft, result }: Props) {
  const smInput: React.CSSProperties = { ...inputStyle, fontSize: 11, padding: '3px 6px' }

  const indicatorList = [
    {
      key: 'scoreUseADX', label: 'ADX', sub: '추세 강도 필터',
      hint: '"지금 추세가 있긴 한가?"\n방향 무관, 추세 강도만 측정 (0~100).\n\n✅ ADX > 설정값 → +1 (추세 존재)\n⛔ ADX ≤ 설정값 → 가감점 없음 (횡보)\n\n💡 20 미만 = 횡보(추세 없음)\n💡 20~40 = 약한 추세\n💡 40 이상 = 강한 추세',
      desc: '추세 방향(롱/숏)은 무관하고 "추세가 존재하는가"만 판단. 횡보장에서 불필요한 진입을 막아줌.',
      settings: (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0.5 }}>
          <Typography sx={{ fontSize: 9, color: '#60a5fa99' }}>최소 ADX 값 <Typography component="span" sx={{ fontSize: 8, color: '#52525b' }}>(20미만=횡보, 20~40=약한추세)</Typography></Typography>
          <input type="number" min={1} max={60}
            value={draft.adxThreshold ?? String(params.adxThreshold)} style={smInput}
            onChange={e => setDraft(d => ({ ...d, adxThreshold: e.target.value }))} />
        </Box>
      ),
      svg: (() => {
        const v = Number(draft.adxThreshold ?? params.adxThreshold) || 25
        const thY = 4 + (1 - v / 100) * 34
        return (
          <svg viewBox="0 0 72 42" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
            <rect x="4" y="4" width="64" height={thY - 4} fill="#10b98108" rx="1" />
            <rect x="4" y={thY} width="64" height={38 - thY} fill="#ef444408" rx="1" />
            <line x1="4" y1={thY} x2="68" y2={thY} stroke="#f59e0b88" strokeWidth="0.8" strokeDasharray="3,2" />
            <text x="56" y={thY - 1.5} fill="#f59e0b" fontSize="3.5">{v}</text>
            <text x="8" y={thY - 2} fill="#10b981" fontSize="3" opacity="0.8">롱숏 +1</text>
            <text x="8" y={thY + 5} fill="#71717a" fontSize="3" opacity="0.6">가감점 없음</text>
            <polyline points="4,22 8,20 12,23 16,21 20,24 24,21 28,22 34,19 40,15 48,11 56,8 64,6 68,5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
            <polyline points="4,30 10,30 18,29 26,27 32,23 40,17 50,12 60,9 68,8" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <circle cx="32" cy="23" r="2.5" fill="#10b981" opacity="0.9" />
          </svg>
        )
      })(),
    },
    {
      key: 'scoreUseRSI', label: 'RSI', sub: '과열/침체 필터',
      hint: '"지금 과열이냐 침체냐?"\n14봉 동안 상승폭 vs 하락폭 비율 (0~100).\n\n✅ 하한 이하 → 롱 +1 (과매도, 반등 신호)\n⛔ 점수 없음 (사이 범위)\n✅ 상한 이상 → 숏 +1 (과매수, 하락 신호)\n\n💡 기본값: 35~65 (온건) / 30~70 (적극) / 20~80 (공격적)\n💡 범위가 좁을수록 극단적 신호만 포착, 넓을수록 넓은 신호 포착',
      desc: '과매도 구간에서 롱 진입, 과매수 구간에서 숏 진입. 중립 구간에는 점수 없음.',
      settings: (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
          <Box>
            <Typography sx={{ fontSize: 9, color: '#60a5fa99', mb: 0.5 }}>하한 <Typography component="span" sx={{ fontSize: 8, color: '#52525b' }}>(과매도)</Typography></Typography>
            <input type="number" min={10} max={45}
              value={draft.rsiOversold ?? String(params.rsiOversold)} style={smInput}
              onChange={e => setDraft(d => ({ ...d, rsiOversold: e.target.value }))} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 9, color: '#60a5fa99', mb: 0.5 }}>상한 <Typography component="span" sx={{ fontSize: 8, color: '#52525b' }}>(과매수)</Typography></Typography>
            <input type="number" min={55} max={90}
              value={draft.rsiOverbought ?? String(params.rsiOverbought)} style={smInput}
              onChange={e => setDraft(d => ({ ...d, rsiOverbought: e.target.value }))} />
          </Box>
        </Box>
      ),
      svg: (() => {
        const os = Number(draft.rsiOversold ?? params.rsiOversold) || 35
        const ob = Number(draft.rsiOverbought ?? params.rsiOverbought) || 65
        const osY = 4 + (1 - os / 100) * 34
        const obY = 4 + (1 - ob / 100) * 34
        return (
          <svg viewBox="0 0 72 42" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
            {/* obY < osY: 화면 위=高RSI, 아래=低RSI */}
            <rect x="4" y="4"    width="64" height={obY - 4}    fill="#ef444418" rx="1" />
            <rect x="4" y={obY}  width="64" height={osY - obY}  fill="#52525b18" rx="1" />
            <rect x="4" y={osY}  width="64" height={38 - osY}   fill="#10b98118" rx="1" />
            <line x1="4" y1={obY} x2="68" y2={obY} stroke="#ef444455" strokeWidth="0.7" strokeDasharray="3,2" />
            <text x="56" y={obY - 1.5} fill="#ef4444" fontSize="3.5">{ob}</text>
            <line x1="4" y1={osY} x2="68" y2={osY} stroke="#10b98155" strokeWidth="0.7" strokeDasharray="3,2" />
            <text x="56" y={osY + 4} fill="#10b981" fontSize="3.5">{os}</text>
            <text x="8" y="8"  fill="#ef4444" fontSize="3" opacity="0.8">숏 +1 (과매수)</text>
            <text x="8" y={(obY + osY) / 2} fill="#52525b" fontSize="3" opacity="0.6">점수 없음</text>
            <text x="8" y="38" fill="#10b981" fontSize="3" opacity="0.8">롱 +1 (과매도)</text>
            <path d="M4,10 C12,12 18,15 26,18 C34,20 42,20 50,15 C58,10 64,8 68,6" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.7" />
            <circle cx="26" cy="18" r="2.5" fill="#10b981" opacity="0.9" />
            <circle cx="50" cy="15" r="2.5" fill="#ef4444" opacity="0.9" />
          </svg>
        )
      })(),
    },
    {
      key: 'scoreUseMACD', label: 'MACD', sub: '추세 모멘텀',
      hint: '"상승/하락 가속도가 붙고 있냐?"\n단기(12봉) EMA - 장기(26봉) EMA = MACD선.\n\n✅ 히스토그램 > 0 → 롱 +1 / ⛔ 숏 -1 (상승 모멘텀)\n✅ 히스토그램 < 0 → 숏 +1 / ⛔ 롱 -1 (하락 모멘텀)\n\n💡 막대가 점점 커지면 → 추세 가속 중\n💡 막대가 줄어들면 → 추세 약화, 전환 임박',
      desc: '단기-장기 이평선 차이로 "추세의 가속도"를 측정. 0선 돌파가 핵심 신호.',
      settings: null,
      svg: (
        <svg viewBox="0 0 72 42" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
          <line x1="4" y1="21" x2="68" y2="21" stroke="#52525b" strokeWidth="0.6" />
          <text x="62" y="19" fill="#52525b" fontSize="3">0</text>
          <text x="34" y="8" fill="#10b981" fontSize="3" opacity="0.8">롱 +1 / 숏 -1</text>
          <text x="6" y="38" fill="#ef4444" fontSize="3" opacity="0.8">숏 +1 / 롱 -1</text>
          {[8, 14, 20].map((x, i) => {
            const h = [6, 8, 5][i]
            return <rect key={x} x={x - 3} y={21} width={6} height={h} fill="#ef444466" rx="0.5" />
          })}
          {[30, 38, 46, 54, 62].map((x, i) => {
            const h = [3, 6, 9, 7, 5][i]
            return <rect key={x} x={x - 3} y={21 - h} width={6} height={h} fill="currentColor" rx="0.5" opacity={0.85} />
          })}
          <circle cx="28" cy="21" r="2.5" fill="#10b981" opacity="0.9" />
        </svg>
      ),
    },
    {
      key: 'scoreUseRVOL', label: 'RVOL', sub: '거래량 급등 감지',
      hint: '"평소보다 거래가 활발한가?"\n최근 1주(168봉) 평균 거래량 대비 현재 거래량 비율.\n설정 배수(기본 1.5x) 이상이면 점수 +1.\n\n💡 1.5x = 평소의 1.5배 이상 거래 → 관심 급증\n💡 스킵 기준 이하 = 거래량 너무 적어 무시\n💡 거래량 급등 = 세력/기관 개입 가능성',
      desc: '1주 평균 대비 거래량 폭증 여부 감지. 거래량 없는 가짜 움직임을 걸러냄.',
      settings: (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
          <Box>
            <Typography sx={{ fontSize: 9, color: '#60a5fa99', mb: 0.5 }}>점수 기준 <Typography component="span" sx={{ fontSize: 8, color: '#52525b' }}>(배수)</Typography></Typography>
            <input type="number" min={0.5} max={5} step={0.1}
              value={draft.rvolThreshold ?? String(params.rvolThreshold)} style={smInput}
              onChange={e => setDraft(d => ({ ...d, rvolThreshold: e.target.value }))} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 9, color: '#60a5fa99', mb: 0.5 }}>스킵 기준 <Typography component="span" sx={{ fontSize: 8, color: '#52525b' }}>(이하 무시)</Typography></Typography>
            <input type="number" min={0} max={1} step={0.05}
              value={draft.rvolSkip ?? String(params.rvolSkip)} style={smInput}
              onChange={e => setDraft(d => ({ ...d, rvolSkip: e.target.value }))} />
          </Box>
        </Box>
      ),
      svg: (() => {
        const rv = Number(draft.rvolThreshold ?? params.rvolThreshold) || 1.5
        const sk = Number(draft.rvolSkip ?? params.rvolSkip) || 0.4
        const avgH = 12
        const spikeH = Math.min(avgH * rv, 28)
        const skipH = Math.max(avgH * sk, 2)
        const avgY = 34 - avgH
        const skipY = 34 - skipH
        return (
          <svg viewBox="0 0 72 42" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
            <rect x="4" y={skipY} width="64" height={34 - skipY} fill="#ef444406" rx="1" />
            <line x1="4" y1="34" x2="68" y2="34" stroke="#3f3f46" strokeWidth="0.5" />
            {[8, 16, 24, 32, 40, 56, 64].map((x, i) => {
              const h = [9, 7, 10, 8, 6, 11, 8][i]
              return <rect key={x} x={x - 4} y={34 - h} width={8} height={h} fill="#52525b" opacity={0.6} rx="0.5" />
            })}
            <rect x="44" y={34 - spikeH} width="8" height={spikeH} fill="currentColor" opacity={0.85} rx="0.5" />
            <line x1="4" y1={avgY} x2="68" y2={avgY} stroke="#f59e0b55" strokeWidth="0.8" strokeDasharray="3,2" />
            <text x="5" y={avgY - 1.5} fill="#f59e0b88" fontSize="3.5">avg</text>
            <line x1="4" y1={skipY} x2="68" y2={skipY} stroke="#ef444455" strokeWidth="0.7" strokeDasharray="2,2" />
            <text x="5" y={skipY - 1.5} fill="#ef444488" fontSize="3">skip {sk}x</text>
            <circle cx="48" cy={34 - spikeH} r="2.5" fill="#10b981" opacity="0.9" />
            <text x="52" y={34 - spikeH + 1} fill="#10b981" fontSize="3">롱숏 +1 ({rv}x)</text>
          </svg>
        )
      })(),
    },
    {
      key: 'scoreUseBB', label: 'BB', sub: '볼린저밴드 극값',
      hint: '"극단적인 가격 움직임인가?"\n볼린저밴드는 20일 이평선±2표준편차.\n\n✅ 하단 터치 → 롱 +1 (극도의 약세, 반등 신호)\n⛔ 점수 없음 (중간)\n✅ 상단 터치 → 숏 +1 (극도의 강세, 조정 신호)\n\n💡 밴드가 좁을수록 변동성 낮음\n💡 밴드가 넓을수록 변동성 높음\n💡 극값에서 역추적 가능성 높음',
      desc: '가격이 BB 상단/하단 극값에 닿을 때만 점수 부여. 변동성 극값에서의 반전 신호.',
      settings: null,
      svg: (
        <svg viewBox="0 0 72 42" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
          <line x1="4" y1="8" x2="68" y2="8" stroke="#10b98155" strokeWidth="1" strokeDasharray="2,2" />
          <line x1="4" y1="34" x2="68" y2="34" stroke="#ef444455" strokeWidth="1" strokeDasharray="2,2" />
          <line x1="4" y1="21" x2="68" y2="21" stroke="#52525b77" strokeWidth="0.8" />
          <text x="8" y="6" fill="#10b981" fontSize="3" opacity="0.8">롱 +1</text>
          <text x="8" y="36" fill="#ef4444" fontSize="3" opacity="0.6">숏 +1</text>
          <text x="54" y="22" fill="#52525b" fontSize="3" opacity="0.6">20MA</text>
          <path d="M4,21 L12,18 L20,15 L28,17 L36,14 L44,16 L52,18 L60,15 L68,17" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
          <circle cx="28" cy="8" r="2.5" fill="#10b981" opacity="0.9" />
          <circle cx="44" cy="34" r="2.5" fill="#ef4444" opacity="0.9" />
        </svg>
      ),
    },
    {
      key: 'scoreUseIchi', label: '일목', sub: '구름대 지지/저항',
      hint: '"가격이 구름 위냐 아래냐?"\n일목균형표의 스팬A·B가 만드는 구름대가 지지/저항 역할.\n\n✅ 구름 위 → 롱 +1 / ⛔ 숏 -1 (상승 지지)\n✅ 구름 아래 → 숏 +1 / ⛔ 롱 -1 (하락 저항)\n\n💡 구름이 두꺼울수록 지지/저항이 강함\n💡 구름 안에 있으면 방향 불확실 → 가감점 없음',
      desc: '일목균형표 구름대로 "가격이 지지 위인지 저항 아래인지" 판단. 추세 방향 확인용.',
      settings: null,
      svg: (
        <svg viewBox="0 0 72 42" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="ichiG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d="M4,22 C20,21 36,20 52,19 C60,19 64,19 68,19 L68,28 C64,28 60,28 52,27 C36,26 20,26 4,26 Z" fill="url(#ichiG)" />
          <path d="M4,22 C20,21 36,20 52,19 L68,19" fill="none" stroke="#10b98177" strokeWidth="1" />
          <path d="M4,26 C20,26 36,26 52,27 L68,28" fill="none" stroke="#ef444455" strokeWidth="1" />
          <path d="M4,18 C14,15 26,12 38,10 C50,8 60,7 68,7" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="38" cy="10" r="2.5" fill="#10b981" opacity="0.9" />
          <text x="38" y="9" fill="#10b981" fontSize="3">롱 +1 / 숏 -1</text>
          <text x="38" y="36" fill="#ef4444" fontSize="3" opacity="0.5">숏 +1 / 롱 -1</text>
        </svg>
      ),
    },
    {
      key: 'scoreUseGoldenCross', label: 'MA 추세', sub: 'MA20 vs MA60 방향',
      hint: '"MA20이 MA60 위냐 아래냐? — 현재 추세가 어느 방향인가?"\n\n✅ 롱 점수: MA20 > MA60 → +1 (상승 추세 영역)\n✅ 숏 점수: MA20 < MA60 → +1 (하락 추세 영역)\n\n💡 신호 발생 여부와 무관하게, 항상 현재 MA 관계를 평가\n💡 역추세 진입 억제 역할 (진입 조건 필터로도 사용)',
      desc: 'MA20과 MA60의 상대 위치로 현재 추세를 판정. 상승 추세(MA20>MA60)면 롱 +1, 하락 추세면 숏 +1.',
      settings: null,
      svg: (
        <svg viewBox="0 0 72 42" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
          <polyline points="4,30 16,28 28,26 40,24 52,22 68,20" fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="3,2" />
          <polyline points="4,34 12,32 22,28 32,23 44,18 56,14 68,12" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="26" cy="26" r="2.5" fill="#10b981" opacity="0.9" />
          <text x="28" y="25" fill="#10b981" fontSize="3">골든크로스</text>
          <text x="28" y="30" fill="#10b981" fontSize="3">롱 +1</text>
          <text x="5" y="10" fill="currentColor" fontSize="3.5" opacity="0.6">━ MA20</text>
          <text x="5" y="16" fill="#f59e0b" fontSize="3.5">┅ MA60</text>
          <text x="5" y="38" fill="#ef4444" fontSize="3" opacity="0.5">데드크로스 → 숏 +1</text>
        </svg>
      ),
    },
    {
      key: 'scoreUseFedLiquidity', label: '연준 유동성', sub: '대차대조표·TGA·역레포',
      hint: '"연준이 시중에 유동성을 공급 중인가, 회수 중인가?"\n순유동성 = Fed 대차대조표(WALCL) − TGA(재무부 계좌) − 역레포(RRP)\n\n📊 판단 기준 (MA 기준선)\n  ✅ 순유동성이 MA 위 + 상승 중 → 확실한 유동성 확장 → 롱 +1\n  ✅ 순유동성이 MA 아래 + 하락 중 → 확실한 유동성 수축 → 숏 +1\n  ⬜ 한쪽만 해당 → 혼재 → 0점\n\n💡 MA 기간 설정으로 기준선 민감도 조절 가능 (기본 13주 ≈ 분기)\n💡 FRED API 키 필요: Supabase secrets에 FRED_API_KEY 설정',
      desc: '순유동성이 MA 기준선 대비 높고 상승 중일 때 롱 +1. 낮고 하락 중일 때 숏 +1. 혼재 시 0.',
      settings: (() => {
        const fedVal = result?.fed_latest_net_liquidity
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: 9, color: '#60a5fa99', whiteSpace: 'nowrap' }}>MA 기간</Typography>
              <input type="number" min={4} max={52}
                value={draft.fedLiquidityMAPeriod ?? String(params.fedLiquidityMAPeriod)}
                style={{ ...inputStyle, width: 44 }}
                onChange={e => setDraft(d => ({ ...d, fedLiquidityMAPeriod: e.target.value }))} />
              <Typography sx={{ fontSize: 9, color: '#52525b' }}>주</Typography>
            </Box>
            {fedVal != null && (
              <Typography sx={{ fontSize: 9, color: '#a3e63566', lineHeight: 1.4 }}>
                최근 순유동성: <span style={{ color: '#a3e635', fontWeight: 700 }}>{fedVal.toLocaleString('en-US', { maximumFractionDigits: 0 })} B</span>
                {' '}({(fedVal / 1000).toFixed(1)} T)
              </Typography>
            )}
          </Box>
        )
      })(),
      svg: null,
    },
    {
      key: 'scoreUseCCI', label: 'CCI', sub: '상품채널지수 과열/침체',
      hint: '"가격이 통계적 평균에서 얼마나 벗어났나?"\nCCI = (TP - SMA(TP)) / (0.015 × 평균편차), 기간 20봉.\n\n✅ CCI < 하한(기본 -100) → 롱 +1 (극도 과매도, 반등 신호)\n✅ CCI > 상한(기본 +100) → 숏 +1 (극도 과매수, 하락 신호)\n\n💡 ±100은 일반적 신호 구간, ±200은 극단적 신호 구간\n💡 RSI와 함께 사용 시 이중 확인 효과',
      desc: '가격이 통계적 평균에서 극단적으로 벗어날 때 신호. 과매도(-100↓)에서 롱, 과매수(+100↑)에서 숏.',
      settings: (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
          <Box>
            <Typography sx={{ fontSize: 9, color: '#60a5fa99', mb: 0.5 }}>하한 <Typography component="span" sx={{ fontSize: 8, color: '#52525b' }}>(과매도)</Typography></Typography>
            <input type="number" min={-300} max={-50}
              value={draft.cciOversold ?? String(params.cciOversold)} style={smInput}
              onChange={e => setDraft(d => ({ ...d, cciOversold: e.target.value }))} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 9, color: '#60a5fa99', mb: 0.5 }}>상한 <Typography component="span" sx={{ fontSize: 8, color: '#52525b' }}>(과매수)</Typography></Typography>
            <input type="number" min={50} max={300}
              value={draft.cciOverbought ?? String(params.cciOverbought)} style={smInput}
              onChange={e => setDraft(d => ({ ...d, cciOverbought: e.target.value }))} />
          </Box>
        </Box>
      ),
      svg: (() => {
        const os = Number(draft.cciOversold ?? params.cciOversold) || -100
        const ob = Number(draft.cciOverbought ?? params.cciOverbought) || 100
        const range = 250
        const osY = 4 + (1 - (os + range) / (range * 2)) * 34
        const obY = 4 + (1 - (ob + range) / (range * 2)) * 34
        return (
          <svg viewBox="0 0 72 42" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
            <line x1="4" y1="21" x2="68" y2="21" stroke="#52525b" strokeWidth="0.6" />
            <text x="62" y="19" fill="#52525b" fontSize="3">0</text>
            <line x1="4" y1={obY} x2="68" y2={obY} stroke="#ef444455" strokeWidth="0.7" strokeDasharray="3,2" />
            <text x="5" y={obY - 1.5} fill="#ef4444" fontSize="3.5">{ob}</text>
            <line x1="4" y1={osY} x2="68" y2={osY} stroke="#10b98155" strokeWidth="0.7" strokeDasharray="3,2" />
            <text x="5" y={osY + 4} fill="#10b981" fontSize="3.5">{os}</text>
            <text x="28" y="8" fill="#ef4444" fontSize="3" opacity="0.8">숏 +1</text>
            <text x="28" y="38" fill="#10b981" fontSize="3" opacity="0.8">롱 +1</text>
            <path d="M4,21 C10,18 16,24 22,20 C28,16 34,28 40,23 C46,18 52,12 60,8 C64,6 66,5 68,5" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.7" />
            <circle cx="60" cy="8" r="2.5" fill="#ef4444" opacity="0.9" />
            <circle cx="14" cy="36" r="2.5" fill="#10b981" opacity="0.9" />
          </svg>
        )
      })(),
    },
    {
      key: 'scoreUseVWMA', label: 'VWMA', sub: '거래량 가중 이동평균',
      hint: '"거래량을 반영한 진짜 평균가는 얼마인가?"\nVWMA20 = Σ(종가 × 거래량) / Σ거래량 (20봉).\n거래량이 많이 거래된 가격대에 더 큰 가중치를 부여.\n\n✅ 가격 > VWMA → 롱 +1 (거래량 기준 상승 추세)\n✅ 가격 < VWMA → 숏 +1 (거래량 기준 하락 추세)\n\n💡 MA20보다 세력·기관의 실제 진입 단가에 가까움\n💡 VWMA = WVMA (같은 지표, 표기 차이)',
      desc: '거래량 가중 평균가 대비 현재 가격 위치. 단순 이평선보다 세력 진입 단가에 가까운 기준선.',
      settings: null,
      svg: (
        <svg viewBox="0 0 72 42" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
          <path d="M4,28 C12,26 20,24 32,21 C44,18 56,16 68,14" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3,2" />
          <path d="M4,32 C12,28 20,24 30,20 C40,16 52,12 68,8" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="38" cy="18" r="2.5" fill="#10b981" opacity="0.9" />
          <text x="40" y="17" fill="#10b981" fontSize="3">롱 +1</text>
          <text x="8" y="8" fill="currentColor" fontSize="3.5" opacity="0.6">━ 현재가</text>
          <text x="8" y="14" fill="#f59e0b" fontSize="3.5">┅ VWMA20</text>
          <text x="8" y="38" fill="#ef4444" fontSize="3" opacity="0.5">{'가격 < VWMA → 숏 +1'}</text>
        </svg>
      ),
    },
  ] as {
    key: keyof BacktestParams
    label: string
    sub: string
    hint: string
    desc: string
    settings: React.ReactNode
    svg: React.ReactNode
  }[]

  const activeCount = indicatorList.filter(({ key }) => params[key] as unknown as boolean).length
  const recommendedScore = Math.max(1, Math.round(activeCount * 0.55))
  const currentMinScore = parseInt(draft.minScore ?? String(params.minScore)) || params.minScore

  return (
    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #1f1f23', display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* ── 기간 + 인터벌 ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 100px' }, gap: 1.5 }}>
        <Box>
          <LabelRow label="시작일" />
          <input type="date" value={params.startDate} style={inputStyle}
            onChange={e => setParams(p => ({ ...p, startDate: e.target.value }))} />
        </Box>
        <Box>
          <LabelRow label="종료일" />
          <input type="date" value={params.endDate} style={inputStyle}
            onChange={e => setParams(p => ({ ...p, endDate: e.target.value }))} />
        </Box>
        <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
          <LabelRow label="캔들 단위" hintId="interval"
            hint={'1h = 1시간봉, 4h = 4시간봉, 1d = 일봉.\n짧을수록 거래 횟수 많고 노이즈 많음.'} />
          <select value={params.interval} style={{ ...inputStyle, cursor: 'pointer' }}
            onChange={e => setParams(p => ({ ...p, interval: e.target.value }))}>
            {['15m', '30m', '1h', '4h', '1d'].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Box>
      </Box>

      {/* ── 전략 기본 설정 ── */}
        <Box>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)', // 👈 핵심
                    gap: 1.5
                }}
            >
                {/* 레버리지 */}
                <Box>
                    <LabelRow label="레버리지" hintId="leverage"
                              hint={'"얼마나 크게 배팅하냐"\n10x면 $1,000으로 $10,000 포지션.\n높을수록 수익·손실 폭 커지고 청산 위험 증가.'}
                    />
                    <input
                        type="number"
                        min={1}
                        max={200}
                        value={draft.leverage ?? String(params.leverage)}
                        style={inputStyle}
                        onChange={e => setDraft(d => ({ ...d, leverage: e.target.value }))}
                    />
                </Box>

                {/* 익절 */}
                <Box>
                    <LabelRow label="익절 % (+N)" hintId="fixedTP"
                              hint={'"진입가 기준 N% 오르면 무조건 익절"\n현물 기준 (레버리지 무관).\nRR 필터 없이 무조건 해당 %로 익절.'}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>+</Typography>
                        <input
                            type="number"
                            min={0.1}
                            max={100}
                            step={0.5}
                            value={draft.fixedTP ?? String(params.fixedTP)}
                            style={inputStyle}
                            onChange={e => setDraft(d => ({ ...d, fixedTP: e.target.value }))}
                        />
                        <Typography sx={{ fontSize: 11, color: '#52525b' }}>%</Typography>
                    </Box>
                </Box>

                {/* 손절 */}
                <Box>
                    <LabelRow label="손절 % (-M)" hintId="fixedSL"
                              hint={'"진입가 기준 M% 내리면 무조건 손절"\n현물 기준 (레버리지 무관).\nRR 필터 없이 무조건 해당 %로 손절.'}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>−</Typography>
                        <input
                            type="number"
                            min={0.1}
                            max={100}
                            step={0.5}
                            value={draft.fixedSL ?? String(params.fixedSL)}
                            style={inputStyle}
                            onChange={e => setDraft(d => ({ ...d, fixedSL: e.target.value }))}
                        />
                        <Typography sx={{ fontSize: 11, color: '#52525b' }}>%</Typography>
                    </Box>
                </Box>
            </Box>
        </Box>
      {/* ── MTF 일봉 추세 필터 ── */}
      <Box
        sx={{
          p: 1.5, borderRadius: 2, border: '1px solid',
          borderColor: params.useDailyTrend ? '#f59e0b44' : '#27272a',
          background: params.useDailyTrend ? '#f59e0b08' : 'transparent',
          cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
        }}
        onClick={() => setParams(p => ({ ...p, useDailyTrend: !p.useDailyTrend }))}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: params.useDailyTrend ? '#f59e0b' : '#3f3f46', boxShadow: params.useDailyTrend ? '0 0 8px #f59e0baa' : 'none' }} />
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: params.useDailyTrend ? '#fcd34d' : '#71717a' }}>
                일봉 추세 필터 (MTF)
              </Typography>
              <HintTooltip id="useDailyTrend" text={'"거시 방향과 맞는 진입만 허용"\n일봉 MA120 기준: 일봉 종가 > MA120이면 롱만, < MA120이면 숏만 허용.\n1d 인터벌에서는 자동으로 비활성화.'} />
            </Box>
            <Typography sx={{ fontSize: 10, color: params.useDailyTrend ? '#f59e0b88' : '#52525b', mt: 0.25 }}>
              일봉 MA120 방향과 일치하는 신호만 진입 · 캔들 단위가 1d면 무효
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: params.useDailyTrend ? '#fcd34d' : '#3f3f46' }}>
            {params.useDailyTrend ? 'ON' : 'OFF'}
          </Typography>
        </Box>
      </Box>

      {/* ── 지표 선택 + 점수 ── */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ ...labelSx, color: '#a1a1aa' }}>지표 선택</Typography>
            <Box sx={{ px: 1, py: 0.25, borderRadius: 10, background: activeCount > 0 ? '#3b82f620' : '#27272a', border: '1px solid', borderColor: activeCount > 0 ? '#3b82f644' : '#3f3f46' }}>
              <Typography sx={{ fontSize: 10, color: activeCount > 0 ? '#93c5fd' : '#52525b', fontWeight: 700 }}>
                {activeCount} / {indicatorList.length} 활성화
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          {/* 매수 기준 점수 */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
              <LabelRow label="매수 기준 점수" hintId="minScore"
                hint={'"진입에 필요한 최소 점수"\n활성화된 지표들이 각각 +1 점수를 부여.\n합산 점수가 이 값 이상이어야 실제 진입.\n높을수록 신중한 진입, 0이면 조건 없이 진입.'} />
              <input type="number" min={0} max={7}
                value={draft.minScore ?? String(params.minScore)}
                style={{ ...inputStyle, width: 48 }}
                onChange={e => setDraft(d => ({ ...d, minScore: e.target.value }))} />
            </Box>
            <Box
              onClick={() => setDraft(d => ({ ...d, minScore: String(recommendedScore) }))}
              sx={{
                px: 0.9, py: 0.3, borderRadius: 10, cursor: 'pointer', userSelect: 'none',
                background: currentMinScore === recommendedScore ? '#a3e63520' : '#27272a',
                border: '1px solid', borderColor: currentMinScore === recommendedScore ? '#a3e63566' : '#3f3f46',
                transition: 'all 0.15s', '&:hover': { borderColor: '#a3e63599', background: '#a3e63518' },
                width: 'fit-content',
              }}
            >
              <Typography sx={{ fontSize: 9, fontWeight: 700, color: currentMinScore === recommendedScore ? '#a3e635' : '#71717a' }}>
                추천 {recommendedScore}
              </Typography>
            </Box>
          </Box>
          {/* 신호약화 임계값 */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <LabelRow label="신호약화 임계값" hintId="scoreExitThreshold"
                hint={'"점수가 떨어지면 매도"\n진입 후 현재 점수가 이 값 이하로 내려가면\n신호 약화로 판단하여 즉시 청산 (손절/익절 전).\n0 = 비활성화'} />
              <input type="number" min={0} max={7}
                value={draft.scoreExitThreshold ?? String(params.scoreExitThreshold)}
                style={{ ...inputStyle, width: 48 }}
                onChange={e => setDraft(d => ({ ...d, scoreExitThreshold: e.target.value }))} />
            </Box>
          </Box>
        </Box>

        {/* 지표 카드 그리드 */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)' }, gap: 1 }}>
          {indicatorList.map(({ key, label, sub, hint, desc, svg, settings }) => {
            const on = params[key] as unknown as boolean
            return (
              <Box
                key={String(key)}
                onClick={() => setParams(p => ({ ...p, [key]: !p[key] }))}
                sx={{
                  display: 'flex', flexDirection: 'row', gap: 0,
                  borderRadius: 2, border: '1px solid', cursor: 'pointer', userSelect: 'none',
                  borderColor: on ? '#3b82f666' : '#27272a',
                  background: on ? '#3b82f610' : '#18181b',
                  overflow: 'hidden', transition: 'all 0.15s',
                  '&:hover': { borderColor: on ? '#3b82f699' : '#3f3f46', background: on ? '#3b82f618' : '#1c1c1f' },
                }}
              >
                {/* 좌측: 텍스트 + 설정 */}
                <Box sx={{ flex: '0 0 52%', p: 1.25, display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: on ? '#3b82f6' : '#3f3f46', boxShadow: on ? '0 0 6px #3b82f6aa' : 'none', transition: 'all 0.15s' }} />
                      <Typography sx={{ fontSize: 13, fontWeight: 800, lineHeight: 1, color: on ? '#93c5fd' : '#71717a' }}>{label}</Typography>
                    </Box>
                    <HintTooltip id={`pill-${String(key)}`} text={hint} />
                  </Box>
                  <Typography sx={{ fontSize: 9, fontWeight: 600, color: on ? '#60a5fa99' : '#52525b' }}>{sub}</Typography>
                  <Typography sx={{ fontSize: 9, color: on ? '#71717a' : '#3f3f46', lineHeight: 1.45, flex: 1 }}>{desc}</Typography>
                  {settings && on && (
                    <Box onClick={e => e.stopPropagation()} sx={{ pt: 0.75, mt: 0.25, borderTop: '1px solid #3b82f622' }}>
                      {settings}
                    </Box>
                  )}
                </Box>
                {/* 우측: SVG 차트 */}
                {svg && (
                  <Box sx={{
                    flex: 1, minWidth: 0, alignSelf: 'stretch',
                    color: on ? '#60a5fa' : '#3f3f46', transition: 'color 0.15s',
                    borderLeft: '1px solid', borderColor: on ? '#3b82f622' : '#27272a',
                    background: on ? '#0a1628' : '#111113',
                    display: 'flex', alignItems: 'stretch',
                  }}>
                    <Box component="span" sx={{ display: 'flex', width: '100%', height: '100%', minHeight: 100 }}>
                      {svg}
                    </Box>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
