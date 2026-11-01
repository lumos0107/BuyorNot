import { parseDay } from './dates'
import { daysUntil } from './subscriptions'
import type { WishItem } from './wishlist'

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
