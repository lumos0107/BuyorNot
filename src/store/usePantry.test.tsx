import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { PANTRY_KEY, type PantryItem } from '../logic/pantry'
import { usePantry } from './usePantry'

const stamp = '2026-11-01T00:00:00.000Z'
const item = (over: Partial<PantryItem> = {}): PantryItem => ({ id: 'p1', name: '세제', kind: 'essential', level: 'plenty', purchases: [], createdAt: stamp, updatedAt: stamp, ...over })
beforeEach(() => { localStorage.clear() })

it('AC118: 집에 있는 것을 더하면 저장되고 다시 읽힌다', () => {
  const { result } = renderHook(() => usePantry())
  let outcome = ''
  act(() => { outcome = result.current.addItem(item()) })
  expect(outcome).toBe('ok')
  expect(renderHook(() => usePantry()).result.current.store.items).toEqual([item()])
})
it('AC118: 다른 탭이 먼저 저장하면 덮어쓰지 않는다', () => {
  const { result } = renderHook(() => usePantry())
  const other = JSON.stringify({ schemaVersion: 1, items: [item({ id: 'other' })], recipes: [], events: [] })
  localStorage.setItem(PANTRY_KEY, other)
  let outcome = ''
  act(() => { outcome = result.current.addItem(item()) })
  expect(outcome).toBe('replaced')
  expect(localStorage.getItem(PANTRY_KEY)).toBe(other)
  expect(result.current.status.kind).toBe('replaced')
})
