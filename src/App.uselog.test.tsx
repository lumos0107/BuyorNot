import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY } from './logic/subscriptions'

// PRD F19 구독 "오늘 썼어요": 직접 기록으로 마지막 사용일·해지 후보·사용량이 바뀐다
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 11, 9))
})

afterEach(() => {
  vi.useRealTimers()
})

const card = (name: string) => within(screen.getByRole('article', { name }))

async function openSubs() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '구독' }))
  return user
}

describe('오늘 썼어요 (F19)', () => {
  it('누르면 마지막 사용일이 오늘이 되고 해지 후보에서 빠지며, 직접 기록한 사용량이 보인다. 다시 누르면 취소된다', async () => {
    const user = await openSubs()
    const form = within(screen.getByRole('form', { name: '구독 담기' }))
    await user.type(form.getByLabelText('구독 이름'), '티빙')
    await user.type(form.getByLabelText('요금'), '9500')
    await user.type(form.getByLabelText('결제일 (매월)'), '10')
    await user.click(form.getByRole('button', { name: '구독 추가' }))
    expect(card('티빙').getByText('해지 후보')).toBeInTheDocument()

    const button = card('티빙').getByRole('button', { name: '오늘 썼어요' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await user.click(button)
    expect(card('티빙').getByRole('button', { name: '오늘 썼어요' })).toHaveAttribute('aria-pressed', 'true')
    expect(card('티빙').getByText('마지막 사용 2026-10-11')).toBeInTheDocument()
    expect(card('티빙').queryByText('해지 후보')).not.toBeInTheDocument()
    expect(card('티빙').getByText('사용량(직접 기록): 최근 30일 1번 사용 · 1번에 약 9,500원')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0].useDates).toEqual(['2026-10-11'])

    await user.click(card('티빙').getByRole('button', { name: '오늘 썼어요' }))
    expect(card('티빙').getByRole('button', { name: '오늘 썼어요' })).toHaveAttribute('aria-pressed', 'false')
    expect(card('티빙').getByText('해지 후보')).toBeInTheDocument()
  })

  it('예시 구독도 누르면 예시 숫자 대신 직접 기록한 사용량을 보여준다', async () => {
    const user = await openSubs()
    await user.click(screen.getByRole('button', { name: '예시 구독 넣기' }))
    await user.click(card('(예시) 넷플릭스').getByRole('button', { name: '오늘 썼어요' }))
    expect(card('(예시) 넷플릭스').getByText('사용량(직접 기록): 최근 30일 1번 사용 · 1번에 약 13,500원')).toBeInTheDocument()
    expect(card('(예시) 넷플릭스').queryByText(/사용량\(예시\)/)).not.toBeInTheDocument()
  })
})
