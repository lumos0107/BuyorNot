import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

const now = new Date(2026, 10, 1, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const weekly: Subscription = { id: 'w1', name: '생수', kind: 'delivery', priceKrw: 18900, cycle: 'weekly', intervalWeeks: 4, renewalDate: '2026-11-05', lastUsedDate: null, createdAt: stamp, updatedAt: stamp }
const monthly: Subscription = { id: 'm1', name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null, createdAt: stamp, updatedAt: stamp }
const seed = (...items: Subscription[]) => localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items }))
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '가계부' })); return user }
const form = () => within(screen.getByRole('form', { name: '고정비 담기' }))

it('AC100: 4주마다 생수의 요금과 다음 배송, 구독과 합계가 보인다', async () => {
  seed(weekly, monthly)
  await open()
  const card = within(screen.getByRole('article', { name: '생수' }))
  expect(card.getByText('4주마다 18,900원 · 월평균 약 20,475원')).toBeInTheDocument()
  expect(card.getByText('다음 배송 2026-11-05 · D-4')).toBeInTheDocument()
  expect(card.queryByText('건너뛰기·해지는 그 서비스에서 해요.')).not.toBeInTheDocument()
  const summary = within(screen.getByRole('region', { name: '고정비 요약' }))
  expect(summary.getByText('33,975원')).toBeInTheDocument()
  expect(summary.getByText('연 407,700원')).toBeInTheDocument()
})

it('AC100: 다음 배송이 2일 남으면 건너뛰기 안내를 보이고 지나면 다음 주기로 옮긴다', async () => {
  seed(weekly)
  vi.setSystemTime(new Date(2026, 10, 3, 9))
  await open()
  expect(within(screen.getByRole('article', { name: '생수' })).getByText('건너뛰기·해지는 그 서비스에서 해요.')).toBeInTheDocument()
  cleanup()
  vi.setSystemTime(new Date(2026, 10, 6, 9))
  await open()
  expect(within(screen.getByRole('article', { name: '생수' })).getByText('다음 배송 2026-12-03 · D-27')).toBeInTheDocument()
})

it('AC101: 정기배송만 주마다를 고를 수 있고 종류를 바꾸면 매월로 돌아간다', async () => {
  const user = await open()
  expect(form().queryByRole('radio', { name: '주마다' })).not.toBeInTheDocument()
  await user.selectOptions(form().getByLabelText('종류'), 'delivery')
  await user.click(form().getByRole('radio', { name: '주마다' }))
  expect(form().getByLabelText('몇 주마다')).toBeInTheDocument()
  expect(form().getByLabelText('다음 배송일')).toBeInTheDocument()
  await user.selectOptions(form().getByLabelText('종류'), 'subscription')
  expect(form().getByRole('radio', { name: '매월' })).toBeChecked()
  expect(form().queryByLabelText('몇 주마다')).not.toBeInTheDocument()
})

it('AC101: 다음 배송일이 주 수 범위 밖이면 오류와 포커스를 보인다', async () => {
  const user = await open()
  await user.selectOptions(form().getByLabelText('종류'), 'delivery')
  await user.type(form().getByLabelText('이름'), '생수')
  await user.type(form().getByLabelText('요금'), '18900')
  await user.click(form().getByRole('radio', { name: '주마다' }))
  await user.type(form().getByLabelText('몇 주마다'), '4')
  fireEvent.change(form().getByLabelText('다음 배송일'), { target: { value: '2026-11-30' } })
  await user.click(form().getByRole('button', { name: '고정비 추가' }))
  expect(form().getByLabelText('다음 배송일')).toHaveAccessibleDescription('다음 배송일은 오늘부터 4주 안이어야 해요')
  expect(form().getByLabelText('다음 배송일')).toHaveFocus()
})
