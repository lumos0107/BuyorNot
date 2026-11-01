import { describe, expect, it } from 'vitest'
import {
  cancelConfirmLines,
  cancelledLine,
  cancelledNotice,
  contractLines,
  kindTotalsLine,
  PHONE_COMPARE_LINKS,
  resumeConfirmText,
  sortCancelled,
  trialLine,
  trialSummaryLine,
  validateCancelDay,
  nextLabel,
  priceText,
  skipLine,
} from './fixedCosts'
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

describe('정기배송과 약정 (F45·F52)', () => {
  it('AC100: 주마다 요금과 배송 안내를 만든다', () => {
    const delivery = sub('생수', 18900, { kind: 'delivery', cycle: 'weekly', intervalWeeks: 4, renewalDate: '2026-11-05', billingDay: undefined })
    expect(priceText(delivery)).toBe('4주마다 18,900원 · 월평균 약 20,475원')
    expect(nextLabel(delivery)).toBe('다음 배송')
    expect(skipLine(delivery, TODAY)).toBeNull()
    expect(skipLine(delivery, new Date(2026, 10, 3))).toBe('건너뛰기·해지는 그 서비스에서 해요.')
  })
  it('AC111: 약정은 남은 날·만료·해지 여부에 따라 줄이 다르다', () => {
    const phone = sub('휴대폰', 55000, { kind: 'phone', contractEndDate: '2026-12-16' })
    expect(contractLines(phone, TODAY)).toEqual(['약정 끝나는 날 2026-12-16 (D-45)', '약정이 끝나면 요금이나 할인이 바뀔 수 있어요. 통신사 앱에서 확인해 보세요.'])
    expect(contractLines({ ...phone, contractEndDate: '2027-01-01' }, TODAY)).toEqual(['약정 끝나는 날 2027-01-01 (D-61)'])
    expect(contractLines({ ...phone, contractEndDate: '2026-10-31' }, TODAY)).toEqual(['약정이 끝났어요 (2026-10-31)'])
    expect(contractLines({ ...phone, cancelledOn: '2026-11-01' }, TODAY)).toEqual([])
  })
  it('AC112: 통신 비교 링크에는 기록을 붙이지 않는다', () => {
    expect(PHONE_COMPARE_LINKS).toHaveLength(1)
    expect(PHONE_COMPARE_LINKS[0].name).toBe('알뜰폰허브')
    expect(new URL(PHONE_COMPARE_LINKS[0].href).search).toBe('')
    expect(new URL(PHONE_COMPARE_LINKS[0].href).hash).toBe('')
  })
})

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

