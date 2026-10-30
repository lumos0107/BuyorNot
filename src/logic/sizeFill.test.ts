import { describe, expect, it } from 'vitest'
import type { SizeCandidate, SizeUnit } from '../ai/types'
import { BASIS_MAX, isFit, parseCm } from './fit'
import { candidateBasis, candidateToFields, candidateView, toCmText } from './sizeFill'

// PRD F44 2단계(AI 치수 읽기)의 확인 상자 문장·칸 값·기준과 검증 사례 AC67 중 문장·값으로 정해지는 경우.
// 화면 흐름(라디오·단위 선택·넣기·저장·늦은 응답)은 src/App.fitPhoto.test.tsx가 본다.
// 계획 Task 6의 영어 테스트 이름은 해당 it 위 `// plan:` 주석에 있다.
// 총괄 판정 R19(candidateView의 notice, 단위 mixed면 넣을 값·지울 칸·넣기 버튼 없음)와 Task 3 리뷰의 기준 30자 방어를 포함한다.
//
// PRD·계획에 값이 없어 정한 것(가정):
// - 가정: AC67이 적지 않은 축의 값은 결과를 가르지 않는 첫 사례 값(32·25·47cm, mm면 320·250·470)이다.
// - 가정: "AI가 읽은 내용: ‘{text}’ · 사진과 같은지 확인해 주세요"(label이 있으면 앞에 "{label} · ")의 '앞'은 문장 앞이다
//   → "접었을 때 · AI가 읽은 내용: ‘…’ · 사진과 같은지 확인해 주세요" (PRD v0.36 판정 R29-I1, 10/31에 "적힌 내용: ‘…’"에서 바꿈).
// - 가정: "넣을 값: 가로 {a} · 깊이 {b} · 높이 {c}cm"에서 높이를 모르면 F32의 "가격 모름"(R8 무렵 정한 방식)처럼 값과 단위를 함께
//   '모름'으로 바꿔 "높이 모름"이다("모름cm"이 되지 않게).
// - 가정: 지울 칸 이름이 둘 이상이면 F31·F33의 칸 이름 목록처럼 '·'로 잇는다.
// - 가정: 기준 label을 30자에 맞춰 자를 때 서로게이트 쌍(이모지 등)의 앞 반쪽만 남으면 그 반쪽도 뺀다(깨진 글자를 저장하지 않게, 30자 이하는 그대로).

const READ_TEXT = '제품 크기: 가로 32 x 깊이 25 x 높이 47cm'

// AC67 첫 사례: 표기 1개(product, labeled, 32·25·47, cm)
const BASE: SizeCandidate = {
  text: READ_TEXT,
  label: null,
  kind: 'product',
  axes: 'labeled',
  w: 32,
  d: 25,
  h: 47,
  unit: 'cm',
}
const candidate = (over: Partial<SizeCandidate> = {}): SizeCandidate => ({ ...BASE, ...over })
const EMPTY = { w: '', d: '', h: '' }
const FILLED = { w: '32', d: '25', h: '47' }

// ---------------------------------------------------------------- PRD 문장 (글자 그대로)
const CHOICE_LINE = 'AI가 읽은 내용: ‘제품 크기: 가로 32 x 깊이 25 x 높이 47cm’'
const READ_LINE = 'AI가 읽은 내용: ‘제품 크기: 가로 32 x 깊이 25 x 높이 47cm’ · 사진과 같은지 확인해 주세요'
const PRODUCT = '제품 치수예요.'
const PACKAGE = '포장 치수예요. 실제 쓰는 상태의 크기와 다를 수 있어요.'
const UNKNOWN_KIND = '제품 치수인지 포장 치수인지 적혀 있지 않아요. 확인해 주세요.'
const ORDER = '축이 분명하지 않아 적힌 순서대로 가로·깊이·높이에 넣어요. 맞는지 확인해 주세요.'
const MIXED = '축마다 단위가 달라 자동으로 넣지 않아요. 직접 입력해 주세요.'
const CHOOSE_UNIT = '단위를 고르면 넣을 값을 cm로 보여 드려요.'
const FILL_FIRST = '넣을 값: 가로 32 · 깊이 25 · 높이 47cm'

