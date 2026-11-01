import { expect, it } from 'vitest'
import { collectTodayActions } from './todayActions'
import type { Expiry } from './benefits'
import type { Subscription } from './subscriptions'
import type { WishItem } from './wishlist'

const now = new Date(2026, 10, 2, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const wish = (id: string, over: Partial<WishItem> = {}): WishItem => ({
  id, name: id, priceKrw: 10000, reason: '필요해서', url: null, createdAt: stamp, updatedAt: stamp,
  reviewAt: '2026-11-05T00:00:00.000Z', status: 'considering', decidedAt: null, ...over,
})
const sub = (id: string, day: number, over: Partial<Subscription> = {}): Subscription => ({
  id, name: id, priceKrw: 10000, cycle: 'monthly', billingDay: day, lastUsedDate: null,
  createdAt: stamp, updatedAt: stamp, ...over,
})
const expiry = (id: string, day: string): Expiry => ({ id, name: id, expiresOn: day })

it('AC163·AC164: 고민이 끝난 물건과 오늘·7일 안의 날짜만 집계한다', () => {
  const actions = collectTodayActions(
    [wish('끝', { reviewAt: '2026-11-02T00:00:00.000Z' }), wish('아직', { reviewAt: '2026-11-03T00:00:00.000Z' }), wish('반품오늘', { status: 'purchased', decidedAt: stamp, returnBy: '2026-11-02' }), wish('반품7', { status: 'purchased', decidedAt: stamp, returnBy: '2026-11-09' }), wish('반품8', { status: 'purchased', decidedAt: stamp, returnBy: '2026-11-10' })],
    [sub('결제오늘', 2), sub('결제7', 9), sub('결제8', 10)],
    [expiry('쿠폰오늘', '2026-11-02'), expiry('쿠폰7', '2026-11-09'), expiry('쿠폰8', '2026-11-10')], now,
  )
  expect(actions.ready.map((row) => row.id)).toEqual(['끝'])
  expect(actions.payments.map((row) => row.id)).toEqual(['결제오늘', '결제7'])
  expect(actions.returns.map((row) => row.id)).toEqual(['반품오늘', '반품7'])
  expect(actions.expiries.map((row) => row.id)).toEqual(['쿠폰오늘', '쿠폰7'])
})

it('AC165: 해지·반품 완료·지난 만료는 할 일에서 뺀다', () => {
  const actions = collectTodayActions(
    [wish('완료', { status: 'purchased', decidedAt: stamp, returnBy: '2026-11-03', returnedOn: '2026-11-02' })],
    [sub('해지', 3, { cancelledOn: '2026-11-01' })],
    [expiry('지난쿠폰', '2026-11-01')], now,
  )
  expect(actions.ready).toEqual([])
  expect(actions.payments).toEqual([])
  expect(actions.returns).toEqual([])
  expect(actions.expiries).toEqual([])
})

it('AC166: 첫 이동 대상은 날짜가 빠른 순·같은 날은 이름순이다', () => {
  const actions = collectTodayActions(
    [wish('나', { status: 'purchased', decidedAt: stamp, returnBy: '2026-11-04' }), wish('가', { status: 'purchased', decidedAt: stamp, returnBy: '2026-11-04' })],
    [sub('나', 4), sub('가', 4)],
    [expiry('나', '2026-11-04'), expiry('가', '2026-11-04')], now,
  )
  expect(actions.payments[0].name).toBe('가')
  expect(actions.returns[0].name).toBe('가')
  expect(actions.expiries[0].name).toBe('가')
})
