import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { SPENDING_KEY, type SpendingTemplate } from '../logic/spending'
import { useSpending } from './useSpending'

const stamp = '2026-11-01T00:00:00.000Z'
const template: SpendingTemplate = { id: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, createdAt: stamp, updatedAt: stamp }
beforeEach(() => { localStorage.clear() })

it('AC128: 작은 지출 버튼은 저장되고 다시 읽힌다', () => {
  const { result } = renderHook(() => useSpending())
  let outcome = ''
  act(() => { outcome = result.current.addTemplate(template) })
  expect(outcome).toBe('ok')
  expect(renderHook(() => useSpending()).result.current.store.templates).toEqual([template])
})
it('AC128: 손상된 저장값은 덮어쓰지 않는다', () => {
  localStorage.setItem(SPENDING_KEY, '{bad')
  const { result } = renderHook(() => useSpending())
  act(() => { result.current.addTemplate(template) })
  expect(localStorage.getItem(SPENDING_KEY)).toBe('{bad')
  expect(result.current.status.kind).toBe('corrupt')
})
