import { describe, expect, it } from 'vitest'
import { compareBundles, formatSupply, supplyMonths, supplySentence, validateBundleInput, validateMonthlyUse, type BundleInput } from './bundle'

// PRD F05 묶음상품 가성비 비교, 검증 사례 AC10·AC11·AC12·AC17
const bundle = (price: number, unit: BundleInput['unit'], size: number, count: number): BundleInput => ({
  price,
  unit,
  size,
  count,
})

describe('묶음상품 단가 비교', () => {
  it('AC10: 900mL×2개 6,000원과 1.5L×1개 5,400원은 100mL당 333.33원과 360원이고 A가 7.4% 저렴하다', () => {
    const result = compareBundles(bundle(6000, 'mL', 900, 2), bundle(5400, 'L', 1.5, 1))
    if (!result.ok) throw new Error(result.reason)
    expect(result.a.referenceLabel).toBe('100mL')
    expect(result.a.unitPrice).toBeCloseTo(333.33, 2)
    expect(result.b.unitPrice).toBeCloseTo(360, 2)
    expect(result.verdict.cheaper).toBe('A')
    expect(result.verdict.percent).toBeCloseTo(7.4, 1)
    // 단가는 A가 낮지만 총지출은 A가 600원 더 크다
    expect(result.verdict.spendDiff).toBe(600)
    expect(result.verdict.spendMore).toBe('A')
  })

  it('AC11: 500g×2개 8,000원과 1kg×1개 8,000원은 100g당 800원으로 동률이다', () => {
    const result = compareBundles(bundle(8000, 'g', 500, 2), bundle(8000, 'kg', 1, 1))
    if (!result.ok) throw new Error(result.reason)
    expect(result.a.referenceLabel).toBe('100g')
    expect(result.a.unitPrice).toBe(800)
    expect(result.b.unitPrice).toBe(800)
    expect(result.verdict.cheaper).toBe('tie')
    expect(result.verdict.displayTie).toBe(false)
  })

  it('AC17: 12개 묶음 4,800원과 6개 묶음 2,500원은 1개당 400원과 416.67원이고 A가 4.0% 저렴하다', () => {
    // 개수 단위는 개당 무게·용량을 쓰지 않고 묶음 개수만 쓴다
    const result = compareBundles(bundle(4800, 'ea', 1, 12), bundle(2500, 'ea', 1, 6))
    if (!result.ok) throw new Error(result.reason)
    expect(result.a.referenceLabel).toBe('1개')
    expect(result.a.unitPrice).toBe(400)
    expect(result.b.unitPrice).toBeCloseTo(416.67, 2)
    expect(result.verdict.cheaper).toBe('A')
    expect(result.verdict.percent).toBeCloseTo(4.0, 1)
  })

  it('무게와 부피처럼 종류가 다른 단위는 비교하지 않는다', () => {
    const result = compareBundles(bundle(3000, 'g', 500, 1), bundle(3000, 'mL', 500, 1))
    expect(result).toEqual({ ok: false, reason: 'unit-kind-mismatch' })
  })

  it('표시 단가(소수 둘째 자리)는 같지만 실제 단가가 다르면 미세한 차이로 표시한다', () => {
    // A: 100g당 333.333…원, B: 100g당 333.3296…원 → 둘 다 333.33원으로 보이지만 B가 아주 조금 싸다
    const result = compareBundles(bundle(1000, 'g', 300, 1), bundle(3000, 'g', 900.01, 1))
    if (!result.ok) throw new Error(result.reason)
    expect(result.verdict.cheaper).toBe('B')
    expect(result.verdict.displayTie).toBe(true)
  })

  it('0원 상품은 허용하고 단가 0원으로 계산한다', () => {
    const result = compareBundles(bundle(0, 'mL', 500, 1), bundle(1000, 'mL', 500, 1))
    if (!result.ok) throw new Error(result.reason)
    expect(result.a.unitPrice).toBe(0)
    expect(result.verdict.cheaper).toBe('A')
    expect(result.verdict.percent).toBe(100)
  })

  it('총지출 차이는 비싼 쪽에서 싼 쪽을 뺀 양수이고, 같으면 0이다', () => {
    const same = compareBundles(bundle(5000, 'mL', 500, 2), bundle(5000, 'L', 1, 1))
    if (!same.ok) throw new Error(same.reason)
    expect(same.verdict.spendDiff).toBe(0)
    expect(same.verdict.spendMore).toBe('same')

    // 단가가 싼 쪽(B)이 총지출은 더 클 수 있다. 총지출 비교는 단가와 별개다
    const cross = compareBundles(bundle(1500, 'mL', 500, 1), bundle(2000, 'L', 1, 1))
    if (!cross.ok) throw new Error(cross.reason)
    expect(cross.verdict.cheaper).toBe('B')
    expect(cross.verdict.spendMore).toBe('B')
    expect(cross.verdict.spendDiff).toBe(500)
  })
})

