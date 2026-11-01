import { describe, expect, it } from 'vitest'
import {
  EMPTY_SAVINGS,
  TRANSFER_MAX,
  addTransfer,
  clearGoal,
  isSavingsStore,
  parseSavings,
  removeTransfer,
  setGoal,
  type Goal,
  type SavingsStore,
  type Transfer,
} from './savings'

// PRD F48 저장 (AC96): buyornot.savings.v1 = { schemaVersion: 1, transfers, goal }
// plan: 계획의 테스트 이름 끝 (AC96)을 앞으로 옮김(R2)
const T = (over: Partial<Transfer> = {}): Transfer => ({
  id: 't1',
  day: '2026-11-01',
  amountKrw: 100000,
  direction: 'in',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
})
const G = (over: Partial<Goal> = {}): Goal => ({
  name: '비상금',
  targetKrw: 500000,
  startedOn: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
})
const raw = (over: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, transfers: [], goal: null, ...over })
const bad = (r: string | null) => {
  expect(parseSavings(r)).toEqual({ ok: false, reason: 'corrupt' })
}

describe('모으기 기록 복원 (F48 저장)', () => {
  it('AC96: 저장값이 없으면 빈 모으기 기록이다', () => {
    expect(parseSavings(null)).toEqual({ ok: true, store: { schemaVersion: 1, transfers: [], goal: null } })
    expect(EMPTY_SAVINGS).toEqual({ schemaVersion: 1, transfers: [], goal: null })
  })

  it('AC96: 옮긴 돈과 목표가 그대로 복원된다', () => {
    const store: SavingsStore = {
      schemaVersion: 1,
      transfers: [T(), T({ id: 't2', direction: 'out', amountKrw: 20000, memo: '적금 통장' })],
      goal: G({ targetDate: '2027-04-30' }),
    }
    expect(parseSavings(JSON.stringify(store))).toEqual({ ok: true, store })
    expect(isSavingsStore(store)).toBe(true)
  })

  it('AC96: 모르는 키 kept가 있으면 손상이다', () => {
    bad(raw({ kept: [] }))
  })

  it('AC96: JSON이 아니거나 판이 1이 아니거나 키가 모자라면 손상이다', () => {
    bad('{')
    bad(raw({ schemaVersion: 2 }))
    bad(JSON.stringify({ schemaVersion: 1, transfers: [] }))
    bad('null')
  })

  it('AC96: 옮긴 돈이 2,001건이면 손상이다', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => T({ id: `t${i}` }))
    expect(parseSavings(raw({ transfers: many(TRANSFER_MAX) })).ok).toBe(true)
    bad(raw({ transfers: many(TRANSFER_MAX + 1) }))
  })

  it('AC96: 금액 0, 방향이 다름, 메모 31자, 실제가 아닌 날짜, 같은 id 두 개면 손상이다', () => {
    bad(raw({ transfers: [T({ amountKrw: 0 })] }))
    bad(raw({ transfers: [T({ direction: 'sideways' as never })] }))
    bad(raw({ transfers: [T({ memo: 'ㄱ'.repeat(31) })] }))
    bad(raw({ transfers: [T({ day: '2026-02-30' })] }))
    bad(raw({ transfers: [T(), T()] }))
  })

  it('AC96: 금액 1억 원 초과, 정수가 아닌 금액, 빈 id, 빈 메모, 시각이 아닌 값은 손상이고 경계값은 읽힌다', () => {
    expect(parseSavings(raw({ transfers: [T({ amountKrw: 100_000_000 }), T({ id: 't2', memo: 'ㄱ'.repeat(30) })] })).ok).toBe(true)
    bad(raw({ transfers: [T({ amountKrw: 100_000_001 })] }))
    bad(raw({ transfers: [T({ amountKrw: 1.5 })] }))
    bad(raw({ transfers: [T({ id: '' })] }))
    bad(raw({ transfers: [T({ memo: '' })] }))
    bad(raw({ transfers: [T({ createdAt: '어제' })] }))
  })

  it('AC96: 목표 이름 21자, 금액 9,999, 실제가 아닌 정한 날이면 손상이다', () => {
    bad(raw({ goal: G({ name: 'ㄱ'.repeat(21) }) }))
    bad(raw({ goal: G({ targetKrw: 9999 }) }))
    bad(raw({ goal: G({ startedOn: '2026-13-01' }) }))
  })

  it('AC96: 목표의 경계값은 읽히고 1억 원 초과, 빈 이름, 실제가 아닌 목표 날짜, 빈 시각은 손상이다', () => {
    expect(parseSavings(raw({ goal: G({ name: 'ㄱ'.repeat(20), targetKrw: 10000 }) })).ok).toBe(true)
    expect(parseSavings(raw({ goal: G({ targetKrw: 100_000_000 }) })).ok).toBe(true)
    bad(raw({ goal: G({ targetKrw: 100_000_001 }) }))
    bad(raw({ goal: G({ name: '   ' }) }))
    bad(raw({ goal: G({ targetDate: '2027-02-30' }) }))
    bad(raw({ goal: G({ updatedAt: '' }) }))
  })

  it('AC96: 목표 이름은 앞뒤 공백을 뺀 길이로 센다', () => {
    expect(parseSavings(raw({ goal: G({ name: ` ${'ㄱ'.repeat(20)} ` }) })).ok).toBe(true)
  })
})

describe('모으기 기록 바꾸기 (F48 저장)', () => {
  it('AC96: 옮긴 돈을 더하고 지운다', () => {
    const added = addTransfer(EMPTY_SAVINGS, T())
    expect(added).toEqual({ schemaVersion: 1, transfers: [T()], goal: null })
    expect(removeTransfer(added as SavingsStore, 't1').transfers).toEqual([])
  })

  it('AC96: 2,000건이면 더 더하지 않는다', () => {
    const full: SavingsStore = { ...EMPTY_SAVINGS, transfers: Array.from({ length: TRANSFER_MAX }, (_, i) => T({ id: `t${i}` })) }
    expect(addTransfer(full, T({ id: 'extra' }))).toBe('full')
  })

  it('AC96: 목표를 정하고 지워도 옮긴 돈은 남는다', () => {
    const withGoal = setGoal({ ...EMPTY_SAVINGS, transfers: [T()] }, G())
    expect(withGoal.goal).toEqual(G())
    expect(clearGoal(withGoal)).toEqual({ schemaVersion: 1, transfers: [T()], goal: null })
  })
})
