import { renderWishlistApp } from './test/renderWishlistApp'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { STORAGE_KEY } from './logic/storage'

const now = new Date(2026, 10, 2, 9)
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())
const form = () => within(screen.getByRole('form', { name: '물건 담기' }))
const items = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items ?? []

it('AC167: 처음에는 상품명·가격과 3일만 보고 이유 없이 담는다', async () => {
  const user = userEvent.setup()
  renderWishlistApp()
  await user.click(form().getByText('물건 담기'))
  expect(form().getByText('3일 뒤 다시 볼게요. 이유는 담은 뒤 적어도 돼요.')).toBeVisible()
  expect(form().getByLabelText('사고 싶은 이유')).not.toBeVisible()
  await user.type(form().getByLabelText('상품명'), '전기 포트')
  await user.type(form().getByLabelText('가격'), '59000')
  await user.click(form().getByRole('button', { name: '담아 두기' }))
  expect(items()[0].reason).toBe('')
  expect(new Date(items()[0].reviewAt).getTime() - new Date(items()[0].createdAt).getTime()).toBe(3 * 24 * 60 * 60 * 1000)
  expect(screen.getByText('사고 싶은 이유를 아직 적지 않았어요.')).toBeInTheDocument()
  expect(screen.getByRole('status', { name: '담은 물건' })).toHaveTextContent('사고 싶은 이유는 물건 카드에서 나중에 적을 수 있어요.')
  expect(screen.getByRole('status', { name: '담은 물건' })).toBeVisible()
  expect(form().getByText('물건 담기').closest('details')).not.toHaveAttribute('open')
})

it('AC170: 예시로 채우면 더 적기가 열려 이유와 체크리스트가 보인다', async () => {
  const user = userEvent.setup()
  renderWishlistApp()
  await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
  expect(form().getByText('더 적기 (선택)').closest('details')).toHaveAttribute('open')
  expect(form().getByLabelText('사고 싶은 이유')).toBeVisible()
})

it('AC169: 더 적기를 열면 이유·기간·링크를 기존처럼 저장한다', async () => {
  const user = userEvent.setup()
  renderWishlistApp()
  await user.click(form().getByText('물건 담기'))
  await user.click(form().getByText('더 적기 (선택)'))
  await user.type(form().getByLabelText('상품명'), '전기 포트')
  await user.type(form().getByLabelText('가격'), '59000')
  await user.type(form().getByLabelText('사고 싶은 이유'), '차를 끓이려고')
  await user.click(form().getByRole('radio', { name: '7일' }))
  await user.click(form().getByText('상품 링크 (선택)'))
  await user.type(form().getByLabelText('링크 (선택)'), 'https://example.com/kettle')
  await user.click(form().getByRole('button', { name: '담아 두기' }))
  expect(items()[0]).toMatchObject({ reason: '차를 끓이려고', url: 'https://example.com/kettle' })
  expect(new Date(items()[0].reviewAt).getTime() - new Date(items()[0].createdAt).getTime()).toBe(7 * 24 * 60 * 60 * 1000)
})

it('AC171: 다른 탭이 먼저 저장했으면 빠른 담기의 두 값이 남는다', async () => {
  const user = userEvent.setup()
  renderWishlistApp()
  await user.click(form().getByText('물건 담기'))
  await user.type(form().getByLabelText('상품명'), '전기 포트')
  await user.type(form().getByLabelText('가격'), '59000')
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [] }))
  await user.click(form().getByRole('button', { name: '담아 두기' }))
  expect(form().getByLabelText('상품명')).toHaveValue('전기 포트')
  expect(form().getByLabelText('가격')).toHaveValue('59000')
  expect(screen.queryByRole('status', { name: '담은 물건' })).not.toBeInTheDocument()
})
