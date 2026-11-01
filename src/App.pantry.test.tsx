import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { PANTRY_KEY, type PantryItem } from './logic/pantry'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

const today = new Date(2026, 10, 1, 9)
const stamp = today.toISOString()
const item = (over: Partial<PantryItem> = {}): PantryItem => ({ id: 'p1', name: '세제', kind: 'essential', level: 'plenty', purchases: [], createdAt: stamp, updatedAt: stamp, ...over })
const seed = (...items: PantryItem[]) => localStorage.setItem(PANTRY_KEY, JSON.stringify({ schemaVersion: 1, items, recipes: [], events: [] }))
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByText('집에 있는 것')); return user }

it('AC117: 세제를 적고 조금으로 바꾸면 살 때가 된 것에 보인다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '집에 있는 것 적기' }))
  await user.type(form.getByLabelText('이름'), '세제')
  await user.click(form.getByRole('button', { name: '적기' }))
  expect(screen.getByRole('status', { name: '집에 있는 것 알림' })).toHaveTextContent('‘세제’를 적었어요.')
  await user.click(screen.getByRole('button', { name: '세제 남은 정도: 넉넉' }))
  expect(screen.getByText('살 때가 된 것')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '세제 남은 정도: 조금' })).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}').items[0].level).toBe('low')
})

it('AC118: 같은 이름은 다시 적지 않고 원래 기록을 유지한다', async () => {
  seed(item())
  const user = await open()
  const form = within(screen.getByRole('form', { name: '집에 있는 것 적기' }))
  await user.type(form.getByLabelText('이름'), ' 세제 ')
  await user.click(form.getByRole('button', { name: '적기' }))
  expect(form.getByLabelText('이름')).toHaveAccessibleDescription('같은 이름이 이미 있어요.')
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}').items).toHaveLength(1)
})

it('AC117: 정기배송과 이름이 같으면 카드에 도착 안내가 보인다', async () => {
  seed(item({ level: 'low' }))
  const delivery: Subscription = { id: 's1', name: '세제', kind: 'delivery', priceKrw: 10000, cycle: 'monthly', billingDay: 5, lastUsedDate: null, createdAt: stamp, updatedAt: stamp }
  localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [delivery] }))
  await open()
  expect(screen.getByText('정기배송으로 와요.')).toBeInTheDocument()
})
