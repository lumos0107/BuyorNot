import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

const today = new Date(2026, 10, 1, 9)
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '장보기' })); await user.click(screen.getByRole('tab', { name: '배달' })); return user }

it('AC129: 두 배달 앱의 메뉴·배달비·포장을 총액으로 비교한다', async () => {
  const user = await open()
  const a = within(screen.getByRole('form', { name: 'A안 배달 입력' }))
  const b = within(screen.getByRole('form', { name: 'B안 배달 입력' }))
  await user.type(a.getByLabelText('앱 이름'), 'A앱')
  await user.type(a.getByLabelText('메뉴 금액'), '15000')
  await user.type(a.getByLabelText('배달비'), '3000')
  await user.type(b.getByLabelText('앱 이름'), 'B앱')
  await user.type(b.getByLabelText('메뉴 금액'), '19000')
  await user.type(b.getByLabelText('배달비'), '3000')
  await user.click(b.getByLabelText('포장'))
  expect(screen.getByText('A앱 총 18,000원 · B앱 총 19,000원')).toBeInTheDocument()
  expect(screen.getByText('두 결제액 차이 1,000원')).toBeInTheDocument()
})

it('AC130: 최소 주문 금액 미달은 주문할 수 없다고 알린다', async () => {
  const user = await open()
  const a = within(screen.getByRole('form', { name: 'A안 배달 입력' }))
  await user.type(a.getByLabelText('앱 이름'), 'A앱')
  await user.type(a.getByLabelText('메뉴 금액'), '15000')
  await user.type(a.getByLabelText('최소 주문 금액 (선택)'), '18000')
  expect(screen.getByText('최소 주문까지 3,000원 부족해요. 이 금액으로는 주문할 수 없어요.')).toBeInTheDocument()
})

it('AC129: 배달 멤버십은 비교액에 섞지 않고 맥락으로만 보인다', async () => {
  const sub: Subscription = { id: 's1', name: '배민클럽', kind: 'membership', areas: ['delivery'], priceKrw: 3990, cycle: 'monthly', billingDay: 5, lastUsedDate: null, createdAt: today.toISOString(), updatedAt: today.toISOString() }
  localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub] }))
  await open()
  expect(screen.getByText('배민클럽을 내고 있어요(월 3,990원)')).toBeInTheDocument()
})
