import { expect, it } from 'vitest'
import { EMPTY_SPENDING, SPENDING_KEY, isSpendingStore, parseSpending, type SpendingTemplate } from './spending'

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
