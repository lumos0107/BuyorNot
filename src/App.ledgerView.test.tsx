import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { LEDGER_KEY } from './logic/ledger'

// PRD F84 가계부 보기 화면 (AC203·AC205~AC208)
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 2, 9)) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const at = '2026-11-02T00:00:00.000Z'
const seed = (entries: object[], saveTargets?: Record<string, number>) =>
  localStorage.setItem(LEDGER_KEY, JSON.stringify({ schemaVersion: 1, entries, ...(saveTargets ? { saveTargets } : {}) }))
const e = (id: string, kind: string, category: string, amountKrw: number, day: string) => ({ id, kind, category, name: id, amountKrw, day, createdAt: at })

async function openLedger() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가계부' }))
  return user
}

it('AC203: 이전 달·다음 달 버튼으로 볼 달을 한 달씩 옮긴다', async () => {
  const user = await openLedger()
  const summary = within(screen.getByRole('region', { name: '이달 가계부 요약' }))
  await user.click(summary.getByRole('button', { name: '이전 달' }))
  expect(summary.getByLabelText('볼 달')).toHaveValue('2026-10')
  await user.click(summary.getByRole('button', { name: '다음 달' }))
  await user.click(summary.getByRole('button', { name: '다음 달' }))
  expect(summary.getByLabelText('볼 달')).toHaveValue('2026-12')
})

it('AC204·AC205: 분류별 지출과 날짜별로 묶은 내역', async () => {
  seed([e('점심', 'expense', 'food', 12000, '2026-11-02'), e('간식', 'expense', 'food', 3000, '2026-11-01'), e('교통', 'expense', 'transport', 5000, '2026-11-01'), e('용돈', 'income', 'salary', 50000, '2026-11-02')])
  await openLedger()
  const categories = within(screen.getByRole('region', { name: '분류별 지출' }))
  // 동그란 분류 표식은 장식(aria-hidden)이라 빼고 읽는다
  const visibleText = (li: HTMLElement) => [...li.children].filter((child) => child.getAttribute('aria-hidden') !== 'true').map((child) => child.textContent).join('')
  expect(categories.getAllByRole('listitem').map(visibleText)).toEqual(['식비15,000원75%', '교통5,000원25%'])
  const list = screen.getByRole('region', { name: '가계부 내역' })
  const heads = list.querySelectorAll('.ledger-day-head')
  expect([...heads].map((h) => h.textContent)).toEqual(['11월 2일 (월)수입 50,000원 · 지출 12,000원', '11월 1일 (일)지출 8,000원'])
})

it('AC204: 수입만 있는 달에는 분류별 지출 카드가 없다', async () => {
  seed([e('용돈', 'income', 'salary', 50000, '2026-11-02')])
  await openLedger()
  expect(screen.queryByRole('region', { name: '분류별 지출' })).not.toBeInTheDocument()
})

it('AC206·AC207: 이달 현황판과 모을 금액 저장·넘침·지우기·오류', async () => {
  seed([e('용돈', 'income', 'salary', 500000, '2026-11-02'), e('점심', 'expense', 'food', 15500, '2026-11-02')])
  const user = await openLedger()
  const board = within(screen.getByRole('region', { name: '이달 현황판' }))
  const input = board.getByLabelText('이번 달 모을 금액')
  expect(board.getByText('수입 500,000원 중 지출 15,500원(3%) · 남는 돈 484,500원(97%)')).toBeInTheDocument()

  await user.type(input, '100000')
  await user.click(board.getByRole('button', { name: '저장' }))
  expect(board.getByText('수입 500,000원 중 지출 15,500원(3%) · 모을 금액 100,000원(20%) · 남는 돈 384,500원(77%)')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(LEDGER_KEY) ?? '{}').saveTargets).toEqual({ '2026-11': 100000 })

  await user.clear(input)
  await user.type(input, '490000')
  await user.click(board.getByRole('button', { name: '저장' }))
  expect(board.getByText('수입보다 5,500원 많아요')).toBeInTheDocument()

  for (const bad of ['-1', '1.5', '오만']) {
    await user.clear(input)
    await user.type(input, bad)
    await user.click(board.getByRole('button', { name: '저장' }))
    expect(board.getByText('모을 금액은 0원~10억 원 사이의 정수로 적어 주세요.')).toBeInTheDocument()
  }

  await user.clear(input)
  await user.click(board.getByRole('button', { name: '저장' }))
  expect(board.getByText('이번 달 모을 금액을 지웠어요.')).toBeInTheDocument()
  expect(board.getByText('수입 500,000원 중 지출 15,500원(3%) · 남는 돈 484,500원(97%)')).toBeInTheDocument()
})

it('AC206: 수입이 없는 달은 현황판 대신 안내', async () => {
  seed([e('점심', 'expense', 'food', 15500, '2026-10-02')])
  const user = await openLedger()
  await user.click(screen.getByRole('button', { name: '이전 달' }))
  expect(within(screen.getByRole('region', { name: '이달 현황판' })).getByText('이 달 수입을 적으면 현황판이 채워져요.')).toBeInTheDocument()
})

it('AC207: 저장한 모을 금액은 새로 열어도 남는다', async () => {
  seed([e('용돈', 'income', 'salary', 500000, '2026-11-02')], { '2026-11': 100000 })
  await openLedger()
  expect(within(screen.getByRole('region', { name: '이달 현황판' })).getByLabelText('이번 달 모을 금액')).toHaveValue('100000')
})

it('AC208: 지난달 지출과 비교한 한 줄, 지난달 기록이 없으면 없다', async () => {
  seed([e('10월', 'expense', 'food', 20000, '2026-10-05'), e('11월', 'expense', 'food', 15000, '2026-11-01')])
  const user = await openLedger()
  const summary = within(screen.getByRole('region', { name: '이달 가계부 요약' }))
  expect(summary.getByText('지난달보다 5,000원 덜 썼어요')).toBeInTheDocument()
  await user.click(summary.getByRole('button', { name: '이전 달' }))
  expect(summary.queryByText(/지난달/)).not.toBeInTheDocument()
})

it('AC214: 요약에 이번 달 모을 금액 칸이 있고, 정하기를 누르면 현황판의 입력칸으로 가며 저장하면 칸에 금액이 보인다', async () => {
  const user = await openLedger()
  const summary = within(screen.getByRole('region', { name: '이달 가계부 요약' }))
  expect(summary.getByText('이번 달 모을 금액')).toBeInTheDocument()
  expect(summary.getByText('정하지 않음')).toBeInTheDocument()
  await user.click(summary.getByRole('button', { name: '이번 달 모을 금액 정하기' }))
  const board = within(screen.getByRole('region', { name: '이달 현황판' }))
  expect(board.getByLabelText('이번 달 모을 금액')).toHaveFocus()
  await user.type(board.getByLabelText('이번 달 모을 금액'), '100000')
  await user.click(board.getByRole('button', { name: '저장' }))
  expect(summary.getByText('100,000원')).toBeInTheDocument()
  expect(summary.getByRole('button', { name: '이번 달 모을 금액 바꾸기' })).toBeInTheDocument()
})
