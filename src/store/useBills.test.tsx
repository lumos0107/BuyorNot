import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { BILLS_KEY, BILL_MAX, type Bill } from '../logic/bills'
import { useBills } from './useBills'

const stamp = '2026-11-01T00:00:00.000Z'
const bill = (over: Partial<Bill> = {}): Bill => ({ id: 'b1', kind: 'electric', month: '2026-10', amountKrw: 42300, createdAt: stamp, updatedAt: stamp, ...over })
const rawOf = (items: Bill[]) => JSON.stringify({ schemaVersion: 1, items })
beforeEach(() => { localStorage.clear() })

it('AC115: 공과금을 더하면 저장되고 다시 읽으면 같다', () => {
  const { result } = renderHook(() => useBills())
  let outcome = ''
  act(() => { outcome = result.current.add(bill()) })
  expect(outcome).toBe('ok')
  expect(localStorage.getItem(BILLS_KEY)).toBe(rawOf([bill()]))
  expect(renderHook(() => useBills()).result.current.store.items).toEqual([bill()])
})

it('AC115: 다른 탭이 먼저 저장했으면 덮어쓰지 않고 불러온다', () => {
  const { result } = renderHook(() => useBills())
  const other = rawOf([bill({ id: 'other' })])
  localStorage.setItem(BILLS_KEY, other)
  let outcome = ''
  act(() => { outcome = result.current.add(bill()) })
  expect(outcome).toBe('replaced')
  expect(localStorage.getItem(BILLS_KEY)).toBe(other)
  expect(result.current.store.items[0].id).toBe('other')
  expect(result.current.status.kind).toBe('replaced')
})

it('AC115: 손상된 저장값은 덮어쓰지 않는다', () => {
  localStorage.setItem(BILLS_KEY, '{bad')
  const { result } = renderHook(() => useBills())
  act(() => { result.current.add(bill()) })
  expect(localStorage.getItem(BILLS_KEY)).toBe('{bad')
  expect(result.current.status.kind).toBe('corrupt')
})

it('AC115: 600건이면 full을 돌려주고 저장하지 않는다', () => {
  const items = Array.from({ length: BILL_MAX }, (_, i) => bill({ id: String(i), month: `${2000 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}` }))
  localStorage.setItem(BILLS_KEY, rawOf(items))
  const { result } = renderHook(() => useBills())
  let outcome = ''
  act(() => { outcome = result.current.add(bill({ id: 'new' })) })
  expect(outcome).toBe('full')
  expect(result.current.store.items).toHaveLength(BILL_MAX)
})

it('AC115: 바꾸기와 지우기는 다른 탭이 먼저 저장했으면 false다', () => {
  localStorage.setItem(BILLS_KEY, rawOf([bill()]))
  const { result } = renderHook(() => useBills())
  localStorage.setItem(BILLS_KEY, rawOf([bill({ amountKrw: 45000 })]))
  let outcome = true
  act(() => { outcome = result.current.update('b1', { kind: 'electric', month: '2026-10', amountKrw: 48000 }) })
  expect(outcome).toBe(false)
  expect(result.current.store.items[0].amountKrw).toBe(45000)
})
