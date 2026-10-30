import { describe, expect, it } from 'vitest'
import type { TagItem } from '../ai/types'
import { completeBundle, fillLine, tagToBundle, type BundleFill } from './bundleFill'

// PRD F32 두 상품 사진으로 묶음 비교 채우기, 검증 사례 AC55(칸 채우기·확인 상자 문장)·AC56(단가 가격표·모두 모름).
// 계획 Task 11의 영어 테스트 이름은 해당 it 위 `// plan:` 주석에 있다.
// 총괄 판정 R8(단위를 고른 뒤 "채울 값" 줄을 그 단위로 다시 만든다)·R9(단위를 개로 고르면 계산용 개수 1도 비운다)를 포함한다.
//
// PRD·계획에 값이 없어 정한 것(가정):
// - 가정: 상품명은 결과를 가르지 않는 '세탁 세제'. 가격은 AC55가 적은 곳(9900)만 PRD 값이고 나머지는 4500.
// - 가정: 계획의 "unit이 'ea'면 size ''"는 읽은 용량(size)이 있어도 비운다. 그래서 단위 개에서는 읽은 용량이 있어도
//   "size가 있으면 개수 1" 규칙이 적용되지 않는다(개수 칸은 읽은 개수 또는 모름).

const ITEM: TagItem = {
  name: '세탁 세제',
  brand: null,
  price: 4500,
  priceCondition: null,
  regularPrice: null,
  priceBasis: null,
  sizeText: null,
  size: null,
  unit: null,
  count: null,
  tagReadable: true,
}

// ok: true인 결과만 꺼낸다(아니면 시험이 실패한다)
function filled(item: TagItem): Extract<BundleFill, { ok: true }> {
  const result = tagToBundle(item)
  if (!result.ok) throw new Error(`채울 수 있는 상품이어야 해요: ${result.message}`)
  return result
}

