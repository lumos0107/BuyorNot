import { normalizePantryName, type PantryItem } from './pantry'
import { daysUntil, kindOf, nextBillingDate, type Subscription } from './subscriptions'

export function deliveryOverlapLine(item: PantryItem, subscriptions: readonly Subscription[], today: Date): string | null {
  if (item.kind !== 'essential' || item.level !== 'plenty') return null
  const match = subscriptions
    .filter((sub) => !sub.cancelledOn && kindOf(sub) === 'delivery' && normalizePantryName(sub.name) === normalizePantryName(item.name))
    .map((sub) => nextBillingDate(sub, today))
    .filter((day) => daysUntil(day, today) >= 0 && daysUntil(day, today) <= 7)
    .sort()[0]
  return match ? `집에 넉넉해요. ${match} 정기배송 전에 계속 필요한지 확인해 보세요.` : null
}
