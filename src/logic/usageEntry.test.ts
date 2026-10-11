import { describe, expect, it } from 'vitest'
import { isCancelCandidate, lastUsedOf, needsUsageCheck, parseSubscriptions, setUsageEntry, updateSubscription, type Subscription } from './subscriptions'
import { usageInfo, validateUsageInput } from './usage'

// PRD F25 구독 사용량 직접 적기 (AC44): 스크린 타임이나 주문 내역에서 본 최근 30일 사용 시간·횟수를 한 달에 한 번 적는다
const TODAY = new Date(2026, 9, 11, 9)
const at = '2026-10-01T00:00:00.000Z'
const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 's',
  name: '티빙',
  priceKrw: 9500,
  cycle: 'monthly',
  billingDay: 10,
  lastUsedDate: null,
  createdAt: at,
  updatedAt: at,
  ...over,
})

describe('사용량 입력 검사 (F25)', () => {
  it('사용 시간은 0~720시간, 소수 첫째 자리까지 받아 분으로 바꾼다', () => {
    expect(validateUsageInput('minutes', '18')).toEqual({ value: 1080 })
    expect(validateUsageInput('minutes', ' 1.5 ')).toEqual({ value: 90 })
    expect(validateUsageInput('minutes', '0')).toEqual({ value: 0 })
    expect(validateUsageInput('minutes', '720')).toEqual({ value: 43200 })
    expect(validateUsageInput('minutes', '')).toEqual({ error: '숫자를 적어 주세요' })
    for (const bad of ['721', 'abc', '1.25', '-1']) {
      expect(validateUsageInput('minutes', bad)).toEqual({ error: '사용 시간은 0~720시간, 소수 첫째 자리까지 적어 주세요' })
    }
  })

  it('사용 횟수는 0~999 정수', () => {
    expect(validateUsageInput('count', '6')).toEqual({ value: 6 })
    expect(validateUsageInput('count', '999')).toEqual({ value: 999 })
    for (const bad of ['1000', '2.5', 'x', '-3']) {
      expect(validateUsageInput('count', bad)).toEqual({ error: '사용 횟수는 0~999 사이 정수로 적어 주세요' })
    }
  })
})

describe('적은 사용량 저장과 표시 (F25)', () => {
  it('적은 날(현지 날짜)과 함께 저장하고 기록 시각을 바꾼다. 지우면 필드를 없앤다', () => {
    const now = new Date(2026, 9, 11, 22)
    const saved = setUsageEntry(sub(), { kind: 'minutes', value: 1080 }, now)
    expect(saved.usageEntry).toEqual({ kind: 'minutes', value: 1080, day: '2026-10-11' })
    expect(saved.updatedAt).toBe(now.toISOString())
    expect(setUsageEntry(saved, null, now)).not.toHaveProperty('usageEntry')
  })

  it('사용 시간·횟수로 한 번에 드는 돈을 보여주고, 0이면 사용 없음', () => {
    const entered = (kind: 'minutes' | 'count', value: number, over: Partial<Subscription> = {}) =>
      usageInfo(sub({ usageEntry: { kind, value, day: '2026-10-11' }, ...over }), TODAY)
    expect(entered('minutes', 1080)).toEqual({ source: 'entered', text: '최근 30일 18시간 · 1시간에 약 530원', day: '2026-10-11', stale: false })
    expect(entered('count', 6, { priceKrw: 3990 })?.text).toBe('최근 30일 6번 사용 · 1번에 약 670원')
    expect(entered('minutes', 0)?.text).toBe('최근 30일 사용 없음')
  })

  it('적은 날부터 30일이 넘으면 다시 적으라고 표시한다', () => {
    expect(usageInfo(sub({ usageEntry: { kind: 'count', value: 3, day: '2026-09-11' } }), TODAY)).toMatchObject({ stale: false })
    expect(usageInfo(sub({ usageEntry: { kind: 'count', value: 3, day: '2026-09-10' } }), TODAY)).toMatchObject({ stale: true })
  })

  it('직접 적은 사용량이 오늘 썼어요 기록과 예시보다 먼저다', () => {
    const both = sub({ usageEntry: { kind: 'count', value: 6, day: '2026-10-11' }, useDates: ['2026-10-10'], exampleUseCount: 1 })
    expect(usageInfo(both, TODAY)?.source).toBe('entered')
  })

  it('구독을 고쳐도 적은 사용량은 남는다', () => {
    const before = sub({ usageEntry: { kind: 'minutes', value: 60, day: '2026-10-11' } })
    const after = updateSubscription(before, { name: '티빙', priceKrw: 10900, cycle: 'monthly', billingDay: 10, lastUsedDate: null }, TODAY)
    expect(after.usageEntry).toEqual({ kind: 'minutes', value: 60, day: '2026-10-11' })
  })
})

describe('적은 사용량과 해지 후보 (F25)', () => {
  it('1 이상을 적으면 적은 날을 사용한 날로 보고, 확인 필요가 아니다', () => {
    const used = sub({ usageEntry: { kind: 'count', value: 6, day: '2026-10-11' } })
    expect(lastUsedOf(used)).toBe('2026-10-11')
    expect(needsUsageCheck(used)).toBe(false)
    expect(isCancelCandidate(used, TODAY)).toBe(false)
  })

  it('0을 적었고 다른 사용 기록이 없으면 해지 후보다', () => {
    const unused = sub({ usageEntry: { kind: 'minutes', value: 0, day: '2026-10-11' } })
    expect(lastUsedOf(unused)).toBeNull()
    expect(needsUsageCheck(unused)).toBe(false)
    expect(isCancelCandidate(unused, TODAY)).toBe(true)
  })

  it('적은 날이 31일 넘게 지났으면 1 이상이어도 해지 후보가 된다', () => {
    expect(isCancelCandidate(sub({ usageEntry: { kind: 'count', value: 2, day: '2026-09-10' } }), TODAY)).toBe(true)
  })
})

describe('복원 (F25)', () => {
  const load = (usageEntry: unknown) => parseSubscriptions(JSON.stringify({ schemaVersion: 1, items: [{ ...sub(), usageEntry }] }))
  it('kind·범위·실제 날짜가 맞을 때만 받는다', () => {
    expect(load({ kind: 'minutes', value: 43200, day: '2026-10-11' })).toMatchObject({ ok: true })
    expect(load({ kind: 'count', value: 999, day: '2026-10-11' })).toMatchObject({ ok: true })
    for (const bad of [
      { kind: 'minutes', value: 43201, day: '2026-10-11' },
      { kind: 'count', value: 1000, day: '2026-10-11' },
      { kind: 'count', value: 2.5, day: '2026-10-11' },
      { kind: 'hours', value: 1, day: '2026-10-11' },
      { kind: 'count', value: 1, day: '2026-02-30' },
      { kind: 'count', value: 1 },
      'x',
    ]) {
      expect(load(bad)).toEqual({ ok: false, reason: 'corrupt' })
    }
  })
})
