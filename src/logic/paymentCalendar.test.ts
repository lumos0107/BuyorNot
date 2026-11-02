import { expect, it } from 'vitest'
import { paymentOccurrences, paymentTotal } from './paymentCalendar'
import type { Subscription } from './subscriptions'

const stamp = '2026-02-01T00:00:00.000Z'
const sub = (id: string, over: Partial<Subscription> = {}): Subscription => ({
  id, name: id, priceKrw: 10000, cycle: 'monthly', billingDay: 1, lastUsedDate: null,
  createdAt: stamp, updatedAt: stamp, ...over,
})

it('AC172: 30일 안의 월 두 건과 주마다 반복 결제를 각각 센다', () => {
  const monthly = sub('월 구독')
  const weekly = sub('정기배송', { kind: 'delivery', cycle: 'weekly', billingDay: undefined, renewalDate: '2026-02-01', intervalWeeks: 1, priceKrw: 4000 })
  const rows = paymentOccurrences([monthly, weekly], new Date(2026, 1, 1, 9))
  expect(rows.filter((row) => row.subscriptionId === '월 구독').map((row) => row.day)).toEqual(['2026-02-01', '2026-03-01'])
  expect(rows.filter((row) => row.subscriptionId === '정기배송').map((row) => row.day)).toEqual(['2026-02-01', '2026-02-08', '2026-02-15', '2026-02-22', '2026-03-01'])
  expect(paymentTotal(rows)).toBe(40000)
})

it('AC173: 오늘과 29일 뒤를 포함하고 30일 뒤는 뺀다', () => {
  const rows = paymentOccurrences([
    sub('오늘', { billingDay: 2 }),
    sub('끝', { billingDay: 1 }),
    sub('밖', { cycle: 'yearly', billingDay: undefined, renewalDate: '2026-12-02' }),
  ], new Date(2026, 10, 2, 9))
  expect(rows.map((row) => [row.subscriptionId, row.day])).toEqual([['오늘', '2026-11-02'], ['끝', '2026-12-01']])
})

it('AC174: 해지는 제외하고 무료 체험 끝나는 날을 첫 예정일로 둔다', () => {
  const rows = paymentOccurrences([
    sub('해지', { cancelledOn: '2026-11-01', billingDay: 3 }),
    sub('체험', { trialEndDate: '2026-11-05', billingDay: 15 }),
  ], new Date(2026, 10, 2, 9))
  expect(rows[0]).toMatchObject({ subscriptionId: '체험', day: '2026-11-05', priceKrw: 10000 })
  expect(rows.some((row) => row.subscriptionId === '해지')).toBe(false)
})

it('AC172: 매월 31일과 연 2월 29일은 없는 날을 그 달 말일에 맞춘다', () => {
  const monthly = sub('말일', { billingDay: 31 })
  const yearly = sub('윤일', { cycle: 'yearly', billingDay: undefined, renewalDate: '2024-02-29' })
  expect(paymentOccurrences([monthly, yearly], new Date(2027, 1, 1, 9)).map((row) => [row.subscriptionId, row.day])).toEqual([
    ['말일', '2027-02-28'],
    ['윤일', '2027-02-28'],
  ])
})
