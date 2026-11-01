import { expect, it } from 'vitest'
import { applyPriceChange, createSubscription, monthlyEquivalent, nextBillingDate, parseSubscriptions, priceChangeMode, subscriptionSummary, updateSubscription, validateSubscriptionInput, type Subscription } from './subscriptions'

const today = new Date(2026, 10, 1, 9)
const weekly: Subscription = { id: 'w1', name: '생수', kind: 'delivery', priceKrw: 18900, cycle: 'weekly', intervalWeeks: 4, renewalDate: '2026-11-05', lastUsedDate: null, createdAt: today.toISOString(), updatedAt: today.toISOString() }
const monthly: Subscription = { id: 'm1', name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null, createdAt: today.toISOString(), updatedAt: today.toISOString() }

it('AC100: 4주마다 18,900원은 월평균 20,475원, 1년 245,700원이다', () => {
  expect(monthlyEquivalent(weekly)).toBe(20475)
  expect(subscriptionSummary([weekly, monthly], today)).toMatchObject({ monthlyTotal: 33975, yearlyTotal: 407700 })
})
it('AC100: 다음 배송일은 기준일에 4주씩 더한 오늘 이후 첫날이다', () => {
  expect(nextBillingDate(weekly, today)).toBe('2026-11-05')
  expect(nextBillingDate(weekly, new Date(2026, 10, 6, 9))).toBe('2026-12-03')
})
it('AC101: 몇 주마다 0·13과 범위 밖 다음 배송일은 오류다', () => {
  const raw = { name: '생수', price: '18900', kind: 'delivery' as const, cycle: 'weekly' as const, intervalWeeks: '4', billingDay: '', renewalDate: '2026-11-05', lastUsedDate: '', memo: '' }
  expect(validateSubscriptionInput({ ...raw, intervalWeeks: '0' }, today).errors.intervalWeeks).toBe('몇 주마다는 1~12 사이 정수여야 해요')
  expect(validateSubscriptionInput({ ...raw, intervalWeeks: '13' }, today).errors.intervalWeeks).toBe('몇 주마다는 1~12 사이 정수여야 해요')
  expect(validateSubscriptionInput({ ...raw, renewalDate: '2026-11-30' }, today).errors.renewalDate).toBe('다음 배송일은 오늘부터 4주 안이어야 해요')
  expect(validateSubscriptionInput({ ...raw, renewalDate: '2026-11-29' }, today).value?.intervalWeeks).toBe(4)
})
it('AC101: weekly 저장은 정기배송에만 유효하고 예전 매월 기록은 그대로다', () => {
  const saved = (items: unknown[]) => parseSubscriptions(JSON.stringify({ schemaVersion: 1, items }))
  expect(saved([weekly]).ok).toBe(true)
  expect(saved([{ ...weekly, kind: 'phone' }]).ok).toBe(false)
  expect(saved([{ ...weekly, billingDay: 5 }]).ok).toBe(false)
  expect(saved([{ ...weekly, intervalWeeks: 13 }]).ok).toBe(false)
  expect(saved([{ ...monthly, intervalWeeks: 4 }]).ok).toBe(false)
  expect(createSubscription({ name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null }, today, 'new')).not.toHaveProperty('intervalWeeks')
})

it('AC112: 약정 끝은 1년 전부터 5년 뒤까지이고 채워 둔 값은 유지한다', () => {
  const raw = { name: '휴대폰', price: '55000', kind: 'phone' as const, cycle: 'monthly' as const, billingDay: '10', renewalDate: '', lastUsedDate: '', memo: '', contractEndDate: '2025-11-01' }
  expect(validateSubscriptionInput(raw, today).value?.contractEndDate).toBe('2025-11-01')
  expect(validateSubscriptionInput({ ...raw, contractEndDate: '2031-11-01' }, today).value?.contractEndDate).toBe('2031-11-01')
  expect(validateSubscriptionInput({ ...raw, contractEndDate: '2025-10-31' }, today).errors.contractEndDate).toBe('약정·계약 끝나는 날은 1년 전부터 5년 뒤 사이여야 해요')
  expect(validateSubscriptionInput({ ...raw, contractEndDate: '2031-11-02' }, today).errors.contractEndDate).toBe('약정·계약 끝나는 날은 1년 전부터 5년 뒤 사이여야 해요')
  const base: Subscription = { ...monthly, kind: 'phone', priceKrw: 55000, contractEndDate: '2025-06-30' }
  expect(validateSubscriptionInput({ ...raw, contractEndDate: '2025-06-30' }, today, undefined, undefined, base).value?.contractEndDate).toBe('2025-06-30')
})

