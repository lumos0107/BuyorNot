import { expect, it } from 'vitest'
import { shoppingCandidates } from './shoppingDraft'
import type { PantryItem, PantryRecipe } from './pantry'

const stamp = '2026-11-02T00:00:00.000Z'
const item = (id: string, name: string, level: PantryItem['level'], kind: PantryItem['kind'] = 'essential'): PantryItem => ({
  id, name, kind, level, purchases: [], createdAt: stamp, updatedAt: stamp,
})
const recipe: PantryRecipe = { id: 'r', name: '김치두부', ingredients: ['두부', '김치', ' 계란 '], createdAt: stamp, updatedAt: stamp }

it('AC176: 조금·떨어짐만 기본 장보기 후보로 만들고 넉넉은 뺀다', () => {
  const rows = shoppingCandidates([item('a', '세제', 'low'), item('b', '휴지', 'out'), item('c', '쌀', 'plenty')])
  expect(rows.map((row) => row.name)).toEqual(['휴지', '세제'])
  expect(rows.every((row) => row.source === 'pantry')).toBe(true)
})

it('AC177: 선택한 요리에서 없는 재료를 더하고 떨어진 같은 이름은 한 번만 보인다', () => {
  const rows = shoppingCandidates([
    item('a', '두부', 'plenty', 'ingredient'),
    item('b', '계란', 'out', 'ingredient'),
  ], recipe)
  expect(rows.map((row) => row.name)).toEqual(['계란', '김치'])
  expect(rows.filter((row) => row.key === '계란')).toHaveLength(1)
  expect(rows.find((row) => row.name === '계란')?.fromRecipe).toBe(true)
})

it('AC179: 모두 넉넉하고 요리를 고르지 않으면 비어 있다', () => {
  expect(shoppingCandidates([item('a', '세제', 'plenty')])).toEqual([])
})

it('AC178: 집에 있는 항목의 변경 시각이 바뀌면 임시 체크용 키도 달라진다', () => {
  const first = item('a', '세제', 'low')
  const changed = { ...first, updatedAt: '2026-11-03T00:00:00.000Z' }
  expect(shoppingCandidates([first])[0].checkKey).not.toBe(shoppingCandidates([changed])[0].checkKey)
})

it('AC180: 이번 주 요리 셋의 공통으로 부족한 재료를 한 번만 보인다', () => {
  const recipes: PantryRecipe[] = [
    { ...recipe, id: 'a', name: '두부요리', ingredients: ['두부', '계란'] },
    { ...recipe, id: 'b', name: '계란요리', ingredients: ['계란'] },
    { ...recipe, id: 'c', name: '김치찌개', ingredients: ['김치', '계란'] },
  ]
  const rows = shoppingCandidates([item('x', '두부', 'plenty', 'ingredient')], recipes)
  expect(rows.map((row) => row.name)).toEqual(['계란', '김치'])
  expect(rows.filter((row) => row.name === '계란')).toHaveLength(1)
})
