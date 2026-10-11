import { describe, expect, it } from 'vitest'
import { impulseSignals, priceInHours, unansweredQuestions } from './impulse'
import { type WishItem } from './wishlist'

// PRD F15 사기 전에 한 번 더: 내 기록에서 찾은 근거로 "왜 충동구매일 수 있는지" 보여준다 (AC29)
const NOW = new Date('2026-10-11T09:00:00+09:00')
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

let seq = 0
function item(over: Partial<WishItem> = {}): WishItem {
  return {
    id: `id-${++seq}`,
    name: '무선 헤드폰',
    priceKrw: 129000,
    reason: '출퇴근길에 쓰려고',
    url: null,
    createdAt: at(-4),
    updatedAt: at(-4),
    reviewAt: at(-1),
    status: 'considering',
    decidedAt: null,
    answers: { haveOne: 'no', problem: '선이 자꾸 끊겨요', useInMonth: 'yes' },
    ...over,
  }
}
const texts = (target: WishItem, all: WishItem[] = [target]) => impulseSignals(target, all, NOW).map((s) => s.text)

describe('사기 전 점검 신호 (F15)', () => {
  it('걸리는 점이 없으면 빈 목록이다', () => {
    expect(texts(item())).toEqual([])
  })

  it('비슷한 이름의 다른 기록을 알려주고, 자기 자신은 빼고 센다', () => {
    const target = item()
    const bought = item({ name: '블루투스 헤드폰', status: 'purchased', decidedAt: at(-20), createdAt: at(-25), updatedAt: at(-20), reviewAt: at(-22) })
    expect(texts(target, [target, bought])).toEqual(["비슷한 기록: 20일 전에 '블루투스 헤드폰'을 구매했어요"])
    expect(texts(target, [target])).toEqual([])
  })

  it("담을 때 '지금 쓰는 게 있어요'라고 답했으면 알려준다", () => {
    expect(texts(item({ answers: { haveOne: 'yes', problem: '음질', useInMonth: 'yes' } }))).toEqual([
      "담을 때 '지금 쓰는 게 있어요'라고 답했어요",
    ])
  })

  it('답하지 않은 질문은 걸리는 점으로 세지 않고, 생각해 볼 질문으로 따로 돌려준다 (중요한 순서)', () => {
    expect(texts(item({ answers: undefined }))).toEqual([])
    expect(unansweredQuestions(item({ answers: undefined }))).toEqual([
      '없으면 어떤 문제가 있나요?',
      '한 달 뒤에도 쓸까요?',
      '지금 쓰는 게 있나요?',
      '할인·한정 때문인가요?',
      '놓을 곳과 쓸 시간이 있나요?',
      '빌리거나 중고로 대신할 수 있나요?',
    ])
    expect(unansweredQuestions(item({ answers: { haveOne: 'no', useInMonth: 'yes', problem: '음질', saleDriven: 'no', spaceTime: 'yes', alternative: 'no' } }))).toEqual([])
  })

  it('이유의 할인 문구가 이미 걸리는 점이면 할인 질문은 생각해 볼 질문에서 뺀다', () => {
    expect(unansweredQuestions(item({ reason: '세일이라서', answers: undefined }))).not.toContain('할인·한정 때문인가요?')
  })

  it("'한 달 뒤에도 쓸까요?'에 아닐 것 같아요·모르겠어요라고 답했으면 알려준다", () => {
    expect(texts(item({ answers: { problem: '음질', useInMonth: 'no' } }))).toEqual([
      "'한 달 뒤에도 쓸까요?'에 '아닐 것 같아요'라고 답했어요",
    ])
    expect(texts(item({ answers: { problem: '음질', useInMonth: 'unsure' } }))).toEqual([
      "'한 달 뒤에도 쓸까요?'에 '모르겠어요'라고 답했어요",
    ])
  })

  it('사고 싶은 이유에 할인을 뜻하는 말이 있으면 처음 찾은 말로 알려준다 (조사는 받침에 맞게)', () => {
    expect(texts(item({ reason: '세일이라서 담음' }))).toEqual(["사고 싶은 이유에 '세일'이 있어요. 할인이 없어도 살까요?"])
    expect(texts(item({ reason: '오늘만 특가' }))).toEqual(["사고 싶은 이유에 '특가'가 있어요. 할인이 없어도 살까요?"])
  })

  it('고민 기간이 남았는데 사려 하면 남은 기간을 알려준다', () => {
    expect(texts(item({ reviewAt: at(2) }))).toEqual(['고민 기간이 2일 남았어요'])
    expect(texts(item({ reviewAt: NOW.toISOString() }))).toEqual([])
  })

  it('신호는 비슷한 기록 → 답 → 할인 → 남은 기간 순서로 모인다', () => {
    const target = item({ reason: '세일', reviewAt: at(2), answers: { haveOne: 'yes', useInMonth: 'unsure' } })
    const skipped = item({ name: '헤드폰', status: 'skipped', decidedAt: at(-3), createdAt: at(-6), updatedAt: at(-3), reviewAt: at(-5) })
    expect(impulseSignals(target, [target, skipped], NOW).map((s) => s.kind)).toEqual(['similar', 'have-one', 'wont-use', 'sale', 'early'])
  })
})

describe('목록 키 (GPT 검토)', () => {
  it('비슷한 기록의 문장이 같아도 신호의 키는 기록마다 다르다', () => {
    const target = item()
    const twin = (id: string) => item({ id, name: '헤드폰', status: 'skipped', decidedAt: at(-3), createdAt: at(-6), updatedAt: at(-3), reviewAt: at(-5) })
    const keys = impulseSignals(target, [target, twin('t1'), twin('t2')], NOW).map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('금액을 시급으로 (F15)', () => {
  it('시급이 있으면 소수 첫째 자리 시간, 없으면 null', () => {
    expect(priceInHours(129000, 10000)).toBe('12.9')
    expect(priceInHours(129000, null)).toBeNull()
  })
})
