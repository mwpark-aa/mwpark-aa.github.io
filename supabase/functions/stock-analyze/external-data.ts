/**
 * 외부 API에서 시장 심리 및 파생상품 데이터를 가져온다.
 * - Fear & Greed Index: alternative.me (무료, API 키 불필요)
 * - 펀딩레이트 + 미결제약정: CoinGlass (무료 티어, COINGLASS_API_KEY 필요)
 *
 * 크립토 심볼에만 적용. 주식 심볼은 null 반환.
 */

// Binance 기준 크립토 심볼 목록 (필요 시 확장)
const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'AVAX',
  'MATIC', 'DOT', 'LINK', 'LTC', 'UNI', 'ATOM', 'NEAR', 'APT',
  'ARB', 'OP', 'SUI', 'TRX',
])

export interface FearGreedResult {
  value: number            // 0~100
  classification: string   // 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
}

export interface DerivativesResult {
  fundingRate: number | null    // 8시간 펀딩레이트 (%)
  openInterest: number | null   // 미결제약정 (USD)
  openInterestChange24h: number | null  // 24시간 OI 변화율 (%)
  longShortRatio: number | null // 롱/숏 비율
}

export interface ExternalMarketData {
  isCrypto: boolean
  fearGreed: FearGreedResult | null
  derivatives: DerivativesResult | null
}

/**
 * Fear & Greed Index 조회 (alternative.me, 무료)
 */
async function fetchFearGreed(): Promise<FearGreedResult | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return null
    const json = await res.json()
    const item = json?.data?.[0]
    if (!item) return null
    return {
      value: Number(item.value),
      classification: item.value_classification ?? '',
    }
  } catch {
    return null
  }
}

/**
 * CoinGlass 펀딩레이트 + 미결제약정 조회 (COINGLASS_API_KEY 필요)
 * API 키 없으면 null 반환.
 */
async function fetchCoinGlassDerivatives(
  symbol: string,
  apiKey: string,
): Promise<DerivativesResult | null> {
  // CoinGlass는 'BTC', 'ETH' 형식으로 받음
  const coin = symbol.replace(/USDT$/i, '').toUpperCase()

  try {
    const headers = { 'coinglassSecret': apiKey }

    const [frRes, oiRes, lsRes] = await Promise.all([
      fetch(`https://open-api.coinglass.com/public/v2/funding?symbol=${coin}`, { headers }),
      fetch(`https://open-api.coinglass.com/public/v2/open_interest?symbol=${coin}`, { headers }),
      fetch(`https://open-api.coinglass.com/public/v2/long_short?symbol=${coin}&period=4h`, { headers }),
    ])

    const [frJson, oiJson, lsJson] = await Promise.all([
      frRes.ok ? frRes.json() : null,
      oiRes.ok ? oiRes.json() : null,
      lsRes.ok ? lsRes.json() : null,
    ])

    // 전체 거래소 평균 펀딩레이트 (Binance 우선)
    let fundingRate: number | null = null
    if (frJson?.data) {
      const entry = frJson.data.find((d: any) => d.exchangeName?.toLowerCase() === 'binance') ?? frJson.data[0]
      if (entry?.rate !== undefined) fundingRate = Number(entry.rate)
    }

    let openInterest: number | null = null
    let openInterestChange24h: number | null = null
    if (oiJson?.data) {
      const total = oiJson.data.find((d: any) => d.exchangeName === 'ALL') ?? oiJson.data[0]
      if (total) {
        openInterest = total.openInterest ?? null
        openInterestChange24h = total.openInterestChange24h ?? null
      }
    }

    let longShortRatio: number | null = null
    if (lsJson?.data) {
      const entry = lsJson.data.find((d: any) => d.exchangeName?.toLowerCase() === 'binance') ?? lsJson.data[0]
      if (entry?.longRate !== undefined && entry?.shortRate !== undefined) {
        const shortRate = Number(entry.shortRate)
        if (shortRate > 0) longShortRatio = Number((Number(entry.longRate) / shortRate).toFixed(3))
      }
    }

    return { fundingRate, openInterest, openInterestChange24h, longShortRatio }
  } catch {
    return null
  }
}

/**
 * 심볼에 맞는 외부 데이터를 모두 가져온다.
 */
export async function fetchExternalMarketData(
  symbol: string,
  coinGlassApiKey: string | undefined,
): Promise<ExternalMarketData> {
  const isCrypto = CRYPTO_SYMBOLS.has(symbol.toUpperCase())

  if (!isCrypto) {
    return { isCrypto: false, fearGreed: null, derivatives: null }
  }

  // Fear & Greed + Derivatives 병렬 조회
  const [fearGreed, derivatives] = await Promise.all([
    fetchFearGreed(),
    coinGlassApiKey
      ? fetchCoinGlassDerivatives(symbol, coinGlassApiKey)
      : Promise.resolve(null),
  ])

  return { isCrypto: true, fearGreed, derivatives }
}

/**
 * 외부 데이터를 프롬프트에 삽입할 텍스트로 변환한다.
 */
export function formatExternalDataForPrompt(data: ExternalMarketData): string {
  if (!data.isCrypto) {
    return '(주식 종목 — 온체인/파생 데이터 해당 없음)'
  }

  const lines: string[] = []

  // Fear & Greed
  if (data.fearGreed) {
    const { value, classification } = data.fearGreed
    const emoji = value <= 20 ? '😱' : value <= 40 ? '😨' : value <= 60 ? '😐' : value <= 80 ? '😏' : '🤑'
    lines.push(`공포탐욕지수: ${value}/100 (${classification}) ${emoji}`)
  } else {
    lines.push('공포탐욕지수: 데이터 미제공')
  }

  // Derivatives
  if (data.derivatives) {
    const { fundingRate, openInterest, openInterestChange24h, longShortRatio } = data.derivatives

    if (fundingRate !== null) {
      const frAnnualized = (fundingRate * 3 * 365).toFixed(1)  // 8h → 연환산
      const frState = fundingRate > 0.05 ? '롱 과열 ⚠️'
        : fundingRate < -0.02 ? '숏 과열 (숏스퀴즈 주의) ⚠️'
        : '중립'
      lines.push(`펀딩레이트: ${fundingRate.toFixed(4)}% (8h) / 연환산 ${frAnnualized}% → ${frState}`)
    } else {
      lines.push('펀딩레이트: 데이터 미제공')
    }

    if (openInterest !== null) {
      const oiB = (openInterest / 1e9).toFixed(2)
      const oiChange = openInterestChange24h !== null
        ? ` / 24h 변화: ${openInterestChange24h > 0 ? '+' : ''}${openInterestChange24h.toFixed(1)}%`
        : ''
      lines.push(`미결제약정(OI): $${oiB}B${oiChange}`)
    } else {
      lines.push('미결제약정: 데이터 미제공')
    }

    if (longShortRatio !== null) {
      const lsState = longShortRatio > 1.5 ? '롱 편향 (역발상 숏 주의)'
        : longShortRatio < 0.67 ? '숏 편향 (역발상 롱 주의)'
        : '균형'
      lines.push(`롱/숏 비율: ${longShortRatio} → ${lsState}`)
    } else {
      lines.push('롱/숏 비율: 데이터 미제공')
    }
  } else {
    lines.push('펀딩레이트 / OI / 롱숏비율: COINGLASS_API_KEY 미설정으로 미제공')
  }

  return lines.join('\n')
}