describe('읽은 상품을 묶음 비교 칸 값으로 바꾼다 (AC55)', () => {
  it('AC55: 가격 9900·개당 2.5·L·1개·표기 2.5L이면 9900·L·2.5·1이고 확인 상자 두 줄을 만든다', () => {
    const result = filled({ ...ITEM, price: 9900, size: 2.5, unit: 'L', count: 1, sizeText: '2.5L' })

    expect(result.partial).toEqual({ price: '9900', size: '2.5', count: '1', unit: 'L', countAssumed: false })
    expect(result.read).toBe('AI가 읽은 내용: ‘세탁 세제’ · ‘2.5L’ · 사진과 같은지 확인해 주세요')
    expect(result.fill).toBe('채울 값: 가격 9,900원 · 2.5L × 1개')
  })

  it('AC55: 응답 4500·개당 1.5·g·50개·표기 75g(1.5g×50)이면 4500·g·1.5·50이다', () => {
    const result = filled({ ...ITEM, price: 4500, size: 1.5, unit: 'g', count: 50, sizeText: '75g(1.5g×50)' })

    expect(result.partial).toEqual({ price: '4500', size: '1.5', count: '50', unit: 'g', countAssumed: false })
    expect(result.read).toBe('AI가 읽은 내용: ‘세탁 세제’ · ‘75g(1.5g×50)’ · 사진과 같은지 확인해 주세요')
    expect(result.fill).toBe('채울 값: 가격 4,500원 · 1.5g × 50개')
  })

  it('AC55: 개수가 null이고 용량이 75g이면 개수 칸에 1을 넣고 확인 상자에 "× 1개(계산용 1묶음)"으로 적는다', () => {
    const result = filled({ ...ITEM, size: 75, unit: 'g', count: null, sizeText: '75g' })

    expect(result.partial).toEqual({ price: '4500', size: '75', count: '1', unit: 'g', countAssumed: true })
    expect(result.fill).toBe('채울 값: 가격 4,500원 · 75g × 1개(계산용 1묶음)')
    // 읽은 개수가 1개일 때와 구분된다(실제 개수를 알아낸 것처럼 보이지 않는다)
    expect(result.fill).not.toBe('채울 값: 가격 4,500원 · 75g × 1개')
  })

  it('AC55: 단위가 개(6개, 용량 없음)이면 개수 6이고 용량은 비우며 확인 상자는 "가격 4,500원 · 6개"다', () => {
    const result = filled({ ...ITEM, size: null, unit: 'ea', count: 6, sizeText: '6개입' })

    expect(result.partial).toEqual({ price: '4500', size: '', count: '6', unit: 'ea', countAssumed: false })
    expect(result.read).toBe('AI가 읽은 내용: ‘세탁 세제’ · ‘6개입’ · 사진과 같은지 확인해 주세요')
    expect(result.fill).toBe('채울 값: 가격 4,500원 · 6개')
  })

  it('AC55: 단위가 개이면 읽은 용량이 있어도 용량 칸은 비운다', () => {
    const result = filled({ ...ITEM, size: 30, unit: 'ea', count: 6 })

    expect(result.partial.size).toBe('')
    expect(result.partial.count).toBe('6')
    expect(result.fill).toBe('채울 값: 가격 4,500원 · 6개')
  })

  it('AC55: 단위가 개이고 개수를 모르면 개수 칸을 비우고 확인 상자에 "모름"으로 적는다', () => {
    const result = filled({ ...ITEM, size: null, unit: 'ea', count: null })

    expect(result.partial).toEqual({ price: '4500', size: '', count: '', unit: 'ea', countAssumed: false })
    expect(result.fill).toBe('채울 값: 가격 4,500원 · 모름')
  })

  it('AC55: 단위가 null이고 용량이 900이면 단위는 null로 두고 용량 900을 그대로 둔다. 확인 상자에 "(단위 모름)"을 적는다', () => {
    const result = filled({ ...ITEM, size: 900, unit: null, count: null, sizeText: '900' })

    expect(result.partial).toEqual({ price: '4500', size: '900', count: '1', unit: null, countAssumed: true })
    expect(result.fill).toBe('채울 값: 가격 4,500원 · 900(단위 모름) × 1개(계산용 1묶음)')
  })

  it('AC55: 단위가 null이어도 읽은 개수가 있으면 그 개수를 쓴다', () => {
    const result = filled({ ...ITEM, size: 900, unit: null, count: 2 })

    expect(result.partial).toEqual({ price: '4500', size: '900', count: '2', unit: null, countAssumed: false })
    expect(result.fill).toBe('채울 값: 가격 4,500원 · 900(단위 모름) × 2개')
  })

  it('AC55: 포장 표기가 없으면 확인 상자 첫 줄에 "포장 표기 없음"을 적는다', () => {
    const result = filled({ ...ITEM, price: 9900, size: 2.5, unit: 'L', count: 1, sizeText: null })

    expect(result.read).toBe('AI가 읽은 내용: ‘세탁 세제’ · 포장 표기 없음 · 사진과 같은지 확인해 주세요')
  })

  it('AC55: 포장 표기가 공백뿐이어도 "포장 표기 없음"이다', () => {
    const result = filled({ ...ITEM, price: 9900, size: 2.5, unit: 'L', count: 1, sizeText: '  ' })

    expect(result.read).toBe('AI가 읽은 내용: ‘세탁 세제’ · 포장 표기 없음 · 사진과 같은지 확인해 주세요')
  })

  it('AC77: 포장 표기가 있으면 상품명과 표기를 각각 따옴표로, 없으면 포장 표기 없음을 따옴표 밖에 두고 사진과 같은지 확인해 달라고 붙여요', () => {
    const withLabel = filled({ ...ITEM, price: 9900, size: 2.5, unit: 'L', count: 1, sizeText: '2.5L' })
    const withoutLabel = filled({ ...ITEM, price: 9900, size: 2.5, unit: 'L', count: 1, sizeText: null })

    expect(withLabel.read).toBe('AI가 읽은 내용: ‘세탁 세제’ · ‘2.5L’ · 사진과 같은지 확인해 주세요')
    expect(withoutLabel.read).toBe('AI가 읽은 내용: ‘세탁 세제’ · 포장 표기 없음 · 사진과 같은지 확인해 주세요')
    // "읽은 내용:"으로 시작하는 옛 첫 줄이 아니다
    expect(withLabel.read.startsWith('읽은 내용:')).toBe(false)
    // '포장 표기 없음'은 AI가 읽은 글이 아니라서 따옴표 안에 들어가지 않는다
    expect(withoutLabel.read).not.toContain('‘포장 표기 없음’')
  })
})

