import { describe, expect, it } from 'vitest'
import {
  BASIS_MAX,
  PLACE_MAX,
  TIGHT_MM,
  checkFit,
  fitLines,
  fitSignal,
  fitSummary,
  formatCm,
  isFit,
  latestPlace,
  parseCm,
  setItemFit,
  validatePlace,
  type Dims,
  type Fit,
} from './fit'
import type { WishItem } from './wishlist'

// PRD F44 놓을 자리 확인 / AC64(계산) · AC65(입력 검사와 저장 형식 중 로직 부분)
// 치수는 mm 정수다(입력 cm × 10). 아래 숫자는 모두 mm이고, 주석의 cm는 AC64에 적힌 값이다.

const PLACE = '싱크대 옆 칸'
const SPACE: Dims = { w: 400, d: 300, h: 500 } // 40×30×50cm

const FITS_FIRST = '입력 치수상 싱크대 옆 칸에 들어가요.'
const TIGHT_FIRST =
  '입력 치수상 싱크대 옆 칸에 들어가지만 빠듯해요(한 축 이상에서 남는 곳이 2cm보다 적어요). 줄자로 다시 재 보세요.'
const NO_FIRST = '입력 치수상 싱크대 옆 칸에 안 들어가요.'
const ROTATED_NOTE = '방향 2는 물건을 바닥에서 90도 돌려 놓은 경우예요.'
const LAST_LINE = '입력한 치수만 비교했어요. 눕혀 놓는 경우와 문 여닫는 공간·손잡이·전선·환기 공간은 따로 확인해 주세요.'

const linesOf = (item: Dims, basis?: string, space: Dims = SPACE) => fitLines({ place: PLACE, space, item, basis })

