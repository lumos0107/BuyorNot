import { describe, expect, it } from 'vitest'
import { addBill, createBill, isBillsStore, parseBills, updateBill, type Bill } from './bills'

const stamp = '2026-11-01T00:00:00.000Z'
const bill = (over: Partial<Bill> = {}): Bill => ({ id: 'b1', kind: 'electric', month: '2026-10', amountKrw: 42300, createdAt: stamp, updatedAt: stamp, ...over })
const store = (...items: Bill[]) => ({ schemaVersion: 1 as const, items })

describe('공과금 저장', () => {
  it('AC115: 저장값이 없으면 빈 공과금 기록이다', () => {
    expect(parseBills(null)).toEqual({ ok: true, store: store() })
  })
  it('AC115: 모르는 키와 같은 종류·같은 달 중복은 손상이다', () => {
    expect(isBillsStore({ ...store(), extra: true })).toBe(false)
    expect(isBillsStore(store(bill(), bill({ id: 'b2' })))).toBe(false)
    expect(isBillsStore(store(bill(), bill({ id: 'b2', kind: 'gas' })))).toBe(true)
  })
  it('AC115: 날짜·금액·두 달 치·종류·ID가 잘못되면 손상이다', () => {
    for (const over of [
      { month: '1999-12' }, { month: '2026-13' }, { amountKrw: 0 }, { amountKrw: 10000001 },
      { amountKrw: 1.5 }, { months: 3 }, { kind: 'trash' }, { id: '' }, { createdAt: 'bad' },
    ]) expect(isBillsStore(store(bill(over as Partial<Bill>)))).toBe(false)
    expect(isBillsStore(store(bill(), bill({ id: 'b1', kind: 'gas' })))).toBe(false)
  })
  it('AC115: 600건이면 더 더하지 않는다', () => {
    const items = Array.from({ length: 600 }, (_, i) => bill({ id: String(i), month: `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}` }))
    expect(addBill(store(...items), bill({ id: 'new' }))).toBe('full')
    expect(isBillsStore(store(...items, bill({ id: 'new' })))).toBe(false)
  })
  it('AC114: 같은 달을 바꾸면 금액과 두 달 치만 바뀌고 하나만 남는다', () => {
    const before = store(bill())
    const after = updateBill(before, 'b1', { kind: 'electric', month: '2026-10', amountKrw: 45000, months: 2 }, new Date('2026-11-02T00:00:00Z'))
    expect(after.items).toEqual([{ ...bill(), amountKrw: 45000, months: 2, updatedAt: '2026-11-02T00:00:00.000Z' }])
    expect(createBill({ kind: 'gas', month: '2026-10', amountKrw: 15000 }, new Date(stamp), 'b2')).not.toHaveProperty('months')
  })
})
