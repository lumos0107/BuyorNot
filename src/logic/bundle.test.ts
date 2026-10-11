import { describe, expect, it } from 'vitest'
import { compareBundles, validateBundleInput, type BundleInput } from './bundle'

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
    // 개수 단위는 개당 용량을 쓰지 않고 묶음 개수만 쓴다
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

  it('개수 단위에서는 개당 용량이 비어 있어도 된다', () => {
    const { value, errors } = validateBundleInput({ price: '4800', unit: 'ea', size: '', count: '12' })
    expect(errors).toEqual({})
    expect(value?.count).toBe(12)
  })

  it('용량은 0보다 커야 하고 개수는 정수여야 한다', () => {
    expect(validateBundleInput({ price: '1000', unit: 'g', size: '0', count: '1' }).errors.size).toBeTruthy()
    expect(validateBundleInput({ price: '1000', unit: 'g', size: '100', count: '1.5' }).errors.count).toBeTruthy()
  })
})
