import { describe, expect, it } from 'vitest'
import { extendItem, reviewAtFrom, reviewState, type WishItem } from './wishlist'
import { parseStore } from './storage'

// GPT 2차 PRD 검토 반영: 연장 경계(AC18 추가 사례), 회고와 상태의 관계(AC28)
const T0 = new Date('2026-10-11T09:00:00+09:00')
const hours = (n: number) => n * 60 * 60 * 1000
const at = (base: Date, ms: number) => new Date(base.getTime() + ms)

function item(over: Partial<WishItem> = {}): WishItem {
  return {
    id: 'a',
    name: '무선 헤드폰',
    priceKrw: 129000,
    reason: '이유',
    url: null,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    reviewAt: reviewAtFrom(T0, 3),
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}

describe('연장 경계 (AC18)', () => {
  it('종료 정각에 1일 연장하면 정확히 1일 남는다', () => {
    const now = at(T0, hours(72))
    const extended = extendItem(item(), 1, now)
    expect(reviewState(extended.reviewAt, now)).toEqual({ phase: 'cooling', remainingMs: hours(24) })
  })

  it('7일 연장을 두 번 하면 14일 남고 2번 연장이다', () => {
    const now = at(T0, hours(72))
    const twice = extendItem(extendItem(item(), 7, now), 7, now)
    expect(reviewState(twice.reviewAt, now)).toEqual({ phase: 'cooling', remainingMs: hours(24 * 14) })
    expect(twice.extensions).toBe(2)
  })
})

describe('회고 필드와 상태 (AC28)', () => {
  const base = {
    id: 'a',
    name: '게이밍 키보드',
    priceKrw: 149000,
    reason: '이유',
    url: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-05T00:00:00.000Z',
    reviewAt: '2026-10-04T00:00:00.000Z',
    decidedAt: '2026-10-05T00:00:00.000Z',
  }
  const json = (over: Record<string, unknown>) => JSON.stringify({ schemaVersion: 1, items: [{ ...base, ...over }] })

  it('구매 포기 기록에 회고가 있으면 손상이고, 구매함 기록의 회고는 복원된다', () => {
    expect(parseStore(json({ status: 'skipped', satisfaction: 'good' }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(json({ status: 'skipped', reviewNote: '쓸 일이 없었다' }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(json({ status: 'purchased', satisfaction: 'good', reviewNote: '매일 씀' }))).toMatchObject({ ok: true })
  })
})
