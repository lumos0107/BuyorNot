import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY } from './logic/subscriptions'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 1, 9))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('AC102: 손상된 고정비는 고정비 저장 상태로 알리고 초기화 문장을 보여 준다', async () => {
  localStorage.setItem(SUBS_KEY, '{bad')
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '고정비' }))
  const banner = within(screen.getByRole('status', { name: '고정비 저장 상태' }))
  expect(banner.getByText('저장된 고정비를 읽을 수 없어요. 초기화하기 전까지는 새로 넣은 고정비가 저장되지 않아요.')).toBeInTheDocument()
  await user.click(banner.getByRole('button', { name: '고정비 기록 초기화' }))
  expect(banner.getByText('초기화하면 읽을 수 없는 고정비는 사라지고, 지금 화면의 고정비만 저장돼요.')).toBeInTheDocument()
})

it('AC102: 예시 구독 넣기 버튼 이름은 그대로다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '고정비' }))
  expect(screen.getByRole('button', { name: '예시 구독 넣기' })).toBeInTheDocument()
})
