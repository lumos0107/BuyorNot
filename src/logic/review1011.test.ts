import { describe, expect, it } from 'vitest'
import { compareLinks } from './similar'
import {
  parseDay,
  parseSubscriptions,
  subscriptionSummary,
  validateSubscriptionInput,
  type Subscription,
  type SubscriptionRawInput,
} from './subscriptions'

// GPT 10~11단계 검토 반영 (계산·검증)
const at = '2026-10-01T00:00:00.000Z'
const monthly: Subscription = { id: 'm', name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null, createdAt: at, updatedAt: at }
const yearly: Subscription = { id: 'y', name: '클라우드', priceKrw: 120005, cycle: 'yearly', renewalDate: '2027-01-01', lastUsedDate: null, createdAt: at, updatedAt: at }
const store = (...items: unknown[]) => JSON.stringify({ schemaVersion: 1, items })

const raw = (over: Partial<SubscriptionRawInput>): SubscriptionRawInput => ({
  name: '클라우드',
  price: '120000',
  cycle: 'yearly',
  billingDay: '',
  renewalDate: '',
  lastUsedDate: '',
  memo: '',
  ...over,
})
const localDay = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9)

describe('구독 복원 검증', () => {
  it('주기와 맞지 않는 필드(월 구독의 갱신일, 연 구독의 결제일)가 있으면 손상이다', () => {
    expect(parseSubscriptions(store({ ...monthly, renewalDate: '2027-01-01' }))).toEqual({ ok: false, reason: 'corrupt' })
    expect(parseSubscriptions(store({ ...yearly, billingDay: 15 }))).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('공백뿐인 이름은 손상이다', () => {
    expect(parseSubscriptions(store({ ...monthly, name: '   ' }))).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('지난 연 갱신일은 자동 갱신 계산에 쓰므로 그대로 복원한다', () => {
    expect(parseSubscriptions(store({ ...yearly, renewalDate: '2024-02-29' }))).toMatchObject({ ok: true })
  })
})

describe('날짜 입력 범위', () => {
  it('2월 29일의 1년 뒤 상한은 다음 해 2월 28일이다 (연 갱신 규칙과 같은 말일 처리)', () => {
    const leapDay = localDay(2024, 2, 29)
    expect(validateSubscriptionInput(raw({ renewalDate: '2025-02-28' }), leapDay).value?.renewalDate).toBe('2025-02-28')
    expect(validateSubscriptionInput(raw({ renewalDate: '2025-03-01' }), leapDay).errors.renewalDate).toBeTruthy()
  })

  it('1900년 이전 날짜는 받지 않는다 (0099년이 1999년으로 바뀌는 문제 방지)', () => {
    expect(parseDay('0099-01-01')).toBeNull()
    expect(parseDay('1899-12-31')).toBeNull()
    expect(parseDay('1900-01-01')).not.toBeNull()
    expect(validateSubscriptionInput(raw({ renewalDate: '2027-01-01', lastUsedDate: '0099-01-01' }), localDay(2026, 10, 11)).errors.lastUsedDate).toBeTruthy()
  })
})

describe('요약 반올림 순서', () => {
  it('월 합계는 카드에 보이는 월 환산(반올림 값)의 합이다: 연 120,005원 두 건 → 월 20,000원, 연 240,010원', () => {
    // 해지 후보는 기록상 31일 이상 안 쓴 구독이다 (F23)
    const unused = { ...yearly, lastUsedDate: '2026-09-01' }
    const s = subscriptionSummary([unused, { ...unused, id: 'y2' }], localDay(2026, 10, 11))
    expect(s.monthlyTotal).toBe(20000)
    expect(s.candidateMonthly).toBe(20000)
    expect(s.yearlyTotal).toBe(240010)
  })
})

describe('비교 링크 검색어', () => {
  const query = (name: string) => decodeURIComponent(new URL(compareLinks(name)[0]!.href).searchParams.get('query') ?? '')

  it('"(예시)" 표지는 위치와 상관없이 빼고, 모델·세대 괄호는 남긴다', () => {
    expect(query('헤드폰 (예시)')).toBe('헤드폰')
    expect(query('(예시) 에어팟 (2세대)')).toBe('에어팟 (2세대)')
    expect(query('에어팟 (예시) 프로')).toBe('에어팟 프로')
  })
})
