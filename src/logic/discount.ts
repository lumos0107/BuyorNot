import { MAX_WON, formatWon, parseDecimal, parseInteger } from './number'

// PRD F04 할인 비교 계산 규칙
// 1. 최소 주문액은 배송비를 뺀, 쿠폰 적용 전 상품 금액으로 판단한다.
// 2. 상품 금액이 최소 주문액보다 작으면 쿠폰 적용 불가, 할인 0원.
// 3. 정률 할인액 = 상품 금액 × 할인율 ÷ 100, 원 미만 내림.
// 4. 최대 할인액이 비어 있으면 상한 없음, 0원이면 상한 0원.
// 5. 할인액은 상품 금액을 넘지 않는다. 정률은 최대 할인액도 넘지 않는다.
// 6. 결제액 = 상품 금액 − 할인액 + 배송비.

export type CouponKind = 'none' | 'rate' | 'amount'

export type DiscountInput = {
  price: number
  coupon: CouponKind
  /** 정률이면 % (소수 둘째 자리까지), 정액이면 원 */
  value: number
  minOrder: number
  /** null이면 상한 없음 */
  maxDiscount: number | null
  shipping: number
}

export type DiscountSide = {
  applied: boolean
  reason?: 'below-min-order'
  /** 최소 주문액까지 모자란 금액 */
  shortfall?: number
  /** 상한·상품 금액 제한을 적용하기 전 할인액 */
  baseDiscount: number
  discount: number
  total: number
  /** 계산 근거, 한 줄씩 */
  steps: string[]
}

export type DiscountComparison = { cheaper: 'A' | 'B' | 'tie'; diff: number }

function formatRate(rate: number): string {
  return `${rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`
}

export function calculateDiscount(input: DiscountInput): DiscountSide {
  const steps: string[] = []
  const result: DiscountSide = { applied: true, baseDiscount: 0, discount: 0, total: 0, steps }

  if (input.coupon === 'none') {
    steps.push('쿠폰 없음 → 할인 0원')
  } else if (input.price < input.minOrder) {
    result.applied = false
    result.reason = 'below-min-order'
    result.shortfall = input.minOrder - input.price
    steps.push(
      `상품 금액 ${formatWon(input.price)}이 최소 주문액 ${formatWon(input.minOrder)}보다 ${formatWon(result.shortfall)} 부족 → 쿠폰 적용 불가, 할인 0원`,
    )
  } else if (input.coupon === 'rate') {
    // 할인율을 0.01% 단위 정수로 바꿔 정수끼리 곱한 뒤 내린다. 부동소수점 오차로 1원이 틀어지는 것을 막기 위해서다. (AC15)
    const rate100 = Math.round(input.value * 100)
    result.baseDiscount = Math.floor((input.price * rate100) / 10000)
    result.discount = result.baseDiscount
    steps.push(`${formatWon(input.price)} × ${formatRate(input.value)} = ${formatWon(result.baseDiscount)} (원 미만 내림)`)
    if (input.maxDiscount !== null && result.discount > input.maxDiscount) {
      result.discount = input.maxDiscount
      steps.push(`최대 할인액 ${formatWon(input.maxDiscount)} 적용 → 할인 ${formatWon(result.discount)}`)
    }
    if (result.discount > input.price) {
      result.discount = input.price
      steps.push(`할인은 상품 금액을 넘지 않음 → 할인 ${formatWon(result.discount)}`)
    }
  } else {
    result.baseDiscount = input.value
    result.discount = Math.min(input.value, input.price)
    steps.push(
      result.discount < input.value
        ? `정액 할인 ${formatWon(input.value)} → 상품 금액을 넘지 않도록 할인 ${formatWon(result.discount)}`
        : `정액 할인 ${formatWon(input.value)}`,
    )
  }

  result.total = input.price - result.discount + input.shipping
  steps.push(
    `${formatWon(input.price)} − 할인 ${formatWon(result.discount)} + 배송비 ${formatWon(input.shipping)} = 결제액 ${formatWon(result.total)}`,
  )
  return result
}

export function compareDiscounts(a: DiscountSide, b: DiscountSide): DiscountComparison {
  if (a.total === b.total) return { cheaper: 'tie', diff: 0 }
  return { cheaper: a.total < b.total ? 'A' : 'B', diff: Math.abs(a.total - b.total) }
}

export type DiscountRawInput = {
  price: string
  coupon: CouponKind
  value: string
  minOrder: string
  maxDiscount: string
  shipping: string
}
export type DiscountField = Exclude<keyof DiscountRawInput, 'coupon'>
export type DiscountFieldErrors = Partial<Record<DiscountField, string>>

const RATE_SHAPE = /^\d+(\.\d{1,2})?$/

function wonField(raw: string, name: string, errors: DiscountFieldErrors, key: DiscountField): number | null {
  const parsed = parseInteger(raw)
  if (parsed === null) errors[key] = `${name}을 숫자로 입력해 주세요`
  else if (parsed < 0) errors[key] = `${name}은 0원 이상이어야 해요`
  else if (parsed > MAX_WON) errors[key] = `${name}은 10억 원 이하여야 해요`
  else return parsed
  return null
}

// AC12: 빈 필수 값·음수·범위 밖 할인율은 오류다. 비어 있는 최소 주문액·배송비는 0원, 비어 있는 최대 할인액은 상한 없음으로 본다.
export function validateDiscountInput(raw: DiscountRawInput): { value?: DiscountInput; errors: DiscountFieldErrors } {
  const errors: DiscountFieldErrors = {}

  const price = wonField(raw.price, '상품 금액', errors, 'price')
  const shipping = raw.shipping.trim() === '' ? 0 : wonField(raw.shipping, '배송비', errors, 'shipping')

  let value = 0
  let minOrder = 0
  let maxDiscount: number | null = null

  if (raw.coupon !== 'none') {
    minOrder = raw.minOrder.trim() === '' ? 0 : (wonField(raw.minOrder, '최소 주문액', errors, 'minOrder') ?? 0)

    if (raw.coupon === 'rate') {
      const cleaned = raw.value.replace(/[,\s]/g, '')
      const rate = parseDecimal(raw.value)
      if (rate === null) errors.value = '할인율을 숫자로 입력해 주세요'
      else if (rate < 0 || rate > 100) errors.value = '할인율은 0~100% 사이여야 해요'
      else if (!RATE_SHAPE.test(cleaned)) errors.value = '할인율은 소수 둘째 자리까지 입력할 수 있어요'
      else value = rate

      if (raw.maxDiscount.trim() !== '') maxDiscount = wonField(raw.maxDiscount, '최대 할인액', errors, 'maxDiscount')
    } else {
      const amount = parseInteger(raw.value)
      if (amount === null) errors.value = '할인액을 정수로 입력해 주세요'
      else if (amount < 0) errors.value = '할인액은 0원 이상이어야 해요'
      else if (amount > MAX_WON) errors.value = '할인액은 10억 원 이하여야 해요'
      else value = amount
    }
  }

  if (Object.keys(errors).length > 0) return { errors }
  return { value: { price: price!, coupon: raw.coupon, value, minOrder, maxDiscount, shipping: shipping! }, errors }
}
