import { describe, expect, it } from 'vitest'
import type { Fit } from './fit'
import { impulseSignals } from './impulse'
import { type WishItem } from './wishlist'

// PRD F44 놓을 자리 확인 → F15 사기 전에 한 번 더 연결 (AC66)
// 저장한 결과가 '안 들어가요'·'빠듯해요'면 '놓을 곳·시간' 자리에 걸리는 점으로 넣고, 질문 ⑤ '없어요'와는 한 번만 센다
const NOW = new Date('2026-10-30T09:00:00+09:00')
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

const PLACE = '책상 밑'
const SPACE = { w: 600, d: 500, h: 700 }
// 계산(PRD F44): 방향 1 남는 길이 = 놓을 곳 − 물건(mm), 방향 2는 물건 가로·깊이를 맞바꿔 본다
// 안 들어가요: 650×300×300 → 방향 1 가로 -50(넘침), 방향 2 깊이 500-650=-150(넘침) → 둘 다 안 들어가요
const TOO_BIG = { w: 650, d: 300, h: 300 }
// 빠듯해요: 590×400×600 → 방향 1 가로 10·깊이 100·높이 100(모두 0 이상, 가로가 20 미만) → 빠듯해요 (방향 2는 깊이 -90 → 안 들어가요)
const SNUG = { w: 590, d: 400, h: 600 }
// 들어가요: 300×300×300 → 방향 1 가로 300·깊이 200·높이 400(모두 20 이상) → 들어가요
const ROOMY = { w: 300, d: 300, h: 300 }

const fit = (item: Fit['item'], over: Partial<Fit> = {}): Fit => ({ place: PLACE, space: SPACE, item, savedAt: at(-1), ...over })

let seq = 0
/** 다른 걸리는 점이 모두 있는 물건: 순서와 개수가 바뀌지 않는지 보려고 (비슷한 기록은 따로 넘긴다) */
function busy(over: Partial<WishItem> = {}, answers: NonNullable<WishItem['answers']> = {}): WishItem {
  return {
    id: `id-${++seq}`,
    name: '무선 헤드폰',
    priceKrw: 129000,
    reason: '출퇴근길에 쓰려고',
    url: null,
    createdAt: at(-1),
    updatedAt: at(-1),
    reviewAt: at(2),
    status: 'considering',
    decidedAt: null,
    answers: { problem: '선이 자꾸 끊겨요', haveOne: 'yes', useInMonth: 'no', saleDriven: 'yes', alternative: 'yes', ...answers },
    ...over,
  }
}
const similarRecord: WishItem = {
  id: 'b1',
  name: '블루투스 헤드폰',
  priceKrw: 59000,
  reason: '운동할 때',
  url: null,
  createdAt: at(-25),
  updatedAt: at(-20),
  reviewAt: at(-22),
  status: 'purchased',
  decidedAt: at(-20),
}
const signalsOf = (target: WishItem) => impulseSignals(target, [target, similarRecord], NOW)
/** 비슷한 기록 없이 이 물건의 걸리는 점만 */
const texts = (target: WishItem) => impulseSignals(target, [target], NOW).map((s) => s.text)

const SIMILAR = "비슷한 기록: 20일 전에 '블루투스 헤드폰'을 구매했어요"
const HAVE_ONE = "'지금 쓰는 게 있어요'라고 답했어요"
const WONT_USE = "'한 달 뒤에도 쓸까요?'에 '아닐 것 같아요'라고 답했어요"
const SALE = "'할인·한정 때문'이라고 답했어요. 할인이 없어도 살까요?"
const ALTERNATIVE = "'빌리거나 중고로 대신할 수 있어요'라고 답했어요"
const EARLY = '고민 기간이 2일 남았어요'
const KINDS = ['similar', 'have-one', 'wont-use', 'sale', 'space-time', 'alternative', 'early']
const KINDS_WITHOUT_SPACE_TIME = KINDS.filter((kind) => kind !== 'space-time')

const NO_FIT = "입력한 치수로는 '책상 밑'에 안 들어가요"
const TIGHT = "입력한 치수로는 '책상 밑'에 빠듯해요"
const SPACE_TIME_ANSWER = "'놓을 곳이나 쓸 시간이 없어요'라고 답했어요"

