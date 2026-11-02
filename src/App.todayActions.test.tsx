import { renderWishlistApp } from './test/renderWishlistApp'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BENEFITS_KEY, EMPTY_BENEFITS } from './logic/benefits'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'
import type { WishItem } from './logic/wishlist'

const now = new Date(2026, 10, 2, 9)
const stamp = '2026-10-20T00:00:00.000Z'
const wish = (id: string, over: Partial<WishItem> = {}): WishItem => ({ id, name: id, priceKrw: 59000, reason: '필요해서', url: null, createdAt: stamp, updatedAt: stamp, reviewAt: '2026-11-01T00:00:00.000Z', status: 'considering', decidedAt: null, ...over })
const sub: Subscription = { id: 's', name: '인터넷 요금', priceKrw: 30000, kind: 'phone', cycle: 'monthly', billingDay: 3, lastUsedDate: null, createdAt: stamp, updatedAt: stamp }
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

it('AC163: 오늘 안내와 고민 기간 끝을 한곳에서 보이고 물건 카드로 간다', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [wish('전기 포트')] }))
  const user = userEvent.setup()
  renderWishlistApp()
  const panel = within(screen.getByRole('region', { name: '오늘 확인할 것' }))
  expect(panel.getByText('고민 기간이 끝난 물건 1개')).toBeInTheDocument()
  expect(panel.getByRole('status', { name: '오늘 적을 물건' })).toHaveTextContent('오늘 갖고 싶은 정도를 안 적은 물건 1개')
  await user.click(panel.getByRole('button', { name: '물건 보기' }))
  expect(within(screen.getByRole('article', { name: '전기 포트' })).getByText('전기 포트')).toHaveFocus()
})

it('AC166: 결제·반품·만료 보기는 원래 탭의 첫 카드로 이동한다', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [wish('반품 물건', { status: 'purchased', decidedAt: stamp, returnBy: '2026-11-05' })] }))
  localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub] }))
  localStorage.setItem(BENEFITS_KEY, JSON.stringify({ ...EMPTY_BENEFITS, expiries: [{ id: 'e', name: '쿠폰', expiresOn: '2026-11-04' }] }))
  const user = userEvent.setup()
  renderWishlistApp()
  const panel = within(screen.getByRole('region', { name: '오늘 확인할 것' }))
  await user.click(panel.getByRole('button', { name: '고정비 보기' }))
  expect(screen.getByRole('tab', { name: '가계부' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('article', { name: '인터넷 요금' })).toHaveFocus()
  await user.click(screen.getByRole('tab', { name: '물건' }))
  await user.click(panel.getByRole('button', { name: '반품 기한 보기' }))
  expect(screen.getByRole('tab', { name: '결정 기록' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('region', { name: '반품 물건 산 뒤 확인' })).toHaveFocus()
  await user.click(screen.getByRole('tab', { name: '물건' }))
  await user.click(panel.getByRole('button', { name: '만료일 보기' }))
  expect(screen.getByRole('tab', { name: '모으기' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('article', { name: '쿠폰' })).toHaveFocus()
})
