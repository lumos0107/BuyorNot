import { MAX_WON, parseInteger, withJosa } from './number'

// PRD F13 무료배송 채우기 비교
// 현재 총지출 = 상품 금액 + (상품 금액 ≥ 기준이면 0, 아니면 배송비)
// 추가 후 총지출 = (상품 + 추가) + (그 합이 기준 이상이면 0, 아니면 배송비)
// 추가 상품이 꼭 필요한 물건인지는 사용자가 판단한다.

export type ShippingInput = {
  price: number
  shipping: number
  threshold: number
  add: number
}

export type ShippingOutcome =
  /** 배송비가 0원이라 추가해도 달라지지 않음 */
  | 'no-shipping'
  /** 지금 금액이 이미 기준 이상 */
  | 'already-free'
  /** 추가하면 기준에 닿아 배송비가 사라짐 */
  | 'reaches-free'
  /** 추가해도 기준에 못 미침 */
  | 'still-short'

export type ShippingResult = {
  current: number
  after: number
  /** 추가 후 − 현재 (음수면 줄어듦) */
  diff: number
  outcome: ShippingOutcome
  /** reaches-free일 때 사라지는 배송비 */
  shippingSaved?: number
  /** still-short일 때 기준까지 모자란 금액 */
  shortfall?: number
}

const total = (amount: number, shipping: number, threshold: number) => amount + (amount >= threshold ? 0 : shipping)

export function compareFreeShipping(input: ShippingInput): ShippingResult {
  const { price, shipping, threshold, add } = input
  const current = total(price, shipping, threshold)

  // 이미 기준 이상이면 배송비와 상관없이 "이미 무료배송"이 먼저다
  if (price >= threshold) return { current, after: current, diff: 0, outcome: 'already-free' }
  if (shipping === 0) return { current, after: current + add, diff: add, outcome: 'no-shipping' }

  const sum = price + add
  const after = total(sum, shipping, threshold)
  const diff = after - current
  if (sum >= threshold) return { current, after, diff, outcome: 'reaches-free', shippingSaved: shipping }
  return { current, after, diff, outcome: 'still-short', shortfall: threshold - sum }
}

export type ShippingRawInput = { price: string; shipping: string; threshold: string; add: string }
export type ShippingField = keyof ShippingRawInput
export type ShippingFieldErrors = Partial<Record<ShippingField, string>>

const FIELD_NAME: Record<ShippingField, string> = {
  price: '현재 상품 금액',
  shipping: '배송비',
  threshold: '무료배송 기준 금액',
  add: '추가할 상품 금액',
}
// 상품 금액·기준은 1원부터, 배송비·추가 금액은 0원부터
const MIN: Record<ShippingField, number> = { price: 1, shipping: 0, threshold: 1, add: 0 }

export function validateShippingInput(raw: ShippingRawInput): { value?: ShippingInput; errors: ShippingFieldErrors } {
  const errors: ShippingFieldErrors = {}
  const value: Partial<ShippingInput> = {}
  for (const field of Object.keys(FIELD_NAME) as ShippingField[]) {
    const parsed = parseInteger(raw[field])
    const name = FIELD_NAME[field]
    if (parsed === null) errors[field] = `${withJosa(name, '을/를')} 숫자로 입력해 주세요`
    else if (parsed < MIN[field]) errors[field] = `${withJosa(name, '은/는')} ${MIN[field]}원 이상이어야 해요`
    else if (parsed > MAX_WON) errors[field] = `${withJosa(name, '은/는')} 10억 원 이하여야 해요`
    else value[field] = parsed
  }
  if (Object.keys(errors).length > 0) return { errors }
  return { value: value as ShippingInput, errors }
}
