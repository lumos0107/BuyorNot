import { parseDay } from './dates'
import { isCancelled, nextBillingDate, toDayIso, type Subscription } from './subscriptions'

export type PaymentOccurrence = { subscriptionId: string; name: string; day: string; priceKrw: number }

const localNoon = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12)
const nextDay = (iso: string): Date => {
  const day = parseDay(iso)!
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 12)
}

/** 오늘부터 29일 뒤까지 저장된 고정비 주기마다 예정 건을 만든다. 실제 청구 기록은 아니다. */
export function paymentOccurrences(subscriptions: readonly Subscription[], today: Date): PaymentOccurrence[] {
  const first = localNoon(today)
  const end = toDayIso(new Date(first.getFullYear(), first.getMonth(), first.getDate() + 29, 12))
  const rows: PaymentOccurrence[] = []
  for (const sub of subscriptions) {
    if (isCancelled(sub)) continue
    let cursor = first
    for (let count = 0; count < 31; count++) {
      const day = nextBillingDate(sub, cursor)
      if (day > end) break
      rows.push({ subscriptionId: sub.id, name: sub.name, day, priceKrw: sub.priceKrw })
      cursor = nextDay(day)
    }
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name, 'ko') || a.subscriptionId.localeCompare(b.subscriptionId))
}

export function paymentTotal(rows: readonly PaymentOccurrence[]): number {
  return rows.reduce((total, row) => total + row.priceKrw, 0)
}

// 달력 칸 안의 짧은 금액. 10만 원부터는 '만' 단위로 줄인다(칸이 좁다). 정확한 금액은 아래 날짜별 목록에 있다
export function shortWon(amount: number): string {
  if (amount < 100_000) return amount.toLocaleString('ko-KR')
  const man = amount / 10_000
  return `${man >= 100 ? Math.round(man) : Math.round(man * 10) / 10}만`
}
