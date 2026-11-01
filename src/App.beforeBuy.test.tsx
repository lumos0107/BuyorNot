import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'
import type { WishItem } from './logic/wishlist'

const now = new Date(2026, 10, 1, 9)
const item: WishItem = { id: 'w1', name: '청소기', priceKrw: 300000, reason: '필요', url: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), reviewAt: '2026-11-04T00:00:00.000Z', status: 'considering', decidedAt: null }
beforeEach(() => { localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [item] })); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByText('사기 전에')); return user }

it('AC133: 할부를 적으면 카드와 저장값에 총액 계산이 반영된다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '청소기 할부' }))
  await user.type(form.getByLabelText('할부 개월'), '12')
  await user.type(form.getByLabelText('월 납입금'), '30000')
  await user.click(form.getByRole('button', { name: '할부 적기' }))
  expect(screen.getByText('할부로 내면 총 360,000원 · 일시불보다 60,000원 더')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].installment).toEqual({ months: 12, monthlyKrw: 30000 })
})

it('AC134: 월 납입금이 빠지면 오류가 연결되고 저장하지 않는다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '청소기 할부' }))
  await user.type(form.getByLabelText('할부 개월'), '12')
  await user.click(form.getByRole('button', { name: '할부 적기' }))
  expect(form.getByLabelText('월 납입금')).toHaveAccessibleDescription('월 납입금을 적어 주세요.')
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0]).not.toHaveProperty('installment')
})
