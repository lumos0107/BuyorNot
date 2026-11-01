import { expect, it } from 'vitest'
import { makeBackup, parseBackup } from './backup'
import { parseStore } from './storage'
import { reconsiderItem, type WishItem } from './wishlist'

const stamp = '2026-11-01T00:00:00.000Z'
const item: WishItem = { id: 'w1', name: '무선 헤드폰', priceKrw: 300000, reason: '필요', url: null, createdAt: stamp, updatedAt: stamp, reviewAt: '2026-11-04T00:00:00.000Z', status: 'considering', decidedAt: null }
const load = (value: unknown) => parseStore(JSON.stringify({ schemaVersion: 1, items: [value] }))

it('AC148: 선택 필드가 없는 예전 기록과 있는 기록을 모두 읽는다', () => {
  expect(load(item).ok).toBe(true)
  expect(load({ ...item, installment: { months: 12, monthlyKrw: 30000 }, usesPerYear: 2, bulkUse: { total: 10, monthlyUse: 1, expiresMonths: 6 }, targetPriceKrw: 290000, priceNotes: [{ day: '2026-10-20', priceKrw: 299000 }] }).ok).toBe(true)
})

it('AC134·AC148: 잘못된 선택 필드가 있으면 기록을 손상으로 본다', () => {
  for (const over of [
    { installment: { months: 1, monthlyKrw: 30000 } }, { installment: { months: 12 } }, { usesPerYear: 0 },
    { bulkUse: { total: 10, monthlyUse: 0 } }, { targetPriceKrw: 0 },
    { priceNotes: [{ day: '2026-11-01', priceKrw: 30000 }, { day: '2026-11-01', priceKrw: 29000 }] },
    { returnBy: '2026-11-15' },
  ]) expect(load({ ...item, ...over }).ok).toBe(false)
  expect(load({ ...item, status: 'purchased', decidedAt: stamp, resale: { listedOn: '2026-11-10', soldKrw: 80000 } }).ok).toBe(false)
})

it('AC148: 판 3 백업 왕복 뒤에도 선택 필드가 같다', () => {
  const extra = { ...item, installment: { months: 12, monthlyKrw: 30000 }, targetPriceKrw: 290000 }
  const parsed = parseBackup(makeBackup({ items: [extra], hourlyWage: null, subscriptions: [] }, new Date(stamp)))
  expect(parsed.ok && parsed.data.items[0]).toMatchObject(extra)
})

it('AC148: 구매함의 반품·되팔기 선택 필드도 복원된다', () => {
  const bought: WishItem = { ...item, status: 'purchased', decidedAt: stamp, returnBy: '2026-11-15', returnedOn: '2026-11-10', resale: { listedOn: '2026-11-11', soldOn: '2026-11-20', soldKrw: 80000 } }
  expect(load(bought).ok).toBe(true)
  const parsed = parseBackup(makeBackup({ items: [bought], hourlyWage: null, subscriptions: [] }, new Date(stamp)))
  expect(parsed.ok && parsed.data.items[0]).toMatchObject(bought)
})

it('AC145: 구매함을 다시 고민으로 옮기면 반품·되팔기 필드는 지운다', () => {
  const bought: WishItem = { ...item, status: 'purchased', decidedAt: stamp, returnBy: '2026-11-15', returnedOn: '2026-11-10', resale: { listedOn: '2026-11-11' } }
  const next = reconsiderItem(bought, new Date(stamp))
  expect(next).not.toHaveProperty('returnBy')
  expect(next).not.toHaveProperty('returnedOn')
  expect(next).not.toHaveProperty('resale')
})
