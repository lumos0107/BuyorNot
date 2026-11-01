import { expect, it } from 'vitest'
import { returnDeadlineLine, returnReviewLine } from './afterBuy'
import type { WishItem } from './wishlist'

const now = new Date(2026, 10, 1, 9)
const bought: WishItem = { id: 'w1', name: '전동 칫솔', priceKrw: 59000, reason: '고장', url: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), reviewAt: '2026-11-02T00:00:00.000Z', status: 'purchased', decidedAt: now.toISOString(), returnBy: '2026-11-15' }
it('AC143: 반품 기한 14일 전과 지난 날짜는 다르게 보인다', () => {
  expect(returnDeadlineLine(bought, now)).toBe('반품 기한 2026-11-15 · D-14')
  expect(returnDeadlineLine({ ...bought, returnBy: '2026-10-31' }, now)).toBe('반품 기한이 지났어요 (2026-10-31)')
})
it('AC143: 후회해요이고 기한이 남았을 때만 회고 안내가 있다', () => {
  expect(returnReviewLine({ ...bought, satisfaction: 'regret' }, now)).toBe('반품 기한이 14일 남았어요')
  expect(returnReviewLine({ ...bought, satisfaction: 'good' }, now)).toBeNull()
})
