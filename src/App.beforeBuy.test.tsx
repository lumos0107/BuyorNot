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

it('AC135·AC136: 1년에 두 번 쓰는 물건은 사용당 금액과 중고 홈페이지 링크가 보인다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '청소기 사용 횟수' }))
  await user.type(form.getByLabelText('1년에 몇 번 쓸까요? (선택)'), '2')
  await user.click(form.getByRole('button', { name: '횟수 적기' }))
  expect(screen.getByText('한 번 쓸 때 약 150,000원')).toBeInTheDocument()
  const link = screen.getByRole('link', { name: '당근' })
  expect(link).toHaveAttribute('href', 'https://www.daangn.com/')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].usesPerYear).toBe(2)
})

it('AC139: 총량 10·월 사용량 1·기한 6개월은 다 쓰는 데 10개월이라고 보인다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '청소기 대용량 사용' }))
  await user.type(form.getByLabelText('총량'), '10')
  await user.type(form.getByLabelText('한 달 사용량'), '1')
  await user.type(form.getByLabelText('유통기한 (개월, 선택)'), '6')
  await user.click(form.getByRole('button', { name: '사용량 적기' }))
  expect(screen.getByText('다 쓰는 데 약 10개월 · 유통기한 6개월')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].bulkUse).toEqual({ total: 10, monthlyUse: 1, expiresMonths: 6 })
})

it('AC141: 목표가와 직접 본 값을 적으면 마지막·가장 낮은 값이 보인다', async () => {
  const user = await open()
  const target = within(screen.getByRole('form', { name: '청소기 목표가' }))
  await user.type(target.getByLabelText('목표가 (선택)'), '30000')
  await user.click(target.getByRole('button', { name: '목표가 적기' }))
  const note = within(screen.getByRole('form', { name: '청소기 본 값 적기' }))
  await user.type(note.getByLabelText('본 가격'), '29900')
  await user.click(note.getByRole('button', { name: '본 값 적기' }))
  expect(screen.getByText(/목표가 30,000원 · 마지막으로 본 값 29,900원/)).toBeInTheDocument()
  expect(screen.getByText('적어 둔 값 가운데 목표가 이하가 있어요.')).toBeInTheDocument()
})
