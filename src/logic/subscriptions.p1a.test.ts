import { describe, expect, it } from 'vitest'
import {
  FIXED_COST_KINDS,
  createSubscription,
  kindOf,
  parseSubscriptions,
  tracksUsage,
  updateSubscription,
  yearsLater,
  type Subscription,
} from './subscriptions'

// PRD F45~F47 저장 (AC84): 고정비의 종류 kind, 무료 체험 끝나는 날 trialEndDate, 해지한 날 cancelledOn
// plan: 계획의 테스트 이름 끝 (AC84)를 앞으로 옮김(R2)
const NOW = new Date(2026, 10, 1, 9)
const base = {
  id: 's1',
  name: '휴대폰 요금',
  priceKrw: 55000,
  cycle: 'monthly',
  billingDay: 15,
  lastUsedDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}
const parse = (over: Record<string, unknown>) => parseSubscriptions(JSON.stringify({ schemaVersion: 1, items: [{ ...base, ...over }] }))
const input = { name: '넷플릭스', priceKrw: 13500, cycle: 'monthly' as const, billingDay: 15, lastUsedDate: null }

describe('고정비 종류·체험·해지 복원 (F45~F47)', () => {
  it('AC84: 모르는 종류, 통신의 체험 끝나는 날, 실제가 아닌 해지한 날은 손상이다', () => {
    expect(parse({ kind: 'pet' }).ok).toBe(false)
    expect(parse({ kind: 'phone', trialEndDate: '2026-11-14' }).ok).toBe(false)
    expect(parse({ cancelledOn: '2026-02-30' }).ok).toBe(false)
  })

  it('AC84: 멤버십의 체험·해지한 날과 구독을 적은 kind는 그대로 읽힌다', () => {
    const membership = parse({ kind: 'membership', trialEndDate: '2026-11-14', cancelledOn: '2026-10-20' })
    expect(membership.ok).toBe(true)
    if (membership.ok) {
      expect(membership.store.items[0]).toMatchObject({ kind: 'membership', trialEndDate: '2026-11-14', cancelledOn: '2026-10-20' })
    }
    const sub = parse({ kind: 'subscription' })
    expect(sub.ok).toBe(true)
    if (sub.ok) expect(sub.store.items[0]!.kind).toBe('subscription')
  })

  it('AC84: 실제가 아닌 체험 끝나는 날은 구독·멤버십이어도 손상이다', () => {
    expect(parse({ kind: 'membership', trialEndDate: '2026-02-30' }).ok).toBe(false)
    // kind가 없으면 구독이라 체험 끝나는 날이 있어도 된다
    expect(parse({ trialEndDate: '2026-11-14' }).ok).toBe(true)
  })

  it('AC84: 종류 일곱 개는 고르는 순서대로 있다', () => {
    expect(FIXED_COST_KINDS).toEqual(['subscription', 'membership', 'delivery', 'phone', 'housing', 'insurance', 'other'])
  })
})

describe('종류 판별 (F45)', () => {
  it('AC84: kind가 없으면 구독이고, 사용 기록은 구독·멤버십에만 있다', () => {
    expect(kindOf({})).toBe('subscription')
    expect(kindOf({ kind: 'phone' })).toBe('phone')
    expect(tracksUsage({})).toBe(true)
    expect(tracksUsage({ kind: 'membership' })).toBe(true)
    for (const kind of ['delivery', 'phone', 'housing', 'insurance', 'other'] as const) {
      expect(tracksUsage({ kind })).toBe(false)
    }
  })
})

describe('고정비 만들기·수정 (F45~F47 저장)', () => {
  it('AC84: 예전 입력으로 만든 기록에는 kind·trialEndDate·cancelledOn이 없다', () => {
    const made = createSubscription({ name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null }, NOW, 'a')
    expect(Object.keys(made).sort()).toEqual(['billingDay', 'createdAt', 'cycle', 'id', 'lastUsedDate', 'name', 'priceKrw', 'updatedAt'])
  })

  it('AC84: kind가 구독이면 저장하지 않고, 구독·멤버십이 아니면 체험 끝나는 날을 저장하지 않는다', () => {
    const sub = createSubscription({ ...input, kind: 'subscription' }, NOW, 'a')
    expect('kind' in sub).toBe(false)
    const phone = createSubscription({ ...input, kind: 'phone', trialEndDate: '2026-11-14' }, NOW, 'b')
    expect(phone.kind).toBe('phone')
    expect('trialEndDate' in phone).toBe(false)
    const membership = createSubscription({ ...input, kind: 'membership', trialEndDate: '2026-11-14' }, NOW, 'c')
    expect(membership.trialEndDate).toBe('2026-11-14')
  })

  it('AC84: 수정해도 해지한 날은 남는다', () => {
    const cancelled = { ...base, cancelledOn: '2026-10-20' } as Subscription
    expect(updateSubscription(cancelled, input, NOW).cancelledOn).toBe('2026-10-20')
  })

  it('AC84: 수정하면 종류와 체험 끝나는 날은 입력에서 온다', () => {
    const old = { ...base, kind: 'membership', trialEndDate: '2026-11-14' } as Subscription
    const edited = updateSubscription(old, input, NOW)
    expect('kind' in edited).toBe(false)
    expect('trialEndDate' in edited).toBe(false)
  })
})

describe('몇 해 뒤 같은 날 (F14·F46·F48)', () => {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  it('AC84: yearsLater는 없는 날을 그 달 말일로 맞춘다', () => {
    expect(iso(yearsLater(new Date(2024, 1, 29, 9), 1))).toBe('2025-02-28')
    expect(iso(yearsLater(new Date(2026, 10, 1, 9), 10))).toBe('2036-11-01')
    expect(iso(yearsLater(new Date(2026, 10, 1, 9), -1))).toBe('2025-11-01')
    expect(yearsLater(new Date(2026, 10, 1, 9), 1).getHours()).toBe(12)
  })
})
