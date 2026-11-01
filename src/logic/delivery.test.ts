import { expect, it } from 'vitest'
import { compareDelivery, deliveryMemberLines, freeDeliveryLine, minimumOrderLine, validateDeliverySide, type DeliverySide } from './delivery'
import type { Subscription } from './subscriptions'

const a: DeliverySide = { name: 'A앱', menuKrw: 15000, deliveryKrw: 3000, couponKrw: 0, pickup: false }
const b: DeliverySide = { name: 'B앱', menuKrw: 19000, deliveryKrw: 3000, couponKrw: 0, pickup: true }
it('AC129: 메뉴·배달비·포장을 반영해 실제 총액을 비교한다', () => {
  expect(compareDelivery(a, b)).toMatchObject({ aTotal: 18000, bTotal: 19000, difference: 1000 })
})
it('AC129: 쿠폰이 메뉴 금액보다 크면 오류다', () => {
  expect(validateDeliverySide({ name: 'A앱', menu: '15000', delivery: '3000', coupon: '16000', pickup: false, minimum: '', freeDelivery: '' }).errors.coupon).toBe('쿠폰은 메뉴 금액 이하여야 해요.')
})
it('AC130: 최소 주문 금액 미달은 주문 불가로 표시한다', () => {
  expect(minimumOrderLine({ ...a, minimumOrderKrw: 18000 })).toBe('최소 주문까지 3,000원 부족해요. 이 금액으로는 주문할 수 없어요.')
  expect(minimumOrderLine({ ...a, minimumOrderKrw: 15000 })).toBeNull()
})
it('AC130: 무료배달 기준은 배달비와 더 담은 총액을 따로 보인다', () => {
  expect(freeDeliveryLine({ ...a, freeDeliveryKrw: 18000 })).toBe('배달비를 내면 총 18,000원 · 3,000원을 더 담으면 총 18,000원')
  expect(freeDeliveryLine({ ...a, minimumOrderKrw: 16000, freeDeliveryKrw: 18000 })).toBeNull()
})
it('AC129: 배달에 쓰는 멤버십은 맥락으로만 보여 준다', () => {
  const sub: Subscription = { id: 's1', name: '배민클럽', kind: 'membership', areas: ['delivery'], priceKrw: 3990, cycle: 'monthly', billingDay: 5, lastUsedDate: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }
  expect(deliveryMemberLines([sub])).toEqual(['배민클럽을 내고 있어요(월 3,990원)'])
})
