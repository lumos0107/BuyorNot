import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'
import type { WishItem } from './logic/wishlist'

const now = new Date(2026, 10, 2, 9)
const item: WishItem = { id: 'q1', name: '전기 포트', priceKrw: 59000, reason: '', url: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', reviewAt: '2026-11-04T00:00:00.000Z', status: 'considering', decidedAt: null }
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

it('AC168: 이유 없는 카드에는 미작성 안내가 보이고 수정에서 이유를 채운다', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [item] }))
  const user = userEvent.setup()
  render(<App />)
  const card = () => within(screen.getByRole('article', { name: '전기 포트' }))
  expect(card().getByText('사고 싶은 이유를 아직 적지 않았어요.')).toBeInTheDocument()
  await user.click(card().getByRole('button', { name: '수정' }))
  const editor = within(screen.getByRole('form', { name: '물건 수정' }))
  await user.type(editor.getByLabelText('사고 싶은 이유'), '차를 끓이려고')
  await user.click(editor.getByRole('button', { name: '저장' }))
  expect(card().getByText('처음 적은 이유: 차를 끓이려고')).toBeInTheDocument()
})

it('AC167: 이유 없이 구매함으로 옮겨도 결정 기록에 빈 문단이 없다', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [{ ...item, status: 'purchased', decidedAt: '2026-11-02T00:00:00.000Z' }] }))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '결정 기록' }))
  expect(screen.getByText('사고 싶은 이유를 아직 적지 않았어요.')).toBeInTheDocument()
})
