import { describe, expect, it } from 'vitest'
import { makeBackup, parseBackup } from './backup'
import { BASIS_MAX } from './fit'
import { EMPTY_SAVINGS } from './savings'
import { STORAGE_KEY, loadStore, parseStore, saveStore, type WishStore } from './storage'
import type { WishItem } from './wishlist'

// PRD F44 저장: 선택 필드 fit (schemaVersion 1 그대로). 규칙에 맞지 않으면 다른 선택 필드처럼 손상으로 보고,
// 백업·복원 규칙은 물건 기록과 같다 (AC65)
const FIT = {
  place: '싱크대 옆 칸',
  space: { w: 400, d: 300, h: 500 },
  item: { w: 320, d: 250, h: 470 },
  savedAt: '2026-10-30T09:00:00.000Z',
}

function item(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'w1',
    name: '전기 포트',
    priceKrw: 32000,
    reason: '냄비로 물을 끓이기 번거로워서',
    url: null,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    reviewAt: '2026-10-31T00:00:00.000Z',
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}
const load = (...items: Record<string, unknown>[]) => parseStore(JSON.stringify({ schemaVersion: 1, items }))

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  }
}

describe('놓을 자리 저장과 복원 (F44, AC65)', () => {
  it('fit이 있는 기록을 저장하고 다시 읽으면 fit까지 그대로예요', () => {
    const storage = memoryStorage()
    const store = { schemaVersion: 1, items: [item({ fit: FIT }), item({ id: 'w2', fit: { ...FIT, basis: '포장 치수' } })] } as WishStore
    expect(saveStore(storage, store)).toEqual({ ok: true })
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').schemaVersion).toBe(1)
    expect(loadStore(storage)).toEqual({ ok: true, store })
  })

  it('fit이 없는 옛 기록은 그대로 읽어요', () => {
    const old = item()
    expect(load(old)).toEqual({ ok: true, store: { schemaVersion: 1, items: [old] } })
  })

  it('결정한 물건에 남은 fit도 읽어요', () => {
    expect(load(item({ status: 'skipped', decidedAt: '2026-10-30T10:00:00.000Z', fit: FIT }))).toMatchObject({ ok: true })
  })

  it('AC65: 저장 기록의 fit.space.w가 0·10001·25.5면 손상이에요', () => {
    for (const w of [0, 10001, 25.5]) {
      expect(load(item({ fit: { ...FIT, space: { ...FIT.space, w } } })), String(w)).toEqual({ ok: false, reason: 'corrupt' })
    }
  })

  it('AC65: 저장 기록의 place가 빈 문자열이면 손상이에요', () => {
    expect(load(item({ fit: { ...FIT, place: '' } }))).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('AC65: 저장 기록의 basis가 31자면 손상이에요', () => {
    expect(load(item({ fit: { ...FIT, basis: '가'.repeat(BASIS_MAX + 1) } }))).toEqual({ ok: false, reason: 'corrupt' })
    expect(load(item({ fit: { ...FIT, basis: '가'.repeat(BASIS_MAX) } }))).toMatchObject({ ok: true })
  })

  it('fit이 null이거나 객체가 아니면 손상이에요', () => {
    for (const bad of [null, 'fit', 7, [], {}]) {
      expect(load(item({ fit: bad })), JSON.stringify(bad)).toEqual({ ok: false, reason: 'corrupt' })
    }
  })

  it('한 물건의 fit이 손상이면 다른 물건이 멀쩡해도 기록 전체를 손상으로 봐요', () => {
    expect(load(item({ fit: FIT }), item({ id: 'w2', fit: { ...FIT, place: '' } }))).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('AC65: 백업 파일을 받은 뒤 불러와도 fit과 basis가 그대로예요', () => {
    const items = [item({ fit: { ...FIT, basis: '포장 치수' } }), item({ id: 'w2' })] as WishItem[]
    const parsed = parseBackup(makeBackup({ items, hourlyWage: null, subscriptions: [] }, new Date('2026-10-30T12:00:00.000Z')))
    expect(parsed).toEqual({ ok: true, data: { items, hourlyWage: null, subscriptions: [], savings: EMPTY_SAVINGS, bills: { schemaVersion: 1, items: [] }, pantry: { schemaVersion: 1, items: [], recipes: [], events: [] }, spending: { schemaVersion: 1, templates: [], entries: [] } } })
    if (!parsed.ok) return
    expect(parsed.data.items[0].fit).toEqual({ ...FIT, basis: '포장 치수' })
    expect('fit' in parsed.data.items[1]).toBe(false)
  })

  it('fit이 손상된 백업 파일은 읽지 않아요', () => {
    const items = [item({ fit: { ...FIT, space: { ...FIT.space, w: 0 } } })] as WishItem[]
    expect(parseBackup(makeBackup({ items, hourlyWage: null, subscriptions: [] }, new Date('2026-10-30T12:00:00.000Z')))).toEqual({ ok: false })
  })
})