describe('단가 가격표와 모두 모르는 경우 (AC56)', () => {
  it('AC56: 단가 가격표(100g)는 채우지 않고 PRD 문장을 돌려준다', () => {
    const result = tagToBundle({ ...ITEM, price: 430, priceBasis: '100g', size: 100, unit: 'g', count: 1 })

    expect(result).toEqual({
      ok: false,
      message: 'AI가 이 가격을 100g당 가격으로 읽었어요. 묶음 전체 가격이 아니라서 채우지 않았어요. 사려는 묶음의 전체 가격과 용량·개수를 직접 입력해 주세요.',
    })
  })

  it('AC56: 단가 가격표는 가격이 읽혀도 총가격으로 추정하지 않는다(채울 값 없음)', () => {
    const result = tagToBundle({ ...ITEM, price: 430, priceBasis: '100g' })

    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('partial')
  })

  it('AC56: 단가 기준이 1kg이면 문장의 기준 자리에 읽은 값을 그대로 넣는다', () => {
    // PRD F32: 문장의 "100g" 자리는 읽은 값(priceBasis)이다
    const result = tagToBundle({ ...ITEM, priceBasis: '1kg' })

    expect(result).toEqual({
      ok: false,
      message: 'AI가 이 가격을 1kg당 가격으로 읽었어요. 묶음 전체 가격이 아니라서 채우지 않았어요. 사려는 묶음의 전체 가격과 용량·개수를 직접 입력해 주세요.',
    })
  })

  it('AC56: 가격·개수·용량이 모두 null이면 세 칸 모두 빈 문자열이고 단위는 null이다', () => {
    const result = filled({ ...ITEM, price: null, size: null, unit: null, count: null, sizeText: null })

    expect(result.partial).toEqual({ price: '', size: '', count: '', unit: null, countAssumed: false })
  })

  it('AC56: 가격·개수·용량이 모두 null이면 확인 상자는 모르는 값을 "모름"으로 적는다', () => {
    const result = filled({ ...ITEM, price: null, size: null, unit: null, count: null, sizeText: null })

    expect(result.read).toBe('AI가 읽은 내용: ‘세탁 세제’ · 포장 표기 없음 · 사진과 같은지 확인해 주세요')
    // R8: 용량도 모르면 "(단위 모름)"을 붙이지 않고 그냥 "모름"
    expect(result.fill).toBe('채울 값: 가격 모름 · 모름 × 모름')
  })

  it('AC56: 단위는 알고 용량·개수만 모르면 용량 자리와 개수 자리가 "모름"이다', () => {
    const result = filled({ ...ITEM, price: 9900, size: null, unit: 'L', count: null })

    expect(result.partial).toEqual({ price: '9900', size: '', count: '', unit: 'L', countAssumed: false })
    expect(result.fill).toBe('채울 값: 가격 9,900원 · 모름 × 모름')
  })
})

describe('확인 상자에서 단위를 고른 뒤 칸 값 만들기', () => {
  // plan: completeBundle clears size for ea
  it('단위를 개로 고르면 읽은 용량도, 계산용으로 넣은 개수 1도 비운다(실제 개수는 사용자가 적는다, R9)', () => {
    const partial = filled({ ...ITEM, size: 900, unit: null, count: null }).partial

    expect(completeBundle(partial, 'ea')).toEqual({ price: '4500', unit: 'ea', size: '', count: '' })
  })

  it('단위를 개로 골라도 읽은 개수는 그대로 둔다(용량만 비운다)', () => {
    const partial = filled({ ...ITEM, size: 900, unit: null, count: 2 }).partial

    expect(completeBundle(partial, 'ea')).toEqual({ price: '4500', unit: 'ea', size: '', count: '2' })
  })

  it('단위를 g로 고르면 읽은 용량 900과 가격, 계산용 개수 1을 그대로 칸 값으로 쓴다', () => {
    const partial = filled({ ...ITEM, size: 900, unit: null, count: null }).partial

    expect(completeBundle(partial, 'g')).toEqual({ price: '4500', unit: 'g', size: '900', count: '1' })
  })

  it('읽은 단위가 개인 상품은 읽은 개수 6을 그대로 쓴다', () => {
    const partial = filled({ ...ITEM, size: null, unit: 'ea', count: 6 }).partial

    expect(completeBundle(partial, 'ea')).toEqual({ price: '4500', unit: 'ea', size: '', count: '6' })
  })

  it('모두 모르는 상품에 단위를 골라도 가격·용량·개수 칸은 빈 문자열이다', () => {
    const partial = filled({ ...ITEM, price: null, size: null, unit: null, count: null }).partial

    expect(completeBundle(partial, 'mL')).toEqual({ price: '', unit: 'mL', size: '', count: '' })
    expect(completeBundle(partial, 'ea')).toEqual({ price: '', unit: 'ea', size: '', count: '' })
  })
})

