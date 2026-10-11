import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  isCancelCandidate,
  monthlyEquivalent,
  nextBillingDate,
  parseSubscriptions,
  sortSubscriptions,
  subscriptionSummary,
  validateSubscriptionInput,
  type Subscription,
} from './subscriptions'

// PRD F14 구독 정리함 / AC27. 날짜는 현지 달력 기준
const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 15, 30)
}
let seq = 0

function monthly(name: string, price: number, billingDay: number, lastUsedDate: string | null = null): Subscription {
  return { id: `s-${++seq}`, name, priceKrw: price, cycle: 'monthly', billingDay, lastUsedDate, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
}

function yearly(name: string, price: number, renewalDate: string, lastUsedDate: string | null = null): Subscription {
  return { id: `s-${++seq}`, name, priceKrw: price, cycle: 'yearly', renewalDate, lastUsedDate, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
}

describe('월 환산 (F14)', () => {
  it('AC27: 연 120,005원은 월 10,000원으로 표시한다 (원 미만 반올림)', () => {
    expect(monthlyEquivalent(yearly('클라우드', 120005, '2026-12-01'))).toBe(10000)
    expect(monthlyEquivalent(monthly('넷플릭스', 13500, 15))).toBe(13500)
  })
})

describe('다음 결제일 (F14)', () => {
  it('AC27: 결제일 31일이면 2월에는 말일(28일)에 결제한다', () => {
    expect(nextBillingDate(monthly('A', 1000, 31), day('2026-02-10'))).toBe('2026-02-28')
  })

  it('AC27: 결제일이 오늘이면 D-0이다 (2월 28일, 10일)', () => {
    const today = day('2026-02-28')
    const sub = monthly('A', 1000, 31)
    expect(nextBillingDate(sub, today)).toBe('2026-02-28')
    expect(daysUntil(nextBillingDate(sub, today), today)).toBe(0)
    expect(daysUntil(nextBillingDate(monthly('B', 1000, 10), day('2026-10-10')), day('2026-10-10'))).toBe(0)
  })

  it('AC27: 2월 말 결제가 지나면 다음은 3월 28일이 아니라 3월 31일이다', () => {
    expect(nextBillingDate(monthly('A', 1000, 31), day('2026-03-01'))).toBe('2026-03-31')
  })

  it('결제일이 지났으면 다음 달, 연도가 넘어가도 맞다', () => {
    expect(nextBillingDate(monthly('A', 1000, 15), day('2026-12-20'))).toBe('2027-01-15')
    expect(daysUntil('2027-01-15', day('2026-12-20'))).toBe(26)
  })

  it('AC27: 연 구독은 갱신일이 지났으면 1년씩 더한다', () => {
    expect(nextBillingDate(yearly('A', 1000, '2026-03-01'), day('2026-03-02'))).toBe('2027-03-01')
    expect(nextBillingDate(yearly('A', 1000, '2026-03-01'), day('2026-03-01'))).toBe('2026-03-01')
  })

  it('윤년 2월 29일 갱신은 평년에는 2월 28일, 윤년에는 2월 29일이다', () => {
    expect(nextBillingDate(yearly('A', 1000, '2024-02-29'), day('2026-03-01'))).toBe('2027-02-28')
    expect(nextBillingDate(yearly('A', 1000, '2024-02-29'), day('2027-12-01'))).toBe('2028-02-29')
  })
})

describe('해지 후보 (F14)', () => {
  const today = day('2026-10-11')
  it('AC27: 마지막 사용이 30일 전이면 아직 아니고, 31일 전이거나 비어 있으면 해지 후보다', () => {
    expect(isCancelCandidate(monthly('A', 1000, 1, '2026-09-11'), today)).toBe(false)
    expect(isCancelCandidate(monthly('A', 1000, 1, '2026-09-10'), today)).toBe(true)
    expect(isCancelCandidate(monthly('A', 1000, 1, null), today)).toBe(true)
    expect(isCancelCandidate(monthly('A', 1000, 1, '2026-10-11'), today)).toBe(false)
  })
})

describe('요약과 정렬 (F14)', () => {
  const today = day('2026-10-11')

  it('AC27: 월 10,000 + 5,000, 연 120,005 → 월 25,000원, 연 300,005원 (연 합계는 원액)', () => {
    const subs = [monthly('A', 10000, 1, '2026-10-10'), monthly('B', 5000, 2, '2026-10-10'), yearly('C', 120005, '2027-01-01', '2026-10-10')]
    const s = subscriptionSummary(subs, today)
    expect(s.monthlyTotal).toBe(25000)
    expect(s.yearlyTotal).toBe(300005)
    expect(s.candidateMonthly).toBe(0)
    expect(s.candidateCount).toBe(0)
  })

  it('해지 후보의 월 환산 합계를 따로 보여준다', () => {
    const subs = [monthly('A', 10000, 1, null), yearly('C', 120005, '2027-01-01', null), monthly('B', 5000, 2, '2026-10-10')]
    const s = subscriptionSummary(subs, today)
    expect(s.candidateCount).toBe(2)
    expect(s.candidateMonthly).toBe(20000)
  })

  it('다음 결제가 가까운 순, 같으면 이름 순이다', () => {
    const subs = [monthly('나', 1000, 20), monthly('가', 1000, 20), monthly('다', 1000, 12)]
    expect(sortSubscriptions(subs, today).map((s) => s.name)).toEqual(['다', '가', '나'])
  })
})

describe('입력 검증 (F14)', () => {
  const today = day('2026-10-11')
  const raw = { name: '넷플릭스', price: '13,500', cycle: 'monthly' as const, billingDay: '15', renewalDate: '', lastUsedDate: '2026-10-01', memo: '' }

  it('월 구독 정상 입력', () => {
    const { value, errors } = validateSubscriptionInput(raw, today)
    expect(errors).toEqual({})
    expect(value).toEqual({ name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: '2026-10-01' })
  })

  it('이름 1~40자, 요금 1원~10억 원, 결제일 1~31일', () => {
    expect(validateSubscriptionInput({ ...raw, name: '' }, today).errors.name).toBeTruthy()
    expect(validateSubscriptionInput({ ...raw, name: '가'.repeat(41) }, today).errors.name).toBeTruthy()
    expect(validateSubscriptionInput({ ...raw, price: '0' }, today).errors.price).toBeTruthy()
    expect(validateSubscriptionInput({ ...raw, billingDay: '32' }, today).errors.billingDay).toBeTruthy()
    expect(validateSubscriptionInput({ ...raw, billingDay: '0' }, today).errors.billingDay).toBeTruthy()
  })

  it('연 구독은 갱신일이 오늘부터 1년 이내여야 한다', () => {
    const y = { ...raw, cycle: 'yearly' as const, billingDay: '', renewalDate: '2027-03-01' }
    expect(validateSubscriptionInput(y, today).value?.renewalDate).toBe('2027-03-01')
    expect(validateSubscriptionInput({ ...y, renewalDate: '2026-10-10' }, today).errors.renewalDate).toBeTruthy()
    expect(validateSubscriptionInput({ ...y, renewalDate: '2027-10-12' }, today).errors.renewalDate).toBeTruthy()
    expect(validateSubscriptionInput({ ...y, renewalDate: '' }, today).errors.renewalDate).toBeTruthy()
  })

  it('마지막 사용일은 비워도 되고, 미래·잘못된 날짜는 오류다', () => {
    expect(validateSubscriptionInput({ ...raw, lastUsedDate: '' }, today).value?.lastUsedDate).toBeNull()
    expect(validateSubscriptionInput({ ...raw, lastUsedDate: '2026-10-12' }, today).errors.lastUsedDate).toBeTruthy()
    expect(validateSubscriptionInput({ ...raw, lastUsedDate: '2026-02-30' }, today).errors.lastUsedDate).toBeTruthy()
  })

  it('메모는 200자까지', () => {
    expect(validateSubscriptionInput({ ...raw, memo: '가'.repeat(201) }, today).errors.memo).toBeTruthy()
    expect(validateSubscriptionInput({ ...raw, memo: ' 가족 공유 ' }, today).value?.memo).toBe('가족 공유')
  })
})

describe('저장 데이터 복원 (F14)', () => {
  const ok = { schemaVersion: 1, items: [monthly('넷플릭스', 13500, 15, '2026-10-01'), yearly('클라우드', 120000, '2027-01-01')] }

  it('정상 데이터는 복원되고, 없으면 빈 목록이다', () => {
    expect(parseSubscriptions(JSON.stringify(ok))).toEqual({ ok: true, store: ok })
    expect(parseSubscriptions(null)).toEqual({ ok: true, store: { schemaVersion: 1, items: [] } })
  })

  it('잘못된 주기·결제일·날짜·중복 id는 손상이다', () => {
    const bad = (over: Record<string, unknown>) => JSON.stringify({ schemaVersion: 1, items: [{ ...ok.items[0], ...over }] })
    expect(parseSubscriptions('{bad')).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseSubscriptions(bad({ cycle: 'weekly' }))).toMatchObject({ ok: false })
    expect(parseSubscriptions(bad({ billingDay: 32 }))).toMatchObject({ ok: false })
    expect(parseSubscriptions(bad({ lastUsedDate: '2026-13-01' }))).toMatchObject({ ok: false })
    expect(parseSubscriptions(bad({ priceKrw: -1 }))).toMatchObject({ ok: false })
    expect(parseSubscriptions(JSON.stringify({ schemaVersion: 1, items: [ok.items[0], ok.items[0]] }))).toMatchObject({ ok: false })
  })
})
