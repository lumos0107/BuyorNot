import { describe, expect, it } from 'vitest'
import { CHOICES, QUESTION_TEXT, answerItem, cardQuestions, hasAnswer, validateProblem } from './questions'
import { describeAnswers, type WishItem } from './wishlist'

// PRD F22 고민 노트: 카드의 "생각해 볼 질문"에서 답하지 않은 질문에 하나씩 답한다 (AC37)
const NOW = new Date(2026, 9, 11, 9)
const iso = (day: number) => new Date(2026, 9, day, 9).toISOString()

function item(over: Partial<WishItem> = {}): WishItem {
  return {
    id: 'w1',
    name: '무선 헤드폰',
    priceKrw: 129000,
    reason: '출퇴근길에 쓰려고',
    url: null,
    createdAt: iso(9),
    updatedAt: iso(9),
    reviewAt: iso(12),
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}

describe('카드에서 물을 질문 (F22)', () => {
  it('답하지 않은 질문을 중요한 순서로 돌려준다', () => {
    expect(cardQuestions(item()).map((key) => QUESTION_TEXT[key])).toEqual([
      '없으면 어떤 문제가 있나요?',
      '한 달 뒤에도 쓸까요?',
      '지금 쓰는 게 있나요?',
      '할인·한정 때문인가요?',
      '놓을 곳과 쓸 시간이 있나요?',
      '빌리거나 중고로 대신할 수 있나요?',
    ])
    expect(cardQuestions(item({ answers: { problem: '음악', useInMonth: 'yes' } }))[0]).toBe('haveOne')
  })

  it('이유에 할인 문구가 있어도 카드에서는 할인 질문을 묻는다 (바로잡을 수 있게, GPT 계획 검토)', () => {
    expect(cardQuestions(item({ reason: '가격 비교: B안 결제액 72,000원 (할인 8,000원 · 배송비 포함)' }))).toContain('saleDriven')
  })

  it('공백뿐인 문제 설명은 답하지 않은 것으로 본다', () => {
    expect(hasAnswer({ problem: '   ' }, 'problem')).toBe(false)
    expect(hasAnswer({ problem: ' 음악 ' }, 'problem')).toBe(true)
    expect(hasAnswer(undefined, 'haveOne')).toBe(false)
    expect(cardQuestions(item({ answers: { problem: '  ' } }))[0]).toBe('problem')
  })

  it('선택지 문구는 담기 폼과 같다', () => {
    expect(CHOICES.useInMonth.map(([, label]) => label)).toEqual(['쓸 것 같아요', '아닐 것 같아요', '모르겠어요'])
    expect(CHOICES.haveOne.map(([, label]) => label)).toEqual(['있어요', '없어요'])
    expect(CHOICES.saleDriven.map(([, label]) => label)).toEqual(['네', '아니요'])
    expect(CHOICES.spaceTime.map(([, label]) => label)).toEqual(['있어요', '없어요'])
    expect(CHOICES.alternative.map(([, label]) => label)).toEqual(['대신할 수 있어요', '어려워요'])
  })
})

describe('카드에서 답하기·다시 답하기 (F22)', () => {
  it('답을 저장하고 기록 시각을 바꾼다. 다른 답은 그대로다', () => {
    const next = answerItem(item({ answers: { haveOne: 'no' } }), 'useInMonth', 'yes', NOW)
    expect(next.answers).toEqual({ haveOne: 'no', useInMonth: 'yes' })
    expect(next.updatedAt).toBe(NOW.toISOString())
  })

  it('문제 설명은 앞뒤 공백을 빼고 저장한다', () => {
    expect(answerItem(item(), 'problem', '  출퇴근 때 못 들어요 ', NOW).answers).toEqual({ problem: '출퇴근 때 못 들어요' })
  })

  it('다시 답하기는 그 답을 지워 질문으로 돌린다. 답이 하나도 남지 않으면 answers를 지운다', () => {
    const cleared = answerItem(item({ answers: { haveOne: 'yes', useInMonth: 'no' } }), 'haveOne', undefined, NOW)
    expect(cleared.answers).toEqual({ useInMonth: 'no' })
    expect(cardQuestions(cleared)).toContain('haveOne')
    expect('answers' in answerItem(item({ answers: { haveOne: 'yes' } }), 'haveOne', undefined, NOW)).toBe(false)
  })

  it('정도 기록과 다른 필드는 그대로 둔다', () => {
    const withDesire = item({ desireStart: 4, desireChecks: [{ day: '2026-10-10', level: 3 }] })
    const next = answerItem(withDesire, 'spaceTime', 'yes', NOW)
    expect(next.desireStart).toBe(4)
    expect(next.desireChecks).toEqual([{ day: '2026-10-10', level: 3 }])
    expect(describeAnswers(next.answers)).toEqual(['놓을 곳과 쓸 시간이 있어요'])
  })
})

describe('문제 설명 검사 (F22, AC37)', () => {
  it('앞뒤 공백을 뺀 1~200자', () => {
    expect(validateProblem('')).toEqual({ error: '답을 적어 주세요' })
    expect(validateProblem('   ')).toEqual({ error: '답을 적어 주세요' })
    expect(validateProblem('가'.repeat(201))).toEqual({ error: '메모는 200자 이하로 적어 주세요' })
    expect(validateProblem(` ${'가'.repeat(200)} `)).toEqual({ value: '가'.repeat(200) })
  })
})
