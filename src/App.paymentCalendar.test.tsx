import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

const now = new Date(2026, 10, 2, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const sub = (id: string, name: string, day: number, priceKrw: number): Subscription => ({
  id, name, priceKrw, cycle: 'monthly', billingDay: day, lastUsedDate: null, createdAt: stamp, updatedAt: stamp,
})
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

it('AC175: 처음부터 열린 달력에 결제 건수·요금 합계를 보이고 날짜를 누르면 그날 기록으로 간다', async () => {
  localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub('a', '인터넷 요금', 3, 30000), sub('b', '음악 구독', 5, 12000)] }))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가계부' }))
  const calendar = within(screen.getByRole('region', { name: '앞으로 30일 결제 달력' }))
  expect(calendar.getByText('결제 예정 2건 · 적어 둔 요금 합계 42,000원')).toBeInTheDocument()
  expect(calendar.getByText('실제 청구일과 금액은 서비스에서 확인해 주세요.')).toBeVisible()
  await user.click(calendar.getByRole('button', { name: '2026-11-03 결제 예정 1건' }))
  expect(calendar.getByRole('region', { name: '2026-11-03 결제 예정' })).toHaveFocus()
  expect(calendar.getByText('11월 3일 · 인터넷 요금 · 30,000원')).toBeInTheDocument()
})

it('AC175: 적어 둔 고정비가 없으면 30일 달력에 빈 안내를 보인다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가계부' }))
  const calendar = within(screen.getByRole('region', { name: '앞으로 30일 결제 달력' }))
  expect(calendar.getByText('앞으로 30일에 적어 둔 결제 예정이 없어요.')).toBeVisible()
})
