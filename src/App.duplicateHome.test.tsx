import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { PANTRY_KEY } from './logic/pantry'
import { STORAGE_KEY } from './logic/storage'

const now = new Date(2026, 10, 1, 9)
const item = { id: 'w1', name: '세탁 세제', priceKrw: 12000, reason: '필요', url: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), reviewAt: '2026-11-04T00:00:00.000Z', status: 'considering', decidedAt: null }
beforeEach(() => { localStorage.clear(); localStorage.setItem(PANTRY_KEY, JSON.stringify({ schemaVersion: 1, items: [{ id: 'p1', name: '세탁 세제', kind: 'essential', level: 'plenty', purchases: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }], recipes: [], events: [] })); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers() })

it('AC137: 같은 이름을 담기 폼에 적으면 집에 있다는 안내가 보인다', async () => {
  const user = userEvent.setup()
  render(<App />)
  const form = within(screen.getByRole('form', { name: '물건 담기' }))
  await user.type(form.getByLabelText('상품명'), '세탁 세제')
  expect(form.getByRole('status', { name: '집에 있는 것 확인' })).toHaveTextContent('집에 있는 것에 ‘세탁 세제’가 있어요 (넉넉)')
})

it('AC137: 사기 전 카드에도 같은 이름과 남은 정도가 보인다', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [item] }))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByText('사기 전에'))
  expect(within(screen.getByRole('region', { name: '세탁 세제 사기 전 확인' })).getByText('집에 있는 것에 ‘세탁 세제’가 있어요 (넉넉)')).toBeInTheDocument()
})

it('AC138: 부분 일치는 집에 있다는 안내를 만들지 않는다', async () => {
  const user = userEvent.setup()
  render(<App />)
  const form = within(screen.getByRole('form', { name: '물건 담기' }))
  await user.type(form.getByLabelText('상품명'), '세제')
  expect(form.getByRole('status', { name: '집에 있는 것 확인' })).toBeEmptyDOMElement()
})
