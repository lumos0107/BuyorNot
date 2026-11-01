import { expect, it } from 'vitest'
import { EMPTY_PANTRY, PANTRY_KEY, isPantryStore, parsePantry, type PantryItem } from './pantry'

const stamp = '2026-11-01T00:00:00.000Z'
const item = (over: Partial<PantryItem> = {}): PantryItem => ({ id: 'p1', name: '세제', kind: 'essential', level: 'plenty', purchases: [], createdAt: stamp, updatedAt: stamp, ...over })
const store = (...items: PantryItem[]) => ({ schemaVersion: 1 as const, items, recipes: [], events: [] })

it('AC118: 집에 있는 것 저장값이 없으면 빈 기록이다', () => {
  expect(PANTRY_KEY).toBe('buyornot.pantry.v1')
  expect(parsePantry(null)).toEqual({ ok: true, store: EMPTY_PANTRY })
})
it('AC118: 알 수 없는 키·중복 이름·잘못된 종류와 상태는 손상이다', () => {
  expect(isPantryStore({ ...store(item()), extra: 1 })).toBe(false)
  expect(isPantryStore(store(item(), item({ id: 'p2', name: ' 세제 ' })))).toBe(false)
  expect(isPantryStore(store(item({ kind: 'unknown' as never })))).toBe(false)
  expect(isPantryStore(store(item({ level: 'empty' as never })))).toBe(false)
  expect(isPantryStore(store(item({ kind: 'essential', expiresOn: '2026-11-03' })))).toBe(false)
  expect(isPantryStore(store(item()))).toBe(true)
})