describe('해지했어요 문장과 검사 (F47)', () => {
  const FIRST = '‘넷플릭스’를 해지한 것으로 옮길까요? 실제 해지는 그곳에서 직접 해야 해요.'
  const THIRD = '다른 곳으로 갈아탄 거라면 해지 대신 ‘수정’에서 요금을 바꿔 주세요. 해지로 옮기면 이 요금 전체를 줄어든 고정비로 세요.'

  it('AC88: 구독 해지 확인 두 줄', () => {
    expect(cancelConfirmLines(sub('넷플릭스', 13500))).toEqual([
      FIRST,
      '옮기면 합계에서 빠지고, 모으기의 ‘줄어든 고정비’에 월 13,500원이 더해져요.',
    ])
    // 조사는 이름에 맞게
    expect(cancelConfirmLines(sub('왓챠', 7900))[0]).toBe('‘왓챠’를 해지한 것으로 옮길까요? 실제 해지는 그곳에서 직접 해야 해요.')
    expect(cancelConfirmLines(sub('멜론', 7900))[0]).toBe('‘멜론’을 해지한 것으로 옮길까요? 실제 해지는 그곳에서 직접 해야 해요.')
  })

  it('AC88: 연 요금이면 월 10,000원이다', () => {
    const yearly = sub('클라우드', 120000, { cycle: 'yearly', billingDay: undefined, renewalDate: '2027-02-01' })
    expect(cancelConfirmLines(yearly)[1]).toBe('옮기면 합계에서 빠지고, 모으기의 ‘줄어든 고정비’에 월 10,000원이 더해져요.')
  })

  it('AC89: 통신·보험은 셋째 줄이 있다', () => {
    const phone = cancelConfirmLines(sub('휴대폰', 55000, { kind: 'phone' }))
    expect(phone).toHaveLength(3)
    expect(phone[1]).toBe('옮기면 합계에서 빠지고, 모으기의 ‘줄어든 고정비’에 월 55,000원이 더해져요.')
    expect(phone[2]).toBe(THIRD)
    expect(cancelConfirmLines(sub('보험', 30000, { kind: 'insurance' }))[2]).toBe(THIRD)
    // 다른 종류에는 셋째 줄이 없다
    expect(cancelConfirmLines(sub('쿠팡', 7890, { kind: 'membership' }))).toHaveLength(2)
    expect(cancelConfirmLines(sub('정기배송', 20000, { kind: 'delivery' }))).toHaveLength(2)
    expect(cancelConfirmLines(sub('기타', 20000, { kind: 'other' }))).toHaveLength(2)
  })

  it('AC89: 월세·관리비는 둘째 줄이 다르고 셋째 줄이 없다', () => {
    expect(cancelConfirmLines(sub('월세', 450000, { kind: 'housing' }))).toEqual([
      '‘월세’를 해지한 것으로 옮길까요? 실제 해지는 그곳에서 직접 해야 해요.',
      '옮기면 합계에서 빠져요. 월세·관리비는 줄어든 고정비로 세지 않아요.',
    ])
  })

  it('AC89: 해지한 날은 90일 전과 오늘을 받고 그 밖은 오류다', () => {
    expect(validateCancelDay('2026-08-03', TODAY)).toEqual({ value: '2026-08-03' })
    expect(validateCancelDay('2026-11-01', TODAY)).toEqual({ value: '2026-11-01' })
    expect(validateCancelDay(' 2026-10-20 ', TODAY)).toEqual({ value: '2026-10-20' })
    const range = '해지한 날은 90일 전부터 오늘 사이여야 해요'
    expect(validateCancelDay('2026-08-02', TODAY)).toEqual({ error: range })
    expect(validateCancelDay('2026-11-02', TODAY)).toEqual({ error: range })
    expect(validateCancelDay('', TODAY)).toEqual({ error: '해지한 날을 골라 주세요' })
    expect(validateCancelDay('2026-02-30', TODAY)).toEqual({ error: '해지한 날을 골라 주세요' })
  })

  it('AC88: 해지한 카드 줄은 해지한 날과 요금이다', () => {
    expect(cancelledLine(sub('넷플릭스', 13500, { cancelledOn: '2026-11-01' }))).toBe('2026-11-01 해지 · 월 13,500원')
    expect(
      cancelledLine(sub('클라우드', 120000, { cycle: 'yearly', billingDay: undefined, renewalDate: '2027-02-01', cancelledOn: '2026-10-20' })),
    ).toBe('2026-10-20 해지 · 연 120,000원 · 월평균 10,000원')
    expect(cancelledNotice(sub('넷플릭스', 13500))).toBe('‘넷플릭스’를 해지한 것으로 옮겼어요.')
  })

  it('AC90: 다시 쓰기 확인 문장', () => {
    expect(resumeConfirmText(sub('넷플릭스', 13500))).toBe('‘넷플릭스’를 다시 쓰는 것으로 옮길까요? 모으기의 ‘줄어든 고정비’에서도 빠져요.')
    expect(resumeConfirmText(sub('월세', 450000, { kind: 'housing' }))).toBe('‘월세’를 다시 쓰는 것으로 옮길까요?')
  })

  it('AC88: 해지한 것은 해지한 날 최신순, 같으면 이름 순이다', () => {
    const list = [
      sub('다', 1000, { cancelledOn: '2026-10-01' }),
      sub('나', 1000, { cancelledOn: '2026-10-20' }),
      sub('가', 1000, { cancelledOn: '2026-10-20' }),
    ]
    expect(sortCancelled(list).map((s) => s.name)).toEqual(['가', '나', '다'])
    expect(list.map((s) => s.name)).toEqual(['다', '나', '가'])
  })
})
