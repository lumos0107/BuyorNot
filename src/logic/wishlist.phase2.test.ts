import { describe, expect, it } from 'vitest'
import { decideItem, extendItem, reviewAtFrom, reviewState, validateNote, type WishItem } from './wishlist'

// 2차 F07 고민 기간 연장, F08 결정 메모 (AC18, AC19)
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

describe('고민 기간 연장 (F07)', () => {
  it('AC18: 남은 2일에 3일을 연장하면 5일 남고 1번 연장으로 기록된다', () => {
    const now = at(T0, hours(24))
    const extended = extendItem(item(), 3, now)
    expect(extended.reviewAt).toBe(reviewAtFrom(T0, 6))
    expect(reviewState(extended.reviewAt, now)).toEqual({ phase: 'cooling', remainingMs: hours(24 * 5) })
    expect(extended.extensions).toBe(1)
    expect(extended.createdAt).toBe(item().createdAt)
    expect(extended.reason).toBe(item().reason)
    expect(extended.updatedAt).toBe(now.toISOString())
  })

  it('AC18: 고민 기간 끝(지난 지 1일)에서 3일을 연장하면 지금부터 3일 남고 고민 중으로 돌아간다', () => {
    const now = at(T0, hours(24 * 4))
    const extended = extendItem(item(), 3, now)
    expect(extended.reviewAt).toBe(reviewAtFrom(now, 3))
    expect(reviewState(extended.reviewAt, now)).toEqual({ phase: 'cooling', remainingMs: hours(72) })
  })

  it('연장 횟수는 누적된다', () => {
    const twice = extendItem(extendItem(item(), 1, T0), 1, T0)
    expect(twice.extensions).toBe(2)
  })
})

describe('결정 메모 (F08)', () => {
  it('AC19: 메모는 앞뒤 공백을 지우고 저장하며, 비어 있으면 저장하지 않는다', () => {
    const noted = decideItem(item(), 'skipped', T0, '  지금 키보드도 멀쩡해서 ')
    expect(noted.decisionNote).toBe('지금 키보드도 멀쩡해서')
    expect(decideItem(item(), 'purchased', T0, '   ').decisionNote).toBeUndefined()
    expect(decideItem(item(), 'purchased', T0).decisionNote).toBeUndefined()
  })

  it('AC19: 200자는 허용하고 201자는 오류다', () => {
    expect(validateNote('가'.repeat(200)).error).toBeUndefined()
    expect(validateNote('가'.repeat(201)).error).toBeTruthy()
    expect(validateNote('').value).toBeUndefined()
  })
})
