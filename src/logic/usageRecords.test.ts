import { describe, expect, it } from 'vitest'
import { lastUsedOf, isCancelCandidate, needsUsageCheck, parseSubscriptions, updateSubscription, type Subscription } from './subscriptions'
import { analyzeRecord, recentPeriod, replaceRecord, type UsageRecord } from './usageRecords'

// PRD F26 구독 이용 분석 13-1: 출처 기록(출처·수집 기간·가져온 시각·날짜별 기록 수/시간)과 분석 함수
const TODAY = new Date(2026, 9, 11, 9)
const record = (over: Partial<UsageRecord> = {}): UsageRecord => ({
  source: 'netflix-csv',
  from: '2026-09-01',
  to: '2026-10-10',
  updatedAt: '2026-10-11T00:00:00.000Z',
  entries: [
    { day: '2026-09-05', plays: 2 },
    { day: '2026-10-01', plays: 1 },
    { day: '2026-10-10', plays: 2 },
  ],
  ...over,
})

describe('분석 기간 (F26)', () => {
  it('최근 30일은 오늘 포함 30일이다', () => {
    expect(recentPeriod(TODAY)).toEqual({ from: '2026-09-12', to: '2026-10-11' })
  })
})

describe('이용 일수·기록 수·실제 이용 시간을 따로 센다 (F26)', () => {
  it('기간 안의 기록이 있는 날짜 수와 기록 수를 따로 세고, 시간이 없는 출처는 시간을 null로 둔다', () => {
    const s = analyzeRecord(record(), { from: '2026-09-12', to: '2026-10-11' })
    expect(s.days).toBe(2)
    expect(s.plays).toBe(3)
    expect(s.minutes).toBeNull()
  })

  it('실제 이용 시간이 있는 출처만 시간을 더한다', () => {
    const timed = record({ entries: [{ day: '2026-10-01', plays: 3, minutes: 50 }, { day: '2026-10-02', plays: 1, minutes: 0 }] })
    expect(analyzeRecord(timed, { from: '2026-09-12', to: '2026-10-11' }).minutes).toBe(50)
  })
})

describe('수집 기간과 분석 기간 (F26: 일부를 전체로 보이지 않게)', () => {
  it('분석 기간이 수집 기간 안이면 전체, 일부만 겹치면 겹친 날 수, 안 겹치면 없음', () => {
    expect(analyzeRecord(record(), { from: '2026-09-12', to: '2026-10-10' })).toMatchObject({ coverage: 'full', coveredDays: 29, periodDays: 29 })
    // 수집이 10/10에서 끝났는데 10/11까지 보면 30일 중 29일분만 있다
    expect(analyzeRecord(record(), { from: '2026-09-12', to: '2026-10-11' })).toMatchObject({ coverage: 'partial', coveredDays: 29, periodDays: 30 })
    expect(analyzeRecord(record(), { from: '2026-10-11', to: '2026-10-20' })).toMatchObject({ coverage: 'none', coveredDays: 0, days: 0, plays: 0 })
  })
})

describe('같은 출처는 합치지 않고 바꾼다 (F26: 중복 반영 방지)', () => {
  it('같은 출처를 다시 가져오면 바꾸고 다른 출처는 남긴다', () => {
    const first = replaceRecord(undefined, record())
    const again = replaceRecord(first, record({ to: '2026-10-11', entries: [{ day: '2026-10-11', plays: 1 }] }))
    expect(again).toHaveLength(1)
    expect(again[0].entries).toEqual([{ day: '2026-10-11', plays: 1 }])
  })
})

describe('구독과 출처 기록 (F26)', () => {
  const sub = (over: Partial<Subscription> = {}): Subscription => ({
    id: 's',
    name: '넷플릭스',
    priceKrw: 13500,
    cycle: 'monthly',
    billingDay: 15,
    lastUsedDate: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  })

  it('기록이 있는 가장 늦은 날을 마지막 사용일로 더한다(쓴 증거)', () => {
    const s = sub({ usageRecords: [record()] })
    expect(lastUsedOf(s)).toBe('2026-10-10')
    expect(needsUsageCheck(s)).toBe(false)
    expect(isCancelCandidate(s, TODAY)).toBe(false)
  })

  it('기록이 하나도 없는 파일이라는 이유로 해지 후보로 만들지 않는다', () => {
    const empty = sub({ usageRecords: [record({ entries: [] })] })
    expect(isCancelCandidate(empty, TODAY)).toBe(false)
  })

  it('구독을 고쳐도 출처 기록은 남는다', () => {
    const after = updateSubscription(sub({ usageRecords: [record()] }), { name: '넷플릭스', priceKrw: 17000, cycle: 'monthly', billingDay: 15, lastUsedDate: null }, TODAY)
    expect(after.usageRecords).toEqual([record()])
  })

  it('복원: 출처·실제 날짜·기록 수·시간·시각이 맞을 때만 받는다', () => {
    const load = (records: unknown) => parseSubscriptions(JSON.stringify({ schemaVersion: 1, items: [{ ...sub(), usageRecords: records }] }))
    expect(load([record()])).toMatchObject({ ok: true })
    expect(load([record({ entries: [{ day: '2026-10-01', plays: 2, minutes: 30 }] })])).toMatchObject({ ok: true })
    const bad = [
      [record({ source: 'youtube' as never })],
      [record(), record()],
      [record({ from: '2026-02-30' })],
      [record({ updatedAt: 'x' })],
      [record({ entries: [{ day: '2026-10-01', plays: 0 }] })],
      [record({ entries: [{ day: '2026-10-01', plays: 1.5 }] })],
      [record({ entries: [{ day: '2026-10-01', plays: 1, minutes: -1 }] })],
      [record({ entries: [{ day: '2026-10-01', plays: 1 }, { day: '2026-10-01', plays: 2 }] })],
      'x',
    ]
    for (const records of bad) expect(load(records)).toEqual({ ok: false, reason: 'corrupt' })
  })
})
