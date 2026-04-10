/**
 * 모든 점수 지표를 순서대로 정의합니다.
 * INDICATORS 배열을 순회하면 scoreLong / scoreShort / detail이 자동 집계됩니다.
 */
export { ADX }      from './adx'
export { RSI }      from './rsi'
export { MACD }     from './macd'
export { RVOL }     from './rvol'
export { BB }       from './bb'
export { Ichimoku } from './ichimoku'
export { MA }       from './ma'
export { Fed }      from './fed'
export { CCI }      from './cci'
export { VWMA }     from './vwma'

import { ADX }      from './adx'
import { RSI }      from './rsi'
import { MACD }     from './macd'
import { RVOL }     from './rvol'
import { BB }       from './bb'
import { Ichimoku } from './ichimoku'
import { MA }       from './ma'
import { Fed }      from './fed'
import { CCI }      from './cci'
import { VWMA }     from './vwma'

export const INDICATORS = [ADX, RSI, MACD, RVOL, BB, Ichimoku, MA, Fed, CCI, VWMA] as const