describe('놓을 자리 계산 (F44, AC64)', () => {
  it('AC64: 32×25×47은 방향 1로 들어가고 방향 2는 안 들어가요', () => {
    const item: Dims = { w: 320, d: 250, h: 470 }
    expect(linesOf(item)).toEqual([
      FITS_FIRST,
      '방향 1: 가로 8cm 남음 · 깊이 5cm 남음 · 높이 3cm 남음 → 들어가요',
      '방향 2: 가로 15cm 남음 · 깊이 2cm 넘침 · 높이 3cm 남음 → 안 들어가요',
      ROTATED_NOTE,
      LAST_LINE,
    ])
    expect(checkFit(SPACE, item)).toEqual({
      verdict: 'fits',
      orientations: [
        { margins: { w: 80, d: 50, h: 30 }, verdict: 'fits' },
        { margins: { w: 150, d: -20, h: 30 }, verdict: 'no' },
      ],
    })
  })

  it('AC64: 32×25×49는 높이가 1cm만 남아 빠듯해요', () => {
    const item: Dims = { w: 320, d: 250, h: 490 }
    const lines = linesOf(item)
    expect(lines[0]).toBe(TIGHT_FIRST)
    expect(lines[1]).toBe('방향 1: 가로 8cm 남음 · 깊이 5cm 남음 · 높이 1cm 남음 → 빠듯해요')
    // 계산: 방향 2는 가로 400−250=150, 깊이 300−320=−20, 높이 500−490=10
    expect(lines[2]).toBe('방향 2: 가로 15cm 남음 · 깊이 2cm 넘침 · 높이 1cm 남음 → 안 들어가요')
    expect(lines.slice(3)).toEqual([ROTATED_NOTE, LAST_LINE])
    const result = checkFit(SPACE, item)
    expect(result.verdict).toBe('tight')
    expect(result.orientations.map((o) => o.verdict)).toEqual(['tight', 'no'])
    expect(result.orientations[0]?.margins).toEqual({ w: 80, d: 50, h: 10 })
  })

  it('AC64: 38×22×40은 가로가 2cm 남아도 빠듯하지 않고 들어가요', () => {
    const item: Dims = { w: 380, d: 220, h: 400 }
    const lines = linesOf(item)
    expect(lines[0]).toBe(FITS_FIRST)
    expect(lines[1]).toBe('방향 1: 가로 2cm 남음 · 깊이 8cm 남음 · 높이 10cm 남음 → 들어가요')
    // 계산: 방향 2는 가로 400−220=180, 깊이 300−380=−80, 높이 500−400=100
    expect(lines[2]).toBe('방향 2: 가로 18cm 남음 · 깊이 8cm 넘침 · 높이 10cm 남음 → 안 들어가요')
    expect(lines.slice(3)).toEqual([ROTATED_NOTE, LAST_LINE])
    const result = checkFit(SPACE, item)
    expect(result.verdict).toBe('fits')
    expect(result.orientations[0]).toEqual({ margins: { w: 20, d: 80, h: 100 }, verdict: 'fits' })
  })

  it('AC64: 25×35×30은 방향 1은 안 들어가도 방향 2로 들어가요', () => {
    const item: Dims = { w: 250, d: 350, h: 300 }
    expect(linesOf(item)).toEqual([
      FITS_FIRST,
      '방향 1: 가로 15cm 남음 · 깊이 5cm 넘침 · 높이 20cm 남음 → 안 들어가요',
      '방향 2: 가로 5cm 남음 · 깊이 5cm 남음 · 높이 20cm 남음 → 들어가요',
      ROTATED_NOTE,
      LAST_LINE,
    ])
    expect(checkFit(SPACE, item)).toEqual({
      verdict: 'fits',
      orientations: [
        { margins: { w: 150, d: -50, h: 200 }, verdict: 'no' },
        { margins: { w: 50, d: 50, h: 200 }, verdict: 'fits' },
      ],
    })
  })

  it('AC64: 30×30×20은 가로와 깊이가 같아 방향 1만 보이고 깊이가 꼭 맞아 빠듯해요', () => {
    const item: Dims = { w: 300, d: 300, h: 200 }
    expect(linesOf(item)).toEqual([
      TIGHT_FIRST,
      '방향 1: 가로 10cm 남음 · 깊이 꼭 맞음 · 높이 30cm 남음 → 빠듯해요',
      LAST_LINE,
    ])
    expect(linesOf(item).join('\n')).not.toContain('방향 2')
    expect(checkFit(SPACE, item)).toEqual({
      verdict: 'tight',
      orientations: [{ margins: { w: 100, d: 0, h: 300 }, verdict: 'tight' }],
    })
  })

  it('AC64: 32×25×51은 높이가 1cm 넘쳐 두 방향 모두 안 들어가요', () => {
    const item: Dims = { w: 320, d: 250, h: 510 }
    expect(linesOf(item)).toEqual([
      NO_FIRST,
      '방향 1: 가로 8cm 남음 · 깊이 5cm 남음 · 높이 1cm 넘침 → 안 들어가요',
      // 계산: 방향 2는 가로 400−250=150, 깊이 300−320=−20, 높이 500−510=−10
      '방향 2: 가로 15cm 남음 · 깊이 2cm 넘침 · 높이 1cm 넘침 → 안 들어가요',
      ROTATED_NOTE,
      LAST_LINE,
    ])
    const result = checkFit(SPACE, item)
    expect(result.verdict).toBe('no')
    expect(result.orientations.map((o) => o.verdict)).toEqual(['no', 'no'])
  })

  it('AC64: 가로가 40.5cm 공간에 40.4cm 물건이면 0.1cm 남아 빠듯해요', () => {
    // 가정: AC64는 다른 축을 "넉넉"이라고만 적었다. 결과가 바뀌지 않게 깊이 20cm(공간 30cm), 높이 30cm(공간 50cm)로 둔다
    const space: Dims = { w: 405, d: 300, h: 500 }
    const item: Dims = { w: 404, d: 200, h: 300 }
    const lines = linesOf(item, undefined, space)
    expect(lines[0]).toBe(TIGHT_FIRST)
    expect(lines[1]).toBe('방향 1: 가로 0.1cm 남음 · 깊이 10cm 남음 · 높이 20cm 남음 → 빠듯해요')
    // 계산: 방향 2는 가로 405−200=205, 깊이 300−404=−104, 높이 500−300=200
    expect(lines[2]).toBe('방향 2: 가로 20.5cm 남음 · 깊이 10.4cm 넘침 · 높이 20cm 남음 → 안 들어가요')
    expect(checkFit(space, item).verdict).toBe('tight')
    expect(checkFit(space, item).orientations[0]?.margins).toEqual({ w: 1, d: 100, h: 200 })
  })

  it("AC64: 기준 '포장 치수'를 저장하면 첫 줄 끝에 (포장 치수 기준)이 붙어요", () => {
    const item: Dims = { w: 320, d: 250, h: 470 }
    const lines = linesOf(item, '포장 치수')
    expect(lines[0]).toBe('입력 치수상 싱크대 옆 칸에 들어가요. (포장 치수 기준)')
    expect(lines.slice(1)).toEqual(linesOf(item).slice(1))
  })

  it('기준이 있으면 빠듯해요·안 들어가요 첫 줄 끝에도 붙고 없으면 붙지 않아요', () => {
    expect(linesOf({ w: 320, d: 250, h: 490 }, '적힌 순서로 넣은 치수')[0]).toBe(`${TIGHT_FIRST} (적힌 순서로 넣은 치수 기준)`)
    expect(linesOf({ w: 320, d: 250, h: 510 }, '포장 치수')[0]).toBe(`${NO_FIRST} (포장 치수 기준)`)
    expect(linesOf({ w: 320, d: 250, h: 510 }, '')[0]).toBe(NO_FIRST)
  })

  it('AC64: 남는 길이가 빠듯함 기준과 같으면 들어가요, 1mm 모자라면 빠듯해요, 0이면 빠듯해요, 1mm 넘치면 안 들어가요', () => {
    // 가로 축만 바꾸고 나머지는 넉넉하게 둔다. 방향 2는 깊이 축이 모자라 늘 안 들어간다
    const widthMargin = (margin: number) => checkFit(SPACE, { w: SPACE.w - margin, d: 100, h: 100 })
    expect(widthMargin(TIGHT_MM).verdict).toBe('fits')
    expect(widthMargin(TIGHT_MM - 1).verdict).toBe('tight')
    expect(widthMargin(1).verdict).toBe('tight')
    expect(widthMargin(0).verdict).toBe('tight')
    expect(widthMargin(-1).verdict).toBe('no')
  })

  it('두 방향 중 나은 쪽을 결과로 한다: 들어가요 > 빠듯해요 > 안 들어가요', () => {
    // 방향 1 안 들어가요(깊이 −50), 방향 2 빠듯해요(높이 10) → 빠듯해요
    expect(checkFit(SPACE, { w: 250, d: 350, h: 490 }).verdict).toBe('tight')
    // 방향 1 빠듯해요(가로 10), 방향 2 들어가요(가로 200 · 깊이 110) → 들어가요
    const wide: Dims = { w: 400, d: 500, h: 500 }
    const result = checkFit(wide, { w: 390, d: 200, h: 300 })
    expect(result.orientations.map((o) => o.verdict)).toEqual(['tight', 'fits'])
    expect(result.verdict).toBe('fits')
  })

  it('물건 가로와 깊이가 같지 않으면 방향 2가 있고 같으면 없어요', () => {
    expect(checkFit(SPACE, { w: 100, d: 101, h: 100 }).orientations).toHaveLength(2)
    expect(checkFit(SPACE, { w: 100, d: 100, h: 100 }).orientations).toHaveLength(1)
  })
})

