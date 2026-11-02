import { renderWishlistApp } from './test/renderWishlistApp'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PANTRY_KEY, type PantryItem } from './logic/pantry'

const today = new Date(2026, 10, 1, 9)
const stamp = today.toISOString()
const ingredient = (id: string, name: string, level: PantryItem['level'] = 'plenty'): PantryItem => ({ id, name, kind: 'ingredient', level, purchases: [], createdAt: stamp, updatedAt: stamp })
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(PANTRY_KEY, JSON.stringify({ schemaVersion: 1, items: [ingredient('a', '두부'), ingredient('b', '김치'), ingredient('c', '계란', 'out')], recipes: [], events: [] }))
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today)
})
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); renderWishlistApp(); await user.click(screen.getByText('집에 있는 것')); return user }

it('AC123: 자주 해 먹는 것에 있는 재료 2/3개와 부족한 계란이 보인다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '자주 해 먹는 것 적기' }))
  await user.type(form.getByLabelText('이름'), '김치두부')
  await user.type(form.getByLabelText('재료 이름'), '두부, 김치, 계란')
  await user.type(form.getByLabelText('배달 대신 썼을 금액 (선택)'), '12000')
  await user.click(form.getByRole('button', { name: '적기' }))
  expect(screen.getByText('있는 재료 2/3개')).toBeInTheDocument()
  expect(screen.getByText('부족한 재료: 계란')).toBeInTheDocument()
})

it('AC124: 해 먹은 금액은 모으기에 따로 보이고 옮긴 돈에는 더하지 않는다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '자주 해 먹는 것 적기' }))
  await user.type(form.getByLabelText('이름'), '김치두부')
  await user.type(form.getByLabelText('재료 이름'), '두부, 김치, 계란')
  await user.type(form.getByLabelText('배달 대신 썼을 금액 (선택)'), '12000')
  await user.click(form.getByRole('button', { name: '적기' }))
  await user.click(screen.getByRole('button', { name: '김치두부 해 먹었어요' }))
  await user.click(screen.getByRole('tab', { name: '모으기' }))
  expect(screen.getByText('해 먹었다고 적은 금액')).toBeInTheDocument()
  // 숨은 가계부 탭의 분류별 지출 예시(식비 12,000원)와 겹치지 않게 모으기 탭 안에서 찾는다 (F84)
  expect(within(screen.getByRole('tabpanel', { name: '모으기' })).getByText('12,000원')).toBeInTheDocument()
  expect(screen.queryByText('아직 모은 기록이 없어요. 고민하던 물건을 구매 포기하거나, 고정비를 ‘해지했어요’로 옮기거나, 은행 앱에서 옮긴 돈을 적으면 여기에 보여요.')).not.toBeInTheDocument()
})
