import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'
import type { WishItem } from './logic/wishlist'

const now = new Date(2026, 10, 1, 9)
const bought: WishItem = { id: 'w1', name: '전동 칫솔', priceKrw: 59000, reason: '고장', url: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), reviewAt: '2026-11-02T00:00:00.000Z', status: 'purchased', decidedAt: now.toISOString() }
beforeEach(() => { localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [bought] })); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '물건' })); await user.click(screen.getByRole('tab', { name: '결정 기록' })); await user.click(screen.getByText('산 뒤에')); return user }

it('AC143: 반품 기한을 적으면 날짜·D-14와 판매처 기준 안내가 보인다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '전동 칫솔 반품 기한' }))
  fireEvent.change(form.getByLabelText('반품 기한 (선택)'), { target: { value: '2026-11-15' } })
  await user.click(form.getByRole('button', { name: '기한 적기' }))
  expect(screen.getByText('반품 기한 2026-11-15 · D-14')).toBeInTheDocument()
  expect(screen.getByText('판매처 기준을 확인해 주세요.')).toBeInTheDocument()
})

it('AC145: 반품했어요를 확인하면 모으기에 등록 가격이 별도로 보인다', async () => {
  const user = await open()
  await user.click(screen.getByRole('button', { name: '전동 칫솔 반품했어요' }))
  await user.click(within(screen.getByRole('group', { name: '반품 기록 확인' })).getByRole('button', { name: '반품했어요' }))
  await user.click(screen.getByRole('tab', { name: '모으기' }))
  expect(screen.getByText('반품했다고 적은 금액')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '반품했다고 적은 금액' })).getByText('59,000원')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].returnedOn).toBe('2026-11-01')
})

it('AC146·AC147: 후회한 물건을 되팔았다고 적으면 생긴 돈이 별도로 보인다', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [{ ...bought, satisfaction: 'regret' }] }))
  const user = await open()
  const form = within(screen.getByRole('form', { name: '전동 칫솔 되팔기' }))
  fireEvent.change(form.getByLabelText('올린 날'), { target: { value: '2026-11-10' } })
  fireEvent.change(form.getByLabelText('판 날 (선택)'), { target: { value: '2026-11-20' } })
  await user.type(form.getByLabelText('판 금액 (선택)'), '80000')
  await user.click(form.getByRole('button', { name: '되팔기 적기' }))
  expect(screen.getByText('2026-11-20에 80,000원에 팔았다고 적었어요.')).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: '모으기' }))
  expect(screen.getByText('생긴 돈')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '생긴 돈' })).getByText('80,000원')).toBeInTheDocument()
  expect(screen.getByText('판 금액은 실제 입금을 확인한 금액이 아니에요.')).toBeInTheDocument()
})

it('AC146: 잘 샀어요인 물건에는 되팔기 폼이 없다', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [{ ...bought, satisfaction: 'good' }] }))
  await open()
  expect(screen.queryByRole('form', { name: '전동 칫솔 되팔기' })).not.toBeInTheDocument()
})