describe('cm 입력 검사 (F44, AC65)', () => {
  const NOT_CM = 'cm로 적어 주세요(예: 40 또는 40.5)'
  const ONE_DECIMAL = '소수 첫째 자리까지 적어 주세요'
  const OUT_OF_RANGE = '0.1~1000cm 사이로 적어 주세요'

  it("AC65: 빈 칸과 '40cm'는 cm로 적어 달라는 오류예요", () => {
    expect(parseCm('')).toEqual({ error: NOT_CM })
    expect(parseCm('   ')).toEqual({ error: NOT_CM })
    expect(parseCm('40cm')).toEqual({ error: NOT_CM })
  })

  it("AC65: '40.25'는 소수 첫째 자리까지 적어 달라는 오류예요", () => {
    expect(parseCm('40.25')).toEqual({ error: ONE_DECIMAL })
  })

  it("AC65: '0'과 '1000.1'은 0.1~1000cm 사이로 적어 달라는 오류예요", () => {
    expect(parseCm('0')).toEqual({ error: OUT_OF_RANGE })
    expect(parseCm('0.0')).toEqual({ error: OUT_OF_RANGE })
    expect(parseCm('1000.1')).toEqual({ error: OUT_OF_RANGE })
  })

  it("AC65: 경계인 '1000'은 10000mm, '0.1'은 1mm로 받아요", () => {
    expect(parseCm('1000')).toEqual({ mm: 10000 })
    expect(parseCm('1000.0')).toEqual({ mm: 10000 })
    expect(parseCm('0.1')).toEqual({ mm: 1 })
  })

  // plan: parseCm trims spaces, accepts .5 and rejects a comma or full-width digits
  it('앞뒤 공백을 지우고 .5는 받으며 쉼표와 전각 숫자는 거절해요', () => {
    expect(parseCm(' 40.5 ')).toEqual({ mm: 405 })
    expect(parseCm('.5')).toEqual({ mm: 5 })
    expect(parseCm('40,5')).toEqual({ error: NOT_CM })
    expect(parseCm('４０')).toEqual({ error: NOT_CM })
  })

  it('mm는 정수부 × 10 + 소수 한 자리와 같은 정수예요', () => {
    // 소수 첫째 자리 값은 부동소수 곱셈도 정확히 떨어지므로(0.1~1000.0 전체 확인) 이 테스트로 구현 방식을 가르지는 못한다.
    // 정수 연산을 쓰는 것은 결정 사항이고, 여기서는 값이 mm 정수인지만 확인한다
    expect(parseCm('1.1')).toEqual({ mm: 11 })
    expect(parseCm('0.7')).toEqual({ mm: 7 })
    expect(parseCm('40.4')).toEqual({ mm: 404 })
    expect(parseCm('123.4')).toEqual({ mm: 1234 })
    expect(parseCm('40')).toEqual({ mm: 400 })
    expect(parseCm('007')).toEqual({ mm: 70 })
  })

  it('숫자와 소수점 한 개 말고는 모두 cm로 적어 달라는 오류예요', () => {
    for (const raw of ['.', '40.', '1.2.3', '-5', '+5', '1e3', '0x10', '1 000', '1_000', '4０', 'abc', '40mm', '40 cm', 'NaN', 'Infinity']) {
      expect(parseCm(raw), raw).toEqual({ error: NOT_CM })
    }
  })

  it('소수 둘째 자리 이상은 끝이 0이어도 소수 첫째 자리까지 적어 달라는 오류예요', () => {
    expect(parseCm('40.50')).toEqual({ error: ONE_DECIMAL })
    expect(parseCm('.25')).toEqual({ error: ONE_DECIMAL })
    expect(parseCm('0.001')).toEqual({ error: ONE_DECIMAL })
  })

  it('아주 큰 수도 범위 오류로 처리해요', () => {
    expect(parseCm('1001')).toEqual({ error: OUT_OF_RANGE })
    expect(parseCm('9'.repeat(400))).toEqual({ error: OUT_OF_RANGE })
  })
})