it('AC112: 구독의 약정 끝 저장값은 손상이고 구독 입력에는 남지 않는다', () => {
  const saved = parseSubscriptions(JSON.stringify({ schemaVersion: 1, items: [{ ...monthly, contractEndDate: '2026-12-01' }] }))
  expect(saved.ok).toBe(false)
  const raw = { name: '넷플릭스', price: '13500', kind: 'subscription' as const, cycle: 'monthly' as const, billingDay: '15', renewalDate: '', lastUsedDate: '', memo: '', contractEndDate: '2026-12-01' }
  expect(validateSubscriptionInput(raw, today).value?.contractEndDate).toBeUndefined()
})

it('AC110: 쓰는 곳 저장은 중복·빈 값·다른 종류를 거부한다', () => {
  const saved = (item: unknown) => parseSubscriptions(JSON.stringify({ schemaVersion: 1, items: [item] }))
  expect(saved({ ...monthly, areas: ['delivery'] }).ok).toBe(true)
  expect(saved({ ...monthly, areas: [] }).ok).toBe(false)
  expect(saved({ ...monthly, areas: ['delivery', 'delivery'] }).ok).toBe(false)
  expect(saved({ ...monthly, areas: ['game'] }).ok).toBe(false)
  expect(saved({ ...monthly, kind: 'phone', areas: ['delivery'] }).ok).toBe(false)
})

it('AC110: 고른 순서와 관계없이 정해진 순서로 저장하고 종류를 바꾸면 지운다', () => {
  const raw = { name: '넷플릭스', price: '13500', kind: 'subscription' as const, cycle: 'monthly' as const, billingDay: '15', renewalDate: '', lastUsedDate: '', memo: '', areas: ['video', 'delivery', 'video'] as never }
  expect(validateSubscriptionInput(raw, today).value?.areas).toEqual(['delivery', 'video'])
  expect(validateSubscriptionInput({ ...raw, kind: 'phone' }, today).value?.areas).toBeUndefined()
  expect(createSubscription({ name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null }, today, 'new')).not.toHaveProperty('areas')
})

it('AC105: 같은 날 두 번 바꾸면 하나로 합치고 처음 값으로 돌아오면 지운다', () => {
  const first = applyPriceChange(undefined, 13500, 17000, { by: 'service', day: '2026-11-01' })
  const second = applyPriceChange(first, 17000, 17500, { by: 'service', day: '2026-11-01' })
  expect(second).toEqual([{ day: '2026-11-01', from: 13500, to: 17500, by: 'service' }])
  expect(applyPriceChange(second, 17500, 13500, { by: 'service', day: '2026-11-01' })).toBeUndefined()
})

it('AC105: 잘못 적어서 고치면 마지막 기록만 바꾸거나 지운다', () => {
  const first = [{ day: '2026-10-01', from: 12000, to: 13500, by: 'service' as const }]
  expect(applyPriceChange(first, 13500, 15000, { by: 'fix', day: '2026-11-01' })).toEqual([{ ...first[0], to: 15000 }])
  expect(applyPriceChange(first, 13500, 12000, { by: 'fix', day: '2026-11-01' })).toBeUndefined()
  expect(applyPriceChange(undefined, 13500, 14000, { by: 'fix', day: '2026-11-01' })).toBeUndefined()
})