describe('사기 전 점검에 놓을 자리 확인 결과 잇기 (F44, AC66)', () => {
  it("AC66: 저장한 결과가 '안 들어가요'면 '놓을 곳·시간' 자리에 걸리는 점 하나로 들어가고 다른 걸리는 점의 순서와 개수는 그대로예요", () => {
    const signals = signalsOf(busy({ fit: fit(TOO_BIG) }))
    expect(signals.map((s) => s.text)).toEqual([SIMILAR, HAVE_ONE, WONT_USE, SALE, NO_FIT, ALTERNATIVE, EARLY])
    expect(signals.map((s) => s.kind)).toEqual(KINDS)
    expect(signals.filter((s) => s.kind === 'space-time')).toEqual([{ kind: 'space-time', key: 'space-time', text: NO_FIT }])
  })

  it("AC66: 저장한 결과가 '빠듯해요'면 같은 자리에 '빠듯해요' 문장이 들어가요", () => {
    const signals = signalsOf(busy({ fit: fit(SNUG) }))
    expect(signals.map((s) => s.text)).toEqual([SIMILAR, HAVE_ONE, WONT_USE, SALE, TIGHT, ALTERNATIVE, EARLY])
    expect(signals.map((s) => s.kind)).toEqual(KINDS)
  })

  it("AC66: 저장한 결과가 '들어가요'면 그 걸리는 점은 없고 나머지는 그대로예요", () => {
    const signals = signalsOf(busy({ fit: fit(ROOMY) }))
    expect(signals.map((s) => s.text)).toEqual([SIMILAR, HAVE_ONE, WONT_USE, SALE, ALTERNATIVE, EARLY])
    expect(signals.map((s) => s.kind)).toEqual(KINDS_WITHOUT_SPACE_TIME)
  })

  it('AC66: 저장한 결과(fit)가 없으면 그 걸리는 점은 없고 나머지는 그대로예요', () => {
    const signals = signalsOf(busy())
    expect(signals.map((s) => s.text)).toEqual([SIMILAR, HAVE_ONE, WONT_USE, SALE, ALTERNATIVE, EARLY])
    expect(signals.map((s) => s.kind)).toEqual(KINDS_WITHOUT_SPACE_TIME)
  })

  // plan: space-time answer and fit result count once
  it("AC66: 질문 ⑤에 '없어요'라고 답하고 '안 들어가요'를 저장했으면 걸리는 점 하나로 이어 한 번만 세요", () => {
    const signals = signalsOf(busy({ fit: fit(TOO_BIG) }, { spaceTime: 'no' }))
    expect(signals.map((s) => s.text)).toEqual([
      SIMILAR,
      HAVE_ONE,
      WONT_USE,
      SALE,
      "'놓을 곳이나 쓸 시간이 없어요'라고 답했어요 · 입력한 치수로는 '책상 밑'에 안 들어가요",
      ALTERNATIVE,
      EARLY,
    ])
    expect(signals.map((s) => s.kind)).toEqual(KINDS)
    expect(signals.filter((s) => s.kind === 'space-time')).toHaveLength(1)
  })

  it("AC66: 저장한 결과에 기준('포장 치수')이 있으면 문장 끝에 ' (포장 치수 기준)'이 붙어요", () => {
    const signals = signalsOf(busy({ fit: fit(TOO_BIG, { basis: '포장 치수' }) }))
    expect(signals.map((s) => s.text)).toEqual([
      SIMILAR,
      HAVE_ONE,
      WONT_USE,
      SALE,
      "입력한 치수로는 '책상 밑'에 안 들어가요 (포장 치수 기준)",
      ALTERNATIVE,
      EARLY,
    ])
    expect(signals.map((s) => s.kind)).toEqual(KINDS)
  })
})

describe('놓을 자리 확인 결과와 질문 ⑤의 조합 (F44·F15, AC66 둘레)', () => {
  const only = (answers: WishItem['answers'], over: Partial<WishItem> = {}): WishItem => busy({ reviewAt: at(-1), answers, ...over })

  it("질문 ⑤ '없어요' + '빠듯해요'도 한 문장으로 이어요", () => {
    expect(texts(only({ spaceTime: 'no' }, { fit: fit(SNUG) }))).toEqual([
      "'놓을 곳이나 쓸 시간이 없어요'라고 답했어요 · 입력한 치수로는 '책상 밑'에 빠듯해요",
    ])
  })

  it("질문 ⑤ '없어요' + 기준이 있는 '안 들어가요'는 기준까지 이어요", () => {
    expect(texts(only({ spaceTime: 'no' }, { fit: fit(TOO_BIG, { basis: '포장 치수' }) }))).toEqual([
      "'놓을 곳이나 쓸 시간이 없어요'라고 답했어요 · 입력한 치수로는 '책상 밑'에 안 들어가요 (포장 치수 기준)",
    ])
  })

  it("질문 ⑤ '없어요' + '들어가요'면 지금처럼 답 문장 하나만 보여요", () => {
    expect(texts(only({ spaceTime: 'no' }, { fit: fit(ROOMY) }))).toEqual([SPACE_TIME_ANSWER])
  })

  it("질문 ⑤ '없어요'만 있고 저장한 결과가 없으면 지금처럼 답 문장 하나만 보여요", () => {
    expect(texts(only({ spaceTime: 'no' }))).toEqual([SPACE_TIME_ANSWER])
  })

  it("질문 ⑤에 '있어요'라고 답했어도 '안 들어가요'를 저장했으면 치수 문장만 하나 보여요(⑤의 답은 바꾸지 않아요)", () => {
    const target = only({ spaceTime: 'yes' }, { fit: fit(TOO_BIG) })
    expect(texts(target)).toEqual([NO_FIT])
    expect(target.answers?.spaceTime).toBe('yes')
  })

  it('질문 ⑤에 답하지 않았어도 저장한 결과가 빠듯하면 치수 문장만 하나 보여요', () => {
    expect(texts(only(undefined, { fit: fit(SNUG) }))).toEqual([TIGHT])
  })

  it("저장한 결과의 놓을 곳 이름과 기준은 그대로 문장에 써요(싱크대 옆 칸 · '적힌 순서로 넣은 치수')", () => {
    const saved = fit(TOO_BIG, { place: '싱크대 옆 칸', basis: '포장 치수 · 적힌 순서로 넣은 치수' })
    expect(texts(only({}, { fit: saved }))).toEqual(["입력한 치수로는 '싱크대 옆 칸'에 안 들어가요 (포장 치수 · 적힌 순서로 넣은 치수 기준)"])
  })

  it('걸리는 점은 저장한 결과(item.fit)만 보고, 다른 물건의 놓을 곳은 쓰지 않아요', () => {
    const target = only({}, { fit: fit(ROOMY) })
    const other = busy({ name: '전기 포트', fit: fit(TOO_BIG, { place: '싱크대 옆 칸' }) })
    expect(impulseSignals(target, [target, other], NOW).map((s) => s.text)).toEqual([])
  })
})