describe('읽은 값을 cm 칸 글자로 바꾼다 (F44 cm 환산, AC67)', () => {
  // plan: toCmText
  it('AC67: mm 470.5는 반올림한 471mm라 47.1, m 0.35는 35, cm 32는 32예요', () => {
    expect(toCmText(470.5, 'mm')).toBe('47.1')
    expect(toCmText(0.35, 'm')).toBe('35')
    expect(toCmText(32, 'cm')).toBe('32')
  })

  it('AC67: mm 20000은 10000mm를 넘어 빈 글자(모름)예요', () => {
    expect(toCmText(20000, 'mm')).toBe('')
  })

  it('값이나 단위가 null이면 빈 글자예요', () => {
    expect(toCmText(null, 'cm')).toBe('')
    expect(toCmText(32, null)).toBe('')
    expect(toCmText(null, null)).toBe('')
  })

  // plan: toCmText checks the range before rounding
  it('AC67: 범위는 반올림 전에 봐요 — mm 0.99와 10000.4는 빈 글자, mm 1은 0.1이에요', () => {
    // 반올림하면 0.99 → 1, 10000.4 → 10000이 되어 범위 안으로 들어가므로, 반올림 뒤에 보면 이 두 값이 통과한다
    expect(toCmText(0.99, 'mm')).toBe('')
    expect(toCmText(10000.4, 'mm')).toBe('')
    expect(toCmText(1, 'mm')).toBe('0.1')
    // 경계 그대로는 받는다: 10000mm = 1000cm, m 10 = 10000mm
    expect(toCmText(10000, 'mm')).toBe('1000')
    expect(toCmText(10, 'm')).toBe('1000')
  })

  it('0·음수·무한대는 빈 글자예요', () => {
    expect(toCmText(0, 'cm')).toBe('')
    expect(toCmText(-1, 'cm')).toBe('')
    expect(toCmText(Number.POSITIVE_INFINITY, 'mm')).toBe('')
    expect(toCmText(Number.NaN, 'mm')).toBe('')
  })

  it('빈 글자가 아니면 늘 직접 입력 검사(parseCm)를 통과하고, 그 mm는 반올림한 값이에요', () => {
    const units: SizeUnit[] = ['mm', 'cm', 'm']
    const factor: Record<SizeUnit, number> = { mm: 1, cm: 10, m: 1000 }
    const values = [0.5, 0.99, 1, 1.04, 1.05, 9.99, 12.34, 47.15, 99.95, 470.5, 999.96, 1000, 1000.04, 9999.5, 10000, 10000.4, 20000]
    for (const unit of units) {
      for (const value of values) {
        const text = toCmText(value, unit)
        const mm = value * factor[unit]
        if (mm < 1 || mm > 10000) {
          expect(text, `${value}${unit}`).toBe('')
          continue
        }
        expect(parseCm(text), `${value}${unit} → '${text}'`).toEqual({ mm: Math.round(mm) })
      }
    }
  })
})

describe('읽은 표기를 물건 세 칸 글자로 바꾼다 (F44 넣기, AC67)', () => {
  it('AC67: cm 32·25·47은 32·25·47이에요', () => {
    expect(candidateToFields(candidate(), 'cm')).toEqual(FILLED)
  })

  it('AC67: mm 320·250·470.5는 32·25·47.1이에요', () => {
    expect(candidateToFields(candidate({ unit: 'mm', w: 320, d: 250, h: 470.5 }), 'mm')).toEqual({ w: '32', d: '25', h: '47.1' })
  })

  it('AC67: m 0.35·0.2·1.2는 35·20·120이에요', () => {
    expect(candidateToFields(candidate({ unit: 'm', w: 0.35, d: 0.2, h: 1.2 }), 'm')).toEqual({ w: '35', d: '20', h: '120' })
  })

  it('AC67: 가로 20000mm는 가로 칸을 비워요(모름)', () => {
    expect(candidateToFields(candidate({ unit: 'mm', w: 20000, d: 250, h: 470 }), 'mm')).toEqual({ w: '', d: '25', h: '47' })
  })

  it('AC67: 가로 0.99mm·높이 10000.4mm는 가로·높이 칸을 비워요', () => {
    expect(candidateToFields(candidate({ unit: 'mm', w: 0.99, d: 250, h: 10000.4 }), 'mm')).toEqual({ w: '', d: '25', h: '' })
  })

  it('AC67: 높이 null이면 높이 칸을 비워요', () => {
    expect(candidateToFields(candidate({ h: null }), 'cm')).toEqual({ w: '32', d: '25', h: '' })
  })

  it('단위를 못 읽은 표기는 사용자가 고른 단위로 바꿔요', () => {
    const noUnit = candidate({ unit: null, w: 320, d: 250, h: 470 })
    expect(candidateToFields(noUnit, 'mm')).toEqual({ w: '32', d: '25', h: '47' })
    expect(candidateToFields(noUnit, 'cm')).toEqual({ w: '320', d: '250', h: '470' })
  })

  it('읽은 단위가 있으면 넘긴 단위보다 읽은 단위를 써요', () => {
    expect(candidateToFields(candidate(), 'mm')).toEqual(FILLED)
  })

  it('단위가 mixed인 표기는 어느 칸에도 값을 만들지 않아요(화면은 넣기를 보이지 않는다)', () => {
    expect(candidateToFields(candidate({ unit: 'mixed' }), 'cm')).toEqual(EMPTY)
  })
})

