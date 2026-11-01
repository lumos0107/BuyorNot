import { describe, expect, it } from 'vitest'
import {
  FIXED_COST_KINDS,
  createSubscription,
  kindOf,
  parseSubscriptions,
  subscriptionSummary,
  tracksUsage,
  updateSubscription,
  validateSubscriptionInput,
  yearsLater,
  type Subscription,
  type SubscriptionRawInput,
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

describe('고정비 입력 검사·요약 (F45)', () => {
  const raw = (over: Partial<SubscriptionRawInput> = {}): SubscriptionRawInput => ({
    name: '넷플릭스',
    price: '13500',
    cycle: 'monthly',
    billingDay: '15',
    renewalDate: '',
    lastUsedDate: '',
    memo: '',
    ...over,
  })

  it('AC82: 통신으로 바꾸면 마지막 사용일을 비운다', () => {
    // 마지막 사용일 칸에 값이 남아 있어도 통신이면 보지 않는다(잘못된 값이어도 오류가 아니다)
    const phone = validateSubscriptionInput(raw({ kind: 'phone', lastUsedDate: '2026-10-20' }), NOW)
    expect(phone.value).toMatchObject({ kind: 'phone', lastUsedDate: null })
    expect(validateSubscriptionInput(raw({ kind: 'phone', lastUsedDate: '2099-01-01' }), NOW).errors).toEqual({})
    // 구독이면 kind를 넣지 않고 마지막 사용일을 그대로 둔다
    const sub = validateSubscriptionInput(raw({ kind: 'subscription', lastUsedDate: '2026-10-20' }), NOW)
    expect('kind' in sub.value!).toBe(false)
    expect(sub.value!.lastUsedDate).toBe('2026-10-20')
    expect(validateSubscriptionInput(raw({ kind: 'membership', lastUsedDate: '2026-10-20' }), NOW).value).toMatchObject({ kind: 'membership', lastUsedDate: '2026-10-20' })
  })

  it('AC82: 통신은 해지 후보·확인 필요에 세지 않는다', () => {
    const old = '2026-08-01'
    const subs = [
      { ...base, id: 'a', name: '구독', kind: undefined, lastUsedDate: old },
      { ...base, id: 'b', name: '통신', kind: 'phone', lastUsedDate: old },
      { ...base, id: 'c', name: '월세', kind: 'housing', lastUsedDate: null },
      { ...base, id: 'd', name: '멤버십', kind: 'membership', lastUsedDate: null },
    ] as Subscription[]
    const s = subscriptionSummary(subs, NOW)
    expect(s).toMatchObject({ candidateCount: 1, candidateMonthly: 55000, unknownCount: 1, monthlyTotal: 220000, yearlyTotal: 2640000 })
  })

  it('AC83: 이름이 비면 이름을 입력해 달라고 한다', () => {
    expect(validateSubscriptionInput(raw({ name: '  ' }), NOW).errors.name).toBe('이름을 입력해 주세요')
  })
})
