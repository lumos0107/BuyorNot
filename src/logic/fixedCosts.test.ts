import { describe, expect, it } from 'vitest'
import { kindTotalsLine, trialLine, trialSummaryLine } from './fixedCosts'
import { subscriptionSummary, type FixedCostKind, type Subscription } from './subscriptions'

// PRD F45 요약의 종류별 줄 (AC81). 오늘 2026-11-01
const TODAY = new Date(2026, 10, 1, 9)
const sub = (id: string, priceKrw: number, over: Partial<Subscription> = {}): Subscription => ({
  id,
  name: id,
  priceKrw,
  cycle: 'monthly',
  billingDay: 15,
  lastUsedDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})
const kinded = (id: string, priceKrw: number, kind: FixedCostKind) => sub(id, priceKrw, { kind })

describe('종류별 줄 (F45)', () => {
  it('AC81: 묶음이 셋이면 종류별 줄을 PRD 순서로 만든다', () => {
    // 입력 순서를 섞어도 구독·멤버십 → 통신 → 월세·관리비 순이다
    const subs = [
      kinded('월세', 450000, 'housing'),
      kinded('휴대폰', 55000, 'phone'),
      sub('넷플릭스', 13500),
      sub('클라우드', 120000, { cycle: 'yearly', billingDay: undefined, renewalDate: '2027-02-01' }),
    ]
    expect(kindTotalsLine(subs, TODAY)).toBe('구독·멤버십 23,500원 · 통신 55,000원 · 월세·관리비 450,000원')
  })

  it('AC81: 묶음이 하나면 종류별 줄이 없다', () => {
    expect(kindTotalsLine([sub('넷플릭스', 13500), sub('클라우드', 120000, { cycle: 'yearly', billingDay: undefined, renewalDate: '2027-02-01' })], TODAY)).toBeNull()
    expect(kindTotalsLine([], TODAY)).toBeNull()
  })

  it('AC81: 구독과 멤버십은 한 묶음이다', () => {
    expect(kindTotalsLine([sub('넷플릭스', 13500), kinded('쿠팡', 7890, 'membership')], TODAY)).toBeNull()
    expect(kindTotalsLine([sub('넷플릭스', 13500), kinded('쿠팡', 7890, 'membership'), kinded('보험', 30000, 'insurance')], TODAY)).toBe(
      '구독·멤버십 21,390원 · 보험 30,000원',
    )
  })

  it('AC81: 정기배송·보험·기타도 PRD 순서(구독·멤버십 · 정기배송 · 통신 · 월세·관리비 · 보험 · 기타)로 나온다', () => {
    const subs = [
      kinded('기타', 1000, 'other'),
      kinded('보험', 2000, 'insurance'),
      kinded('월세', 3000, 'housing'),
      kinded('통신', 4000, 'phone'),
      kinded('배송', 5000, 'delivery'),
      sub('구독', 6000),
    ]
    expect(kindTotalsLine(subs, TODAY)).toBe('구독·멤버십 6,000원 · 정기배송 5,000원 · 통신 4,000원 · 월세·관리비 3,000원 · 보험 2,000원 · 기타 1,000원')
  })
})

// PRD F46 체험 줄 (AC85·AC86)
const trial = (over: Partial<Subscription> = {}) => sub('넷플릭스', 13500, { billingDay: 20, trialEndDate: '2026-11-14', ...over })
const at = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 15, 30)
}

describe('체험 줄 (F46)', () => {
  it('AC85: 체험 줄은 매월·매년 요금을 PRD 문장으로 보인다', () => {
    expect(trialLine(trial(), TODAY)).toBe('무료 체험 중 · 2026-11-14에 끝나요 (D-13). 그 뒤 월 13,500원')
    const yearly = trial({ cycle: 'yearly', priceKrw: 120000, billingDay: undefined, renewalDate: '2027-11-14' })
    expect(trialLine(yearly, TODAY)).toBe('무료 체험 중 · 2026-11-14에 끝나요 (D-13). 그 뒤 연 120,000원')
  })

  it('AC85: 요약 체험 줄은 개수와 월평균 합을 보인다', () => {
    const yearly = trial({ id: 'y', cycle: 'yearly', priceKrw: 120000, billingDay: undefined, renewalDate: '2027-11-14' })
    expect(trialSummaryLine(subscriptionSummary([trial()], TODAY))).toBe('무료 체험 중 1개 · 끝나면 월 13,500원이 더 나가요')
    expect(trialSummaryLine(subscriptionSummary([yearly], TODAY))).toBe('무료 체험 중 1개 · 끝나면 월 10,000원이 더 나가요')
    expect(trialSummaryLine(subscriptionSummary([trial(), yearly], TODAY))).toBe('무료 체험 중 2개 · 끝나면 월 23,500원이 더 나가요')
    expect(trialSummaryLine(subscriptionSummary([sub('a', 1000)], TODAY))).toBeNull()
  })

  it('AC86: 체험이 오늘 끝나면 오늘 끝난다는 문장이다', () => {
    expect(trialLine(trial(), at('2026-11-14'))).toBe('무료 체험이 오늘 끝나요. 해지하지 않으면 유료로 바뀌어요.')
    expect(trialLine(trial(), at('2026-11-13'))).toBe('무료 체험 중 · 2026-11-14에 끝나요 (D-1). 그 뒤 월 13,500원')
  })

  it('AC86: 체험이 끝나면 체험 줄이 없다', () => {
    expect(trialLine(trial(), at('2026-11-15'))).toBeNull()
    expect(trialLine(trial(), at('2026-12-01'))).toBeNull()
    expect(trialLine(sub('a', 1000), TODAY)).toBeNull()
  })

  it('AC85: 체험 중인 것은 종류별 줄에서 빠진다', () => {
    // 체험 중인 넷플릭스를 빼면 묶음이 통신 하나라 종류별 줄이 없다
    expect(kindTotalsLine([trial(), kinded('휴대폰', 55000, 'phone')], TODAY)).toBeNull()
    expect(kindTotalsLine([trial(), sub('왓챠', 7900), kinded('휴대폰', 55000, 'phone')], TODAY)).toBe('구독·멤버십 7,900원 · 통신 55,000원')
    // 체험이 끝난 다음 날부터는 들어간다
    expect(kindTotalsLine([trial(), kinded('휴대폰', 55000, 'phone')], at('2026-11-15'))).toBe('구독·멤버십 13,500원 · 통신 55,000원')
  })
})
