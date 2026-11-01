import { expect, it } from 'vitest'
import { createSubscription, monthlyEquivalent, nextBillingDate, parseSubscriptions, subscriptionSummary, validateSubscriptionInput, type Subscription } from './subscriptions'

const today = new Date(2026, 10, 1, 9)
const weekly: Subscription = { id: 'w1', name: '생수', kind: 'delivery', priceKrw: 18900, cycle: 'weekly', intervalWeeks: 4, renewalDate: '2026-11-05', lastUsedDate: null, createdAt: today.toISOString(), updatedAt: today.toISOString() }
const monthly: Subscription = { id: 'm1', name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null, createdAt: today.toISOString(), updatedAt: today.toISOString() }

it('AC100: 4주마다 18,900원은 월평균 20,475원, 1년 245,700원이다', () => {
  expect(monthlyEquivalent(weekly)).toBe(20475)
  expect(subscriptionSummary([weekly, monthly], today)).toMatchObject({ monthlyTotal: 33975, yearlyTotal: 407700 })
})
it('AC100: 다음 배송일은 기준일에 4주씩 더한 오늘 이후 첫날이다', () => {
  expect(nextBillingDate(weekly, today)).toBe('2026-11-05')
  expect(nextBillingDate(weekly, new Date(2026, 10, 6, 9))).toBe('2026-12-03')
})
it('AC101: 몇 주마다 0·13과 범위 밖 다음 배송일은 오류다', () => {
  const raw = { name: '생수', price: '18900', kind: 'delivery' as const, cycle: 'weekly' as const, intervalWeeks: '4', billingDay: '', renewalDate: '2026-11-05', lastUsedDate: '', memo: '' }
  expect(validateSubscriptionInput({ ...raw, intervalWeeks: '0' }, today).errors.intervalWeeks).toBe('몇 주마다는 1~12 사이 정수여야 해요')
  expect(validateSubscriptionInput({ ...raw, intervalWeeks: '13' }, today).errors.intervalWeeks).toBe('몇 주마다는 1~12 사이 정수여야 해요')
  expect(validateSubscriptionInput({ ...raw, renewalDate: '2026-11-30' }, today).errors.renewalDate).toBe('다음 배송일은 오늘부터 4주 안이어야 해요')
  expect(validateSubscriptionInput({ ...raw, renewalDate: '2026-11-29' }, today).value?.intervalWeeks).toBe(4)
})
it('AC101: weekly 저장은 정기배송에만 유효하고 예전 매월 기록은 그대로다', () => {
  const saved = (items: unknown[]) => parseSubscriptions(JSON.stringify({ schemaVersion: 1, items }))
  expect(saved([weekly]).ok).toBe(true)
  expect(saved([{ ...weekly, kind: 'phone' }]).ok).toBe(false)
  expect(saved([{ ...weekly, billingDay: 5 }]).ok).toBe(false)
  expect(saved([{ ...weekly, intervalWeeks: 13 }]).ok).toBe(false)
  expect(saved([{ ...monthly, intervalWeeks: 4 }]).ok).toBe(false)
  expect(createSubscription({ name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null }, today, 'new')).not.toHaveProperty('intervalWeeks')
})
