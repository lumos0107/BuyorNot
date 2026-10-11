import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// PRD F16 구독 사용량 (예시): 예시 구독에만 예시 숫자를 보여주고, 실제 연동은 휴대폰 앱으로 만들 때 한다
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

describe('구독 사용량 (예시, F16)', () => {
  it('예시 구독 5개에 사용 시간·횟수와 한 번에 드는 돈을 예시로 보여준다', async () => {
    const user = await openSubs()
    await user.click(screen.getByRole('button', { name: '예시 구독 넣기' }))
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(card('(예시) 넷플릭스').getByText('사용량(예시): 최근 30일 18시간 · 1시간에 약 750원')).toBeInTheDocument()
    expect(card('(예시) 음악 스트리밍').getByText('사용량(예시): 최근 30일 사용 없음')).toBeInTheDocument()
    expect(card('(예시) 배민클럽').getByText('사용량(예시): 최근 30일 6번 사용 · 1번에 약 670원')).toBeInTheDocument()
    expect(card('(예시) 쿠팡 와우 멤버십').getByText('사용량(예시): 최근 30일 1번 사용 · 1번에 약 7,890원')).toBeInTheDocument()
    // '사용량 적기' 버튼(F25)이 아니라 사용량 표시 줄이 없는지 본다
    expect(card('(예시) 클라우드 저장공간').queryByText(/^사용량\(/)).not.toBeInTheDocument()
    const summary = within(screen.getByRole('region', { name: '구독 요약' }))
    expect(summary.getByText('월 46,280원')).toBeInTheDocument()
    expect(summary.getByText('연 555,360원')).toBeInTheDocument()
    expect(summary.getByText("(예시)는 시연용 숫자예요. '오늘 썼어요'를 누르면 직접 기록한 횟수로 바뀌어요. 자동 연동은 휴대폰 앱으로 만들 때 할 계획이에요.")).toBeInTheDocument()
  })

  it('직접 넣은 구독에는 사용량을 보여주지 않는다', async () => {
    const user = await openSubs()
    const form = within(screen.getByRole('form', { name: '구독 담기' }))
    await user.type(form.getByLabelText('구독 이름'), '티빙')
    await user.type(form.getByLabelText('요금'), '9500')
    await user.type(form.getByLabelText('결제일 (매월)'), '10')
    await user.click(form.getByRole('button', { name: '구독 추가' }))
    expect(card('티빙').queryByText(/^사용량\(/)).not.toBeInTheDocument()
    expect(screen.queryByText(/시연용 숫자예요/)).not.toBeInTheDocument()
  })
})
