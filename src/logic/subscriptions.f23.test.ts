import { describe, expect, it } from 'vitest'
import { demoSubscriptions, isCancelCandidate, needsUsageCheck, subscriptionSummary, type Subscription } from './subscriptions'

// PRD F23 (F14 보강): 사용 기록이 없는 구독은 해지 후보가 아니라 "확인 필요"다. 해지 후보는 기록상 31일 이상 안 쓴 구독뿐이다 (AC27, AC42)
const TODAY = new Date(2026, 9, 11, 9)
const at = '2026-10-01T00:00:00.000Z'
const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 's',
  name: '티빙',
  priceKrw: 9500,
  cycle: 'monthly',
  billingDay: 10,
  lastUsedDate: null,
  createdAt: at,
  updatedAt: at,
  ...over,
})

describe('사용 기록 없음과 안 씀 (F23)', () => {
  it('사용 기록이 없으면 해지 후보가 아니라 확인 필요다', () => {
    expect(isCancelCandidate(sub(), TODAY)).toBe(false)
    expect(needsUsageCheck(sub())).toBe(true)
    expect(needsUsageCheck(sub({ useDates: [] }))).toBe(true)
  })

  it('마지막 사용일이나 오늘 썼어요 기록이 있으면 확인 필요가 아니다', () => {
    expect(needsUsageCheck(sub({ lastUsedDate: '2026-09-01' }))).toBe(false)
    expect(needsUsageCheck(sub({ useDates: ['2026-10-11'] }))).toBe(false)
  })

  it('기록상 31일 이상 안 썼으면 해지 후보, 30일 전은 아직 아니다', () => {
    expect(isCancelCandidate(sub({ lastUsedDate: '2026-09-10' }), TODAY)).toBe(true)
    expect(isCancelCandidate(sub({ lastUsedDate: '2026-09-11' }), TODAY)).toBe(false)
  })

  it('요약에 사용 기록이 없는 구독 수를 넣고, 해지 후보 합계에는 넣지 않는다', () => {
    const s = subscriptionSummary([sub(), sub({ id: 's2', name: '왓챠', lastUsedDate: '2026-09-01', priceKrw: 7900 })], TODAY)
    expect(s.unknownCount).toBe(1)
    expect(s.candidateCount).toBe(1)
    expect(s.candidateMonthly).toBe(7900)
  })
})

describe('예시 구독 (F23, AC42)', () => {
  it('음악 스트리밍은 마지막 사용이 40일 전이라 해지 후보이고, 확인 필요인 예시는 없다', () => {
    let n = 0
    const demo = demoSubscriptions(TODAY, () => `d${++n}`)
    const music = demo.find((s) => s.name === '(예시) 음악 스트리밍')!
    expect(music.lastUsedDate).toBe('2026-09-01')
    const s = subscriptionSummary(demo, TODAY)
    expect(s.candidateCount).toBe(1)
    expect(s.candidateMonthly).toBe(10900)
    expect(s.unknownCount).toBe(0)
  })
})
