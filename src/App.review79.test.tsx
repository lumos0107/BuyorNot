import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// GPT 7~9단계 검토 반영 (화면·접근성)
const T0 = new Date('2026-10-11T09:00:00+09:00')

afterEach(() => {
  vi.useRealTimers()
})

describe('화면 보완', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
  })

  const form = () => within(screen.getByRole('form', { name: '물건 담기' }))
  const card = (name: string) => within(screen.getByRole('article', { name }))

  async function addItem(user: ReturnType<typeof userEvent.setup>, name = '무선 헤드폰') {
    await user.type(form().getByLabelText('상품명'), name)
    await user.type(form().getByLabelText('가격'), '129000')
    await user.type(form().getByLabelText('사고 싶은 이유'), '이유')
    await user.click(form().getByRole('button', { name: '담아 두기' }))
  }

  it('링크 영역을 접은 채 오류가 나면 다시 펼치고 그 입력으로 포커스를 옮긴다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(form().getByLabelText('상품명'), '무선 헤드폰')
    await user.type(form().getByLabelText('가격'), '129000')
    await user.type(form().getByLabelText('사고 싶은 이유'), '이유')
    await user.click(form().getByText('상품 링크 (선택)'))
    await user.type(form().getByLabelText('링크 (선택)'), 'abc')
    await user.click(form().getByText('상품 링크 (선택)'))
    expect(form().getByLabelText('링크 (선택)')).not.toBeVisible()
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    const link = form().getByLabelText('링크 (선택)')
    expect(link).toBeVisible()
    expect(link).toHaveFocus()
  })

  it('결정하면 카드가 사라지므로 포커스를 화면 제목으로 옮긴다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toHaveFocus()
  })

  it('수정을 열면 상품명에 포커스가 간다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '수정' }))
    expect(within(screen.getByRole('form', { name: '물건 수정' })).getByLabelText('상품명')).toHaveFocus()
  })

  it('결정 기록에서 삭제를 취소하면 삭제 버튼으로, 지우면 화면 제목으로 포커스가 간다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함 확인' }))
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '삭제' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '취소' }))
    expect(card('무선 헤드폰').getByRole('button', { name: '삭제' })).toHaveFocus()
    await user.click(card('무선 헤드폰').getByRole('button', { name: '삭제' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '지우기' }))
    expect(screen.getByRole('heading', { level: 2, name: '결정 기록' })).toHaveFocus()
  })

  it('비교 링크 영역에 추천이 아니라는 안내와 새 창 안내가 보인다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addItem(user)
    expect(card('무선 헤드폰').getByText(/추천 아님/)).toBeVisible()
    expect(card('무선 헤드폰').getByText(/새 창/)).toBeVisible()
  })

  it('더 고민하기 안내는 남은 기간에 더한다고 말한다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '더 고민하기' }))
    expect(card('무선 헤드폰').getByText('남은 기간에 더해요. 기간이 지났다면 지금부터 세어요.')).toBeInTheDocument()
  })

  it('AC19: 결정 메모 200자는 저장되어 결정 기록에 보인다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.type(card('무선 헤드폰').getByLabelText('결정 메모 (선택)'), '가'.repeat(200))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(card('무선 헤드폰').getByText('가'.repeat(200))).toBeInTheDocument()
  })

  it('안내문에 단정하는 문장이 없다', () => {
    render(<App />)
    expect(screen.queryByText(/늦지 않아요/)).not.toBeInTheDocument()
  })
})

describe('열린 화면의 종료 타이머 재예약', () => {
  it('첫 종료가 지난 뒤 다음 종료도 30초 주기보다 먼저 반영한다', async () => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const at = (sec: number) => new Date(T0.getTime() + sec * 1000).toISOString()
    const make = (id: string, name: string, reviewSec: number) => ({
      id,
      name,
      priceKrw: 1000,
      reason: '이유',
      url: null,
      createdAt: at(-3 * 24 * 3600),
      updatedAt: at(-3 * 24 * 3600),
      reviewAt: at(reviewSec),
      status: 'considering',
      decidedAt: null,
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [make('a', '첫째', 10), make('b', '둘째', 20)] }))
    render(<App />)
    const status = (name: string) => within(screen.getByRole('article', { name })).queryByText('고민 기간 끝')
    expect(status('첫째')).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(10_100)
    })
    expect(status('첫째')).not.toBeNull()
    expect(status('둘째')).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(status('둘째')).not.toBeNull()
  })
})
