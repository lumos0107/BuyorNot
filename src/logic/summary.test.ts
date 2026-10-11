import { describe, expect, it } from 'vitest'
import { parseSettings, validateWage, type Settings } from './settings'
import { historySummary, review, reviewDue } from './summary'
import { decideItem, demoItems, reviewAtFrom, type WishItem } from './wishlist'

// PRD F12 결정 기록 요약·구매 후 회고 / AC24, AC25
const T0 = new Date('2026-10-11T09:00:00+09:00')
const DAY = 24 * 60 * 60 * 1000
let seq = 0

function item(name: string, price: number, over: Partial<WishItem> = {}): WishItem {
  return {
    id: `id-${++seq}`,
    name,
    priceKrw: price,
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

describe('결정 기록 요약 (F12)', () => {
  it('AC24: 포기 129,000원·45,000원, 시급 10,000원 → 2건 174,000원, 약 17.4시간', () => {
    const items = [
      decideItem(item('헤드폰', 129000), 'skipped', T0),
      decideItem(item('건조대', 45000), 'skipped', T0),
      decideItem(item('청소기', 189000), 'purchased', T0),
      item('키보드', 99000),
    ]
    const s = historySummary(items, 10000)
    expect(s.skippedCount).toBe(2)
    expect(s.skippedTotal).toBe(174000)
    expect(s.hoursLabel).toBe('17.4')
    expect(s.includesExample).toBe(false)
  })

  it('AC24: 시급이 없으면 환산을 하지 않는다', () => {
    expect(historySummary([decideItem(item('헤드폰', 129000), 'skipped', T0)], null).hoursLabel).toBeNull()
  })

  it('예시 기록이 섞여 있으면 알려준다', () => {
    expect(historySummary(demoItems(T0, () => `d-${++seq}`), null).includesExample).toBe(true)
  })

  it('회고 집계: 답한 건수와 후회 건수', () => {
    const now = new Date(T0.getTime() + 8 * DAY)
    const a = review(decideItem(item('A', 1000), 'purchased', T0), 'regret', '거의 안 씀', now)
    const b = review(decideItem(item('B', 1000), 'purchased', T0), 'good', undefined, now)
    const c = decideItem(item('C', 1000), 'purchased', T0)
    const s = historySummary([a, b, c], null)
    expect(s.reviewedCount).toBe(2)
    expect(s.regretCount).toBe(1)
  })
})

describe('구매 후 회고 시점 (F12)', () => {
  const bought = decideItem(item('청소기', 189000), 'purchased', T0)

  it('AC25: 결정 + 7일 − 1ms에는 묻지 않고, 정각부터 묻는다', () => {
    expect(reviewDue(bought, new Date(T0.getTime() + 7 * DAY - 1))).toBe(false)
    expect(reviewDue(bought, new Date(T0.getTime() + 7 * DAY))).toBe(true)
  })

  it('AC25: 구매 포기·고민 중 기록에는 묻지 않는다', () => {
    const later = new Date(T0.getTime() + 30 * DAY)
    expect(reviewDue(decideItem(item('키보드', 1000), 'skipped', T0), later)).toBe(false)
    expect(reviewDue(item('마우스', 1000), later)).toBe(false)
  })

  it('AC25: 답을 저장하고 고칠 수 있으며, 메모는 앞뒤 공백을 지운다', () => {
    const now = new Date(T0.getTime() + 8 * DAY)
    const first = review(bought, 'good', '  매일 씀 ', now)
    expect(first.satisfaction).toBe('good')
    expect(first.reviewNote).toBe('매일 씀')
    expect(first.updatedAt).toBe(now.toISOString())
    const changed = review(first, 'regret', '', now)
    expect(changed.satisfaction).toBe('regret')
    expect(changed.reviewNote).toBeUndefined()
  })
})

describe('열린 화면의 회고 갱신 시점', () => {
  it('아직 묻지 않은 구매 기록 중 가장 가까운 회고 시점까지 남은 시간을 알려준다', async () => {
    const { nextRetroDelay } = await import('./summary')
    const now = new Date(T0.getTime() + DAY)
    const bought = decideItem(item('청소기', 1000), 'purchased', T0)
    const answered = review(decideItem(item('의자', 1000), 'purchased', T0), 'good', undefined, now)
    expect(nextRetroDelay([bought, answered], now)).toBe(6 * DAY)
    expect(nextRetroDelay([answered], now)).toBeNull()
  })
})

describe('시급 설정 (F12)', () => {
  it('AC24: 1,000~1,000,000원 정수만 받고, 비우면 null이다', () => {
    expect(validateWage('10,000')).toEqual({ value: 10000 })
    expect(validateWage('')).toEqual({ value: null })
    expect(validateWage('999').error).toBeTruthy()
    expect(validateWage('1000001').error).toBeTruthy()
    expect(validateWage('12.5').error).toBeTruthy()
    expect(validateWage('1000')).toEqual({ value: 1000 })
    expect(validateWage('1000000')).toEqual({ value: 1000000 })
  })

  it('설정 복원: 손상되면 비운 것으로 본다', () => {
    const ok: Settings = { schemaVersion: 1, hourlyWage: 10000 }
    expect(parseSettings(JSON.stringify(ok))).toEqual(ok)
    expect(parseSettings(null)).toEqual({ schemaVersion: 1, hourlyWage: null })
    expect(parseSettings('{bad')).toEqual({ schemaVersion: 1, hourlyWage: null })
    expect(parseSettings(JSON.stringify({ schemaVersion: 1, hourlyWage: -5 }))).toEqual({ schemaVersion: 1, hourlyWage: null })
  })
})
