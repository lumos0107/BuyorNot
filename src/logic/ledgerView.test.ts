import { describe, expect, it } from 'vitest'
import {
  isLedgerStore,
  ledgerByCategory,
  ledgerDashboard,
  ledgerDayGroups,
  ledgerDayLabel,
  ledgerMonthChange,
  ledgerMonth,
  parseLedger,
  parseSaveTarget,
  shiftMonth,
  type LedgerEntry,
} from './ledger'

// PRD F84 가계부 보기 (AC203~AC208)
const at = '2026-11-02T00:00:00.000Z'
const entry = (id: string, kind: LedgerEntry['kind'], category: LedgerEntry['category'], amountKrw: number, day: string): LedgerEntry =>
  ({ id, kind, category, name: id, amountKrw, day, createdAt: at })

describe('AC203: 달 이동', () => {
  it('한 달씩 앞뒤로 옮기고 해가 바뀐다', () => {
    expect(shiftMonth('2026-11', -1)).toBe('2026-10')
    expect(shiftMonth('2026-10', 2)).toBe('2026-12')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})

describe('AC204: 분류별 지출', () => {
  it('지출 분류별 금액과 비율을 큰 순서로, 수입은 넣지 않는다', () => {
    const entries = [
      entry('a', 'expense', 'food', 12000, '2026-11-02'),
      entry('b', 'expense', 'food', 3000, '2026-11-01'),
      entry('c', 'expense', 'transport', 5000, '2026-11-01'),
      entry('d', 'income', 'salary', 50000, '2026-11-02'),
      entry('e', 'expense', 'daily', 9000, '2026-10-30'),
    ]
    expect(ledgerByCategory(entries, '2026-11')).toEqual([
      { category: 'food', amountKrw: 15000, percent: 75 },
      { category: 'transport', amountKrw: 5000, percent: 25 },
    ])
  })
  it('수입만 있거나 기록이 없으면 빈 목록', () => {
    expect(ledgerByCategory([entry('d', 'income', 'salary', 50000, '2026-10-02')], '2026-10')).toEqual([])
    expect(ledgerByCategory([], '2026-10')).toEqual([])
  })
})

describe('AC205: 날짜별 내역', () => {
  it('날짜별로 묶고 그날 수입·지출 합계를 낸다', () => {
    const entries = [
      entry('lunch', 'expense', 'food', 12000, '2026-11-02'),
      entry('bus', 'expense', 'transport', 3000, '2026-11-01'),
      entry('pay', 'income', 'salary', 50000, '2026-11-02'),
    ]
    const groups = ledgerDayGroups(ledgerMonth(entries, '2026-11').entries)
    expect(groups.map((g) => [g.day, g.income, g.expense, g.entries.length])).toEqual([
      ['2026-11-02', 50000, 12000, 2],
      ['2026-11-01', 0, 3000, 1],
    ])
  })
  it('요일을 붙인 날짜 이름', () => {
    expect(ledgerDayLabel('2026-11-02')).toBe('11월 2일 (월)')
    expect(ledgerDayLabel('2026-11-01')).toBe('11월 1일 (일)')
  })
})

describe('AC206: 이달 현황판', () => {
  it('수입 안에서 지출·모을 금액·남는 돈과 비율', () => {
    expect(ledgerDashboard(500000, 15500, 100000)).toEqual({
      kind: 'ok', income: 500000, expense: 15500, target: 100000, left: 384500, over: 0,
      percent: { expense: 3, target: 20, left: 77 },
    })
  })
  it('지출과 모을 금액이 수입보다 크면 넘친 금액', () => {
    expect(ledgerDashboard(500000, 15500, 490000)).toMatchObject({ kind: 'ok', left: 0, over: 5500 })
  })
  it('모을 금액이 없으면 지출과 남는 돈만', () => {
    expect(ledgerDashboard(500000, 15500, null)).toMatchObject({ target: 0, left: 484500, percent: { expense: 3, target: 0, left: 97 } })
  })
  it('수입이 0원이면 비어 있다', () => {
    expect(ledgerDashboard(0, 15500, 100000)).toEqual({ kind: 'no-income' })
  })
})

describe('AC207: 모을 금액 저장', () => {
  it('0원~10억 원 정수만 받고 빈 칸은 지우기', () => {
    expect(parseSaveTarget('100000')).toEqual({ ok: true, value: 100000 })
    expect(parseSaveTarget('0')).toEqual({ ok: true, value: 0 })
    expect(parseSaveTarget('  ')).toEqual({ ok: true, value: null })
    for (const bad of ['-1', '1.5', '오만', '1000000001']) expect(parseSaveTarget(bad)).toEqual({ ok: false })
  })
  it('모을 금액이 없는 옛 기록과 있는 기록을 모두 읽고, 잘못된 값은 손상으로 본다', () => {
    expect(parseLedger(JSON.stringify({ schemaVersion: 1, entries: [] }))).toEqual({ ok: true, store: { schemaVersion: 1, entries: [] } })
    const withTarget = { schemaVersion: 1, entries: [], saveTargets: { '2026-11': 100000 } }
    expect(isLedgerStore(withTarget)).toBe(true)
    expect(isLedgerStore({ ...withTarget, saveTargets: { '2026-11': -1 } })).toBe(false)
    expect(isLedgerStore({ ...withTarget, saveTargets: { '11월': 1 } })).toBe(false)
    expect(isLedgerStore({ ...withTarget, saveTargets: [] })).toBe(false)
  })
})

describe('AC208: 지난달 비교', () => {
  const oct = entry('o', 'expense', 'food', 20000, '2026-10-05')
  it('지난달 지출과 비교한 한 줄', () => {
    expect(ledgerMonthChange([oct, entry('n', 'expense', 'food', 15000, '2026-11-01')], '2026-11')).toBe('지난달보다 5,000원 덜 썼어요')
    expect(ledgerMonthChange([oct, entry('n', 'expense', 'food', 25000, '2026-11-01')], '2026-11')).toBe('지난달보다 5,000원 더 썼어요')
    expect(ledgerMonthChange([oct, entry('n', 'expense', 'food', 20000, '2026-11-01')], '2026-11')).toBe('지난달과 같아요')
  })
  it('지난달 기록이 없으면 보이지 않는다', () => {
    expect(ledgerMonthChange([entry('n', 'expense', 'food', 15000, '2026-11-01')], '2026-11')).toBeNull()
  })
})