describe('놓을 곳 이름 검사 (F44, AC65)', () => {
  it('AC65: 21자 이름은 20자 이하로 적어 달라는 오류예요', () => {
    expect(validatePlace('가'.repeat(PLACE_MAX + 1))).toEqual({ error: '놓을 곳 이름은 20자 이하로 적어 주세요' })
  })

  it('빈 이름과 공백뿐인 이름은 적어 달라는 오류예요', () => {
    expect(validatePlace('')).toEqual({ error: '놓을 곳 이름을 적어 주세요' })
    expect(validatePlace('   ')).toEqual({ error: '놓을 곳 이름을 적어 주세요' })
  })

  it('앞뒤 공백을 지운 뒤 글자를 세고 20자까지 받아요', () => {
    expect(validatePlace(' 싱크대 옆 칸 ')).toEqual({ value: '싱크대 옆 칸' })
    expect(validatePlace(` ${'가'.repeat(PLACE_MAX)} `)).toEqual({ value: '가'.repeat(PLACE_MAX) })
  })
})

describe('cm 문자열 만들기 (F44)', () => {
  it('mm를 소수 첫째 자리 cm로 바꾸고 끝의 .0은 빼요', () => {
    expect(formatCm(80)).toBe('8')
    expect(formatCm(1)).toBe('0.1')
    expect(formatCm(471)).toBe('47.1')
    expect(formatCm(0)).toBe('0')
    expect(formatCm(5)).toBe('0.5')
    expect(formatCm(205)).toBe('20.5')
    expect(formatCm(100)).toBe('10')
    expect(formatCm(10000)).toBe('1000')
  })
})