// 총괄 판정 R8: 단위를 고르면 "채울 값" 줄을 그 단위를 읽은 것처럼 다시 만든다
describe('고른 단위로 "채울 값" 줄을 다시 만든다 (R8)', () => {
  const unitNull = () => filled({ ...ITEM, size: 900, unit: null, count: null }).partial

  it('단위를 아직 모르면(null) 읽은 줄 그대로 "900(단위 모름)"이다', () => {
    expect(fillLine(unitNull(), null)).toBe('채울 값: 가격 4,500원 · 900(단위 모름) × 1개(계산용 1묶음)')
    expect(fillLine(unitNull(), null)).toBe(filled({ ...ITEM, size: 900, unit: null, count: null }).fill)
  })

  it.each([
    ['g', '채울 값: 가격 4,500원 · 900g × 1개(계산용 1묶음)'],
    ['kg', '채울 값: 가격 4,500원 · 900kg × 1개(계산용 1묶음)'],
    ['mL', '채울 값: 가격 4,500원 · 900mL × 1개(계산용 1묶음)'],
    ['L', '채울 값: 가격 4,500원 · 900L × 1개(계산용 1묶음)'],
  ] as const)('단위 %s를 고르면 "(단위 모름)"이 없고 고른 단위가 붙는다', (unit, expected) => {
    expect(fillLine(unitNull(), unit)).toBe(expected)
  })

  it('단위 개를 고르면 용량 없이 개수만 적고, 계산용 1은 버리므로 개수는 "모름"이다', () => {
    expect(fillLine(unitNull(), 'ea')).toBe('채울 값: 가격 4,500원 · 모름')
  })

  it('단위 개를 고르면 읽은 개수는 "{개수}개"로 적는다', () => {
    const partial = filled({ ...ITEM, size: 900, unit: null, count: 2 }).partial

    expect(fillLine(partial, 'ea')).toBe('채울 값: 가격 4,500원 · 2개')
    expect(fillLine(partial, 'g')).toBe('채울 값: 가격 4,500원 · 900g × 2개')
  })

  it('용량도 모르면 단위를 모를 때는 그냥 "모름", 고른 뒤에도 용량 자리는 "모름"이다', () => {
    const partial = filled({ ...ITEM, price: 9900, size: null, unit: null, count: 3 }).partial

    expect(fillLine(partial, null)).toBe('채울 값: 가격 9,900원 · 모름 × 3개')
    expect(fillLine(partial, 'L')).toBe('채울 값: 가격 9,900원 · 모름 × 3개')
    expect(fillLine(partial, 'ea')).toBe('채울 값: 가격 9,900원 · 3개')
  })

  it('가격을 모르면 어느 단위든 가격 자리는 "모름"이다', () => {
    const partial = filled({ ...ITEM, price: null, size: 900, unit: null, count: null }).partial

    expect(fillLine(partial, 'g')).toBe('채울 값: 가격 모름 · 900g × 1개(계산용 1묶음)')
    expect(fillLine(partial, 'ea')).toBe('채울 값: 가격 모름 · 모름')
  })

  it('읽은 단위가 있는 상품의 fill은 그 단위로 만든 줄과 같다', () => {
    const result = filled({ ...ITEM, price: 9900, size: 2.5, unit: 'L', count: 1, sizeText: '2.5L' })

    expect(fillLine(result.partial, 'L')).toBe(result.fill)
    expect(fillLine(result.partial, 'L')).toBe('채울 값: 가격 9,900원 · 2.5L × 1개')
  })
})
