import { MAX_WON, formatFixed, parseDecimal, parseInteger } from './number'

// PRD F05 묶음상품 가성비 비교
// 무게는 g, 부피는 mL로 환산해 100g·100mL당 가격을, 개수는 1개당 가격을 비교한다.
// 다른 종류의 단위끼리는 비교하지 않는다.

export type Unit = 'g' | 'kg' | 'mL' | 'L' | 'ea'
export type UnitKind = 'weight' | 'volume' | 'count'

export type BundleInput = {
  price: number
  unit: Unit
  /** 개당 용량(소수 셋째 자리까지). 개수 단위(ea)에서는 쓰지 않는다 */
  size: number
  count: number
}

export type BundleSide = {
  price: number
  unitPrice: number
  /** 화면에 보이는 단가 (소수 둘째 자리) */
  unitPriceLabel: string
  referenceLabel: '100g' | '100mL' | '1개'
  total: number
  totalLabel: string
}

export type BundleVerdict = {
  cheaper: 'A' | 'B' | 'tie'
  /** 실제 단가는 다르지만 화면의 소수 둘째 자리 표시가 같을 때 */
  displayTie: boolean
  /** 싼 쪽이 비싼 쪽보다 몇 % 싼지 (비싼 쪽 기준) */
  percent: number
  /** 총지출 차이 (항상 0 이상) */
  spendDiff: number
  /** 총지출이 더 큰 쪽. 단가가 싼 쪽이 총지출은 더 클 수 있어 단가 판정과 별개로 둔다 */
  spendMore: 'A' | 'B' | 'same'
}

export type BundleResult =
  | { ok: true; a: BundleSide; b: BundleSide; verdict: BundleVerdict }
  | { ok: false; reason: 'unit-kind-mismatch' }

export const UNIT_LABEL: Record<Unit, string> = { g: 'g', kg: 'kg', mL: 'mL', L: 'L', ea: '개' }
export const MAX_COUNT = 9999
export const MAX_SIZE = 10_000_000
const SIZE_SHAPE = /^\d+(\.\d{1,3})?$/

const UNIT_KIND: Record<Unit, UnitKind> = { g: 'weight', kg: 'weight', mL: 'volume', L: 'volume', ea: 'count' }
const TO_BASE: Record<Unit, number> = { g: 1, kg: 1000, mL: 1, L: 1000, ea: 1 }
const REFERENCE: Record<UnitKind, { amount: number; label: BundleSide['referenceLabel']; baseLabel: string }> = {
  weight: { amount: 100, label: '100g', baseLabel: 'g' },
  volume: { amount: 100, label: '100mL', baseLabel: 'mL' },
  count: { amount: 1, label: '1개', baseLabel: '개' },
}

export function unitKind(unit: Unit): UnitKind {
  return UNIT_KIND[unit]
}

// 총량을 기준 단위의 1/1000 정수(BigInt)로 계산한다. 용량은 소수 셋째 자리까지만 받으므로 ×1000은 정수가 되고,
// 허용 최대값(1,000만 kg × 9,999개)은 Number의 안전 정수 범위를 넘어 BigInt가 필요하다.
function totalMilli(input: BundleInput): bigint {
  if (unitKind(input.unit) === 'count') return BigInt(input.count) * 1000n
  const sizeMilli = BigInt(Math.round(input.size * 1000))
  return sizeMilli * BigInt(TO_BASE[input.unit]) * BigInt(input.count)
}

function side(input: BundleInput, milli: bigint): BundleSide {
  const ref = REFERENCE[unitKind(input.unit)]
  const total = Number(milli) / 1000
  const unitPrice = (input.price * ref.amount * 1000) / Number(milli)
  return {
    price: input.price,
    unitPrice,
    unitPriceLabel: formatFixed(unitPrice, 2),
    referenceLabel: ref.label,
    total,
    totalLabel: `${total.toLocaleString('ko-KR')}${ref.baseLabel}`,
  }
}

export function compareBundles(a: BundleInput, b: BundleInput): BundleResult {
  if (unitKind(a.unit) !== unitKind(b.unit)) return { ok: false, reason: 'unit-kind-mismatch' }

  const milliA = totalMilli(a)
  const milliB = totalMilli(b)
  const sideA = side(a, milliA)
  const sideB = side(b, milliB)

  // 단가 비교는 나눗셈 대신 정수 곱셈으로 한다: priceA/totalA < priceB/totalB ⇔ priceA·totalB < priceB·totalA
  const crossA = BigInt(a.price) * milliB
  const crossB = BigInt(b.price) * milliA
  const cheaper: BundleVerdict['cheaper'] = crossA === crossB ? 'tie' : crossA < crossB ? 'A' : 'B'

  const high = Math.max(sideA.unitPrice, sideB.unitPrice)
  const low = Math.min(sideA.unitPrice, sideB.unitPrice)
  const percent = cheaper === 'tie' || high === 0 ? 0 : ((high - low) / high) * 100

  return {
    ok: true,
    a: sideA,
    b: sideB,
    verdict: {
      cheaper,
      // 화면에 쓰는 포맷 함수의 결과로 판단해야 표시와 어긋나지 않는다
      displayTie: cheaper !== 'tie' && sideA.unitPriceLabel === sideB.unitPriceLabel,
      percent,
      spendDiff: Math.abs(a.price - b.price),
      spendMore: a.price === b.price ? 'same' : a.price > b.price ? 'A' : 'B',
    },
  }
}

export type BundleRawInput = { price: string; unit: Unit; size: string; count: string }
export type BundleFieldErrors = Partial<Record<'price' | 'size' | 'count', string>>

// AC12: 빈 값·음수·0인 수량·정수가 아닌 개수는 오류다. 가격은 0원을 허용한다.
// 개수는 9,999개, 용량은 1,000만(소수 셋째 자리까지) 이하로 제한해 계산이 깨지지 않게 한다.
export function validateBundleInput(raw: BundleRawInput): { value?: BundleInput; errors: BundleFieldErrors } {
  const errors: BundleFieldErrors = {}

  const price = parseInteger(raw.price)
  if (price === null) errors.price = '가격을 숫자로 입력해 주세요'
  else if (price < 0) errors.price = '가격은 0원 이상이어야 해요'
  else if (price > MAX_WON) errors.price = '가격은 10억 원 이하여야 해요'

  const count = parseInteger(raw.count)
  if (count === null) errors.count = '묶음 개수를 정수로 입력해 주세요'
  else if (count < 1) errors.count = '묶음 개수는 1개 이상이어야 해요'
  else if (count > MAX_COUNT) errors.count = `묶음 개수는 ${MAX_COUNT.toLocaleString('ko-KR')}개 이하여야 해요`

  let size = 1
  if (unitKind(raw.unit) !== 'count') {
    const cleaned = raw.size.replace(/[,\s]/g, '')
    const parsed = parseDecimal(raw.size)
    if (parsed === null) errors.size = '개당 용량을 숫자로 입력해 주세요'
    else if (parsed <= 0) errors.size = '개당 용량은 0보다 커야 해요'
    else if (!SIZE_SHAPE.test(cleaned)) errors.size = '개당 용량은 소수 셋째 자리까지 입력할 수 있어요'
    else if (parsed > MAX_SIZE) errors.size = '개당 용량은 1,000만 이하여야 해요'
    else size = parsed
  }

  if (Object.keys(errors).length > 0) return { errors }
  return { value: { price: price!, unit: raw.unit, size, count: count! }, errors }
}
