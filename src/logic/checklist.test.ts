import { describe, expect, it } from 'vitest'
import { impulseSignals } from './impulse'
import { parseStore } from './storage'
import { cleanAnswers, describeAnswers, type WishItem } from './wishlist'

// 담을 때 질문 6개 (F09 확장): 할인·한정 / 놓을 곳·쓸 시간 / 빌리거나 중고로 대신 → 사기 전 점검(F15)의 근거
const NOW = new Date('2026-10-11T09:00:00+09:00')
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

function item(over: Partial<WishItem> = {}): WishItem {
  return {
    id: 'a',
    name: '무선 헤드폰',
    priceKrw: 129000,
    reason: '출퇴근길에 쓰려고',
    url: null,
    createdAt: at(-4),
    updatedAt: at(-4),
    reviewAt: at(-1),
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}
const calm = { haveOne: 'no', problem: '선이 끊겨요', useInMonth: 'yes' } as const
const texts = (target: WishItem) => impulseSignals(target, [target], NOW).map((s) => s.text)

describe('새 질문 3개의 답 (F09)', () => {
  it('재검토 카드에 보여줄 문장', () => {
    expect(describeAnswers({ saleDriven: 'yes', spaceTime: 'no', alternative: 'yes' })).toEqual([
      '할인·한정 때문에 담았어요',
      '놓을 곳이나 쓸 시간이 없어요',
      '빌리거나 중고로 대신할 수 있어요',
    ])
    expect(describeAnswers({ saleDriven: 'no', spaceTime: 'yes', alternative: 'no' })).toEqual([
      '할인 때문은 아니에요',
      '놓을 곳과 쓸 시간이 있어요',
      '대신하기 어려워요',
    ])
  })

  it('저장할 때 새 답도 남기고, 아무것도 안 고르면 저장하지 않는다', () => {
    expect(cleanAnswers({ saleDriven: 'no', spaceTime: 'yes', alternative: 'no' })).toEqual({ saleDriven: 'no', spaceTime: 'yes', alternative: 'no' })
    expect(cleanAnswers({ problem: '  ' })).toBeUndefined()
  })

  it('복원할 때 새 답은 yes·no만 받는다', () => {
    const store = (answers: unknown) => JSON.stringify({ schemaVersion: 1, items: [{ ...item(), answers }] })
    expect(parseStore(store({ saleDriven: 'yes', spaceTime: 'no', alternative: 'yes' }))).toMatchObject({ ok: true })
    expect(parseStore(store({ saleDriven: 'maybe' }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(store({ spaceTime: 1 }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(store({ alternative: 'unsure' }))).toMatchObject({ ok: false, reason: 'corrupt' })
  })
})

describe('새 답을 근거로 한 사기 전 점검 (F15)', () => {
  it("할인·한정 때문이라고 답했으면 알려주고, 이유의 할인 문구와 겹쳐 두 번 세지 않는다", () => {
    expect(texts(item({ reason: '세일이라서', answers: { ...calm, saleDriven: 'yes' } }))).toEqual([
      "담을 때 '할인·한정 때문'이라고 답했어요. 할인이 없어도 살까요?",
    ])
  })

  it('할인 때문이 아니라고 직접 답했으면 이유에 세일이 있어도 근거로 세지 않는다', () => {
    expect(texts(item({ reason: '세일 기다렸다가', answers: { ...calm, saleDriven: 'no' } }))).toEqual([])
  })

  it('놓을 곳이나 쓸 시간이 없다고 답했으면 알려준다', () => {
    expect(texts(item({ answers: { ...calm, spaceTime: 'no' } }))).toEqual(["담을 때 '놓을 곳이나 쓸 시간이 없어요'라고 답했어요"])
    expect(texts(item({ answers: { ...calm, spaceTime: 'yes' } }))).toEqual([])
  })

  it('빌리거나 중고로 대신할 수 있다고 답했으면 알려준다', () => {
    expect(texts(item({ answers: { ...calm, alternative: 'yes' } }))).toEqual(["담을 때 '빌리거나 중고로 대신할 수 있어요'라고 답했어요"])
    expect(texts(item({ answers: { ...calm, alternative: 'no' } }))).toEqual([])
  })

  it('신호 순서: 비슷한 기록 → 지금 쓰는 것 → 한 달 뒤 → 할인 → 놓을 곳·시간 → 대신할 방법 → 남은 기간', () => {
    const target = item({ reviewAt: at(2), answers: { haveOne: 'yes', useInMonth: 'no', saleDriven: 'yes', spaceTime: 'no', alternative: 'yes' } })
    expect(impulseSignals(target, [target], NOW).map((s) => s.kind)).toEqual([
      'have-one',
      'wont-use',
      'sale',
      'space-time',
      'alternative',
      'early',
    ])
  })
})
