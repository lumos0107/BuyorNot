import { describe, expect, it } from 'vitest'
import { isCancelCandidate, lastUsedOf, parseSubscriptions, toggleUseToday, updateSubscription, type Subscription } from './subscriptions'
import { usageInfo } from './usage'

// PRD F19 구독 "오늘 썼어요" (F16 연동 계획 2단계): 직접 기록한 날로 실제 사용 횟수와 1번에 드는 돈을 보여준다
const TODAY = new Date(2026, 9, 11, 9)
const NOW = new Date(2026, 9, 11, 9, 30)
const at = '2026-10-01T00:00:00.000Z'
const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 's',
  name: '넷플릭스',
  priceKrw: 13500,
  cycle: 'monthly',
  billingDay: 15,
  lastUsedDate: null,
  createdAt: at,
  updatedAt: at,
  ...over,
})

describe('오늘 썼어요 기록 (F19)', () => {
  it('누르면 오늘을 기록하고, 다시 누르면 지운다 (날짜순, 중복 없음)', () => {
    const once = toggleUseToday(sub({ useDates: ['2026-10-09'] }), TODAY, NOW)
    expect(once.useDates).toEqual(['2026-10-09', '2026-10-11'])
    expect(once.updatedAt).toBe(NOW.toISOString())
    expect(toggleUseToday(once, TODAY, NOW).useDates).toEqual(['2026-10-09'])
  })

  it('90일보다 오래된 기록은 저장할 때 정리한다', () => {
    expect(toggleUseToday(sub({ useDates: ['2026-07-12', '2026-07-13'] }), TODAY, NOW).useDates).toEqual(['2026-07-13', '2026-10-11'])
  })

  it('마지막 사용일은 직접 적은 날과 기록한 날 중 늦은 날이고, 해지 후보 판정에도 쓴다', () => {
    const recorded = sub({ lastUsedDate: '2026-08-01', useDates: ['2026-10-06'] })
    expect(lastUsedOf(recorded)).toBe('2026-10-06')
    expect(isCancelCandidate(recorded, TODAY)).toBe(false)
    expect(lastUsedOf(sub({ lastUsedDate: '2026-10-08', useDates: ['2026-10-01'] }))).toBe('2026-10-08')
    expect(lastUsedOf(sub())).toBeNull()
  })
})

describe('사용량: 직접 기록이 예시보다 먼저 (F19)', () => {
  it('최근 30일 안의 기록만 세고 1번에 드는 돈을 보여준다', () => {
    const recorded = sub({ useDates: ['2026-09-01', '2026-10-01', '2026-10-05', '2026-10-11'] })
    expect(usageInfo(recorded, TODAY)).toEqual({ source: 'manual', text: '최근 30일 중 3일 사용 · 쓴 날 하루에 약 4,500원' })
  })

  it('최근 30일 경계: 오늘 포함 30일 안(9월 12일)은 세고, 그 전날(9월 11일)은 세지 않는다', () => {
    expect(usageInfo(sub({ useDates: ['2026-09-11', '2026-09-12'] }), TODAY)).toEqual({
      source: 'manual',
      text: '최근 30일 중 1일 사용 · 쓴 날 하루에 약 13,500원',
    })
  })

  it('빈 기록은 기록이 없는 것과 같다 (마지막 사용일 계산도 깨지지 않는다)', () => {
    expect(usageInfo(sub({ useDates: [] }), TODAY)).toBeNull()
    expect(lastUsedOf(sub({ useDates: [] }))).toBeNull()
    expect(lastUsedOf(sub({ lastUsedDate: '2026-10-01', useDates: [] }))).toBe('2026-10-01')
  })

  it('기록은 있지만 최근 30일 안에 없으면 사용 없음', () => {
    expect(usageInfo(sub({ useDates: ['2026-09-01'] }), TODAY)).toEqual({ source: 'manual', text: '최근 30일 사용 없음' })
  })

  it('직접 기록이 없으면 예시, 둘 다 없으면 null', () => {
    expect(usageInfo(sub({ exampleUsageMinutes: 1080 }), TODAY)).toEqual({ source: 'example', text: '최근 30일 18시간 · 1시간에 약 750원' })
    expect(usageInfo(sub({ exampleUsageMinutes: 1080, useDates: ['2026-10-11'] }), TODAY)).toEqual({
      source: 'manual',
      text: '최근 30일 중 1일 사용 · 쓴 날 하루에 약 13,500원',
    })
    expect(usageInfo(sub(), TODAY)).toBeNull()
  })
})

describe('저장 (F19)', () => {
  it('복원할 때 기록은 실제 날짜 배열이어야 하고 중복이 없어야 한다', () => {
    const store = (useDates: unknown) => JSON.stringify({ schemaVersion: 1, items: [{ ...sub(), useDates }] })
    expect(parseSubscriptions(store(['2026-10-01', '2026-10-11']))).toMatchObject({ ok: true })
    expect(parseSubscriptions(store('2026-10-01'))).toEqual({ ok: false, reason: 'corrupt' })
    expect(parseSubscriptions(store(['2026-02-30']))).toEqual({ ok: false, reason: 'corrupt' })
    expect(parseSubscriptions(store(['2026-10-01', '2026-10-01']))).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('구독을 고쳐도 기록은 남는다', () => {
    const edited = updateSubscription(sub({ useDates: ['2026-10-11'] }), { name: '넷플릭스', priceKrw: 17000, cycle: 'monthly', billingDay: 15, lastUsedDate: null }, NOW)
    expect(edited.useDates).toEqual(['2026-10-11'])
  })
})
