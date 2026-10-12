import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// 담을 때 질문 6개 (F09 확장) → 재검토 카드와 사기 전 점검(F15)에 쓰인다
const T0 = new Date('2026-10-11T09:00:00+09:00')
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

describe('담을 때 질문 6개', () => {
  it('새 질문 3개에 카드에서 답하면 저장되고, 구매함을 누를 때 점검의 근거가 된다 (F24: 담기 폼 대신 카드에서)', async () => {
    const T = Date.now()
    const item = {
      id: 'c1',
      name: '캠핑 의자',
      priceKrw: 89000,
      reason: '캠핑 가려고',
      url: null,
      createdAt: new Date(T - 2 * 86400000).toISOString(),
      updatedAt: new Date(T - 2 * 86400000).toISOString(),
      reviewAt: new Date(T - 86400000).toISOString(),
      status: 'considering',
      decidedAt: null,
      answers: { problem: '바닥에 앉아요', useInMonth: 'yes', haveOne: 'no' },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [item] }))
    const user = userEvent.setup()
    render(<App />)
    const note = () => within(card('캠핑 의자').getByRole('region', { name: '오늘의 고민' }))
    await user.click(note().getByRole('button', { name: '네' }))
    await user.click(note().getByRole('button', { name: '없어요' }))
    await user.click(note().getByRole('button', { name: '대신할 수 있어요' }))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].answers).toEqual({
      problem: '바닥에 앉아요',
      useInMonth: 'yes',
      haveOne: 'no',
      saleDriven: 'yes',
      spaceTime: 'no',
      alternative: 'yes',
    })
    await user.click(card('캠핑 의자').getByRole('button', { name: '구매함' }))
    const check = within(card('캠핑 의자').getByRole('region', { name: '사기 전 점검' }))
    expect(check.getByText("'할인·한정 때문'이라고 답했어요. 할인이 없어도 살까요?")).toBeInTheDocument()
    expect(check.getByText("'놓을 곳이나 쓸 시간이 없어요'라고 답했어요")).toBeInTheDocument()
    expect(check.getByText("'빌리거나 중고로 대신할 수 있어요'라고 답했어요")).toBeInTheDocument()
  })

  it('고민 기간 끝 카드에 새 답도 함께 보여준다', async () => {
    const item = {
      id: 'c1',
      name: '캠핑 의자',
      priceKrw: 89000,
      reason: '캠핑 가려고',
      url: null,
      createdAt: at(-4),
      updatedAt: at(-4),
      reviewAt: at(-1),
      status: 'considering',
      decidedAt: null,
      answers: { saleDriven: 'no', spaceTime: 'yes', alternative: 'no' },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [item] }))
    render(<App />)
    // F27: 카드 체크리스트에 질문과 답이 함께 보인다
    const rows = within(card('캠핑 의자').getByRole('list', { name: '체크리스트' })).getAllByRole('listitem')
    expect(rows[3]).toHaveTextContent('할인·한정 때문인가요?아니요다시 답하기')
    expect(rows[4]).toHaveTextContent('놓을 곳과 쓸 시간이 있나요?있어요다시 답하기')
    expect(rows[5]).toHaveTextContent('빌리거나 중고로 대신할 수 있나요?어려워요다시 답하기')
  })
})
