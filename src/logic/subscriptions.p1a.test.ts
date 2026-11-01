import { describe, expect, it } from 'vitest'
import {
  FIXED_COST_KINDS,
  cancelSubscription,
  createSubscription,
  isCancelled,
  kindOf,
  nextBillingDate,
  parseSubscriptions,
  resumeSubscription,
  sortSubscriptions,
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

// PRD F46 무료 체험 끝나는 날 (AC85~AC87, 판정 R46)
const at = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 15, 30)
}
const trialSub = (over: Partial<Subscription> = {}): Subscription =>
  ({ ...base, id: 't1', name: '넷플릭스', priceKrw: 13500, billingDay: 20, kind: undefined, trialEndDate: '2026-11-14', ...over }) as Subscription

describe('체험 중의 다음 결제일 (F46, R46)', () => {
  it('AC86: 체험 중이면 다음 결제일은 체험 끝나는 날이다', () => {
    const sub = trialSub()
    expect(nextBillingDate(sub, at('2026-11-01'))).toBe('2026-11-14')
    // 체험 끝나는 날 당일도 체험 중이다
    expect(nextBillingDate(sub, at('2026-11-14'))).toBe('2026-11-14')
    // 연 구독도 체험 끝나는 날이 먼저다
    const yearly = trialSub({ cycle: 'yearly', billingDay: undefined, renewalDate: '2027-11-14' })
    expect(nextBillingDate(yearly, at('2026-11-01'))).toBe('2026-11-14')
  })

  it('AC86: 체험이 끝난 다음 날부터는 결제일 규칙으로 다음 결제일을 잡는다', () => {
    const sub = trialSub()
    expect(nextBillingDate(sub, at('2026-11-15'))).toBe('2026-11-20')
    expect(nextBillingDate(sub, at('2026-12-01'))).toBe('2026-12-20')
    const yearly = trialSub({ cycle: 'yearly', billingDay: undefined, renewalDate: '2027-11-14' })
    expect(nextBillingDate(yearly, at('2026-11-15'))).toBe('2027-11-14')
  })

  it('AC86: 체험이 없으면 다음 결제일이 지금과 같다', () => {
    // AC27의 입력 몇 개 그대로
    const none = (billingDay: number) => trialSub({ trialEndDate: undefined, billingDay })
    expect(nextBillingDate(none(31), at('2026-02-10'))).toBe('2026-02-28')
    expect(nextBillingDate(none(31), at('2026-02-28'))).toBe('2026-02-28')
    expect(nextBillingDate(none(15), at('2026-11-16'))).toBe('2026-12-15')
  })
})

describe('체험 중인 것의 요약 (F46)', () => {
  it('AC85: 체험 중인 것은 합계에서 빠지고 체험 줄 금액에 들어간다', () => {
    const phone = { ...base, id: 'p1', name: '휴대폰', kind: 'phone', billingDay: 10 } as Subscription
    const monthlyTrial = subscriptionSummary([trialSub(), phone], NOW)
    expect(monthlyTrial).toMatchObject({ monthlyTotal: 55000, yearlyTotal: 660000, trialCount: 1, trialMonthly: 13500 })
    // 매년이면 월 환산(120,000 / 12 = 10,000)이 체험 줄 금액이다
    const yearlyTrial = trialSub({ cycle: 'yearly', priceKrw: 120000, billingDay: undefined, renewalDate: '2027-11-14' })
    expect(subscriptionSummary([yearlyTrial, phone], NOW)).toMatchObject({ monthlyTotal: 55000, yearlyTotal: 660000, trialCount: 1, trialMonthly: 10000 })
    // 체험이 끝난 다음 날부터는 합계에 들어간다
    expect(subscriptionSummary([trialSub(), phone], at('2026-11-15'))).toMatchObject({ monthlyTotal: 68500, trialCount: 0, trialMonthly: 0 })
  })

  it('AC85: 체험 중인 구독도 해지 후보·확인 필요는 그대로 판정한다', () => {
    const s = subscriptionSummary([trialSub({ lastUsedDate: '2026-08-01' }), trialSub({ id: 't2', name: '왓챠' })], NOW)
    expect(s).toMatchObject({ candidateCount: 1, unknownCount: 1, trialCount: 2, monthlyTotal: 0 })
  })
})

