export const CRYPTO_SYMBOLS = ['ETH', 'SOL', 'XRP'] as const
export type CryptoSymbol = (typeof CRYPTO_SYMBOLS)[number]

export const SIGNAL_LABELS: Record<string, string> = {
  // 롱 시그널
  GOLDEN_CROSS:   '골든크로스',
  RSI_OVERSOLD:   'RSI 과매도',
  BB_LOWER_TOUCH: 'BB 하단터치',
  ML_BUY:         'ML 매수',
  RL_BUY:         'RL 롱',
  MA20_PULLBACK:  'MA20 풀백',
  ICHI_BB_PULLBACK: '일목구름+BB눌림',
  // 숏 시그널
  DEATH_CROSS:    '데스크로스',
  RSI_OVERBOUGHT: 'RSI 과매수',
  BB_UPPER_TOUCH: 'BB 상단터치',
  RL_SELL:        'RL 숏',
  MA20_BREAKDOWN: 'MA20 이탈',
}
