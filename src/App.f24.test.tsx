import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// PRD F24 담기 폼 줄이기 (AC43): 질문은 카드에서 묻고, 링크는 접고, 담은 직후 쓰임을 알려 주고, 담기 폼은 맨 위
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

const form = () => within(screen.getByRole('form', { name: '물건 담기' }))
const card = (name: string) => within(screen.getByRole('article', { name }))
async function fillBasics(user: ReturnType<typeof userEvent.setup>, name = '전기 포트') {
  await user.type(form().getByLabelText('상품명'), name)
  await user.type(form().getByLabelText('가격'), '32000')
  await user.type(form().getByLabelText('사고 싶은 이유'), '냄비가 없어서')
}

describe('담기 폼 줄이기 (F24, AC43)', () => {
  it('담기 폼에는 질문 6개가 없고 링크는 접혀 있다. 담은 물건은 카드에서 질문 6개를 묻는다', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(form().queryByText('한 번만 생각해 볼까요? (선택)')).not.toBeInTheDocument()
    expect(form().queryByRole('group', { name: '지금 쓰는 게 있나요?' })).not.toBeInTheDocument()
    const linkToggle = form().getByText('상품 링크 (선택)')
    expect(linkToggle.closest('details')).not.toHaveAttribute('open')
    await fillBasics(user)
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0]).not.toHaveProperty('answers')
    expect(within(card('전기 포트').getByRole('region', { name: '오늘의 고민' })).getByText('생각해 볼 질문 · 6개 남음')).toBeInTheDocument()
  })

  it('링크가 잘못돼 담지 못하면 접힌 링크 영역을 펼치고 그 입력으로 포커스를 옮긴다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await fillBasics(user)
    const linkToggle = form().getByText('상품 링크 (선택)')
    await user.click(linkToggle)
    await user.type(form().getByLabelText('링크 (선택)'), 'abc')
    await user.click(linkToggle)
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    expect(linkToggle.closest('details')).toHaveAttribute('open')
    expect(form().getByLabelText('링크 (선택)')).toHaveFocus()
    expect(form().getByLabelText('링크 (선택)')).toHaveAccessibleDescription(/https:\/\//)
    expect(screen.queryByRole('article', { name: '전기 포트' })).not.toBeInTheDocument()
  })

  it('담은 직후 적은 값이 언제 어디에 쓰이는지 알려 주고, 다시 입력하면 안내를 지운다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await fillBasics(user)
    await user.click(within(form().getByRole('group', { name: '지금 얼마나 갖고 싶나요? (선택)' })).getByRole('radio', { name: '4 많이' }))
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    const notice = form().getByRole('status', { name: '담은 물건' })
    expect(notice).toHaveTextContent(
      '‘전기 포트’를 담았어요. 3일 뒤에 처음 적은 이유와 갖고 싶은 정도의 변화를 다시 보여 드릴게요. 그동안 카드의 오늘의 고민에서 질문에 하나씩 답해 보세요.',
    )
    await user.type(form().getByLabelText('상품명'), '키')
    expect(form().queryByText(/를 담았어요/)).not.toBeInTheDocument()
  })

  it('고른 고민 기간과 받침에 맞춰 안내한다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await fillBasics(user, '무선 헤드폰')
    await user.click(form().getByRole('radio', { name: '7일' }))
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    expect(form().getByRole('status', { name: '담은 물건' })).toHaveTextContent('‘무선 헤드폰’을 담았어요. 7일 뒤에')
  })

  it('고민 중인 물건이 있어도 담기 폼이 목록보다 위에 있고, 새 물건 담기는 없다', () => {
    const item = { id: 'h1', name: '무선 헤드폰', priceKrw: 129000, reason: '이유', url: null, createdAt: at(-1), updatedAt: at(-1), reviewAt: at(2), status: 'considering', decidedAt: null }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [item] }))
    render(<App />)
    const addForm = screen.getByRole('form', { name: '물건 담기' })
    expect(addForm.compareDocumentPosition(screen.getByRole('region', { name: '고민 중인 물건 목록' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: '새 물건 담기' })).not.toBeInTheDocument()
  })
})
