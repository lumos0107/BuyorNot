import { expect, it } from 'vitest'
import { EMPTY_SPENDING, SPENDING_KEY, isSpendingStore, parseSpending, skippedSpendingTotal, spendingMonthSummary, type SpendingEntry, type SpendingTemplate } from './spending'

const stamp = '2026-11-01T00:00:00.000Z'
const template = (over: Partial<SpendingTemplate> = {}): SpendingTemplate => ({ id: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, createdAt: stamp, updatedAt: stamp, ...over })
const store = (...templates: SpendingTemplate[]) => ({ schemaVersion: 1 as const, templates, entries: [] })

it('AC128: 자잘한 지출 저장값이 없으면 빈 기록이다', () => {
  expect(SPENDING_KEY).toBe('buyornot.spending.v1')
  expect(parseSpending(null)).toEqual({ ok: true, store: EMPTY_SPENDING })
})
it('AC128: 모르는 키·중복 id·금액 오류는 손상이다', () => {
  expect(isSpendingStore({ ...store(), extra: true })).toBe(false)
  expect(isSpendingStore(store(template(), template({ name: '차' })))).toBe(false)
  expect(isSpendingStore(store(template({ amountKrw: 0 })))).toBe(false)
  expect(isSpendingStore(store(template()))).toBe(true)
})

const entry = (over: Partial<SpendingEntry> = {}): SpendingEntry => ({ id: 'e1', templateId: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, day: '2026-11-01', action: 'spent', createdAt: stamp, ...over })
it('AC127: 이번 달 카페와 지난달 같은 날까지를 따로 센다', () => {
  const summary = spendingMonthSummary([entry(), entry({ id: 'e2', day: '2026-10-01' }), entry({ id: 'e3', day: '2026-10-02' })], new Date(2026, 10, 1))
  expect(summary.cafe.current).toEqual({ count: 1, amountKrw: 4500 })
  expect(summary.cafe.previous).toEqual({ count: 1, amountKrw: 4500 })
})
it('AC128: 참았다고 적은 금액은 쓴 금액과 분리한다', () => {
  expect(skippedSpendingTotal([entry(), entry({ id: 'e2', action: 'skipped' })])).toEqual({ count: 1, amountKrw: 4500 })
})
