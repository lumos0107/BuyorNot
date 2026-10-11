import { describe, expect, it } from 'vitest'
import { validateDiscountInput } from './discount'
import { withJosa } from './number'
import { validateShippingInput } from './shipping'

// 오류 문구의 조사: 받침이 있으면 을/은, 없으면 를/는
describe('조사', () => {
  it('받침 유무에 따라 을/를, 은/는을 고른다', () => {
    expect(withJosa('배송비', '을/를')).toBe('배송비를')
    expect(withJosa('배송비', '은/는')).toBe('배송비는')
    expect(withJosa('상품 금액', '을/를')).toBe('상품 금액을')
    expect(withJosa('최소 주문액', '은/는')).toBe('최소 주문액은')
  })

  it('할인 비교와 무료배송의 배송비 오류 문구가 자연스럽다', () => {
    const base = { price: '1000', coupon: 'none' as const, value: '', minOrder: '', maxDiscount: '' }
    expect(validateDiscountInput({ ...base, shipping: 'abc' }).errors.shipping).toBe('배송비를 숫자로 입력해 주세요')
    expect(validateDiscountInput({ ...base, shipping: '-1' }).errors.shipping).toBe('배송비는 0원 이상이어야 해요')
    const ship = { price: '1', threshold: '1', add: '0' }
    expect(validateShippingInput({ ...ship, shipping: '-1' }).errors.shipping).toBe('배송비는 0원 이상이어야 해요')
    expect(validateShippingInput({ ...ship, shipping: '' }).errors.shipping).toBe('배송비를 숫자로 입력해 주세요')
  })
})
