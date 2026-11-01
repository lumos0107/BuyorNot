import { describe, expect, it } from 'vitest'
import { kindTotalsLine } from './fixedCosts'
import type { FixedCostKind, Subscription } from './subscriptions'

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
