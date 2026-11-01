import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

const today = new Date(2026, 10, 1, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const phone = (over: Partial<Subscription> = {}): Subscription => ({ id: 'p1', name: '휴대폰', kind: 'phone', priceKrw: 15000, cycle: 'monthly', billingDay: 10, lastUsedDate: null, priceChanges: [{ day: '2026-11-01', from: 55000, to: 15000, by: 'me' }], createdAt: stamp, updatedAt: stamp, ...over })
const seed = (sub: Subscription) => localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub] }))
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => { vi.useRealTimers() })
async function openSavings() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '모으기' })); return user }

it('AC107: 휴대폰 요금 낮춤은 줄어든 고정비 월 40,000원으로 보인다', async () => {
  seed(phone())
  await openSavings()
  expect(screen.getByText('줄어든 고정비 · 요금 낮춤 1개')).toBeInTheDocument()
  expect(screen.getByText('월 40,000원')).toBeInTheDocument()
  expect(screen.getByText('요금 낮춤은 ‘내가 요금제를 바꿨어요’로 고친 요금의 바뀌기 전과 뒤 차이를 한 달 기준으로 더한 값이에요.')).toBeInTheDocument()
})

it('AC107: 낮춘 뒤 해지하면 해지와 요금 낮춤을 합해 월 55,000원이다', async () => {
  seed(phone({ cancelledOn: '2026-11-01' }))
  await openSavings()
  expect(screen.getByText('줄어든 고정비 · 해지 1개 · 요금 낮춤 1개')).toBeInTheDocument()
  expect(screen.getByText('월 55,000원')).toBeInTheDocument()
})

it('AC107: 월세 요금 낮춤만 있으면 모으기 빈 화면이다', async () => {
  seed(phone({ kind: 'housing', name: '월세', priceKrw: 400000, priceChanges: [{ day: '2026-11-01', from: 450000, to: 400000, by: 'me' }] }))
  await openSavings()
  expect(screen.getByText('아직 모은 기록이 없어요. 고민하던 물건을 구매 포기하거나, 고정비를 ‘해지했어요’로 옮기거나, 은행 앱에서 옮긴 돈을 적으면 여기에 보여요.')).toBeInTheDocument()
})

it('AC91: 요금 낮춤이 있어도 세 숫자를 더한 금액은 없다', async () => {
  seed(phone())
  await openSavings()
  const summary = within(screen.getByRole('region', { name: '모으기 요약' }))
  expect(summary.queryByText('합계')).not.toBeInTheDocument()
  expect(summary.queryByText('총액')).not.toBeInTheDocument()
})