it('AC106: 이유가 없거나 바뀐 날이 마지막 기록보다 앞이면 오류다', () => {
  const base: Subscription = { ...monthly, priceChanges: [{ day: '2026-10-20', from: 12000, to: 13500, by: 'service' }] }
  const raw = { name: '넷플릭스', price: '17000', cycle: 'monthly' as const, billingDay: '15', renewalDate: '', lastUsedDate: '', memo: '', priceReason: '' as const, priceDay: '2026-11-01' }
  expect(priceChangeMode(raw, base)).toBe('reason')
  expect(validateSubscriptionInput(raw, today, undefined, undefined, base).errors.priceReason).toBe('요금이 바뀐 이유를 골라 주세요')
  expect(validateSubscriptionInput({ ...raw, priceReason: 'service', priceDay: '2026-10-19' }, today, undefined, undefined, base).errors.priceDay).toBe('바뀐 날은 마지막으로 바뀐 날(2026-10-20)과 같거나 그 뒤여야 해요')
})

it('AC106: 결제 주기를 바꾸면 요금 기록을 지우고 요금이 같으면 유지한다', () => {
  const base: Subscription = { ...monthly, priceChanges: [{ day: '2026-10-20', from: 12000, to: 13500, by: 'service' }] }
  const input = { name: '넷플릭스', priceKrw: 13500, cycle: 'yearly' as const, renewalDate: '2026-12-01', lastUsedDate: null }
  expect(updateSubscription(base, input, today).priceChanges).toBeUndefined()
  expect(updateSubscription(base, { ...input, cycle: 'monthly', billingDay: 15 }, today).priceChanges).toEqual(base.priceChanges)
})

it('AC108: 손상된 요금 기록과 해지한 날 뒤의 기록은 읽지 않는다', () => {
  const change = { day: '2026-10-20', from: 12000, to: 13500, by: 'service' as const }
  const saved = (priceChanges: unknown, over: Partial<Subscription> = {}) => parseSubscriptions(JSON.stringify({ schemaVersion: 1, items: [{ ...monthly, priceChanges, ...over }] }))
  expect(saved([change]).ok).toBe(true)
  for (const bad of [[{ ...change, from: 13500 }], [change, { ...change, day: '2026-10-20' }], [{ ...change, to: 14000 }], [{ ...change, by: 'friend' }], Array.from({ length: 25 }, (_, i) => ({ ...change, day: `2026-10-${String(i + 1).padStart(2, '0')}` }))]) expect(saved(bad).ok).toBe(false)
  expect(saved([change], { cancelledOn: '2026-10-10' }).ok).toBe(false)
})

it('AC106: 요금 기록 24개면 새 날은 막고 마지막 날 합침은 된다', () => {
  const priceChanges = Array.from({ length: 24 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, from: 12000, to: 13500, by: 'service' as const }))
  const base: Subscription = { ...monthly, priceChanges }
  const raw = { name: '넷플릭스', price: '17000', cycle: 'monthly' as const, billingDay: '15', renewalDate: '', lastUsedDate: '', memo: '', priceReason: 'service' as const, priceDay: '2026-11-01' }
  expect(validateSubscriptionInput(raw, today, undefined, undefined, base).errors.priceReason).toBe('요금 바뀜 기록은 24개까지예요. ‘잘못 적어서 고쳐요’로만 고칠 수 있어요.')
  expect(validateSubscriptionInput({ ...raw, priceDay: '2026-10-24' }, today, undefined, undefined, base).value?.priceChange).toEqual({ by: 'service', day: '2026-10-24' })
})

it('AC106: 잘못 적어서 고쳐요는 날짜를 묻지 않고 기록이 없으면 새 기록도 없다', () => {
  const raw = { name: '넷플릭스', price: '14000', cycle: 'monthly' as const, billingDay: '15', renewalDate: '', lastUsedDate: '', memo: '', priceReason: 'fix' as const, priceDay: '' }
  const input = validateSubscriptionInput(raw, today, undefined, undefined, monthly).value
  expect(input?.priceChange?.by).toBe('fix')
  expect(updateSubscription(monthly, input!, today).priceChanges).toBeUndefined()
})
