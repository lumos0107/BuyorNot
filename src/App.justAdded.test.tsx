import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// PRD F24 담은 직후 (AC70, 판정 R29-P3): 담으면 새 물건 카드의 이름으로 포커스가 가고 그 아래에 "방금 담았어요."가 보인다.
// 다른 탭 때문에 담기가 반영되지 않은 경우(판정 R30)는 App.multitab.test.tsx에 있다
const T0 = new Date(2026, 9, 11, 9)
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(T0.getTime() + days * DAY).toISOString()
const JUST_ADDED = '방금 담았어요.'

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

// 저장 형식 그대로 고민 중인 물건을 넣는다 (reviewAt이 남은 시간을 정한다)
const wish = (id: string, name: string, remainingDays: number) => ({
  id,
  name,
  priceKrw: 129000,
  reason: '이유',
  url: null,
  createdAt: at(-1),
  updatedAt: at(-1),
  reviewAt: at(remainingDays),
  status: 'considering',
  decidedAt: null,
})
const seed = (...items: unknown[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items }))
const seedTwo = () => seed(wish('h1', '무선 헤드폰', 1), wish('p1', '전기 포트', 2))

async function addItem(user: ReturnType<typeof userEvent.setup>, name: string, days: 1 | 3 | 7) {
  await user.type(form().getByLabelText('상품명'), name)
  await user.type(form().getByLabelText('가격'), '129000')
  await user.type(form().getByLabelText('사고 싶은 이유'), '운동화가 낡아서')
  await user.click(form().getByRole('radio', { name: `${days}일` }))
  await user.click(form().getByRole('button', { name: '담아 두기' }))
}

describe('담은 직후 새 카드로 포커스 (F24, AC70)', () => {
  it('AC70: 물건 둘이 있을 때 3일로 담으면 셋째 카드 이름으로 포커스가 가고 그 아래에 "방금 담았어요."가 보인다', async () => {
    seedTwo()
    const user = userEvent.setup()
    render(<App />)
    await addItem(user, '나이키 에어포스', 3)

    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(cards[2]).toHaveAccessibleName('나이키 에어포스')
    // 포커스는 셋째 카드 안(이름)에 있고, 이름의 설명이 "방금 담았어요."라 포커스가 갈 때 함께 읽힌다
    const focused = document.activeElement as HTMLElement
    expect(focused.closest('article')).toBe(cards[2])
    expect(focused).toHaveTextContent('나이키 에어포스')
    expect(focused).toHaveAccessibleDescription(JUST_ADDED)
    // 그 이름 바로 아래에 있고, 다른 두 카드에는 없다
    const line = within(cards[2]).getByText(JUST_ADDED)
    expect(line.previousElementSibling).toContainElement(focused)
    expect(within(cards[0]).queryByText(JUST_ADDED)).not.toBeInTheDocument()
    expect(within(cards[1]).queryByText(JUST_ADDED)).not.toBeInTheDocument()
    // 폼 위의 담은 직후 안내(AC43)는 그대로
    expect(form().getByRole('status', { name: '담은 물건' })).toHaveTextContent('‘나이키 에어포스’를 담았어요. 3일 뒤에')
  })

  it('AC70: 담은 뒤 상품명에 한 글자 넣으면 "방금 담았어요."와 담은 직후 안내가 함께 사라진다', async () => {
    seedTwo()
    const user = userEvent.setup()
    render(<App />)
    await addItem(user, '나이키 에어포스', 3)
    expect(screen.getByText(JUST_ADDED)).toBeInTheDocument()
    expect(form().getByRole('status', { name: '담은 물건' })).toBeInTheDocument()

    await user.type(form().getByLabelText('상품명'), '키')
    expect(screen.queryByText(JUST_ADDED)).not.toBeInTheDocument()
    expect(form().queryByRole('status', { name: '담은 물건' })).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: '나이키 에어포스' })).not.toHaveAccessibleDescription(JUST_ADDED)
  })

  it('AC70: 이어서 다른 물건을 담으면 그 카드로 옮겨 가고 줄은 그 카드에만 있다', async () => {
    seedTwo()
    const user = userEvent.setup()
    render(<App />)
    await addItem(user, '나이키 에어포스', 3)
    await addItem(user, '책장', 1)

    const shelf = screen.getByRole('article', { name: '책장' })
    const focused = document.activeElement as HTMLElement
    expect(focused.closest('article')).toBe(shelf)
    expect(focused).toHaveTextContent('책장')
    expect(focused).toHaveAccessibleDescription(JUST_ADDED)
    expect(screen.getAllByText(JUST_ADDED)).toHaveLength(1)
    expect(within(shelf).getByText(JUST_ADDED)).toBeInTheDocument()
    expect(card('나이키 에어포스').queryByText(JUST_ADDED)).not.toBeInTheDocument()
  })

  it('AC70: 담은 뒤 새로고침하면 "방금 담았어요."는 없다', async () => {
    seedTwo()
    const user = userEvent.setup()
    const first = render(<App />)
    await addItem(user, '나이키 에어포스', 3)
    expect(screen.getByText(JUST_ADDED)).toBeInTheDocument()

    first.unmount()
    render(<App />)
    expect(screen.getByRole('article', { name: '나이키 에어포스' })).toBeInTheDocument()
    expect(screen.queryByText(JUST_ADDED)).not.toBeInTheDocument()
  })

  it('AC70: 같은 이름의 물건이 이미 있어도 새로 담은 카드로 포커스가 간다', async () => {
    seed(wish('n1', '나이키 에어포스', 1))
    const user = userEvent.setup()
    render(<App />)
    await addItem(user, '나이키 에어포스', 3)

    expect(screen.getAllByRole('article', { name: '나이키 에어포스' })).toHaveLength(2)
    const focusedCard = (document.activeElement as HTMLElement).closest('article') as HTMLElement
    expect(focusedCard).toHaveAccessibleName('나이키 에어포스')
    // 먼저 있던 카드는 1일 남음, 새로 담은 카드가 3일 남음
    expect(within(focusedCard).getByText(/3일 남음/)).toBeInTheDocument()
    expect(within(focusedCard).getByText(JUST_ADDED)).toBeInTheDocument()
    expect(screen.getAllByText(JUST_ADDED)).toHaveLength(1)
  })

  it('AC70: 담은 뒤 다른 물건을 구매 포기해도 "방금 담았어요."는 새 카드에만 있다', async () => {
    seedTwo()
    const user = userEvent.setup()
    render(<App />)
    await addItem(user, '나이키 에어포스', 3)

    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
    // 구매 포기 뒤 포커스는 화면 제목으로 가고(F18), 새 카드의 줄은 그대로 새 카드에만 있다
    expect(screen.getByRole('heading', { name: '고민 중인 물건' })).toHaveFocus()
    expect(screen.getAllByText(JUST_ADDED)).toHaveLength(1)
    expect(card('나이키 에어포스').getByText(JUST_ADDED)).toBeInTheDocument()
    expect(card('전기 포트').queryByText(JUST_ADDED)).not.toBeInTheDocument()
  })
})
