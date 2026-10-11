import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// PRD F27 카드 체크리스트: 질문 6개를 카드에서 늘 목록으로 보여준다. 답한 것은 답과 다시 답하기,
// 답하지 않은 첫 질문은 펼쳐 바로 답하고, 나머지는 답하기로 골라 답한다 (AC46)
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

const thing = {
  id: 'h1',
  name: '무선 헤드폰',
  priceKrw: 129000,
  reason: '출퇴근길에 쓰려고',
  url: null,
  createdAt: at(-1),
  updatedAt: at(-1),
  reviewAt: at(2),
  status: 'considering',
  decidedAt: null,
  answers: { haveOne: 'yes', useInMonth: 'unsure' },
}
function setup(...items: unknown[]) {
  if (items.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items }))
  const user = userEvent.setup()
  render(<App />)
  return user
}
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items as Record<string, unknown>[]
const card = (name: string) => within(screen.getByRole('article', { name }))
const list = (name: string) => card(name).getByRole('list', { name: '체크리스트' })
const rows = (name: string) => within(list(name)).getAllByRole('listitem')

describe('카드 체크리스트 (F27, AC46)', () => {
  it('질문 6개를 중요한 순서로 늘 보여주고, 답한 것은 답과 다시 답하기, 답하지 않은 첫 질문은 펼쳐 둔다', () => {
    setup(thing)
    expect(card('무선 헤드폰').getByText('체크리스트 2/6')).toBeInTheDocument()
    const r = rows('무선 헤드폰')
    expect(r).toHaveLength(6)
    expect(r.map((row) => row.textContent)).toEqual([
      expect.stringContaining('없으면 어떤 문제가 있나요?'),
      '한 달 뒤에도 쓸까요?모르겠어요다시 답하기',
      '지금 쓰는 게 있나요?있어요다시 답하기',
      '할인·한정 때문인가요?답하기',
      '놓을 곳과 쓸 시간이 있나요?답하기',
      '빌리거나 중고로 대신할 수 있나요?답하기',
    ])
    // 펼친 첫 질문: 바로 적어 답한다
    expect(within(r[0]).getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' })).toBeInTheDocument()
    expect(within(r[0]).getByRole('button', { name: '답하기' })).toBeInTheDocument()
    expect(within(r[1]).getByRole('button', { name: '‘한 달 뒤에도 쓸까요?’ 다시 답하기' })).toBeInTheDocument()
    expect(within(r[3]).getByRole('button', { name: '‘할인·한정 때문인가요?’ 답하기' })).toBeInTheDocument()
    expect(card('무선 헤드폰').queryByRole('list', { name: '답한 것' })).not.toBeInTheDocument()
  })

  it('다른 질문의 답하기를 누르면 그 질문이 펼쳐지고 질문으로 포커스가 가며, 답하면 다시 첫 질문이 펼쳐진다', async () => {
    const user = setup(thing)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '‘놓을 곳과 쓸 시간이 있나요?’ 답하기' }))
    const row = rows('무선 헤드폰')[4]
    expect(within(row).getByText('놓을 곳과 쓸 시간이 있나요?')).toHaveFocus()
    expect(within(rows('무선 헤드폰')[0]).queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: '없어요' }))

    expect(saved()[0].answers).toEqual({ haveOne: 'yes', useInMonth: 'unsure', spaceTime: 'no' })
    expect(card('무선 헤드폰').getByText('체크리스트 3/6')).toBeInTheDocument()
    expect(rows('무선 헤드폰')[4].textContent).toBe('놓을 곳과 쓸 시간이 있나요?없어요다시 답하기')
    expect(within(rows('무선 헤드폰')[0]).getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' })).toBeInTheDocument()
    expect(within(rows('무선 헤드폰')[0]).getByText('없으면 어떤 문제가 있나요?')).toHaveFocus()
  })

  it('다시 답하기를 누르면 답을 지우고 그 질문을 바로 펼친다', async () => {
    const user = setup(thing)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '‘지금 쓰는 게 있나요?’ 다시 답하기' }))
    expect(saved()[0].answers).toEqual({ useInMonth: 'unsure' })
    const row = rows('무선 헤드폰')[2]
    expect(within(row).getByText('지금 쓰는 게 있나요?')).toHaveFocus()
    await user.click(within(row).getByRole('button', { name: '없어요' }))
    expect(saved()[0].answers).toEqual({ useInMonth: 'unsure', haveOne: 'no' })
  })

  it('문제 설명은 적은 글이 답으로 보이고, 6개 모두 답하면 펼친 질문이 없다', () => {
    setup({
      ...thing,
      answers: { problem: '출퇴근길에 음악을 못 들어요', useInMonth: 'yes', haveOne: 'no', saleDriven: 'no', spaceTime: 'yes', alternative: 'no' },
    })
    expect(card('무선 헤드폰').getByText('체크리스트 6/6')).toBeInTheDocument()
    expect(rows('무선 헤드폰')[0].textContent).toBe('없으면 어떤 문제가 있나요?출퇴근길에 음악을 못 들어요다시 답하기')
    expect(within(list('무선 헤드폰')).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(list('무선 헤드폰')).queryByRole('button', { name: /’ 답하기$/ })).not.toBeInTheDocument()
  })
})

describe('예시 물건 규격 (F27)', () => {
  it('예시 두 개는 같은 단계(고민 중·6/6 답함·정도 기록)이고 카드 구성이 같다 (F28: 체크리스트를 모두 채워 둔다)', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    const names = ['(예시) 무선 헤드폰', '(예시) 접이식 건조대']
    for (const name of names) {
      expect(card(name).getByText(/^고민 중 · \d일 남음$/)).toBeInTheDocument()
      expect(card(name).getByText('체크리스트 6/6')).toBeInTheDocument()
      expect(card(name).getAllByRole('button', { name: /다시 답하기$/ })).toHaveLength(6)
      expect(card(name).getByText(/^담을 때 \d → /)).toBeInTheDocument()
      expect(card(name).getByText('일찍 정할 수도 있어요')).toBeInTheDocument()
    }
  })
})
