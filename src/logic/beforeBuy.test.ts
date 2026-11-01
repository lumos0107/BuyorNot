import { expect, it } from 'vitest'
import { installmentLine, validateInstallment } from './beforeBuy'
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
