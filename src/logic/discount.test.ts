import { describe, expect, it } from 'vitest'
import { calculateDiscount, compareDiscounts, validateDiscountInput, type DiscountInput } from './discount'

// PRD F04 할인 비교, 검증 사례 AC05~AC09, AC12, AC15, AC16
const base: DiscountInput = { price: 0, coupon: 'none', value: 0, minOrder: 0, maxDiscount: null, shipping: 0 }
const input = (over: Partial<DiscountInput>): DiscountInput => ({ ...base, ...over })

describe('할인 계산', () => {
  it('AC05: 80,000원에 15% 할인·상한 10,000원·배송비 3,000원이면 73,000원이다', () => {
    const side = calculateDiscount(input({ price: 80000, coupon: 'rate', value: 15, maxDiscount: 10000, shipping: 3000 }))
    expect(side.applied).toBe(true)
    expect(side.discount).toBe(10000)
    expect(side.total).toBe(73000)
    // 계산 근거에 기본 할인액과 상한 적용, 최종 결제액이 보인다
    const steps = side.steps.join(' ')
    expect(steps).toContain('12,000원')
    expect(steps).toContain('10,000원')
    expect(steps).toContain('73,000원')
  })

  it('AC06: 80,000원에 정액 8,000원·배송비 0원이면 72,000원이고 AC05보다 1,000원 낮다', () => {
    const a = calculateDiscount(input({ price: 80000, coupon: 'rate', value: 15, maxDiscount: 10000, shipping: 3000 }))
    const b = calculateDiscount(input({ price: 80000, coupon: 'amount', value: 8000 }))
    expect(b.total).toBe(72000)
    const result = compareDiscounts(a, b)
    expect(result.cheaper).toBe('B')
    expect(result.diff).toBe(1000)
  })

  it('AC07: 49,000원이 최소 주문 50,000원에 못 미치면 쿠폰 불가이고 결제액은 52,000원이다', () => {
    const side = calculateDiscount(input({ price: 49000, coupon: 'rate', value: 10, minOrder: 50000, shipping: 3000 }))
    expect(side.applied).toBe(false)
    expect(side.reason).toBe('below-min-order')
    expect(side.shortfall).toBe(1000)
    expect(side.discount).toBe(0)
    expect(side.total).toBe(52000)
  })

  it('상품 금액이 최소 주문액과 같으면 쿠폰이 적용된다 (경계값)', () => {
    const side = calculateDiscount(input({ price: 50000, coupon: 'amount', value: 5000, minOrder: 50000 }))
    expect(side.applied).toBe(true)
    expect(side.total).toBe(45000)
  })

  it('최소 주문액은 배송비를 뺀 상품 금액으로 판단한다', () => {
    // 상품 48,000 + 배송비 3,000 = 51,000이지만 상품 금액만 보므로 미달이다
    const side = calculateDiscount(input({ price: 48000, coupon: 'amount', value: 5000, minOrder: 50000, shipping: 3000 }))
    expect(side.applied).toBe(false)
  })

  it('AC08: 5,000원에 정액 8,000원 쿠폰·배송비 3,000원이면 할인 5,000원, 결제액 3,000원이다', () => {
    const side = calculateDiscount(input({ price: 5000, coupon: 'amount', value: 8000, shipping: 3000 }))
    expect(side.discount).toBe(5000)
    expect(side.total).toBe(3000)
  })

  it('AC09: 10,005원에 10%는 원 단위로 내려 할인 1,000원, 결제액 9,005원이다', () => {
    const side = calculateDiscount(input({ price: 10005, coupon: 'rate', value: 10 }))
    expect(side.discount).toBe(1000)
    expect(side.total).toBe(9005)
  })

  it('AC15: 부동소수점 오차 없이 9,900원×41%는 4,059원, 50,000원×0.29%는 145원이다', () => {
    expect(calculateDiscount(input({ price: 9900, coupon: 'rate', value: 41 })).discount).toBe(4059)
    expect(calculateDiscount(input({ price: 9900, coupon: 'rate', value: 41 })).total).toBe(5841)
    expect(calculateDiscount(input({ price: 50000, coupon: 'rate', value: 0.29 })).discount).toBe(145)
    expect(calculateDiscount(input({ price: 50000, coupon: 'rate', value: 0.29 })).total).toBe(49855)
  })

  it('AC16: 50,000원에 10%와 정액 5,000원은 둘 다 45,000원으로 동률이다', () => {
    const a = calculateDiscount(input({ price: 50000, coupon: 'rate', value: 10 }))
    const b = calculateDiscount(input({ price: 50000, coupon: 'amount', value: 5000 }))
    const result = compareDiscounts(a, b)
    expect(result.cheaper).toBe('tie')
    expect(result.diff).toBe(0)
  })

  it('최대 할인액이 0원이면 할인 상한이 0원이고, 비어 있으면 상한이 없다', () => {
    expect(calculateDiscount(input({ price: 80000, coupon: 'rate', value: 15, maxDiscount: 0 })).discount).toBe(0)
    expect(calculateDiscount(input({ price: 80000, coupon: 'rate', value: 15, maxDiscount: null })).discount).toBe(12000)
  })

  it('쿠폰이 없으면 할인 0원이고 결제액은 상품 금액 + 배송비다', () => {
    const side = calculateDiscount(input({ price: 30000, coupon: 'none', shipping: 2500 }))
    expect(side.applied).toBe(true)
    expect(side.discount).toBe(0)
    expect(side.total).toBe(32500)
  })

  it('정률 할인도 상품 금액을 넘지 않는다 (100%)', () => {
    const side = calculateDiscount(input({ price: 7000, coupon: 'rate', value: 100, shipping: 3000 }))
    expect(side.discount).toBe(7000)
    expect(side.total).toBe(3000)
  })
})

