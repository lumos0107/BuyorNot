import { describe, expect, it } from 'vitest'
import { bundleDraft, discountDraft, userWrittenReason } from './draft'

// PRD F21 비교 결과를 고민 목록에 담기: 고른 쪽의 가격과 비교 내용을 담기 폼에 채운다
describe('담기 폼에 채울 내용 (F21)', () => {
  it('할인 비교: 결제액을 가격으로, 할인과 배송비 포함을 이유로', () => {
    expect(discountDraft('B안', { applied: true, baseDiscount: 8000, discount: 8000, total: 72000, steps: [] })).toEqual({
      price: 72000,
      reason: '가격 비교: B안 결제액 72,000원 (할인 8,000원 · 배송비 포함)',
    })
  })

  it('할인 비교: 쿠폰을 못 쓰면 그렇게 적는다', () => {
    expect(
      discountDraft('A안', { applied: false, reason: 'below-min-order', shortfall: 20000, baseDiscount: 0, discount: 0, total: 83000, steps: [] }),
    ).toEqual({ price: 83000, reason: '가격 비교: A안 결제액 83,000원 (쿠폰 적용 불가)' })
  })

  it('묶음 비교: 그 상품의 가격과 단가·총량을 이유로', () => {
    expect(
      bundleDraft('상품 A', { price: 6000, unitPrice: 333.33, unitPriceLabel: '333.33', referenceLabel: '100mL', total: 1800, totalLabel: '1,800mL' }),
    ).toEqual({ price: 6000, reason: '가격 비교: 상품 A 100mL당 333.33원 (총 1,800mL · 6,000원)' })
  })
})

// PRD F23: 가격 비교에서 가져온 문장은 사용자가 쓴 이유가 아니다 (할인 문구 검사에서 뺀다)
describe('사용자가 쓴 이유만 남기기 (F23)', () => {
  const discount = discountDraft('B안', { applied: true, baseDiscount: 8000, discount: 8000, total: 72000, steps: [] }).reason
  const noCoupon = discountDraft('A안', { applied: false, reason: 'below-min-order', shortfall: 20000, baseDiscount: 0, discount: 0, total: 83000, steps: [] }).reason
  const bundle = bundleDraft('상품 A', { price: 6000, unitPrice: 333.33, unitPriceLabel: '333.33', referenceLabel: '100mL', total: 1800, totalLabel: '1,800mL' }).reason

  it('담기 폼에 채운 비교 문장은 남기지 않는다', () => {
    for (const reason of [discount, noCoupon, bundle]) expect(userWrittenReason(reason).trim()).toBe('')
  })

  it('사용자가 앞뒤에 덧붙인 말은 남긴다', () => {
    expect(userWrittenReason(`세일 중이라 ${discount} 다시 봄`).replace(/\s+/g, ' ').trim()).toBe('세일 중이라 다시 봄')
  })

  it('문장을 고쳐 형식이 달라지면 사용자가 쓴 것으로 본다', () => {
    expect(userWrittenReason('가격 비교: B안 결제액 72,000원 할인')).toBe('가격 비교: B안 결제액 72,000원 할인')
  })
})