describe('체험 끝나는 날 입력 (F46)', () => {
  const raw = (over: Partial<SubscriptionRawInput> = {}): SubscriptionRawInput => ({
    name: '넷플릭스',
    price: '13500',
    cycle: 'monthly',
    billingDay: '20',
    renewalDate: '',
    lastUsedDate: '',
    memo: '',
    ...over,
  })
  const RANGE = '무료 체험 끝나는 날은 오늘부터 1년 안이어야 해요'

  it('AC87: 체험 끝나는 날의 범위와 오류', () => {
    expect(validateSubscriptionInput(raw({ trialEndDate: '2027-11-02' }), NOW).errors.trialEndDate).toBe(RANGE)
    expect(validateSubscriptionInput(raw({ trialEndDate: '2026-10-31' }), NOW).errors.trialEndDate).toBe(RANGE)
    const edge = validateSubscriptionInput(raw({ trialEndDate: '2027-11-01' }), NOW)
    expect(edge.errors).toEqual({})
    expect(edge.value?.trialEndDate).toBe('2027-11-01')
    // 오늘도 받는다. 비우면 체험이 아니다
    expect(validateSubscriptionInput(raw({ trialEndDate: '2026-11-01' }), NOW).value?.trialEndDate).toBe('2026-11-01')
    const empty = validateSubscriptionInput(raw({ trialEndDate: '  ' }), NOW)
    expect(empty.errors).toEqual({})
    expect('trialEndDate' in empty.value!).toBe(false)
    // 날짜가 아니면
    expect(validateSubscriptionInput(raw({ trialEndDate: '2026-02-30' }), NOW).errors.trialEndDate).toBe('올바른 날짜를 골라 주세요')
  })

  it('AC87: 채워 둔 지난 체험 날을 그대로 두면 저장된다', () => {
    const kept = validateSubscriptionInput(raw({ trialEndDate: '2026-10-20' }), NOW, undefined, '2026-10-20')
    expect(kept.errors).toEqual({})
    expect(kept.value?.trialEndDate).toBe('2026-10-20')
    // 채워 둔 값과 다르게 바꾸면 범위를 따진다
    expect(validateSubscriptionInput(raw({ trialEndDate: '2026-10-21' }), NOW, undefined, '2026-10-20').errors.trialEndDate).toBe(RANGE)
  })

  it('AC87: 구독·멤버십이 아니면 체험 끝나는 날을 넣지 않는다', () => {
    for (const kind of ['delivery', 'phone', 'housing', 'insurance', 'other'] as const) {
      const out = validateSubscriptionInput(raw({ kind, trialEndDate: '2026-11-14' }), NOW)
      expect(out.errors).toEqual({})
      expect('trialEndDate' in out.value!).toBe(false)
    }
    // 잘못된 값이 남아 있어도 오류가 아니다
    expect(validateSubscriptionInput(raw({ kind: 'phone', trialEndDate: '2099-01-01' }), NOW).errors).toEqual({})
    expect(validateSubscriptionInput(raw({ kind: 'membership', trialEndDate: '2026-11-14' }), NOW).value?.trialEndDate).toBe('2026-11-14')
  })

  it('AC87: 체험이 있어도 결제일은 필수다', () => {
    expect(validateSubscriptionInput(raw({ billingDay: '', trialEndDate: '2026-11-14' }), NOW).errors).toEqual({ billingDay: '결제일은 1~31일 사이여야 해요' })
    const yearly = validateSubscriptionInput(raw({ cycle: 'yearly', renewalDate: '', trialEndDate: '2026-11-14' }), NOW)
    expect(yearly.errors).toEqual({ renewalDate: '다음 결제일을 골라 주세요' })
  })
})

describe('해지했어요 (F47)', () => {
  const live = createSubscription({ name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null }, NOW, 'a')

  it('AC88: 해지하면 cancelledOn이 생기고 다시 쓰면 사라진다', () => {
    const later = new Date(2026, 10, 2, 9)
    const cancelled = cancelSubscription(live, '2026-10-20', later)
    expect(isCancelled(live)).toBe(false)
    expect(isCancelled(cancelled)).toBe(true)
    expect(cancelled).toMatchObject({ id: 'a', cancelledOn: '2026-10-20', updatedAt: later.toISOString() })
    const resumed = resumeSubscription(cancelled, later)
    expect(isCancelled(resumed)).toBe(false)
    expect(resumed).not.toHaveProperty('cancelledOn')
    expect(resumed.updatedAt).toBe(later.toISOString())
    // 처음 기록은 바뀌지 않는다
    expect(live).not.toHaveProperty('cancelledOn')
  })

  it('AC88: 해지한 것은 월평균·1년·해지 후보·확인 필요·체험에서 빠진다', () => {
    const mk = (id: string, over: Partial<Subscription>) => createSubscription({ name: id, priceKrw: 10000, cycle: 'monthly', billingDay: 15, lastUsedDate: null, ...over }, NOW, id)
    const items = [
      mk('쓰는 중', { lastUsedDate: '2026-10-30' }),
      { ...mk('해지한 후보', { lastUsedDate: '2026-08-01' }), cancelledOn: '2026-10-20' },
      { ...mk('해지한 확인 필요', {}), cancelledOn: '2026-10-20' },
      { ...mk('해지한 체험', { trialEndDate: '2026-11-14' }), cancelledOn: '2026-10-20' },
      { ...mk('해지한 연', { cycle: 'yearly', billingDay: undefined, renewalDate: '2027-02-01', priceKrw: 120000, lastUsedDate: '2026-10-30' }), cancelledOn: '2026-10-20' },
    ]
    expect(subscriptionSummary(items, NOW)).toEqual({
      monthlyTotal: 10000,
      yearlyTotal: 120000,
      candidateCount: 0,
      candidateMonthly: 0,
      unknownCount: 0,
      trialCount: 0,
      trialMonthly: 0,
    })
  })

  it('AC88: 쓰는 중인 목록 정렬에는 해지한 것이 들어가지 않는다', () => {
    const a = createSubscription({ name: '가', priceKrw: 1000, cycle: 'monthly', billingDay: 20, lastUsedDate: null }, NOW, 'a')
    const b = createSubscription({ name: '나', priceKrw: 1000, cycle: 'monthly', billingDay: 10, lastUsedDate: null }, NOW, 'b')
    const c = cancelSubscription(createSubscription({ name: '다', priceKrw: 1000, cycle: 'monthly', billingDay: 5, lastUsedDate: null }, NOW, 'c'), '2026-10-20', NOW)
    expect(sortSubscriptions([a, b, c], NOW).map((s) => s.name)).toEqual(['나', '가'])
  })
})