describe('접힌 제목과 사기 전에 한 번 더 문장 (F44)', () => {
  const ok: Dims = { w: 320, d: 250, h: 470 }
  const snug: Dims = { w: 320, d: 250, h: 490 }
  const over: Dims = { w: 320, d: 250, h: 510 }
  const base = { place: PLACE, space: SPACE }

  it('접힌 제목에 쓸 요약은 마침표와 기준 없이 판정만 담아요', () => {
    expect(fitSummary({ ...base, item: ok })).toBe('입력 치수상 싱크대 옆 칸에 들어가요')
    expect(fitSummary({ ...base, item: snug })).toBe('입력 치수상 싱크대 옆 칸에 빠듯해요')
    expect(fitSummary({ ...base, item: over })).toBe('입력 치수상 싱크대 옆 칸에 안 들어가요')
  })

  it('안 들어가요와 빠듯해요는 사기 전에 한 번 더에 넘길 문장이 있어요', () => {
    expect(fitSignal({ ...base, item: over })).toBe("입력한 치수로는 '싱크대 옆 칸'에 안 들어가요")
    expect(fitSignal({ ...base, item: snug })).toBe("입력한 치수로는 '싱크대 옆 칸'에 빠듯해요")
  })

  it('기준이 있으면 문장 끝에 붙어요', () => {
    expect(fitSignal({ ...base, item: over, basis: '포장 치수' })).toBe("입력한 치수로는 '싱크대 옆 칸'에 안 들어가요 (포장 치수 기준)")
    expect(fitSignal({ ...base, item: snug, basis: '포장 치수' })).toBe("입력한 치수로는 '싱크대 옆 칸'에 빠듯해요 (포장 치수 기준)")
  })

  // plan: fitSignal returns null for fits
  it('들어가요면 사기 전에 한 번 더에 넘길 문장이 없어요', () => {
    expect(fitSignal({ ...base, item: ok })).toBeNull()
    expect(fitSignal({ ...base, item: ok, basis: '포장 치수' })).toBeNull()
  })
})