describe('확인 상자 문장 (F44 2단계, AC67)', () => {
  it('AC67: 표기 1개(제품·축 이름 분명·cm)는 AI가 읽은 내용·제품 치수·넣을 값 세 줄이고 버튼은 넣기예요', () => {
    expect(candidateView(candidate(), null, EMPTY)).toEqual({
      choice: CHOICE_LINE,
      read: READ_LINE,
      kind: PRODUCT,
      axes: null,
      fill: FILL_FIRST,
      clears: null,
      notice: null,
      applyLabel: '넣기',
    })
  })

  it("AC67: label이 있으면 AI가 읽은 내용 앞에 '접었을 때 · '를 붙여요", () => {
    expect(candidateView(candidate({ label: '접었을 때' }), null, EMPTY).read).toBe(`접었을 때 · ${READ_LINE}`)
    expect(candidateView(candidate({ label: '펼쳤을 때' }), null, EMPTY).read).toBe(`펼쳤을 때 · ${READ_LINE}`)
  })

  it('label이 빈 글자나 공백뿐이면 붙이지 않아요', () => {
    expect(candidateView(candidate({ label: '' }), null, EMPTY).read).toBe(READ_LINE)
    expect(candidateView(candidate({ label: '  ' }), null, EMPTY).read).toBe(READ_LINE)
  })

  it('AC71: 라디오 이름은 확인 요청 없이 label과 AI가 읽은 내용만이에요', () => {
    expect(candidateView(candidate(), null, EMPTY).choice).toBe(CHOICE_LINE)
    const folded = candidate({ label: '접었을 때', text: '접었을 때 30 x 20 x 10cm' })
    expect(candidateView(folded, null, EMPTY).choice).toBe('접었을 때 · AI가 읽은 내용: ‘접었을 때 30 x 20 x 10cm’')
  })

  it('AC71: 확인 상자 첫 줄은 AI가 읽은 내용 뒤에 사진과 같은지 확인해 달라고 붙여요', () => {
    const view = candidateView(candidate(), null, EMPTY)
    expect(view.read).toBe(READ_LINE)
    // "적힌 내용"으로 시작하는 줄은 어디에도 없다
    expect(Object.values(view).filter((line) => typeof line === 'string' && line.startsWith('적힌 내용'))).toEqual([])

    const folded = candidate({ label: '접었을 때', text: '접었을 때 30 x 20 x 10cm' })
    expect(candidateView(folded, null, EMPTY).read).toBe('접었을 때 · AI가 읽은 내용: ‘접었을 때 30 x 20 x 10cm’ · 사진과 같은지 확인해 주세요')
    // 단위가 mixed일 때도 첫 줄은 같다
    expect(candidateView(candidate({ unit: 'mixed' }), null, EMPTY).read).toBe(READ_LINE)
  })

  it('AC67: 축이 분명하지 않으면(order) 적힌 순서 문장을 보이고 버튼 이름이 적힌 순서대로 넣기예요', () => {
    const view = candidateView(candidate({ axes: 'order' }), null, EMPTY)
    expect(view.axes).toBe(ORDER)
    expect(view.applyLabel).toBe('적힌 순서대로 넣기')
    expect(view.fill).toBe(FILL_FIRST)
  })

  it('AC67: 포장 치수와 제품·포장 표기 없음은 각자의 문장이에요', () => {
    expect(candidateView(candidate({ kind: 'package' }), null, EMPTY).kind).toBe(PACKAGE)
    expect(candidateView(candidate({ kind: 'unknown' }), null, EMPTY).kind).toBe(UNKNOWN_KIND)
  })

  it('AC67: mm 320·250·470.5는 넣을 값이 가로 32 · 깊이 25 · 높이 47.1cm예요', () => {
    expect(candidateView(candidate({ unit: 'mm', w: 320, d: 250, h: 470.5 }), null, EMPTY).fill).toBe('넣을 값: 가로 32 · 깊이 25 · 높이 47.1cm')
  })

  it('AC67: m 0.35·0.2·1.2는 넣을 값이 가로 35 · 깊이 20 · 높이 120cm예요', () => {
    expect(candidateView(candidate({ unit: 'm', w: 0.35, d: 0.2, h: 1.2 }), null, EMPTY).fill).toBe('넣을 값: 가로 35 · 깊이 20 · 높이 120cm')
  })

  it("AC67: 가로 20000mm는 넣을 값에서 가로가 '모름'이에요", () => {
    expect(candidateView(candidate({ unit: 'mm', w: 20000, d: 250, h: 470 }), null, EMPTY).fill).toBe('넣을 값: 가로 모름 · 깊이 25 · 높이 47cm')
  })

  it("AC67: 가로 0.99mm·높이 10000.4mm는 가로·높이가 '모름'이에요", () => {
    expect(candidateView(candidate({ unit: 'mm', w: 0.99, d: 250, h: 10000.4 }), null, EMPTY).fill).toBe('넣을 값: 가로 모름 · 깊이 25 · 높이 모름')
  })

  it("AC67: 물건 칸이 채워진 상태에서 높이 null이면 '모름인 칸은 지금 값을 지워요: 높이'예요", () => {
    const view = candidateView(candidate({ h: null }), null, FILLED)
    expect(view.fill).toBe('넣을 값: 가로 32 · 깊이 25 · 높이 모름')
    expect(view.clears).toBe('모름인 칸은 지금 값을 지워요: 높이')
  })

  it('지울 칸은 지금 값이 있는 모름 칸만이고, 둘 이상이면 가로·높이 차례로 이어요', () => {
    const twoUnknown = candidate({ w: null, h: null })
    expect(candidateView(twoUnknown, null, FILLED).clears).toBe('모름인 칸은 지금 값을 지워요: 가로·높이')
    // 가로 칸은 비어 있어 지울 것이 없다
    expect(candidateView(twoUnknown, null, { w: '', d: '25', h: '47' }).clears).toBe('모름인 칸은 지금 값을 지워요: 높이')
    // 공백뿐인 칸은 빈 칸으로 본다
    expect(candidateView(twoUnknown, null, { w: ' ', d: '25', h: '' }).clears).toBeNull()
    // 모르는 값이 없으면 지울 칸도 없다
    expect(candidateView(candidate(), null, FILLED).clears).toBeNull()
  })

  it('지울 칸 줄은 지금 칸 글자로 다시 만들어요(사용자가 상자를 연 채 칸을 고친 경우)', () => {
    const hUnknown = candidate({ h: null })
    expect(candidateView(hUnknown, null, EMPTY).clears).toBeNull()
    expect(candidateView(hUnknown, null, { w: '', d: '', h: '50' }).clears).toBe('모름인 칸은 지금 값을 지워요: 높이')
  })

  // plan: mixed units hide the apply button
  it('AC67: 단위가 mixed면 AI가 읽은 내용과 단위 문장만 있고 넣을 값·지울 칸·넣기 버튼은 없어요', () => {
    const view = candidateView(candidate({ unit: 'mixed', h: null }), 'cm', FILLED)
    expect(view.read).toBe(READ_LINE)
    expect(view.notice).toBe(MIXED)
    expect(view.fill).toBeNull()
    expect(view.clears).toBeNull()
    expect(view.applyLabel).toBeNull()
  })

  it('단위가 mixed면 축이 분명하지 않아도 적힌 순서 문장을 보이지 않아요(넣지 않으니까)', () => {
    const view = candidateView(candidate({ unit: 'mixed', axes: 'order' }), null, EMPTY)
    expect(view.axes).toBeNull()
    expect(view.applyLabel).toBeNull()
  })

  it('단위가 mixed가 아니면 notice는 없어요', () => {
    expect(candidateView(candidate(), null, EMPTY).notice).toBeNull()
    expect(candidateView(candidate({ unit: null }), null, EMPTY).notice).toBeNull()
  })

  // plan: an unknown unit shows the choose-a-unit line instead of cm values
  it('AC67: 단위를 못 읽었고 아직 고르지 않았으면 넣을 값 대신 단위를 고르라는 줄이고 지울 칸도 없어요', () => {
    const view = candidateView(candidate({ unit: null, h: null }), null, FILLED)
    expect(view.fill).toBe(CHOOSE_UNIT)
    expect(view.clears).toBeNull()
    // 버튼 이름은 있고(화면이 비활성으로 둔다), 넣을 값 문장은 없다
    expect(view.applyLabel).toBe('넣기')
    expect(view.fill).not.toMatch(/^넣을 값/)
  })

  it('단위를 고르면 같은 함수가 그 단위로 넣을 값과 지울 칸을 다시 만들어요', () => {
    const noUnit = candidate({ unit: null, w: 320, d: 250, h: null })
    expect(candidateView(noUnit, 'mm', FILLED)).toMatchObject({
      fill: '넣을 값: 가로 32 · 깊이 25 · 높이 모름',
      clears: '모름인 칸은 지금 값을 지워요: 높이',
    })
    expect(candidateView(noUnit, 'cm', FILLED).fill).toBe('넣을 값: 가로 320 · 깊이 250 · 높이 모름')
    expect(candidateView(noUnit, 'm', FILLED)).toMatchObject({
      // 320m는 1000cm를 넘어 모름
      fill: '넣을 값: 가로 모름 · 깊이 모름 · 높이 모름',
      clears: '모름인 칸은 지금 값을 지워요: 가로·깊이·높이',
    })
  })

  it('읽은 단위가 있으면 고른 단위는 보지 않아요', () => {
    expect(candidateView(candidate(), 'mm', EMPTY).fill).toBe(FILL_FIRST)
  })

  it('세 값을 모두 모르면 넣을 값이 모두 모름이에요', () => {
    expect(candidateView(candidate({ w: null, d: null, h: null }), null, EMPTY).fill).toBe('넣을 값: 가로 모름 · 깊이 모름 · 높이 모름')
  })
})

