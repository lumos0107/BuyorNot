import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY } from './logic/subscriptions'

// PRD F23 다듬기 (AC41, AC42): 가격 비교 문장은 할인 근거로 세지 않고, 사용 기록이 없는 구독은 "확인 필요"로 보인다
const T0 = new Date(2026, 9, 11, 9)
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(T0.getTime() + days * DAY).toISOString()

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

const card = (name: string) => within(screen.getByRole('article', { name }))

describe('가격 비교 문장은 할인 근거가 아니다 (F23, AC41)', () => {
  it('가격 비교에서 담은 이유만 있으면 사기 전 점검에 할인 근거가 없고, 할인 질문은 생각해 볼 질문에 들어간다', async () => {
    const item = {
      id: 'k1',
      name: '무선 헤드폰',
      priceKrw: 72000,
      reason: '가격 비교: B안 결제액 72,000원 (할인 8,000원 · 배송비 포함)',
      url: null,
      createdAt: at(-4),
      updatedAt: at(-4),
      reviewAt: at(-1),
      status: 'considering',
      decidedAt: null,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [item] }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    const check = within(card('무선 헤드폰').getByRole('region', { name: '사기 전 점검' }))
    expect(check.getByText('사기 전에 한 번 더 · 걸리는 점이 없어요')).toBeInTheDocument()
    expect(within(check.getByRole('list', { name: '한 번 생각해 볼 질문' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '없으면 어떤 문제가 있나요?',
      '한 달 뒤에도 쓸까요?',
      '지금 쓰는 게 있나요?',
    ])
    expect(check.getByRole('button', { name: '그 밖에 3개 보기' })).toBeInTheDocument()
  })
})

describe('구독 사용 기록 없음은 확인 필요 (F23, AC42)', () => {
  async function openSubs() {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '구독' }))
    return user
  }
  const summary = () => within(screen.getByRole('region', { name: '구독 요약' }))
  const NOTE = "사용 기록이 없는 구독 1개는 마지막으로 쓴 날을 적거나 '오늘 썼어요'를 누르면 해지 후보인지 알려 줘요."

  it('마지막 사용을 비워 두면 해지 후보가 아니라 확인 필요이고, 오늘 썼어요를 누르면 사라졌다가 다시 누르면 돌아온다', async () => {
    const user = await openSubs()
    const form = within(screen.getByRole('form', { name: '구독 담기' }))
    expect(form.getByLabelText('마지막 사용일 (선택)')).toHaveAccessibleDescription("31일 이상 안 쓰면 해지 후보로 표시해요. 비워 두고 '오늘 썼어요' 기록도 없으면 '확인 필요'로 보여요")
    await user.type(form.getByLabelText('구독 이름'), '티빙')
    await user.type(form.getByLabelText('요금'), '9500')
    await user.type(form.getByLabelText('결제일 (매월)'), '10')
    await user.click(form.getByRole('button', { name: '구독 추가' }))
    expect(card('티빙').getByText('확인 필요')).toBeInTheDocument()
    expect(card('티빙').queryByText('해지 후보')).not.toBeInTheDocument()
    expect(summary().getByText(NOTE)).toBeInTheDocument()
    expect(summary().queryByText(/^해지 후보 \d+개/)).not.toBeInTheDocument()

    await user.click(card('티빙').getByRole('button', { name: '오늘 썼어요' }))
    expect(card('티빙').queryByText('확인 필요')).not.toBeInTheDocument()
    expect(summary().queryByText(NOTE)).not.toBeInTheDocument()
    await user.click(card('티빙').getByRole('button', { name: '오늘 썼어요' }))
    expect(card('티빙').getByText('확인 필요')).toBeInTheDocument()
  })

  it('해지 후보에서 오늘 썼어요를 켰다 끄면 이전 마지막 사용일과 해지 후보·요약 금액이 돌아온다 (GPT 후속 확인)', async () => {
    const sub = { id: 's1', name: '왓챠', priceKrw: 7900, cycle: 'monthly', billingDay: 5, lastUsedDate: '2026-09-01', createdAt: at(-60), updatedAt: at(-60) }
    localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub] }))
    const user = await openSubs()
    expect(card('왓챠').getByText('해지 후보')).toBeInTheDocument()
    expect(summary().getByText('해지 후보 1개 · 월 7,900원')).toBeInTheDocument()
    await user.click(card('왓챠').getByRole('button', { name: '오늘 썼어요' }))
    expect(card('왓챠').queryByText('해지 후보')).not.toBeInTheDocument()
    expect(card('왓챠').getByText('마지막 사용 2026-10-11')).toBeInTheDocument()
    expect(summary().queryByText(/^해지 후보 \d+개/)).not.toBeInTheDocument()
    await user.click(card('왓챠').getByRole('button', { name: '오늘 썼어요' }))
    expect(card('왓챠').getByText('해지 후보')).toBeInTheDocument()
    expect(card('왓챠').getByText('마지막 사용 2026-09-01')).toBeInTheDocument()
    expect(summary().getByText('해지 후보 1개 · 월 7,900원')).toBeInTheDocument()
  })

  it('기록상 31일 이상 안 쓴 구독은 해지 후보다', async () => {
    const sub = { id: 's1', name: '왓챠', priceKrw: 7900, cycle: 'monthly', billingDay: 5, lastUsedDate: '2026-09-10', createdAt: at(-60), updatedAt: at(-60) }
    localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub] }))
    await openSubs()
    expect(card('왓챠').getByText('해지 후보')).toBeInTheDocument()
    expect(card('왓챠').queryByText('확인 필요')).not.toBeInTheDocument()
  })

  it('예시 구독은 해지 후보 1개 · 월 10,900원이고 확인 필요는 없다', async () => {
    const user = await openSubs()
    await user.click(screen.getByRole('button', { name: '예시 구독 넣기' }))
    expect(summary().getByText('해지 후보 1개 · 월 10,900원')).toBeInTheDocument()
    expect(card('(예시) 음악 스트리밍').getByText('해지 후보')).toBeInTheDocument()
    expect(card('(예시) 음악 스트리밍').getByText('마지막 사용 2026-09-01')).toBeInTheDocument()
    expect(screen.queryByText('확인 필요')).not.toBeInTheDocument()
  })
})
