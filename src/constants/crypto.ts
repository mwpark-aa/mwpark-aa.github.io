export const ALL_CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'BNB', 'XRP', 'SOL',
  'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK',
] as const
export type CryptoSymbol = (typeof ALL_CRYPTO_SYMBOLS)[number]

// 하위 호환 (기존 코드에서 CRYPTO_SYMBOLS 참조하는 곳)
export const CRYPTO_SYMBOLS = ALL_CRYPTO_SYMBOLS

export const BOT_INTERVALS = ['15m', '30m', '1h', '4h', '1d'] as const
export type BotInterval = (typeof BOT_INTERVALS)[number]

export const SIGNAL_LABELS: Record<string, string> = {
  SCORE_LONG:  '롱 진입',
  SCORE_SHORT: '숏 진입',
  // 레거시 (구 기록 호환용)
  GOLDEN_CROSS:   '골든크로스',
  RSI_OVERSOLD:   'RSI 과매도',
  BB_LOWER_TOUCH: 'BB 하단터치',
  ML_BUY:         'ML 매수',
  RL_BUY:         'RL 롱',
  MA20_PULLBACK:  'MA20 풀백',
  DEATH_CROSS:    '데스크로스',
  RSI_OVERBOUGHT: 'RSI 과매수',
  BB_UPPER_TOUCH: 'BB 상단터치',
  RL_SELL:        'RL 숏',
  MA20_BREAKDOWN: 'MA20 이탈',
}

export const SIGNAL_DESCRIPTIONS: Record<string, { summary: string; condition: string; interpretation: string }> = {
  // ── 롱 시그널 ──
  GOLDEN_CROSS: {
    summary: '단기 이동평균선이 장기 이동평균선을 상향 돌파하는 강세 전환 신호',
    condition: 'MA50이 MA200을 아래에서 위로 교차',
    interpretation: '중장기 추세가 하락→상승으로 전환되는 시점. 거래량 동반 시 신뢰도 상승. 후행 지표이므로 이미 일부 상승이 진행된 후 발생할 수 있음.',
  },
  RSI_OVERSOLD: {
    summary: 'RSI가 과매도 구간에 진입 후 반등하는 매수 신호',
    condition: 'RSI(14)가 설정된 과매도 임계값(기본 30) 이하로 하락 후 반등',
    interpretation: '매도 압력이 과도하여 반등 가능성이 높은 구간. 강한 하락 추세에서는 RSI가 오래 과매도에 머물 수 있으므로 추세 확인 필요.',
  },
  BB_LOWER_TOUCH: {
    summary: '가격이 볼린저밴드 하단에 닿거나 이탈 후 복귀하는 매수 신호',
    condition: '종가가 BB 하단(MA20 − 2σ)에 터치 또는 하향 이탈 후 밴드 안으로 복귀',
    interpretation: '통계적으로 가격이 평균 회귀할 가능성이 높은 구간. 밴드 폭(Bandwidth)이 좁을수록 변동성 확대 직전일 수 있어 주의.',
  },
  ML_BUY: {
    summary: '머신러닝 모델이 상승 확률이 높다고 판단한 매수 신호',
    condition: 'ML 모델의 예측 확률이 매수 임계값 초과',
    interpretation: '과거 패턴 학습 기반 예측. 시장 구조 변화(regime change) 시 성능 저하 가능. 다른 기술적 지표와 함께 확인 권장.',
  },
  RL_BUY: {
    summary: '강화학습 에이전트가 롱 포지션 진입을 결정한 신호',
    condition: 'RL 에이전트의 행동 정책(policy)이 매수 액션 선택',
    interpretation: '보상 함수 기반으로 최적 행동을 학습한 결과. 학습 환경과 실제 시장 괴리에 주의. 탐색-활용 균형에 따라 신호 빈도 변동.',
  },
  MA20_PULLBACK: {
    summary: '상승 추세에서 가격이 MA20까지 눌림 후 반등하는 매수 신호',
    condition: '가격이 MA20 위에서 하락하여 MA20 부근에서 지지 확인 후 반등',
    interpretation: '건강한 상승 추세의 눌림목 매수 기회. MA20이 우상향 중이어야 유효. 거래량 감소 후 반등 시 신뢰도 높음.',
  },
  // ── 숏 시그널 ──
  DEATH_CROSS: {
    summary: '단기 이동평균선이 장기 이동평균선을 하향 돌파하는 약세 전환 신호',
    condition: 'MA50이 MA200을 위에서 아래로 교차',
    interpretation: '중장기 추세가 상승→하락으로 전환되는 시점. 골든크로스의 반대. 이미 하락이 상당 부분 진행된 후 확인되는 후행 신호.',
  },
  RSI_OVERBOUGHT: {
    summary: 'RSI가 과매수 구간에 진입 후 하락하는 매도 신호',
    condition: 'RSI(14)가 설정된 과매수 임계값(기본 70) 이상으로 상승 후 하락',
    interpretation: '매수 압력이 과도하여 조정 가능성이 높은 구간. 강한 상승 추세에서는 RSI가 오래 과매수에 머물 수 있음.',
  },
  BB_UPPER_TOUCH: {
    summary: '가격이 볼린저밴드 상단에 닿거나 이탈 후 복귀하는 매도 신호',
    condition: '종가가 BB 상단(MA20 + 2σ)에 터치 또는 상향 이탈 후 밴드 안으로 복귀',
    interpretation: '평균 회귀 관점에서 하락 가능성이 높은 구간. 강한 추세에서는 밴드를 타고 올라가는 "밴드워킹" 발생 가능.',
  },
  RL_SELL: {
    summary: '강화학습 에이전트가 숏 포지션 진입을 결정한 신호',
    condition: 'RL 에이전트의 행동 정책(policy)이 매도 액션 선택',
    interpretation: 'RL_BUY의 반대. 하락 보상을 최대화하도록 학습된 결과. 시장 변동성이 클수록 신호 빈도 증가 경향.',
  },
  MA20_BREAKDOWN: {
    summary: '하락 추세에서 가격이 MA20을 하향 이탈하는 매도 신호',
    condition: '가격이 MA20 아래로 하락하며 지지선 붕괴 확인',
    interpretation: 'MA20 풀백의 반대. MA20이 하향 전환 중이면 추세 전환 신호. 거래량 증가와 함께 이탈 시 하락 가속 가능.',
  },
}
