import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { PANTRY_KEY, type PantryItem } from './logic/pantry'

const today = new Date(2026, 10, 1, 9)
const stamp = today.toISOString()
const item: PantryItem = { id: 'p1', name: '세제', kind: 'essential', level: 'low', purchases: [{ id: 'a1', day: '2026-10-31', place: '마트', amountKrw: 5000, size: 1, unit: 'ea', createdAt: stamp }], createdAt: stamp, updatedAt: stamp }
beforeEach(() => { localStorage.clear(); localStorage.setItem(PANTRY_KEY, JSON.stringify({ schemaVersion: 1, items: [item], recipes: [], events: [] })); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByText('집에 있는 것')); return user }

it('AC125: 있어서 안 산 금액은 마지막 산 값으로 기록하고 모으기에 따로 보인다', async () => {
  const user = await open()
  await user.click(screen.getByRole('button', { name: '세제 있어서 안 샀어요' }))
  expect(screen.getByRole('status', { name: '집에 있는 것 알림' })).toHaveTextContent('‘세제’를 있어서 안 샀다고 적었어요.')
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}').events[0].amountKrw).toBe(5000)
  await user.click(screen.getByRole('tab', { name: '모으기' }))
  expect(screen.getByText('있어서 안 샀다고 적은 금액')).toBeInTheDocument()
  expect(screen.getByText('5,000원')).toBeInTheDocument()
  expect(screen.getByText('있어서 안 샀다고 적은 금액은 마지막으로 산 값이에요. 실제로 모은 돈은 아니에요.')).toBeInTheDocument()
  expect(screen.queryByText(/해 먹었다고 적은 금액은 배달 대신/)).not.toBeInTheDocument()
})

it('AC126: 같은 날 두 번째는 확인 뒤에만 기록한다', async () => {
  const user = await open()
  await user.click(screen.getByRole('button', { name: '세제 있어서 안 샀어요' }))
  await user.click(screen.getByRole('button', { name: '세제 있어서 안 샀어요' }))
  const confirm = within(screen.getByRole('group', { name: '같은 날 기록 확인' }))
  expect(confirm.getByText('오늘 이미 적었어요. 한 번 더 적을까요?')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}').events).toHaveLength(1)
  await user.click(confirm.getByRole('button', { name: '한 번 더 적기' }))
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}').events).toHaveLength(2)
})

it('AC125: 산 값이 없으면 있어서 안 샀어요 버튼이 없다', async () => {
  localStorage.setItem(PANTRY_KEY, JSON.stringify({ schemaVersion: 1, items: [{ ...item, purchases: [] }], recipes: [], events: [] }))
  await open()
  expect(screen.queryByRole('button', { name: '세제 있어서 안 샀어요' })).not.toBeInTheDocument()
})
