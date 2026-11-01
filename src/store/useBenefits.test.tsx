import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { BENEFITS_KEY, EMPTY_BENEFITS } from '../logic/benefits'
import { useBenefits } from './useBenefits'

beforeEach(() => localStorage.clear())

it('AC162: 받을 수 있는 돈을 한 키에 저장하고 새로 읽는다', () => {
  const { result } = renderHook(() => useBenefits())
  act(() => { expect(result.current.change((store) => ({ ...store, cards: [{ id: 'c', name: '생활 카드', month: '2026-11', targetKrw: 300000, spentKrw: 280000 }] }))).toBe(true) })
  expect(JSON.parse(localStorage.getItem(BENEFITS_KEY) ?? '{}').cards).toHaveLength(1)
  expect(renderHook(() => useBenefits()).result.current.store.cards[0].name).toBe('생활 카드')
})

it('AC162: 다른 탭이 먼저 저장한 값과 손상된 값은 덮어쓰지 않는다', () => {
  const { result } = renderHook(() => useBenefits())
  const other = JSON.stringify({ ...EMPTY_BENEFITS, programs: [{ id: 'energy', checkedOn: '2026-11-02', status: 'checked' }] })
  localStorage.setItem(BENEFITS_KEY, other)
  act(() => { expect(result.current.change((store) => ({ ...store, expiries: [{ id: 'e', name: '포인트', expiresOn: '2026-11-15' }] }))).toBe(false) })
  expect(localStorage.getItem(BENEFITS_KEY)).toBe(other)
  expect(result.current.status.kind).toBe('replaced')
  localStorage.setItem(BENEFITS_KEY, '{bad')
  const damaged = renderHook(() => useBenefits())
  act(() => { damaged.result.current.change((store) => ({ ...store, programs: [{ id: 'rent', checkedOn: '2026-11-02', status: 'checked' }] })) })
  expect(localStorage.getItem(BENEFITS_KEY)).toBe('{bad')
})