describe('저장 형식 검사 (F44, AC65)', () => {
  const valid = (): Fit => ({
    place: PLACE,
    space: { w: 400, d: 300, h: 500 },
    item: { w: 320, d: 250, h: 470 },
    savedAt: '2026-10-30T09:00:00.000Z',
  })

  it('올바른 기록은 받아요 (기준 있음·없음, 경계값)', () => {
    expect(isFit(valid())).toBe(true)
    expect(isFit({ ...valid(), basis: '포장 치수' })).toBe(true)
    expect(isFit({ ...valid(), basis: '가'.repeat(BASIS_MAX) })).toBe(true)
    expect(isFit({ ...valid(), place: '가'.repeat(PLACE_MAX) })).toBe(true)
    expect(isFit({ ...valid(), space: { w: 1, d: 1, h: 1 }, item: { w: 10000, d: 10000, h: 10000 } })).toBe(true)
  })

  it('AC65: fit.space.w가 0·10001·25.5면 손상이에요', () => {
    for (const w of [0, 10001, 25.5]) {
      expect(isFit({ ...valid(), space: { ...valid().space, w } }), String(w)).toBe(false)
    }
  })

  it('AC65: place가 빈 문자열이거나 21자면 손상이에요', () => {
    expect(isFit({ ...valid(), place: '' })).toBe(false)
    expect(isFit({ ...valid(), place: '가'.repeat(PLACE_MAX + 1) })).toBe(false)
  })

  it('place의 앞뒤에 공백이 있거나 문자열이 아니면 손상이에요', () => {
    expect(isFit({ ...valid(), place: ' 싱크대 옆 칸' })).toBe(false)
    expect(isFit({ ...valid(), place: '싱크대 옆 칸 ' })).toBe(false)
    expect(isFit({ ...valid(), place: 7 })).toBe(false)
  })

  it('AC65: basis가 31자면 손상이고 빈 문자열이나 문자열이 아니어도 손상이에요', () => {
    expect(isFit({ ...valid(), basis: '가'.repeat(BASIS_MAX + 1) })).toBe(false)
    expect(isFit({ ...valid(), basis: '' })).toBe(false)
    expect(isFit({ ...valid(), basis: 3 })).toBe(false)
    expect(isFit({ ...valid(), basis: null })).toBe(false)
  })

  it('savedAt이 없거나 시각이 아니면 손상이에요', () => {
    const { savedAt: _omitted, ...withoutSavedAt } = valid()
    expect(isFit(withoutSavedAt)).toBe(false)
    expect(isFit({ ...valid(), savedAt: '어제' })).toBe(false)
    expect(isFit({ ...valid(), savedAt: 1790000000000 })).toBe(false)
    expect(isFit({ ...valid(), savedAt: null })).toBe(false)
  })

  it('item의 치수도 같은 규칙으로 검사해요', () => {
    for (const bad of [0, 10001, 25.5, Number.NaN, Number.POSITIVE_INFINITY, '470', null]) {
      expect(isFit({ ...valid(), item: { ...valid().item, h: bad } }), String(bad)).toBe(false)
    }
    expect(isFit({ ...valid(), item: { w: 320, d: 250 } })).toBe(false)
    expect(isFit({ ...valid(), item: undefined })).toBe(false)
    expect(isFit({ ...valid(), space: null })).toBe(false)
    expect(isFit({ ...valid(), space: [400, 300, 500] })).toBe(false)
  })

  it('객체가 아니면 손상이에요', () => {
    for (const bad of [null, undefined, 'fit', 7, [], [valid()]]) {
      expect(isFit(bad)).toBe(false)
    }
  })
})

