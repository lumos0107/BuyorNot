import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SETTINGS_KEY } from './logic/settings'
import { STORAGE_KEY } from './logic/storage'

// PRD F15 사기 전에 한 번 더 (AC29): "구매함"을 누르면 확인 전에 내 기록에서 찾은 근거를 보여준다
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

const base = {
  priceKrw: 129000,
  url: null,
  status: 'considering',
  decidedAt: null,
}
// 고민 중: 이유에 '세일', 지금 쓰는 게 있음, 문제 설명 없음, 고민 기간 2일 남음
const headphone = {
  ...base,
  id: 'h1',
  name: '무선 헤드폰',
  reason: '세일이라서',
  createdAt: at(-1),
  updatedAt: at(-1),
  reviewAt: at(2),
  answers: { haveOne: 'yes' },
}
// 20일 전에 산 비슷한 물건
const bought = {
  ...base,
  id: 'b1',
  name: '블루투스 헤드폰',
  reason: '운동할 때',
  priceKrw: 59000,
  createdAt: at(-25),
  updatedAt: at(-20),
  reviewAt: at(-22),
  status: 'purchased',
  decidedAt: at(-20),
}
// 걸리는 점이 없는 물건
const calm = {
  ...base,
  id: 'c1',
  name: '전기 포트',
  reason: '물 끓일 냄비가 없어서',
  priceKrw: 32000,
  createdAt: at(-4),
  updatedAt: at(-4),
  reviewAt: at(-1),
  answers: { haveOne: 'no', problem: '라면을 못 끓여요', useInMonth: 'yes' },
}

function setup(items: unknown[], wage?: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items }))
  if (wage) localStorage.setItem(SETTINGS_KEY, JSON.stringify({ schemaVersion: 1, hourlyWage: wage }))
  const user = userEvent.setup()
  render(<App />)
  return user
}
const card = (name: string) => within(screen.getByRole('article', { name }))

describe('사기 전에 한 번 더 (F15, AC29)', () => {
  it('구매함을 누르면 확인 전에 걸리는 점을 개수와 함께 보여준다', async () => {
    const user = setup([headphone, bought])
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    const check = within(card('무선 헤드폰').getByRole('region', { name: '사기 전 점검' }))
    expect(check.getByText('사기 전에 한 번 더 · 걸리는 점 4개')).toBeInTheDocument()
    const concerns = within(check.getByRole('list', { name: '걸리는 점' }))
    expect(concerns.getAllByRole('listitem')).toHaveLength(4)
    expect(concerns.getByText("비슷한 기록: 20일 전에 '블루투스 헤드폰'을 구매했어요")).toBeInTheDocument()
    expect(concerns.getByText("'지금 쓰는 게 있어요'라고 답했어요")).toBeInTheDocument()
    expect(concerns.getByText("사고 싶은 이유에 '세일'이 있어요. 할인이 없어도 살까요?")).toBeInTheDocument()
    expect(concerns.getByText('고민 기간이 2일 남았어요')).toBeInTheDocument()
    // 답하지 않은 질문은 개수에 넣지 않고 따로 보여준다 (중요한 순서로 3개, 나머지는 개수만)
    const questions = within(check.getByRole('list', { name: '한 번 생각해 볼 질문' }))
    expect(questions.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '없으면 어떤 문제가 있나요?',
      '한 달 뒤에도 쓸까요?',
      '놓을 곳과 쓸 시간이 있나요?',
    ])
    expect(check.getByText('그 밖에 1개')).toBeInTheDocument()
    expect(check.getByText('그래도 필요하다면 사도 괜찮아요.')).toBeInTheDocument()
  })

  it('메모 입력에 포커스가 가면 점검 내용을 함께 읽어 준다', async () => {
    const user = setup([headphone, bought])
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    const memo = card('무선 헤드폰').getByLabelText('결정 메모 (선택)')
    expect(memo).toHaveFocus()
    expect(memo).toHaveAccessibleDescription(/걸리는 점 4개/)
  })

  it('시급을 넣어 두었으면 금액을 시간으로 함께 보여준다', async () => {
    const user = setup([headphone], 10000)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    expect(within(card('무선 헤드폰').getByRole('region', { name: '사기 전 점검' })).getByText('이 금액은 시급으로 약 12.9시간이에요.')).toBeInTheDocument()
  })

  it('걸리는 점이 없으면 그렇다고만 알리고, 그대로 살 수 있다', async () => {
    const user = setup([calm])
    await user.click(card('전기 포트').getByRole('button', { name: '구매함' }))
    const check = within(card('전기 포트').getByRole('region', { name: '사기 전 점검' }))
    expect(check.getByText('사기 전에 한 번 더 · 걸리는 점이 없어요')).toBeInTheDocument()
    expect(check.queryByText('그래도 필요하다면 사도 괜찮아요.')).not.toBeInTheDocument()
    await user.click(card('전기 포트').getByRole('button', { name: '구매함 확인' }))
    expect(screen.queryByRole('article', { name: '전기 포트' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].status).toBe('purchased')
  })

  it('구매 포기를 누를 때는 점검을 보여주지 않는다', async () => {
    const user = setup([headphone, bought])
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    expect(card('무선 헤드폰').queryByRole('region', { name: '사기 전 점검' })).not.toBeInTheDocument()
  })
})

describe('시연용 예시 데이터 (F15)', () => {
  it('예시 헤드폰은 답이 있고 아직 고민 중이라, 구매함을 누르면 걸리는 점 3개를 보여준다 (F27: 예시 둘은 고민 중)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    expect(card('(예시) 무선 헤드폰').getByText('체크리스트 3/6')).toBeInTheDocument()
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '구매함' }))
    const check = within(card('(예시) 무선 헤드폰').getByRole('region', { name: '사기 전 점검' }))
    expect(check.getByText('사기 전에 한 번 더 · 걸리는 점 3개')).toBeInTheDocument()
    expect(check.getByText('고민 기간이 3일 남았어요')).toBeInTheDocument()
    expect(check.getByText("'지금 쓰는 게 있어요'라고 답했어요")).toBeInTheDocument()
    expect(check.getByText("'한 달 뒤에도 쓸까요?'에 '모르겠어요'라고 답했어요")).toBeInTheDocument()
  })
})
