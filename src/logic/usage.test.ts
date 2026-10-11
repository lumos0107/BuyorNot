import { describe, expect, it } from 'vitest'
import { demoSubscriptions, parseSubscriptions, subscriptionSummary, updateSubscription, type Subscription } from './subscriptions'
import { usageText } from './usage'

// PRD F16 구독 사용량 (예시): 지금은 예시 구독에만 예시 숫자를 보여준다. 실제 연동 계획은 docs/구독_사용시간_연동_계획.md
// OTT·음악은 사용 시간(분), 배달·쇼핑 멤버십은 사용 횟수(주문 등)로 본다
const NOW = new Date(2026, 9, 11, 9)
const at = '2026-10-01T00:00:00.000Z'
const monthly = (over: Partial<Subscription> = {}): Subscription => ({
  id: 'm',
  name: '(예시) 넷플릭스',
  priceKrw: 13500,
  cycle: 'monthly',
  billingDay: 15,
  lastUsedDate: null,
  createdAt: at,
  updatedAt: at,
  ...over,
})

describe('사용량 문장 (F16)', () => {
  it('사용 시간: 최근 30일 시간과 1시간에 드는 돈(10원 단위 반올림)', () => {
    expect(usageText(monthly({ exampleUsageMinutes: 1080 }))).toBe('최근 30일 18시간 · 1시간에 약 750원')
    expect(usageText(monthly({ exampleUsageMinutes: 130 }))).toBe('최근 30일 2시간 10분 · 1시간에 약 6,230원')
    expect(usageText(monthly({ exampleUsageMinutes: 45 }))).toBe('최근 30일 45분 · 1시간에 약 18,000원')
  })

  it('사용 횟수: 최근 30일 횟수와 1번에 드는 돈', () => {
    expect(usageText(monthly({ priceKrw: 3990, exampleUseCount: 6 }))).toBe('최근 30일 6번 사용 · 1번에 약 670원')
    expect(usageText(monthly({ priceKrw: 7890, exampleUseCount: 1 }))).toBe('최근 30일 1번 사용 · 1번에 약 7,890원')
  })

  it('연 구독은 월 환산 요금으로 계산한다', () => {
    const yearly = monthly({ priceKrw: 120000, cycle: 'yearly', billingDay: undefined, renewalDate: '2027-01-01', exampleUsageMinutes: 600 })
    expect(usageText(yearly)).toBe('최근 30일 10시간 · 1시간에 약 1,000원')
  })

  it('0이면 사용 없음, 정보가 없으면 null', () => {
    expect(usageText(monthly({ exampleUsageMinutes: 0 }))).toBe('최근 30일 사용 없음')
    expect(usageText(monthly({ exampleUseCount: 0 }))).toBe('최근 30일 사용 없음')
    expect(usageText(monthly())).toBeNull()
  })
})

describe('예시 구독과 예시 사용량 (F14·F16)', () => {
  let n = 0
  const demo = demoSubscriptions(NOW, () => `id-${++n}`)

  it('예시 구독 5개: OTT·음악은 시간, 배달·쇼핑 멤버십은 횟수, 클라우드는 시간으로 보기 어려워 없음', () => {
    expect(demo.map((s) => [s.name, s.priceKrw, s.exampleUsageMinutes, s.exampleUseCount])).toEqual([
      ['(예시) 넷플릭스', 13500, 1080, undefined],
      ['(예시) 음악 스트리밍', 10900, 0, undefined],
      ['(예시) 클라우드 저장공간', 120000, undefined, undefined],
      ['(예시) 배민클럽', 3990, undefined, 6],
      ['(예시) 쿠팡 와우 멤버십', 7890, undefined, 1],
    ])
  })

  it('예시 요약: 월 46,280원, 연 555,360원, 해지 후보는 음악 스트리밍 1개', () => {
    expect(subscriptionSummary(demo, NOW)).toEqual({ monthlyTotal: 46280, yearlyTotal: 555360, candidateCount: 1, candidateMonthly: 10900, unknownCount: 0 })
  })

  it('복원할 때 예시 사용 시간은 0~43,200분, 사용 횟수는 0~999 정수만 받고, 둘이 함께 있으면 손상이다', () => {
    const store = (over: Record<string, unknown>) => JSON.stringify({ schemaVersion: 1, items: [{ ...monthly(), ...over }] })
    expect(parseSubscriptions(store({ exampleUsageMinutes: 0 }))).toMatchObject({ ok: true })
    expect(parseSubscriptions(store({ exampleUsageMinutes: 43200 }))).toMatchObject({ ok: true })
    expect(parseSubscriptions(store({ exampleUseCount: 999 }))).toMatchObject({ ok: true })
    for (const bad of [-1, 1.5, 43201, '60']) expect(parseSubscriptions(store({ exampleUsageMinutes: bad }))).toEqual({ ok: false, reason: 'corrupt' })
    for (const bad of [-1, 2.5, 1000, '3']) expect(parseSubscriptions(store({ exampleUseCount: bad }))).toEqual({ ok: false, reason: 'corrupt' })
    expect(parseSubscriptions(store({ exampleUsageMinutes: 60, exampleUseCount: 2 }))).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('예시 구독을 고쳐도 예시 사용량은 남는다', () => {
    const edited = updateSubscription(monthly({ exampleUsageMinutes: 1080 }), { name: '(예시) 넷플릭스', priceKrw: 17000, cycle: 'monthly', billingDay: 15, lastUsedDate: null }, NOW)
    expect(edited.exampleUsageMinutes).toBe(1080)
    expect(usageText(edited)).toBe('최근 30일 18시간 · 1시간에 약 940원')
    const delivery = updateSubscription(monthly({ priceKrw: 3990, exampleUseCount: 6 }), { name: '(예시) 배민클럽', priceKrw: 3990, cycle: 'monthly', billingDay: 20, lastUsedDate: null }, NOW)
    expect(delivery.exampleUseCount).toBe(6)
  })
})
