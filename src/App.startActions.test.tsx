import { renderWishlistApp } from './test/renderWishlistApp'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 2, 9)) })
afterEach(() => vi.useRealTimers())

it('AC190: 장보러 가요는 집에 있는 것과 장보기 초안을 열고 제목으로 이동한다', async () => {
  const user = userEvent.setup()
  renderWishlistApp()
  await user.click(screen.getByRole('button', { name: '장보러 가요' }))
  expect(screen.getByRole('region', { name: '장보기 초안' })).toHaveAttribute('open')
  expect(document.activeElement).toHaveTextContent('장보기 초안')
})

it('AC191: 물건 고민과 고정비 시작은 목적지 제목으로 이동한다', async () => {
  const user = userEvent.setup()
  renderWishlistApp()
  await user.click(screen.getByRole('button', { name: '살까 고민 중' }))
  expect(screen.getByRole('form', { name: '물건 담기' }).querySelector('details')).toHaveAttribute('open')
  expect(document.activeElement).toHaveTextContent('물건 담기')
  await user.click(screen.getByRole('button', { name: '고정비 살펴보기' }))
  expect(screen.getByRole('tab', { name: '가계부' })).toHaveAttribute('aria-selected', 'true')
  expect(document.activeElement).toHaveTextContent('고정비')
})
