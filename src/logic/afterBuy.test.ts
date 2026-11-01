import { expect, it } from 'vitest'
import { resaleLines, resaleTotal, returnDeadlineLine, returnReviewLine, validateResale } from './afterBuy'
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
it('AC146: 올린 날 뒤에 판 날·금액을 함께 적으면 두 줄로 보인다', () => {
  const item = { ...bought, satisfaction: 'regret' as const, resale: { listedOn: '2026-11-10', soldOn: '2026-11-20', soldKrw: 80000 } }
  expect(resaleLines(item)).toEqual(['2026-11-10에 올렸어요', '2026-11-20에 80,000원에 팔았다고 적었어요.'])
  expect(resaleTotal([item])).toEqual({ count: 1, amountKrw: 80000 })
})
it('AC146: 판 날·판 금액은 함께 있어야 하고 판 날은 올린 날 이후다', () => {
  expect(validateResale({ listedOn: '2026-11-10', soldOn: '2026-11-09', soldKrw: '80000' }).errors.soldOn).toBe('판 날은 올린 날과 같거나 그 뒤여야 해요.')
  expect(validateResale({ listedOn: '2026-11-10', soldOn: '2026-11-20', soldKrw: '' }).errors.soldKrw).toBe('판 금액을 적어 주세요.')
})
