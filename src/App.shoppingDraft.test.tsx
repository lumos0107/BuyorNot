import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { PANTRY_KEY, type PantryItem, type PantryRecipe, type PantryStore } from './logic/pantry'

const stamp = '2026-11-02T00:00:00.000Z'
const item = (id: string, name: string, level: PantryItem['level'], kind: PantryItem['kind'] = 'essential'): PantryItem => ({
  id, name, kind, level, purchases: [], createdAt: stamp, updatedAt: stamp,
})
const recipe: PantryRecipe = { id: 'r', name: '김치두부', ingredients: ['두부', '김치', '계란'], createdAt: stamp, updatedAt: stamp }
const seed = (items: PantryItem[], recipes: PantryRecipe[] = []) => localStorage.setItem(PANTRY_KEY, JSON.stringify({ schemaVersion: 1, items, recipes, events: [] } satisfies PantryStore))
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 2, 9)) })
afterEach(() => vi.useRealTimers())

async function open() {
  const user = userEvent.setup()
  const view = render(<App />)
  await user.click(screen.getByRole('tab', { name: '물건' }))
  await user.click(screen.getByText('집에 있는 것'))
  await user.click(screen.getByText('장보기 초안'))
  return { user, view, draft: within(screen.getByRole('region', { name: '장보기 초안' })) }
}

it('AC176·AC178: 부족한 것만 체크하고 접었다 열어도 남지만 재고·새로고침에는 반영되지 않는다', async () => {
  seed([item('a', '세제', 'low'), item('b', '휴지', 'out'), item('c', '쌀', 'plenty')])
  const { user, view, draft } = await open()
  expect(draft.getByRole('checkbox', { name: '세제' })).not.toBeChecked()
  expect(draft.getByRole('checkbox', { name: '휴지' })).toBeInTheDocument()
  expect(draft.queryByRole('checkbox', { name: '쌀' })).not.toBeInTheDocument()
  await user.click(draft.getByRole('checkbox', { name: '세제' }))
  await user.click(draft.getByText('장보기 초안'))
  await user.click(draft.getByText('장보기 초안'))
  expect(draft.getByRole('checkbox', { name: '세제' })).toBeChecked()
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}').items[0].level).toBe('low')
  view.unmount()
  const again = await open()
  expect(again.draft.getByRole('checkbox', { name: '세제' })).not.toBeChecked()
})

it('AC177: 고른 요리의 없는 재료를 더하고 떨어진 재료는 중복하지 않는다', async () => {
  seed([item('a', '두부', 'plenty', 'ingredient'), item('b', '계란', 'out', 'ingredient')], [recipe])
  const { user, draft } = await open()
  await user.click(draft.getByRole('button', { name: '김치두부 이번 주에 해 먹기' }))
  expect(draft.getAllByRole('checkbox', { name: '계란' })).toHaveLength(1)
  expect(draft.getByRole('checkbox', { name: '김치' })).toBeInTheDocument()
  expect(draft.queryByRole('checkbox', { name: '두부' })).not.toBeInTheDocument()
})

it('AC179: 부족한 것과 고른 요리가 없으면 빈 안내만 보인다', async () => {
  seed([item('a', '쌀', 'plenty')])
  const { draft } = await open()
  expect(draft.getByText('지금 장보기 초안에 넣을 항목이 없어요.')).toBeVisible()
  expect(draft.queryByRole('checkbox')).not.toBeInTheDocument()
})

it('AC180·AC181: 이번 주 요리 셋까지만 고르고 재료는 합치며 새로고침하면 선택이 사라진다', async () => {
  seed([item('x', '두부', 'plenty', 'ingredient')], [
    { ...recipe, id: 'a', name: '두부요리', ingredients: ['두부', '계란'] },
    { ...recipe, id: 'b', name: '계란요리', ingredients: ['계란'] },
    { ...recipe, id: 'c', name: '김치찌개', ingredients: ['김치', '계란'] },
    { ...recipe, id: 'd', name: '계란찜', ingredients: ['계란'] },
  ])
  const { user, view, draft } = await open()
  for (const name of ['두부요리', '계란요리', '김치찌개']) await user.click(draft.getByRole('button', { name: `${name} 이번 주에 해 먹기` }))
  expect(draft.getAllByRole('button', { pressed: true })).toHaveLength(3)
  expect(draft.getAllByRole('checkbox', { name: '계란' })).toHaveLength(1)
  await user.click(draft.getByRole('button', { name: '계란찜 이번 주에 해 먹기' }))
  expect(draft.getByText('이번 주에는 3개까지 고를 수 있어요.')).toBeVisible()
  expect(draft.getAllByRole('button', { pressed: true })).toHaveLength(3)
  view.unmount()
  const again = await open()
  expect(again.draft.queryAllByRole('button', { pressed: true })).toHaveLength(0)
})

it('AC198·AC199: 요리를 세 개만 고르고 공통 부족 재료에 출처를 모두 표시한다', async () => {
  seed([item('a', '계란', 'out', 'ingredient')], [
    { ...recipe, id: 'a', name: '김치두부', ingredients: ['계란'] },
    { ...recipe, id: 'b', name: '계란찜', ingredients: ['계란'] },
    { ...recipe, id: 'c', name: '볶음밥', ingredients: ['밥'] },
    { ...recipe, id: 'd', name: '라면', ingredients: ['면'] },
  ])
  const { user, draft } = await open()
  expect(draft.queryByLabelText('이번에 해 먹을 것 (선택)')).not.toBeInTheDocument()
  for (const name of ['김치두부', '계란찜', '볶음밥']) await user.click(draft.getByRole('button', { name: `${name} 이번 주에 해 먹기` }))
  await user.click(draft.getByRole('button', { name: '라면 이번 주에 해 먹기' }))
  expect(draft.getByText('이번 주에는 3개까지 고를 수 있어요.')).toBeVisible()
  expect(draft.getAllByRole('checkbox', { name: '계란' })).toHaveLength(1)
  expect(draft.getByText('남은 정도: 떨어짐 · 김치두부, 계란찜 재료')).toBeVisible()
})

it('AC200: 기록이 비었을 때 재고 이름 입력으로 바로 이동한다', async () => {
  seed([])
  const { user, draft } = await open()
  expect(draft.getByText('집에 있는 것 한 가지만 적어 보세요.')).toBeVisible()
  await user.click(draft.getByRole('button', { name: '집에 있는 것 적기' }))
  expect(within(screen.getByRole('form', { name: '집에 있는 것 적기' })).getByLabelText('이름')).toHaveFocus()
})
