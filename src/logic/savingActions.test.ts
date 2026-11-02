import { expect, it } from 'vitest'
import { billingReviewLine, deliveryOverlapLine } from './savingActions'
import type { PantryItem } from './pantry'
import type { Subscription } from './subscriptions'

const stamp = '2026-11-02T00:00:00.000Z'
const today = new Date(2026, 10, 2, 9)
const item: PantryItem = { id: 'p', name: '휴지', kind: 'essential', level: 'plenty', purchases: [], createdAt: stamp, updatedAt: stamp }
const sub: Subscription = { id: 's', name: '휴지', kind: 'delivery', priceKrw: 10000, cycle: 'monthly', billingDay: 9, lastUsedDate: null, createdAt: stamp, updatedAt: stamp }

it('AC182: 넉넉한 생필품과 7일 뒤 같은 이름의 활성 정기배송을 연결한다', () => {
  expect(deliveryOverlapLine(item, [sub], today)).toBe('집에 넉넉해요. 2026-11-09 정기배송 결제 전에 계속 필요한지 확인해 보세요.')
})

it('AC183: 재고가 넉넉하지 않거나 이름이 다르거나 해지했으면 제외한다', () => {
  expect(deliveryOverlapLine({ ...item, level: 'out' }, [sub], today)).toBeNull()
  expect(deliveryOverlapLine(item, [{ ...sub, name: '휴지 30롤' }], today)).toBeNull()
  expect(deliveryOverlapLine(item, [{ ...sub, cancelledOn: '2026-11-01' }], today)).toBeNull()
  expect(deliveryOverlapLine({ ...item, kind: 'ingredient' }, [sub], today)).toBeNull()
  expect(deliveryOverlapLine(item, [{ ...sub, billingDay: 10 }], today)).toBeNull()
})

it('AC188·AC189: 7일 안 활성 구독은 사용 확인, 월세는 결제 확인만 보인다', () => {
  const subscription = { ...sub, kind: 'subscription' as const }
  expect(billingReviewLine(subscription, today)).toBe('결제 전에 최근 사용 기록을 확인해 보세요.')
  expect(billingReviewLine({ ...subscription, kind: 'membership' }, today)).toBe('결제 전에 최근 사용 기록을 확인해 보세요.')
  expect(billingReviewLine({ ...subscription, kind: 'housing' }, today)).toBe('예정된 결제일과 금액을 확인해 보세요.')
  expect(billingReviewLine({ ...subscription, billingDay: 10 }, today)).toBeNull()
  expect(billingReviewLine({ ...subscription, cancelledOn: '2026-11-01' }, today)).toBeNull()
})
