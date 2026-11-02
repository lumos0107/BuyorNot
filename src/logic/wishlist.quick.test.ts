import { expect, it } from 'vitest'
import { makeBackup, parseBackup } from './backup'
import { buildIcs } from './calendar'
import { parseStore } from './storage'
import { createItem, validateWishInput, validateWishPatch } from './wishlist'

const raw = { name: '전기 포트', price: '59000', reason: '', days: '3', url: '' }
const now = new Date('2026-11-02T00:00:00.000Z')

it('AC167: 두 값과 3일로 담으면 이유가 빈 기록으로 저장되고 백업으로 왕복한다', () => {
  const checked = validateWishInput(raw, true)
  expect(checked.value).toEqual({ name: '전기 포트', priceKrw: 59000, reason: '', days: 3, url: null })
  const item = createItem(checked.value!, now, 'q1')
  expect(parseStore(JSON.stringify({ schemaVersion: 1, items: [item] }))).toMatchObject({ ok: true, store: { items: [item] } })
  const backup = makeBackup({ items: [item], hourlyWage: null, subscriptions: [] }, now)
  expect(parseBackup(backup)).toMatchObject({ ok: true, data: { items: [item] } })
  expect(validateWishInput(raw).value).toBeUndefined()
})

it('AC168: 이유 없이 담은 기록은 이름·가격만 고쳐도 되고 기존 이유는 빈 값으로 지우지 못한다', () => {
  expect(validateWishPatch({ ...raw, name: '새 포트' }, true).value?.reason).toBe('')
  expect(validateWishPatch({ ...raw, name: '새 포트' }).errors.reason).toBe('사고 싶은 이유를 적어 주세요')
})

it('AC171: 이유 없는 물건의 캘린더 설명에는 빈 이유 줄이 없다', () => {
  const item = createItem(validateWishInput(raw, true).value!, now, 'q1')
  const ics = buildIcs(item, now)
  expect(ics).not.toContain('처음 적은 이유:')
})
