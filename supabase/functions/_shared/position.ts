import { CAPITAL_PER_TRADE } from './constants.ts'
import type { BaseConfig } from './types.ts'

export function calcTPSL(direction: string, price: number, c: BaseConfig) {
  const isLong  = direction === 'LONG'
  const isShort = direction === 'SHORT'
  const round = (v: number) => Math.round(v * 1e6) / 1e6
  let tp: number | null = null, sl: number | null = null

  if (c.fixed_tp > 0 && c.fixed_sl > 0) {
    if (isLong) {
      sl = round(price * (1 - c.fixed_sl / 100))
      tp = round(price * (1 + c.fixed_tp / 100))
    } else if (isShort) {
      sl = round(price * (1 + c.fixed_sl / 100))
      tp = round(price * (1 - c.fixed_tp / 100))
    }
  }
  return { tp, sl }
}

export function calcPositionSize(capital: number, entry: number, leverage: number) {
  if (entry <= 0 || capital <= 0 || leverage <= 0) return { quantity: 0, capitalUsed: 0 }
  const capitalUsed = capital * CAPITAL_PER_TRADE
  const quantity    = (capitalUsed * leverage) / entry
  return { quantity, capitalUsed }
}