import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { STORAGE_KEY } from '../logic/storage'
import type { WishItem } from '../logic/wishlist'
import { useWishlist } from './useWishlist'

const stamp = '2026-11-01T00:00:00.000Z'
const item: WishItem = { id: 'w1', name: '무선 헤드폰', priceKrw: 300000, reason: '필요', url: null, createdAt: stamp, updatedAt: stamp, reviewAt: '2026-11-04T00:00:00.000Z', status: 'considering', decidedAt: null }
const seed = (value: WishItem) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [value] }))
beforeEach(() => { localStorage.clear() })

it('AC134: 사기 전 선택 필드가 같은 물건 키에 저장된다', () => {
  seed(item)
  const { result } = renderHook(() => useWishlist())
  let applied = false
  act(() => { applied = result.current.updateBefore('w1', (current) => ({ ...current, installment: { months: 12, monthlyKrw: 30000 } })) })
  expect(applied).toBe(true)
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].installment).toEqual({ months: 12, monthlyKrw: 30000 })
})

it('AC148: 다른 탭이 먼저 물건을 바꾸면 새 선택 필드로 덮지 않는다', () => {
  seed(item)
  const { result } = renderHook(() => useWishlist())
  seed({ ...item, priceKrw: 290000 })
  let applied = true
  act(() => { applied = result.current.updateBefore('w1', (current) => ({ ...current, usesPerYear: 2 })) })
  expect(applied).toBe(false)
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].priceKrw).toBe(290000)
})