describe('할인 입력 검증 (AC12)', () => {
  const raw = {
    price: '80,000',
    coupon: 'rate' as const,
    value: '15',
    minOrder: '',
    maxDiscount: '10000',
    shipping: '3,000',
  }

  it('정상 입력을 숫자로 바꾸고, 빈 최소 주문액·배송비는 0원, 빈 최대 할인액은 상한 없음으로 본다', () => {
    const { value, errors } = validateDiscountInput({ ...raw, maxDiscount: '', shipping: '' })
    expect(errors).toEqual({})
    expect(value).toEqual({ price: 80000, coupon: 'rate', value: 15, minOrder: 0, maxDiscount: null, shipping: 0 })
  })

  it('할인율은 0~100 사이, 소수 둘째 자리까지만 받는다', () => {
    expect(validateDiscountInput({ ...raw, value: '120' }).errors.value).toBeTruthy()
    expect(validateDiscountInput({ ...raw, value: '7.555' }).errors.value).toBeTruthy()
    expect(validateDiscountInput({ ...raw, value: '7.55' }).errors.value).toBeUndefined()
  })

  it('빈 상품 금액, 음수 배송비, 빈 할인값은 오류다', () => {
    const { value, errors } = validateDiscountInput({ ...raw, price: '', value: '', shipping: '-1000' })
    expect(value).toBeUndefined()
    expect(Object.keys(errors).sort()).toEqual(['price', 'shipping', 'value'])
  })

  it('쿠폰이 없으면 할인값·최소 주문액·최대 할인액을 요구하지 않는다', () => {
    const { value, errors } = validateDiscountInput({ ...raw, coupon: 'none', value: '', maxDiscount: '' })
    expect(errors).toEqual({})
    expect(value?.coupon).toBe('none')
    expect(value?.value).toBe(0)
  })

  it('정액 할인값은 정수여야 한다', () => {
    expect(validateDiscountInput({ ...raw, coupon: 'amount', value: '8000.5' }).errors.value).toBeTruthy()
    expect(validateDiscountInput({ ...raw, coupon: 'amount', value: '8,000' }).value?.value).toBe(8000)
  })
})

// GPT 2·3단계 검토 반영: 경계값 (PRD F04)
describe('할인 경계값', () => {
  it('할인율 0%는 적용되지만 할인 0원이다', () => {
    const side = calculateDiscount(input({ price: 10000, coupon: 'rate', value: 0, shipping: 0 }))
    expect(side.applied).toBe(true)
    expect(side.discount).toBe(0)
    expect(side.total).toBe(10000)
    expect(validateDiscountInput({ price: '10000', coupon: 'rate', value: '0', minOrder: '', maxDiscount: '', shipping: '' }).errors).toEqual({})
  })

  it('상품 금액 0원은 허용하고, 10억 원은 허용하며 그 위는 오류다', () => {
    const zero = validateDiscountInput({ price: '0', coupon: 'none', value: '', minOrder: '', maxDiscount: '', shipping: '' })
    expect(zero.errors).toEqual({})
    expect(calculateDiscount(zero.value!).total).toBe(0)
    expect(validateDiscountInput({ price: '1,000,000,000', coupon: 'none', value: '', minOrder: '', maxDiscount: '', shipping: '' }).errors).toEqual({})
    expect(validateDiscountInput({ price: '1000000001', coupon: 'none', value: '', minOrder: '', maxDiscount: '', shipping: '' }).errors.price).toBeTruthy()
  })
})