describe('읽은 치수의 기준 (F44 basis, AC67)', () => {
  it('제품·축 이름 분명·label 없음이면 기준이 없어요', () => {
    expect(candidateBasis(candidate())).toBeNull()
  })

  it("AC67: 포장이면 '포장 치수', 제품·포장 표기 없으면 '제품·포장 표기 없음', 축이 분명하지 않으면 '적힌 순서로 넣은 치수'예요", () => {
    expect(candidateBasis(candidate({ kind: 'package' }))).toBe('포장 치수')
    expect(candidateBasis(candidate({ kind: 'unknown' }))).toBe('제품·포장 표기 없음')
    expect(candidateBasis(candidate({ axes: 'order' }))).toBe('적힌 순서로 넣은 치수')
  })

  it("순서는 (포장·표기 없음) · (적힌 순서) · (label)이고 ' · '로 이어요", () => {
    expect(candidateBasis(candidate({ kind: 'package', axes: 'order' }))).toBe('포장 치수 · 적힌 순서로 넣은 치수')
    expect(candidateBasis(candidate({ label: '접었을 때' }))).toBe('접었을 때')
    expect(candidateBasis(candidate({ kind: 'package', label: '접었을 때' }))).toBe('포장 치수 · 접었을 때')
    // 23자 + 5자 = 28자라 자르지 않는다
    expect(candidateBasis(candidate({ kind: 'package', axes: 'order', label: '펼쳤을 때' }))).toBe('포장 치수 · 적힌 순서로 넣은 치수 · 펼쳤을 때')
  })

  it('label이 빈 글자나 공백뿐이면 없는 것으로 봐요', () => {
    expect(candidateBasis(candidate({ label: '' }))).toBeNull()
    expect(candidateBasis(candidate({ kind: 'package', label: '  ' }))).toBe('포장 치수')
  })

  // plan: candidateBasis keeps the kind and order words and cuts only the label to 30 characters
  it("AC67: 표기 없음 + 적힌 순서 + label 20자면 앞의 두 말(29자)은 두고 label 앞 1자만 붙여 30자예요", () => {
    const head = '제품·포장 표기 없음 · 적힌 순서로 넣은 치수 · '
    expect(head).toHaveLength(29)
    const label = '가나다라마바사아자차카타파하거너더러머버'
    expect(label).toHaveLength(20)
    const basis = candidateBasis(candidate({ kind: 'unknown', axes: 'order', label }))
    expect(basis).toBe(`${head}가`)
    expect(basis).toHaveLength(BASIS_MAX)
  })

  it('label이 길면 그 label만 잘라 정확히 30자에 맞추고 앞의 말은 그대로예요', () => {
    const label = '아주아주긴상태설명이라서서른자를넘는라벨'
    const packageOrder = candidateBasis(candidate({ kind: 'package', axes: 'order', label }))
    expect(packageOrder).toBe(`포장 치수 · 적힌 순서로 넣은 치수 · ${label.slice(0, 7)}`)
    expect(packageOrder).toHaveLength(30)
    const labelOnly = candidateBasis(candidate({ label: `${label}${label}` }))
    expect(labelOnly).toBe(`${label}${label}`.slice(0, 30))
    expect(labelOnly).toHaveLength(30)
  })

  it('30자 이하면 자르지 않아요', () => {
    // '포장 치수 · ' 8자 + 22자 = 30자
    const label = '가'.repeat(22)
    expect(candidateBasis(candidate({ kind: 'package', label }))).toBe(`포장 치수 · ${label}`)
  })

  it('이모지(서로게이트 쌍)도 저장 검사(isFit)처럼 .length로 세어 30을 넘지 않고, 반쪽 글자를 남기지 않아요', () => {
    const head = '포장 치수 · 적힌 순서로 넣은 치수 · '
    expect(head).toHaveLength(23)
    // 남는 자리 7: 이모지 4개(8)면 셋째까지(6) + 넷째의 앞 반쪽 → 반쪽은 빼서 29자
    const emoji = candidateBasis(candidate({ kind: 'package', axes: 'order', label: '😀😀😀😀' }))
    expect(emoji).toBe(`${head}😀😀😀`)
    expect(emoji).toHaveLength(29)
    // 앞에 1자가 더 있으면 반쪽 없이 꼭 30자
    const exact = candidateBasis(candidate({ kind: 'package', axes: 'order', label: 'a😀😀😀😀' }))
    expect(exact).toBe(`${head}a😀😀😀`)
    expect(exact).toHaveLength(30)
    for (const basis of [emoji, exact]) {
      // 짝 없는 서로게이트가 있으면 encodeURIComponent가 URIError를 던진다
      expect(() => encodeURIComponent(basis ?? '')).not.toThrow()
    }
  })

  it('어떤 표기든 기준은 30자를 넘지 않아 저장 검사(isFit)를 통과해요', () => {
    const kinds: SizeCandidate['kind'][] = ['product', 'package', 'unknown']
    const axes: SizeCandidate['axes'][] = ['labeled', 'order']
    const labels = [null, '접었을 때', '가'.repeat(20), '😀'.repeat(20), `a${'😀'.repeat(19)}`, 'x'.repeat(80)]
    const fit = { place: '싱크대 옆 칸', space: { w: 400, d: 300, h: 500 }, item: { w: 320, d: 250, h: 470 }, savedAt: '2026-10-30T00:00:00.000Z' }
    for (const kind of kinds) {
      for (const axis of axes) {
        for (const label of labels) {
          const basis = candidateBasis(candidate({ kind, axes: axis, label }))
          if (basis === null) continue
          expect(basis.length, `${kind}·${axis}·${label}`).toBeLessThanOrEqual(BASIS_MAX)
          expect(isFit({ ...fit, basis }), `${kind}·${axis}·${label}`).toBe(true)
        }
      }
    }
  })
})