describe('묶음상품 입력 검증 (AC12)', () => {
  it('정상 입력은 숫자로 바꿔 돌려준다', () => {
    const { value, errors } = validateBundleInput({ price: '6,000', unit: 'mL', size: '900', count: '2' })
    expect(errors).toEqual({})
    expect(value).toEqual(bundle(6000, 'mL', 900, 2))
  })

  it('개수 0은 오류다', () => {
    const { value, errors } = validateBundleInput({ price: '6000', unit: 'mL', size: '900', count: '0' })
    expect(value).toBeUndefined()
    expect(errors.count).toBeTruthy()
  })

  it('음수 가격과 빈 값은 오류다', () => {
    const negative = validateBundleInput({ price: '-100', unit: 'g', size: '500', count: '1' })
    expect(negative.errors.price).toBeTruthy()
    const empty = validateBundleInput({ price: '', unit: 'g', size: '', count: '' })
    expect(empty.value).toBeUndefined()
    expect(Object.keys(empty.errors).sort()).toEqual(['count', 'price', 'size'])
  })

  it('개수 단위에서는 개당 무게·용량이 비어 있어도 된다', () => {
    const { value, errors } = validateBundleInput({ price: '4800', unit: 'ea', size: '', count: '12' })
    expect(errors).toEqual({})
    expect(value?.count).toBe(12)
  })

  it('용량은 0보다 커야 하고 개수는 정수여야 한다', () => {
    expect(validateBundleInput({ price: '1000', unit: 'g', size: '0', count: '1' }).errors.size).toBeTruthy()
    expect(validateBundleInput({ price: '1000', unit: 'g', size: '100', count: '1.5' }).errors.count).toBeTruthy()
  })
})

// GPT 2·3단계 검토 반영: 큰 값·소수 자릿수 경계와 표시 동률 (PRD F05, AC12)
describe('묶음상품 입력 경계값', () => {
  const raw = { price: '1000', unit: 'g' as const, size: '100', count: '1' }

  it('개수는 9,999개 이하여야 하고, 아주 큰 수는 오류다 (Infinity로 계산이 깨지지 않게)', () => {
    expect(validateBundleInput({ ...raw, count: '9999' }).errors.count).toBeUndefined()
    expect(validateBundleInput({ ...raw, count: '10000' }).errors.count).toBeTruthy()
    expect(validateBundleInput({ ...raw, count: '1' + '0'.repeat(309) }).errors.count).toBeTruthy()
    expect(validateBundleInput({ ...raw, count: '-2' }).errors.count).toBeTruthy()
  })

  it('개당 무게·용량은 소수 셋째 자리까지, 1,000만 이하여야 한다', () => {
    expect(validateBundleInput({ ...raw, size: '1.001' }).errors.size).toBeUndefined()
    expect(validateBundleInput({ ...raw, size: '1.0004' }).errors.size).toBeTruthy()
    expect(validateBundleInput({ ...raw, size: '0.0004' }).errors.size).toBeTruthy()
    expect(validateBundleInput({ ...raw, size: '10000000' }).errors.size).toBeUndefined()
    expect(validateBundleInput({ ...raw, size: '10000001' }).errors.size).toBeTruthy()
    expect(validateBundleInput({ ...raw, size: '-5' }).errors.size).toBeTruthy()
  })

  it('가격 상한 10억 원은 허용하고 그 위는 오류다', () => {
    expect(validateBundleInput({ ...raw, price: '1000000000' }).errors.price).toBeUndefined()
    expect(validateBundleInput({ ...raw, price: '1000000001' }).errors.price).toBeTruthy()
  })

  it('허용 범위의 가장 큰 값끼리도 정확히 비교한다', () => {
    // 1,000만 kg × 9,999개 = 밀리그램 단위로 10^17을 넘지만 정수로 정확히 다뤄야 한다
    const big = bundle(1000000000, 'kg', 10000000, 9999)
    const bigger = bundle(1000000000, 'kg', 10000000, 9998)
    const result = compareBundles(big, bigger)
    if (!result.ok) throw new Error(result.reason)
    expect(result.verdict.cheaper).toBe('A')
    expect(Number.isFinite(result.a.unitPrice)).toBe(true)
  })

  it('용량 소수 셋째 자리 차이도 동률로 뭉개지 않는다', () => {
    const result = compareBundles(bundle(1000, 'g', 1.001, 1), bundle(1000, 'g', 1.002, 1))
    if (!result.ok) throw new Error(result.reason)
    expect(result.verdict.cheaper).toBe('B')
  })

  it('표시 동률은 화면에 보이는 소수 둘째 자리 문자열이 같은지로 판단한다', () => {
    const result = compareBundles(bundle(1000, 'g', 300, 1), bundle(3000, 'g', 900.01, 1))
    if (!result.ok) throw new Error(result.reason)
    expect(result.a.unitPriceLabel).toBe('333.33')
    expect(result.b.unitPriceLabel).toBe('333.33')
    expect(result.verdict.displayTie).toBe(true)
  })
})