describe('물건에 저장하기와 최근 놓을 곳 (F44, AC65)', () => {
  const ITEM: Dims = { w: 320, d: 250, h: 470 }
  const fitAt = (savedAt: string, place = PLACE, space: Dims = SPACE): Fit => ({ place, space, item: ITEM, savedAt })
  const wish = (id: string, over: Partial<WishItem> = {}): WishItem => ({
    id,
    name: `물건 ${id}`,
    priceKrw: 10000,
    reason: '이유',
    url: null,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    reviewAt: '2026-10-23T00:00:00.000Z',
    status: 'considering',
    decidedAt: null,
    ...over,
  })
  const DESK: Dims = { w: 600, d: 500, h: 700 }
  const DOOR: Dims = { w: 800, d: 400, h: 1200 }

  // plan: latestPlace picks the latest savedAt and skips the item itself
  it('최근 놓을 곳은 이 물건을 빼고 저장 시각이 가장 늦은 물건의 놓을 곳이에요', () => {
    const items = [
      wish('a', { fit: fitAt('2026-10-28T09:00:00.000Z', '책상 아래', DESK) }),
      wish('b', { fit: fitAt('2026-10-30T09:00:00.000Z', PLACE, SPACE) }),
      wish('c'),
      wish('self', { fit: fitAt('2026-10-31T09:00:00.000Z', '현관', DOOR) }),
    ]
    expect(latestPlace(items, 'self')).toEqual({ place: PLACE, space: SPACE })
    expect(latestPlace(items, 'b')).toEqual({ place: '현관', space: DOOR })
    expect(latestPlace(items, 'c')).toEqual({ place: '현관', space: DOOR })
  })

  it('저장한 다른 물건이 없으면 최근 놓을 곳이 없어요', () => {
    expect(latestPlace([], 'a')).toBeNull()
    expect(latestPlace([wish('a', { fit: fitAt('2026-10-30T09:00:00.000Z') }), wish('b')], 'a')).toBeNull()
  })

  it('저장 시각은 표기가 아니라 실제 시각으로 비교해요', () => {
    // 2026-10-30T18:00+09:00 = 09:00Z라서 08:00Z보다 늦다
    const items = [
      wish('a', { fit: fitAt('2026-10-30T08:00:00.000Z', '책상 아래', DESK) }),
      wish('b', { fit: fitAt('2026-10-30T18:00:00+09:00', '현관', DOOR) }),
    ]
    expect(latestPlace(items, 'x')).toEqual({ place: '현관', space: DOOR })
  })

  it('결정한 물건에 저장한 놓을 곳도 가져와요', () => {
    // 가정: PRD는 "가장 최근에 저장한 다른 물건"이라고만 하므로 결정 여부로 거르지 않는다
    const decided = wish('a', { status: 'purchased', decidedAt: '2026-10-29T00:00:00.000Z', fit: fitAt('2026-10-28T09:00:00.000Z') })
    expect(latestPlace([decided, wish('b')], 'b')).toEqual({ place: PLACE, space: SPACE })
  })

  it('저장하면 fit을 넣고 수정 시각을 지금으로 바꾸며 다른 필드는 그대로예요', () => {
    const before = wish('a', { answers: { spaceTime: 'yes' }, desireStart: 3, desireStartDay: '2026-10-20' })
    const fit = fitAt('2026-10-30T09:00:00.000Z')
    const now = new Date('2026-10-30T09:00:00.000Z')
    expect(setItemFit(before, fit, now)).toEqual({ ...before, fit, updatedAt: now.toISOString() })
    expect(before.fit).toBeUndefined()
  })

  // plan: setItemFit(null) removes the field
  it('지우면 fit 필드가 없어지고 수정 시각은 지금, 다른 필드는 그대로예요', () => {
    const before = wish('a', { answers: { spaceTime: 'yes' }, fit: fitAt('2026-10-29T09:00:00.000Z') })
    const now = new Date('2026-10-30T09:00:00.000Z')
    const after = setItemFit(before, null, now)
    expect('fit' in after).toBe(false)
    const { fit: _removed, ...rest } = before
    expect(after).toEqual({ ...rest, updatedAt: now.toISOString() })
    expect(before.fit).toBeDefined()
  })
})
