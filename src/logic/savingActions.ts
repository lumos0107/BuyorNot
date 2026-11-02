import { normalizePantryName, type PantryItem } from './pantry'
import { daysUntil, kindOf, nextBillingDate, type Subscription } from './subscriptions'

export function deliveryOverlapLine(item: PantryItem, subscriptions: readonly Subscription[], today: Date): string | null {
  if (item.kind !== 'essential' || item.level !== 'plenty') return null
  const match = subscriptions
    .filter((sub) => !sub.cancelledOn && kindOf(sub) === 'delivery' && normalizePantryName(sub.name) === normalizePantryName(item.name))
    .map((sub) => nextBillingDate(sub, today))
    .filter((day) => daysUntil(day, today) >= 0 && daysUntil(day, today) <= 7)
    .sort()[0]
  return match ? `집에 넉넉해요. ${match} 정기배송 결제 전에 계속 필요한지 확인해 보세요.` : null
}

export function billingReviewLine(sub: Subscription, today: Date): string | null {
  if (sub.cancelledOn) return null
  const days = daysUntil(nextBillingDate(sub, today), today)
  if (days < 0 || days > 7) return null
  const kind = kindOf(sub)
  return kind === 'subscription' || kind === 'membership'
    ? '결제 전에 최근 사용 기록을 확인해 보세요.'
    : '예정된 결제일과 금액을 확인해 보세요.'
}
