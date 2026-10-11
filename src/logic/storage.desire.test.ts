import { describe, expect, it } from 'vitest'
import { makeBackup, parseBackup } from './backup'
import { checkDesire, desireEffect, desireTrend } from './desire'
import { parseStore } from './storage'
import { historySummary } from './summary'
import { demoItems, type WishItem } from './wishlist'

// PRD F22 고민 노트: 정도 기록의 저장·복원 규칙과 예시 데이터, 결정 기록 요약 (AC36-2, AC40)
const NOW = new Date(2026, 9, 11, 9)
const iso = (day: number) => new Date(2026, 9, day, 9).toISOString()
const pad = (n: number) => String(n).padStart(2, '0')
const nthDay = (i: number) => {
  const d = new Date(2025, 0, 1 + i)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function item(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'w1',
    name: '무선 헤드폰',
    priceKrw: 129000,
    reason: '출퇴근길에 쓰려고',
    url: null,
    createdAt: iso(8),
    updatedAt: iso(8),
    reviewAt: iso(11),
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}
const load = (over: Record<string, unknown>) => parseStore(JSON.stringify({ schemaVersion: 1, items: [item(over)] }))

describe('정도 기록 복원 (F22, AC40)', () => {
  it('정도 필드가 없는 이전 기록은 그대로 읽는다', () => {
    expect(load({})).toMatchObject({ ok: true })
  })

  it('담을 때 정도는 1~5 정수만 받는다', () => {
    for (const level of [1, 3, 5]) expect(load({ desireStart: level })).toMatchObject({ ok: true })
    for (const bad of [0, 6, 2.5, '4', null]) expect(load({ desireStart: bad })).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('기록은 실제 날짜와 1~5 정수, 같은 날 중복 없이 받는다. 순서는 상관없다', () => {
    expect(load({ desireChecks: [{ day: '2026-10-10', level: 2 }, { day: '2026-10-09', level: 3 }] })).toMatchObject({ ok: true })
    const bad = [
      [{ day: '2026-10-09', level: 3 }, { day: '2026-10-09', level: 2 }],
      [{ day: '2026-02-30', level: 3 }],
      [{ day: '2026-10-9', level: 3 }],
      [{ day: '2026-10-09', level: 6 }],
      [{ day: '2026-10-09', level: 2.5 }],
      [{ day: '2026-10-09' }],
      ['2026-10-09'],
      { day: '2026-10-09', level: 3 },
    ]
    for (const checks of bad) expect(load({ desireChecks: checks })).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('담을 때 고른 날은 실제 날짜여야 하고, 담을 때 정도와 함께만 있다', () => {
    expect(load({ desireStart: 4, desireStartDay: '2026-10-08' })).toMatchObject({ ok: true })
    expect(load({ desireStart: 4, desireStartDay: '2026-02-30' })).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(load({ desireStartDay: '2026-10-08' })).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('복원은 400개까지 받는다 (AC36-2)', () => {
    const checks = (n: number) => Array.from({ length: n }, (_, i) => ({ day: nthDay(i), level: 3 }))
    expect(load({ desireChecks: checks(400) })).toMatchObject({ ok: true })
    expect(load({ desireChecks: checks(401) })).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('빈 기록([])은 없는 것과 같다', () => {
    const loaded = load({ desireChecks: [] })
    expect(loaded).toMatchObject({ ok: true })
    const restored = (loaded as { ok: true; store: { items: WishItem[] } }).store.items[0]
    expect(desireTrend(restored)).toBeNull()
  })

  it('기기 시각이 바뀌어 등록일보다 이른 날짜가 있어도 손상으로 보지 않는다', () => {
    expect(load({ desireStart: 4, desireChecks: [{ day: '2026-10-01', level: 2 }] })).toMatchObject({ ok: true })
  })
})

describe('400개 기록의 백업 왕복 (AC36-2, GPT 코드 검토)', () => {
  it('400개를 백업했다가 불러오면 그대로이고, 같은 날 값만 바꾸면 줄지 않고, 새 날짜를 기록하면 100개가 된다', () => {
    const restored = item({ desireStart: 4, desireStartDay: '2025-01-01', desireChecks: Array.from({ length: 400 }, (_, i) => ({ day: nthDay(i), level: 3 })) }) as unknown as WishItem
    const back = parseBackup(makeBackup({ items: [restored], hourlyWage: null, subscriptions: [] }, NOW))
    expect(back.ok).toBe(true)
    const roundTrip = (back as { ok: true; data: { items: WishItem[] } }).data.items[0]
    expect(roundTrip).toEqual(restored)
    const lastDay = new Date(2025, 0, 400)
    expect(checkDesire(roundTrip, 2, lastDay).desireChecks).toHaveLength(400)
    const next = checkDesire(roundTrip, 2, NOW).desireChecks!
    expect(next).toHaveLength(100)
    expect(next[0].day).toBe(nthDay(0))
    expect(next[next.length - 1]).toEqual({ day: '2026-10-11', level: 2 })
  })
})

describe('예시 데이터의 정도 기록 (F22, AC40)', () => {
  let n = 0
  const demo = demoItems(NOW, () => `demo-${++n}`)
  const byName = (name: string) => demo.find((target) => target.name === `(예시) ${name}`)!

  it('헤드폰은 줄고, 건조대는 담을 때 값만, 키보드는 줄어 포기, 청소기는 늘어 구매', () => {
    expect(desireTrend(byName('무선 헤드폰'))).toBe('담을 때 4 → 3 → 2 (2 줄었어요)')
    expect(desireTrend(byName('접이식 건조대'))).toBe('담을 때 3')
    expect(desireTrend(byName('게이밍 키보드'))).toBe('담을 때 5 → 4 → 2 (3 줄었어요)')
    expect(desireTrend(byName('무선 청소기'))).toBe('담을 때 3 → 4 → 4 (1 늘었어요)')
    expect(desireEffect(demo)).toEqual({ dropped: 1, droppedSkipped: 1 })
  })

  it('헤드폰 답에 "대신하기 어려워요"가 있어 그 밖에 답한 것도 보인다', () => {
    expect(byName('무선 헤드폰').answers).toEqual({ haveOne: 'yes', useInMonth: 'unsure', alternative: 'no' })
  })

  it('예시 데이터는 저장 규칙을 통과한다', () => {
    expect(parseStore(JSON.stringify({ schemaVersion: 1, items: demo }))).toMatchObject({ ok: true })
  })
})

describe('결정 기록 요약의 고민 효과 (F22, AC40)', () => {
  it('요약에 정도가 줄어든 결정 기록 수와 그중 구매 포기 수가 들어간다', () => {
    const decided = (status: 'purchased' | 'skipped', over: Partial<WishItem>): WishItem =>
      ({ ...item(), id: `${status}-${Math.random()}`, status, decidedAt: iso(12), ...over }) as WishItem
    const s = historySummary(
      [
        decided('skipped', { desireStart: 4, desireChecks: [{ day: '2026-10-10', level: 2 }] }),
        decided('purchased', { desireStart: 3, desireChecks: [{ day: '2026-10-10', level: 4 }] }),
      ],
      null,
    )
    expect(s.desireDropped).toBe(1)
    expect(s.desireDroppedSkipped).toBe(1)
  })
})
