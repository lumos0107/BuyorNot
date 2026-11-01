import { sortExpiries, type Expiry } from './benefits'
import { desireDueToday } from './desire'
import { daysUntil, isCancelled, nextBillingDate, type Subscription } from './subscriptions'
import { reviewState, sortConsidering, type WishItem } from './wishlist'

export type TodayActions = {
  desire: WishItem[]
  ready: WishItem[]
  payments: Subscription[]
  returns: WishItem[]
  expiries: Expiry[]
}

const inNextWeek = (day: string, now: Date) => {
  const left = daysUntil(day, now)
  return left >= 0 && left <= 7
}

/** 기존 기록에서 오늘과 7일 안의 행동만 읽는다. 새 저장값은 만들지 않는다. */
export function collectTodayActions(items: readonly WishItem[], subscriptions: readonly Subscription[], expiries: readonly Expiry[], now: Date): TodayActions {
  const considering = sortConsidering(items, now)
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ko')
  return {
    desire: considering.filter((item) => desireDueToday(item, now)),
    ready: considering.filter((item) => reviewState(item.reviewAt, now).phase === 'ready'),
    payments: subscriptions.filter((sub) => !isCancelled(sub) && inNextWeek(nextBillingDate(sub, now), now))
      .sort((a, b) => nextBillingDate(a, now).localeCompare(nextBillingDate(b, now)) || byName(a, b)),
    returns: items.filter((item) => item.status === 'purchased' && !item.returnedOn && item.returnBy && inNextWeek(item.returnBy, now))
      .sort((a, b) => (a.returnBy ?? '').localeCompare(b.returnBy ?? '') || byName(a, b)),
    expiries: sortExpiries(expiries.filter((entry) => inNextWeek(entry.expiresOn, now))),
  }
}
