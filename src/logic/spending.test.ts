import { expect, it } from 'vitest'
import { EMPTY_SPENDING, SPENDING_KEY, isSpendingStore, parseSpending, skippedSpendingTotal, spendingMonthSummary, startWeeklyExperiment, weeklyExperimentProgress, weeklySpendingExperiment, type SpendingEntry, type SpendingTemplate } from './spending'

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
  expect(isSpendingStore({ ...store(template()), experiment: { templateId: 'missing', startedOn: '2026-11-02', baselineCount: 2 } })).toBe(false)
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

it('AC184: 지난 7일 두 번과 이번 7일 한 번이면 목표는 한 번이다', () => {
  const entries = [entry({ day: '2026-10-20' }), entry({ id: 'e2', day: '2026-10-26' }), entry({ id: 'e3', day: '2026-11-02' })]
  expect(weeklySpendingExperiment(entries, 't1', new Date(2026, 10, 2))).toEqual({ previous: 2, current: 1, target: 1 })
})

it('AC185: 참은 기록과 미래·다른 버튼은 빼고 지난주 0번이면 목표가 없다', () => {
  const entries = [entry({ action: 'skipped', day: '2026-10-20' }), entry({ id: 'e2', day: '2026-11-03' }), entry({ id: 'e3', templateId: 'other', day: '2026-10-24' })]
  expect(weeklySpendingExperiment(entries, 't1', new Date(2026, 10, 2))).toBeNull()
})

it('AC192·AC193: 선택한 버튼의 직전 7일 기준을 고정하고 일곱째 날 뒤 완료한다', () => {
  const initial = { schemaVersion: 1 as const, templates: [template()], entries: [entry({ day: '2026-10-26' }), entry({ id: 'e2', day: '2026-11-01' })] }
  const started = startWeeklyExperiment(initial, 't1', new Date(2026, 10, 2))
  expect(started).not.toBe('no-baseline')
  if (started === 'no-baseline') return
  expect(started.experiment).toEqual({ templateId: 't1', startedOn: '2026-11-02', baselineCount: 2 })
  expect(parseSpending(JSON.stringify(started))).toEqual({ ok: true, store: started })
  expect(weeklyExperimentProgress(started.experiment!, [entry({ day: '2026-11-03' }), entry({ id: 'e2', day: '2026-11-03', action: 'skipped' })], new Date(2026, 10, 3))).toEqual({ kind: 'active', baseline: 2, target: 1, count: 1 })
  expect(weeklyExperimentProgress(started.experiment!, [entry({ day: '2026-11-03' })], new Date(2026, 10, 9))).toEqual({ kind: 'complete', baseline: 2, target: 1, count: 1 })
})

it('AC194: 옛 기록은 유효하고 다른 버튼을 고르면 선택이 바뀐다', () => {
  const initial = { schemaVersion: 1 as const, templates: [template(), template({ id: 't2', name: '배달' })], entries: [entry({ day: '2026-11-01' }), entry({ id: 'e2', templateId: 't2', name: '배달', day: '2026-11-01' })] }
  expect(isSpendingStore(initial)).toBe(true)
  const first = startWeeklyExperiment(initial, 't1', new Date(2026, 10, 2))
  if (first === 'no-baseline') throw new Error('기준 기록이 있어야 한다')
  const changed = startWeeklyExperiment(first, 't2', new Date(2026, 10, 2))
  if (changed === 'no-baseline') throw new Error('기준 기록이 있어야 한다')
  expect(changed.experiment?.templateId).toBe('t2')
})
