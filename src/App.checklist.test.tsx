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
  it('새 질문 3개에 답하고 담으면 저장되고, 구매함을 누를 때 점검의 근거가 된다', async () => {
    const user = userEvent.setup()
    render(<App />)
    const form = within(screen.getByRole('form', { name: '물건 담기' }))
    await user.type(form.getByLabelText('상품명'), '캠핑 의자')
    await user.type(form.getByLabelText('가격'), '89000')
    await user.type(form.getByLabelText('사고 싶은 이유'), '캠핑 가려고')
    await user.click(form.getByText('한 번만 생각해 볼까요? (선택)'))
    const group = (name: string) => within(form.getByRole('group', { name }))
    await user.click(group('할인·한정 때문인가요?').getByRole('radio', { name: '네' }))
    await user.click(group('놓을 곳과 쓸 시간이 있나요?').getByRole('radio', { name: '없어요' }))
    await user.click(group('빌리거나 중고로 대신할 수 있나요?').getByRole('radio', { name: '대신할 수 있어요' }))
    await user.click(form.getByRole('button', { name: '담아 두기' }))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].answers).toEqual({
      saleDriven: 'yes',
      spaceTime: 'no',
      alternative: 'yes',
    })
    await user.click(card('캠핑 의자').getByRole('button', { name: '구매함' }))
    const check = within(card('캠핑 의자').getByRole('region', { name: '사기 전 점검' }))
    expect(check.getByText("담을 때 '할인·한정 때문'이라고 답했어요. 할인이 없어도 살까요?")).toBeInTheDocument()
    expect(check.getByText("담을 때 '놓을 곳이나 쓸 시간이 없어요'라고 답했어요")).toBeInTheDocument()
    expect(check.getByText("담을 때 '빌리거나 중고로 대신할 수 있어요'라고 답했어요")).toBeInTheDocument()
  })

  it('재검토 가능 카드에 새 답도 함께 보여준다', async () => {
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
    const answers = within(card('캠핑 의자').getByRole('list', { name: '담을 때 답한 것' }))
    expect(answers.getByText('할인 때문은 아니에요')).toBeInTheDocument()
    expect(answers.getByText('놓을 곳과 쓸 시간이 있어요')).toBeInTheDocument()
    expect(answers.getByText('대신하기 어려워요')).toBeInTheDocument()
  })
})
