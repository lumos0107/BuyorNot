import { expect, it } from 'vitest'
import { EMPTY_PANTRY, PANTRY_KEY, discardedThisMonth, expiringPantryItems, isPantryStore, parsePantry, type PantryItem } from './pantry'

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

it('AC119: 오늘부터 3일 안과 지난 식재료만 먼저 쓸 것으로 본다', () => {
  const today = new Date(2026, 10, 1, 9)
  expect(expiringPantryItems([item({ kind: 'ingredient', expiresOn: '2026-11-04' }), item({ id: 'p2', name: '우유', kind: 'ingredient', expiresOn: '2026-11-05' })], today).map((entry) => entry.name)).toEqual(['세제'])
  expect(expiringPantryItems([item({ kind: 'ingredient', expiresOn: '2026-10-31' })], today)).toHaveLength(1)
})

it('AC120: 이번 달 버린 식재료 개수와 산 값 합계를 센다', () => {
  const count = discardedThisMonth([{ id: 'e1', action: 'discarded', sourceId: 'p1', name: '두부', day: '2026-11-01', amountKrw: 2500, createdAt: stamp }], new Date(2026, 10, 1))
  expect(count).toEqual({ count: 1, amountKrw: 2500 })
})