// 2026-10-13 P3 필요한 양 기준 비교: 한 달에 쓰는 양(선택)으로 각 상품을 다 쓰는 데 걸리는 기간을 보여 준다.
// 남는 양처럼 알 수 없는 값은 계산하지 않는다
describe('한 달에 쓰는 양 (P3)', () => {
  it('비우면 값도 오류도 없다. 숫자·0보다 큼·소수 셋째 자리·상품과 같은 종류의 단위를 검사한다', () => {
    expect(validateMonthlyUse({ amount: '', unit: 'mL' }, 'mL')).toEqual({})
    expect(validateMonthlyUse({ amount: '  ', unit: 'mL' }, 'mL')).toEqual({})
    expect(validateMonthlyUse({ amount: '오백', unit: 'mL' }, 'mL').error).toBe('한 달에 쓰는 양을 숫자로 입력해 주세요')
    expect(validateMonthlyUse({ amount: '0', unit: 'mL' }, 'mL').error).toBe('한 달에 쓰는 양은 0보다 커야 해요')
    expect(validateMonthlyUse({ amount: '1.2345', unit: 'L' }, 'mL').error).toBe('한 달에 쓰는 양은 소수 셋째 자리까지 입력할 수 있어요')
    expect(validateMonthlyUse({ amount: '500', unit: 'g' }, 'mL').error).toBe('상품 A가 부피 단위라 한 달에 쓰는 양도 부피 단위(mL·L)로 골라 주세요')
    expect(validateMonthlyUse({ amount: '1,500', unit: 'L' }, 'mL')).toEqual({ value: { amount: 1500, unit: 'L' } })
    // 쉼표만 적은 것은 빈 칸이 아니라 숫자가 아니다 (GPT 31번)
    expect(validateMonthlyUse({ amount: ',', unit: 'mL' }, 'mL').error).toBe('한 달에 쓰는 양을 숫자로 입력해 주세요')
    expect(validateMonthlyUse({ amount: '10000001', unit: 'mL' }, 'mL').error).toBe('한 달에 쓰는 양은 1,000만 이하여야 해요')
  })

  it("개수 단위도 같은 방식이고, 아주 큰 총량을 아주 작은 사용량으로 나눠도 유한한 값이다 (GPT 31번)", () => {
    const ea = compareBundles(bundle(9000, 'ea', 1, 30), bundle(4000, 'ea', 1, 10))
    if (!ea.ok) throw new Error('비교 실패')
    expect(validateMonthlyUse({ amount: '4', unit: 'ea' }, 'ea')).toEqual({ value: { amount: 4, unit: 'ea' } })
    expect(supplySentence(supplyMonths(ea.a, { amount: 4, unit: 'ea' }), supplyMonths(ea.b, { amount: 4, unit: 'ea' }))).toBe(
      '입력한 사용량이면 상품 A는 약 7.5개월, 상품 B는 약 2.5개월 분량이에요.',
    )
    const huge = compareBundles(bundle(1, 'kg', 10_000_000, 9999), bundle(1, 'g', 1, 1))
    if (!huge.ok) throw new Error('비교 실패')
    const months = supplyMonths(huge.a, { amount: 0.001, unit: 'g' })
    expect(Number.isFinite(months)).toBe(true)
    expect(formatSupply(months)).toMatch(/^약 [\d.e+]+개월$/)
  })

  it('총량 ÷ 한 달에 쓰는 양(같은 기준 단위로 환산)', () => {
    const r = compareBundles(bundle(6000, 'mL', 900, 2), bundle(5400, 'L', 1.5, 1))
    if (!r.ok) throw new Error('비교 실패')
    expect(supplyMonths(r.a, { amount: 500, unit: 'mL' })).toBeCloseTo(3.6)
    expect(supplyMonths(r.b, { amount: 0.5, unit: 'L' })).toBeCloseTo(3)
    const g = compareBundles(bundle(9900, 'kg', 2, 1), bundle(9900, 'g', 500, 4))
    if (!g.ok) throw new Error('비교 실패')
    expect(supplyMonths(g.a, { amount: 0.5, unit: 'kg' })).toBeCloseTo(4)
  })

  it('1개월 이상은 소수 첫째 자리 개월(정수면 소수 없이), 1개월 미만은 30일 기준 일수(최소 1일)', () => {
    expect(formatSupply(3.6)).toBe('약 3.6개월')
    expect(formatSupply(3)).toBe('약 3개월')
    expect(formatSupply(2.96)).toBe('약 3개월')
    expect(formatSupply(0.6)).toBe('약 18일')
    expect(formatSupply(0.001)).toBe('약 1일')
  })

  it('두 상품을 한 문장으로 말한다', () => {
    expect(supplySentence(3.6, 3)).toBe('입력한 사용량이면 상품 A는 약 3.6개월, 상품 B는 약 3개월 분량이에요.')
  })
})
