import { describe, expect, it } from 'vitest'
import { parseStore, type WishStore } from './storage'

// 2차: 선택 필드 복원 검증과 1차 형식 호환 (AC28)
const store: WishStore = {
  schemaVersion: 1,
  items: [
    {
      id: 'a',
      name: '무선 헤드폰',
      priceKrw: 129000,
      reason: '이유',
      url: null,
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
      reviewAt: '2026-10-14T00:00:00.000Z',
      status: 'considering',
      decidedAt: null,
    },
  ],
}
const base = store.items[0]!
const withItem = (over: Record<string, unknown>) => JSON.stringify({ schemaVersion: 1, items: [{ ...base, ...over }] })

describe('2차 선택 필드', () => {
  it('AC28: 1차 형식(새 필드 없음) 기록은 그대로 복원된다', () => {
    expect(parseStore(JSON.stringify(store))).toEqual({ ok: true, store })
  })

  it('연장 횟수·메모·답·회고가 규칙에 맞으면 복원된다', () => {
    const ok = withItem({ extensions: 2, answers: { haveOne: 'no', problem: '선이 끊겨서', useInMonth: 'unsure' } })
    expect(parseStore(ok)).toMatchObject({ ok: true })
    const decided = withItem({
      status: 'purchased',
      decidedAt: '2026-10-12T00:00:00.000Z',
      decisionNote: '세일이라서',
      satisfaction: 'regret',
      reviewNote: '거의 안 씀',
    })
    expect(parseStore(decided)).toMatchObject({ ok: true })
  })

  it('음수 연장, 201자 메모, 허용되지 않은 답·회고 값은 손상이다', () => {
    expect(parseStore(withItem({ extensions: -1 }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(withItem({ extensions: 1.5 }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(withItem({ decisionNote: '가'.repeat(201) }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(withItem({ answers: { haveOne: 'maybe' } }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(withItem({ satisfaction: 'bad' }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(withItem({ reviewNote: 123 }))).toMatchObject({ ok: false, reason: 'corrupt' })
  })
})
