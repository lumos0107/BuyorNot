import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

const today = new Date(2026, 10, 1, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const phone = (over: Partial<Subscription> = {}): Subscription => ({ id: 'p1', name: '휴대폰', kind: 'phone', priceKrw: 55000, cycle: 'monthly', billingDay: 10, lastUsedDate: null, createdAt: stamp, updatedAt: stamp, ...over })
const seed = (...items: Subscription[]) => localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items }))
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '가계부' })); return user }

it('AC111: 약정 끝 45일 전인 휴대폰은 안내와 비교 링크를 보여 준다', async () => {
  seed(phone({ contractEndDate: '2026-12-16' }))
  await open()
  const card = within(screen.getByRole('article', { name: '휴대폰' }))
  expect(card.getByText('약정 끝나는 날 2026-12-16 (D-45)')).toBeInTheDocument()
  expect(card.getByText('약정이 끝나면 요금이나 할인이 바뀔 수 있어요. 통신사 앱에서 확인해 보세요.')).toBeInTheDocument()
  const link = card.getByRole('link', { name: '알뜰폰허브' })
  expect(link).toHaveAttribute('href', 'https://www.mvnohub.kr/')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

it('AC111: 월세 카드는 계약 문장이고 통신 링크는 없다', async () => {
  seed(phone({ kind: 'housing', name: '월세', contractEndDate: '2026-12-01' }))
  await open()
  const card = within(screen.getByRole('article', { name: '월세' }))
  expect(card.getByText('계약 끝나는 날 2026-12-01 (D-30)')).toBeInTheDocument()
  expect(card.getByText('계약이 끝나면 요금이나 조건이 바뀔 수 있어요. 계약한 곳에 확인해 보세요.')).toBeInTheDocument()
  expect(card.queryByRole('link', { name: '알뜰폰허브' })).not.toBeInTheDocument()
})

it('AC112: 구독 폼에는 약정 칸이 없고 통신의 범위 밖 날짜는 오류다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '고정비 담기' }))
  expect(form.queryByLabelText('약정·계약 끝나는 날 (선택)')).not.toBeInTheDocument()
  await user.selectOptions(form.getByLabelText('종류'), 'phone')
  await user.type(form.getByLabelText('이름'), '휴대폰')
  await user.type(form.getByLabelText('요금'), '55000')
  await user.type(form.getByLabelText('결제일 (매월)'), '10')
  await user.type(form.getByLabelText('약정·계약 끝나는 날 (선택)'), '2025-10-31')
  await user.click(form.getByRole('button', { name: '고정비 추가' }))
  expect(form.getByLabelText('약정·계약 끝나는 날 (선택)')).toHaveAccessibleDescription('약정·계약 끝나는 날은 1년 전부터 5년 뒤 사이여야 해요')
})
