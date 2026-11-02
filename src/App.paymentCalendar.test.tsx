import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'
import { LEDGER_KEY } from './logic/ledger'
import { shortWon } from './logic/paymentCalendar'

const now = new Date(2026, 10, 2, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const sub = (id: string, name: string, day: number, priceKrw: number): Subscription => ({
  id, name, priceKrw, cycle: 'monthly', billingDay: day, lastUsedDate: null, createdAt: stamp, updatedAt: stamp,
})
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

it('AC175: 처음부터 열린 달력에 결제 건수·요금 합계를 보이고 날짜를 누르면 그날 기록으로 간다', async () => {
  localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub('a', '인터넷 요금', 3, 30000), sub('b', '음악 구독', 5, 12000)] }))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가계부' }))
  const calendar = within(screen.getByRole('region', { name: '결제·지출 달력' }))
  expect(calendar.getByText('결제 예정 2건 · 적어 둔 요금 합계 42,000원')).toBeInTheDocument()
  expect(calendar.getByText('실제 청구일과 금액은 서비스에서 확인해 주세요.')).toBeVisible()
  await user.click(calendar.getByRole('button', { name: '2026-11-03 결제 예정 1건' }))
  expect(calendar.getByRole('region', { name: '2026-11-03 결제 예정' })).toHaveFocus()
  expect(calendar.getByText('11월 3일 · 인터넷 요금 · 30,000원')).toBeInTheDocument()
})

it('AC175: 적어 둔 고정비가 없으면 저장되지 않는 예시 결제를 보인다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가계부' }))
  const calendar = within(screen.getByRole('region', { name: '결제·지출 달력' }))
  expect(calendar.getByText('예시 결제 4건 · 36,280원')).toBeVisible()
  expect(calendar.getByText('달력의 예시 결제는 저장되지 않아요. 고정비를 등록하면 실제 입력한 요금으로 바뀝니다.')).toBeVisible()
  expect(localStorage.getItem(SUBS_KEY)).toBeNull()
})

// 결제·지출 달력 (F74 보강, AC212·AC213, 2026-11-03 제작자 "나갈 돈은 놔두고 지출 내역을 달력에 추가", "지출·나갈 것 금액으로 표시")
const entry = (id: string, name: string, day: string, amountKrw: number, kind: 'expense' | 'income' = 'expense') => ({
  id, kind, category: 'food', name, amountKrw, day, createdAt: stamp,
})

it('AC212: 이번 달 1일부터 그리고, 가계부 지출은 결제 예정과 다른 색의 금액으로 날짜 아래에 보인다', async () => {
  localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub('a', '인터넷 요금', 3, 30000)] }))
  localStorage.setItem(LEDGER_KEY, JSON.stringify({ schemaVersion: 1, entries: [
    entry('e1', '점심', '2026-11-01', 12000),
    entry('e2', '커피', '2026-11-01', 4500),
    entry('e3', '용돈', '2026-11-01', 50000, 'income'),
    entry('e4', '지난달 장보기', '2026-10-31', 30000),
  ] }))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가계부' }))
  const calendar = within(screen.getByRole('region', { name: '결제·지출 달력' }))
  // 지출만 센다(수입·지난달 제외)
  expect(calendar.getByText('가계부 지출 2건 · 16,500원')).toBeInTheDocument()
  const spentDay = calendar.getByRole('button', { name: '2026-11-01 지출 2건' })
  expect(spentDay.querySelector('.payment-calendar-amount.spent')).toHaveTextContent('16,500')
  expect(spentDay.querySelector('.payment-calendar-amount.pay')).toBeNull()
  const payDay = calendar.getByRole('button', { name: '2026-11-03 결제 예정 1건' })
  expect(payDay.querySelector('.payment-calendar-amount.pay')).toHaveTextContent('30,000')
  // 날짜 숫자가 금액보다 먼저(위)
  expect(payDay.querySelector('.payment-calendar-date')!.compareDocumentPosition(payDay.querySelector('.payment-calendar-amount')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await user.click(spentDay)
  expect(calendar.getByRole('region', { name: '2026-11-01 지출' })).toHaveFocus()
  expect(calendar.getByText('11월 1일 · 지출 · 점심 · 12,000원')).toBeInTheDocument()
  expect(calendar.queryByText(/지난달 장보기/)).not.toBeInTheDocument()
})

it('AC213: 칸 안 금액은 10만 원부터 만 단위로 줄인다', () => {
  expect(shortWon(9800)).toBe('9,800')
  expect(shortWon(99999)).toBe('99,999')
  expect(shortWon(120000)).toBe('12만')
  expect(shortWon(125000)).toBe('12.5만')
  expect(shortWon(1_234_567)).toBe('123만')
})
