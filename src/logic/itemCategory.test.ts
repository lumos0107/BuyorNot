import { describe, expect, it } from 'vitest'
import { ITEM_CATEGORIES, ITEM_CATEGORY_LABEL, isItemCategory, nameInitial } from './itemCategory'
import { parseStore } from './storage'
import { createItem, updateItem, type WishItem } from './wishlist'

// PRD F85 물건 분류 아이콘 (AC209~AC211)
const T0 = new Date('2026-11-03T00:00:00.000Z')
const base = { name: '게임기', priceKrw: 398000, reason: '친구랑 하려고', days: 3, url: null }

describe('물건 분류 (F85)', () => {
  it('분류는 일곱 가지이고 화면 이름이 있다', () => {
    expect(ITEM_CATEGORIES.map((c) => ITEM_CATEGORY_LABEL[c])).toEqual(['취미', '식비', '생활용품', '옷·잡화', '전자기기', '공부', '기타'])
    expect(isItemCategory('hobby')).toBe(true)
    expect(isItemCategory('game')).toBe(false)
    expect(isItemCategory(undefined)).toBe(false)
  })

  it('AC209: 담을 때 고른 분류를 저장하고, 고르지 않으면 분류 칸이 없다', () => {
    expect(createItem({ ...base, category: 'hobby' }, T0, 'a').category).toBe('hobby')
    expect('category' in createItem(base, T0, 'b')).toBe(false)
  })

  it('AC210: 수정에서 분류를 바꾸거나(값) 지우고(null), 넘기지 않으면(undefined) 그대로 둔다', () => {
    const item = createItem({ ...base, category: 'hobby' }, T0, 'a')
    const patch = { name: item.name, priceKrw: item.priceKrw, reason: item.reason, url: item.url }
    expect(updateItem(item, { ...patch, category: 'digital' }, T0).category).toBe('digital')
    expect('category' in updateItem(item, { ...patch, category: null }, T0)).toBe(false)
    expect(updateItem(item, patch, T0).category).toBe('hobby')
  })

  it('AC211: 저장된 기록은 분류가 없거나 올바른 값이면 읽고, 모르는 값이면 기록 전체를 거절한다', () => {
    const item: WishItem = createItem(base, T0, 'a')
    const raw = (extra: object) => JSON.stringify({ schemaVersion: 1, items: [{ ...item, ...extra }] })
    expect(parseStore(raw({})).ok).toBe(true)
    expect(parseStore(raw({ category: 'food' })).ok).toBe(true)
    expect(parseStore(raw({ category: 'game' })).ok).toBe(false)
  })

  it('첫 글자 표식은 (예시) 머리말을 뺀다', () => {
    expect(nameInitial('(예시) 게임기')).toBe('게')
    expect(nameInitial('게임기')).toBe('게')
  })
})
