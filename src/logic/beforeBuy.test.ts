import { expect, it } from 'vitest'
import { ALTERNATIVE_LINKS, bulkUseLine, installmentLine, pantryDuplicateLine, usageCostLine, validateBulkUse, validateInstallment, validateUsesPerYear } from './beforeBuy'
import type { PantryItem } from './pantry'
import type { WishItem } from './wishlist'

const item: WishItem = { id: 'w1', name: '청소기', priceKrw: 300000, reason: '필요', url: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', reviewAt: '2026-11-04T00:00:00.000Z', status: 'considering', decidedAt: null }
it('AC133: 12개월에 월 30,000원이면 총 360,000원·일시불보다 60,000원 더다', () => {
  expect(installmentLine({ ...item, installment: { months: 12, monthlyKrw: 30000 } })).toBe('할부로 내면 총 360,000원 · 일시불보다 60,000원 더')
  expect(installmentLine({ ...item, installment: { months: 10, monthlyKrw: 30000 } })).toBe('할부로 내면 총 300,000원 · 일시불과 같아요')
})
it('AC134: 개월만 적으면 월 납입금 오류다', () => {
  expect(validateInstallment({ months: '12', monthly: '' }).errors.monthly).toBe('월 납입금을 적어 주세요.')
  expect(validateInstallment({ months: '1', monthly: '30000' }).errors.months).toBe('할부 개월은 2~36개월이어야 해요.')
})
it('AC135: 연 2번 쓰는 100,000원 물건은 한 번에 약 50,000원이다', () => {
  expect(usageCostLine({ ...item, priceKrw: 100000, usesPerYear: 2 })).toBe('한 번 쓸 때 약 50,000원')
  expect(usageCostLine({ ...item, usesPerYear: 3 })).toBeNull()
  expect(validateUsesPerYear('0').error).toBe('1년에 쓰는 횟수는 1~365 사이여야 해요.')
})
it('AC136: 대안 링크는 상품명과 기록을 보내지 않는다', () => {
  expect(ALTERNATIVE_LINKS).toHaveLength(2)
  for (const link of ALTERNATIVE_LINKS) {
    const url = new URL(link.href)
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  }
})
it('AC137·AC138: 집에 있는 것과 이름이 정확히 같을 때만 알려 준다', () => {
  const pantry: PantryItem[] = [{ id: 'p1', name: '세탁 세제', kind: 'essential', level: 'plenty', purchases: [], createdAt: item.createdAt, updatedAt: item.updatedAt }]
  expect(pantryDuplicateLine(' 세탁 세제 ', pantry)).toBe('집에 있는 것에 ‘세탁 세제’가 있어요 (넉넉)')
  expect(pantryDuplicateLine('세제', pantry)).toBeNull()
})
it('AC139·AC140: 대용량을 다 쓰는 달이 유통기한보다 길 때만 걸리는 점을 보인다', () => {
  expect(bulkUseLine({ ...item, bulkUse: { total: 10, monthlyUse: 1, expiresMonths: 6 } })).toEqual({ line: '다 쓰는 데 약 10개월 · 유통기한 6개월', warning: true })
  expect(bulkUseLine({ ...item, bulkUse: { total: 10, monthlyUse: 2, expiresMonths: 6 } })).toEqual({ line: '다 쓰는 데 약 5개월', warning: false })
})
it('AC140: 총량과 한 달 사용량은 함께 적고 소수 셋째 자리까지만 받는다', () => {
  expect(validateBulkUse({ total: '10', monthlyUse: '' }).errors.monthlyUse).toBe('한 달 사용량을 적어 주세요.')
  expect(validateBulkUse({ total: '10.0001', monthlyUse: '1' }).errors.total).toBe('총량은 0보다 크고 소수 셋째 자리까지 적어 주세요.')
})
