import { parseDay } from './dates'
import { daysUntil } from './subscriptions'
import { formatWon, MAX_WON, parseInteger } from './number'
import type { Resale, WishItem } from './wishlist'

// PRD F66: 반품 기한은 사용자가 판매처에서 확인한 날짜만 쓴다.
export function validateReturnBy(raw: string): { value?: string | null; error?: string } {
  if (!raw.trim()) return { value: null }
  return parseDay(raw) ? { value: raw } : { error: '올바른 날짜를 골라 주세요.' }
}
export function returnDeadlineLine(item: Pick<WishItem, 'returnBy'>, today: Date): string | null {
  if (!item.returnBy) return null
  const left = daysUntil(item.returnBy, today)
  return left < 0 ? `반품 기한이 지났어요 (${item.returnBy})` : `반품 기한 ${item.returnBy} · D-${left}`
}
export function returnReviewLine(item: Pick<WishItem, 'returnBy' | 'returnedOn' | 'satisfaction'>, today: Date): string | null {
  if (!item.returnBy || item.returnedOn || item.satisfaction !== 'regret') return null
  const left = daysUntil(item.returnBy, today)
  return left >= 0 ? `반품 기한이 ${left}일 남았어요` : null
}
export function returnedAmount(items: readonly WishItem[]): { count: number; amountKrw: number } {
  const returned = items.filter((item) => item.status === 'purchased' && item.returnedOn)
  return { count: returned.length, amountKrw: returned.reduce((sum, item) => sum + item.priceKrw, 0) }
}

export type ResaleRaw = { listedOn: string; soldOn: string; soldKrw: string }
export type ResaleErrors = Partial<Record<keyof ResaleRaw, string>>
export function validateResale(raw: ResaleRaw): { value?: Resale | null; errors: ResaleErrors } {
  const errors: ResaleErrors = {}
  if (!raw.listedOn && !raw.soldOn && !raw.soldKrw) return { value: null, errors }
  if (!parseDay(raw.listedOn)) errors.listedOn = '올린 날을 골라 주세요.'
  if (raw.soldOn && !parseDay(raw.soldOn)) errors.soldOn = '판 날을 골라 주세요.'
  else if (raw.soldOn && raw.soldOn < raw.listedOn) errors.soldOn = '판 날은 올린 날과 같거나 그 뒤여야 해요.'
  if (raw.soldOn && !raw.soldKrw.trim()) errors.soldKrw = '판 금액을 적어 주세요.'
  if (raw.soldKrw.trim() && !raw.soldOn) errors.soldOn = '판 날을 골라 주세요.'
  const soldKrw = raw.soldKrw.trim() ? parseInteger(raw.soldKrw) : null
  if (raw.soldKrw.trim() && (soldKrw === null || soldKrw < 1 || soldKrw > MAX_WON)) errors.soldKrw = '판 금액은 1원~10억 원 사이여야 해요.'
  if (Object.keys(errors).length) return { errors }
  return { value: { listedOn: raw.listedOn, ...(raw.soldOn ? { soldOn: raw.soldOn, soldKrw: soldKrw! } : {}) }, errors }
}
export function resaleLines(item: Pick<WishItem, 'resale'>): string[] {
  if (!item.resale) return []
  const lines = [`${item.resale.listedOn}에 올렸어요`]
  if (item.resale.soldOn && item.resale.soldKrw) lines.push(`${item.resale.soldOn}에 ${formatWon(item.resale.soldKrw)}에 팔았다고 적었어요.`)
  return lines
}
export function resaleTotal(items: readonly WishItem[]): { count: number; amountKrw: number } {
  const sold = items.filter((item) => item.status === 'purchased' && item.resale?.soldKrw !== undefined)
  return { count: sold.length, amountKrw: sold.reduce((sum, item) => sum + (item.resale?.soldKrw ?? 0), 0) }
}
