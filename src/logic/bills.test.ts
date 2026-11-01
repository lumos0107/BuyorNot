import { describe, expect, it } from 'vitest'
import { addBill, billCompareLine, billLogLine, createBill, isBillsStore, parseBills, updateBill, validateBillInput, type Bill } from './bills'

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

describe('공과금 비교', () => {
  it('AC113: 작년 같은 달보다 많으면·적으면·같으면 금액 차이를 말한다', () => {
    const old = bill({ id: 'old', month: '2025-10', amountKrw: 36200 })
    expect(billCompareLine([old, bill()], 'electric')).toBe('10월 전기 42,300원 · 작년 10월보다 6,100원 많아요')
    expect(billCompareLine([old, bill({ amountKrw: 30000 })], 'electric')).toBe('10월 전기 30,000원 · 작년 10월보다 6,200원 적어요')
    expect(billCompareLine([old, bill({ amountKrw: 36200 })], 'electric')).toBe('10월 전기 36,200원 · 작년 10월과 같아요')
  })
  it('AC113: 작년 없이 최근 세 번 평균과 비교한다', () => {
    const items = [bill({ id: 'a', kind: 'gas', month: '2026-07', amountKrw: 11000 }), bill({ id: 'b', kind: 'gas', month: '2026-08', amountKrw: 12000 }), bill({ id: 'c', kind: 'gas', month: '2026-09', amountKrw: 13000 }), bill({ id: 'd', kind: 'gas', amountKrw: 15000 })]
    expect(billCompareLine(items, 'gas')).toBe('10월 가스 15,000원 · 최근 3번 평균(12,000원)보다 3,000원 많아요')
  })
  it('AC113: 지난번이 하나면 그 달을, 비교할 기록이 없으면 금액만 보인다', () => {
    const current = bill({ kind: 'gas', amountKrw: 15000 })
    expect(billCompareLine([bill({ id: 'prev', kind: 'gas', month: '2026-09', amountKrw: 14000 }), current], 'gas')).toBe('10월 가스 15,000원 · 지난번(9월, 14,000원)보다 1,000원 많아요')
    expect(billCompareLine([bill({ id: 'prev', kind: 'gas', month: '2026-03' }), current], 'gas')).toBe('10월 가스 15,000원')
  })
  it('AC114: 두 달 치는 한 달 값으로 작년과 비교한다', () => {
    const old = bill({ id: 'old', kind: 'water', month: '2025-09', amountKrw: 20000, months: 2 })
    const current = bill({ kind: 'water', month: '2026-09', amountKrw: 24000, months: 2 })
    expect(billCompareLine([old, current], 'water')).toBe('9월 수도(두 달 치) 24,000원 · 한 달에 약 12,000원 · 작년 9월보다 한 달에 약 2,000원 많아요')
    expect(billLogLine(current)).toBe('2026-09 · 수도 · 24,000원 · 두 달 치')
  })
  it('AC114: 금액과 미래 청구 월은 오류다', () => {
    const base = { kind: 'electric' as const, year: '2026', month: '10', amount: '42300', twoMonths: false }
    expect(validateBillInput({ ...base, amount: '0' }, new Date(2026, 10, 1)).errors.amount).toBe('금액은 1원~1,000만 원 사이여야 해요')
    expect(validateBillInput({ ...base, amount: '' }, new Date(2026, 10, 1)).errors.amount).toBe('금액을 숫자로 입력해 주세요')
    expect(validateBillInput({ ...base, month: '12' }, new Date(2026, 10, 1)).errors.month).toBe('청구 월은 이번 달이거나 그 전이어야 해요')
  })
})
