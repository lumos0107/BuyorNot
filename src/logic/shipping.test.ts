import { describe, expect, it } from 'vitest'
import { compareFreeShipping, validateShippingInput, type ShippingInput } from './shipping'

// PRD F13 무료배송 채우기 비교 / AC26
const input = (price: number, shipping: number, threshold: number, add: number): ShippingInput => ({
  price,
  shipping,
  threshold,
  add,
})

describe('무료배송 채우기 계산 (F13)', () => {
  it('AC26: 27,000원 + 배송비 3,000원, 기준 30,000원, 8,000원 추가 → 30,000원에서 35,000원, 배송비 3,000원 감소', () => {
    const r = compareFreeShipping(input(27000, 3000, 30000, 8000))
    expect(r.current).toBe(30000)
    expect(r.after).toBe(35000)
    expect(r.outcome).toBe('reaches-free')
    expect(r.shippingSaved).toBe(3000)
    expect(r.diff).toBe(5000)
  })

  it('AC26: 2,000원만 추가하면 아직 미달이라 기준까지 1,000원 더 필요하다', () => {
    const r = compareFreeShipping(input(27000, 3000, 30000, 2000))
    expect(r.outcome).toBe('still-short')
    expect(r.shortfall).toBe(1000)
    expect(r.after).toBe(32000)
    expect(r.diff).toBe(2000)
  })

  it('AC26: 상품 금액이 기준 이상이거나 같으면 이미 무료배송이다', () => {
    expect(compareFreeShipping(input(31000, 3000, 30000, 8000)).outcome).toBe('already-free')
    const same = compareFreeShipping(input(30000, 3000, 30000, 8000))
    expect(same.outcome).toBe('already-free')
    expect(same.current).toBe(30000)
  })

  it('AC26: 추가 0원이면 현재와 같은 결과다', () => {
    const r = compareFreeShipping(input(27000, 3000, 30000, 0))
    expect(r.outcome).toBe('still-short')
    expect(r.shortfall).toBe(3000)
    expect(r.after).toBe(r.current)
    expect(r.diff).toBe(0)
  })

  it('AC26: 배송비가 0원이면 추가해도 달라지지 않는다고 판정한다', () => {
    const r = compareFreeShipping(input(27000, 0, 30000, 8000))
    expect(r.outcome).toBe('no-shipping')
    expect(r.current).toBe(27000)
  })

  it('AC26: 추가 금액이 배송비와 같으면 총지출이 같다', () => {
    const r = compareFreeShipping(input(27000, 3000, 30000, 3000))
    expect(r.outcome).toBe('reaches-free')
    expect(r.current).toBe(30000)
    expect(r.after).toBe(30000)
    expect(r.diff).toBe(0)
  })

  it('최대 입력값의 합계도 정확하다', () => {
    const r = compareFreeShipping(input(999_999_999, 1_000_000_000, 1_000_000_000, 1_000_000_000))
    expect(r.outcome).toBe('reaches-free')
    expect(r.current).toBe(1_999_999_999)
    expect(r.after).toBe(1_999_999_999)
  })
})

describe('무료배송 입력 검증', () => {
  const raw = { price: '27,000', shipping: '3,000', threshold: '30,000', add: '8,000' }

  it('정상 입력을 숫자로 바꾼다', () => {
    expect(validateShippingInput(raw)).toEqual({ value: input(27000, 3000, 30000, 8000), errors: {} })
  })

  it('상품 금액·기준은 1원 이상, 배송비·추가는 0원 이상, 모두 10억 원 이하 정수다', () => {
    expect(validateShippingInput({ ...raw, price: '0' }).errors.price).toBeTruthy()
    expect(validateShippingInput({ ...raw, threshold: '0' }).errors.threshold).toBeTruthy()
    expect(validateShippingInput({ ...raw, shipping: '0' }).errors.shipping).toBeUndefined()
    expect(validateShippingInput({ ...raw, add: '0' }).errors.add).toBeUndefined()
    expect(validateShippingInput({ ...raw, add: '-1' }).errors.add).toBeTruthy()
    expect(validateShippingInput({ ...raw, shipping: '1000000001' }).errors.shipping).toBeTruthy()
    expect(validateShippingInput({ ...raw, price: '12.5' }).errors.price).toBeTruthy()
  })

  it('빈 값은 오류다', () => {
    const { value, errors } = validateShippingInput({ price: '', shipping: '', threshold: '', add: '' })
    expect(value).toBeUndefined()
    expect(Object.keys(errors).sort()).toEqual(['add', 'price', 'shipping', 'threshold'])
  })
})
