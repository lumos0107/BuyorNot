import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { BILLS_KEY, type Bill } from './logic/bills'

const now = new Date(2026, 10, 1, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const bill = (over: Partial<Bill> = {}): Bill => ({ id: 'b1', kind: 'electric', month: '2026-10', amountKrw: 42300, createdAt: stamp, updatedAt: stamp, ...over })
const seed = (...items: Bill[]) => localStorage.setItem(BILLS_KEY, JSON.stringify({ schemaVersion: 1, items }))
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '고정비' })); return user }
const form = () => within(screen.getByRole('form', { name: '공과금 적기' }))
async function enterAmount(user: ReturnType<typeof userEvent.setup>, amount: string) { await user.clear(form().getByLabelText('금액')); await user.type(form().getByLabelText('금액'), amount) }

it('AC113: 공과금을 적으면 작년 같은 달 비교 줄과 계절 안내가 보인다', async () => {
  seed(bill({ id: 'old', month: '2025-10', amountKrw: 36200 }))
  const user = await open()
  expect(screen.getByRole('region', { name: '수도·가스·전기 요금' })).toBeInTheDocument()
  await user.selectOptions(form().getByLabelText('청구 월'), '10')
  await enterAmount(user, '42300')
  await user.click(form().getByRole('button', { name: '적기' }))
  expect(screen.getByText('10월 전기 42,300원 · 작년 10월보다 6,100원 많아요')).toBeInTheDocument()
  expect(screen.getByText('전기·가스는 계절마다 크게 달라서, 작년 같은 달 기록이 있으면 그 달과 비교해요.')).toBeInTheDocument()
  expect(screen.getByRole('status', { name: '공과금 알림' })).toHaveTextContent('2026년 10월 전기 요금 42,300원을 적었어요.')
  expect(form().getByLabelText('금액')).toHaveValue('')
})

it('AC114: 같은 달을 다시 적으면 확인하고 하나만 남긴다', async () => {
  seed(bill())
  const user = await open()
  await user.selectOptions(form().getByLabelText('청구 월'), '10')
  await enterAmount(user, '45000')
  await user.click(form().getByRole('button', { name: '적기' }))
  const confirm = within(screen.getByRole('group', { name: '공과금 바꾸기 확인' }))
  expect(confirm.getByText('2026년 10월 전기 요금이 이미 있어요(42,300원). 새 금액으로 바꿀까요?')).toBeInTheDocument()
  expect(confirm.getByRole('button', { name: '바꾸기' })).toHaveFocus()
  await user.click(confirm.getByRole('button', { name: '바꾸기' }))
  expect(JSON.parse(localStorage.getItem(BILLS_KEY) ?? '{}').items).toHaveLength(1)
  expect(JSON.parse(localStorage.getItem(BILLS_KEY) ?? '{}').items[0].amountKrw).toBe(45000)
  expect(form().getByRole('button', { name: '적기' })).toHaveFocus()
})

it('AC115: 다른 탭이 먼저 저장하면 알림 없이 입력을 남긴다', async () => {
  const user = await open()
  await enterAmount(user, '42300')
  seed(bill({ id: 'other' }))
  await user.click(form().getByRole('button', { name: '적기' }))
  expect(screen.getByRole('status', { name: '공과금 저장 상태' })).toHaveTextContent('다른 탭에서 저장한 공과금 기록을 불러왔어요.')
  expect(screen.getByRole('status', { name: '공과금 알림' })).toBeEmptyDOMElement()
  expect(form().getByLabelText('금액')).toHaveValue('42300')
})

it('AC114: 잘못된 금액은 오류가 연결되고 그 칸으로 포커스한다', async () => {
  const user = await open()
  fireEvent.change(form().getByLabelText('금액'), { target: { value: '0' } })
  await user.click(form().getByRole('button', { name: '적기' }))
  expect(form().getByLabelText('금액')).toHaveAccessibleDescription('금액은 1원~1,000만 원 사이여야 해요')
  expect(form().getByLabelText('금액')).toHaveFocus()
})

it('AC114: 두 달 치 수도는 한 달 값으로 비교한다', async () => {
  seed(bill({ id: 'old', kind: 'water', month: '2025-09', amountKrw: 20000, months: 2 }))
  const user = await open()
  await user.click(form().getByRole('radio', { name: '수도' }))
  await user.selectOptions(form().getByLabelText('청구 월'), '9')
  await enterAmount(user, '24000')
  await user.click(form().getByLabelText('두 달 치 고지서예요'))
  await user.click(form().getByRole('button', { name: '적기' }))
  expect(screen.getByText('9월 수도(두 달 치) 24,000원 · 한 달에 약 12,000원 · 작년 9월보다 한 달에 약 2,000원 많아요')).toBeInTheDocument()
})

it('AC114: 같은 달 바꾸기를 취소하면 입력과 기록이 그대로다', async () => {
  seed(bill())
  const user = await open()
  await user.selectOptions(form().getByLabelText('청구 월'), '10')
  await enterAmount(user, '45000')
  await user.click(form().getByRole('button', { name: '적기' }))
  await user.click(within(screen.getByRole('group', { name: '공과금 바꾸기 확인' })).getByRole('button', { name: '취소' }))
  expect(form().getByRole('button', { name: '적기' })).toHaveFocus()
  expect(form().getByLabelText('금액')).toHaveValue('45000')
  expect(JSON.parse(localStorage.getItem(BILLS_KEY) ?? '{}').items[0].amountKrw).toBe(42300)
})

it('AC115: 손상된 공과금 저장값은 덮어쓰지 않고 알린다', async () => {
  localStorage.setItem(BILLS_KEY, '{bad')
  await open()
  expect(screen.getByRole('status', { name: '공과금 저장 상태' })).toHaveTextContent('저장된 공과금 기록을 읽을 수 없어요.')
  expect(screen.getByRole('button', { name: '공과금 기록 초기화' })).toBeInTheDocument()
  expect(localStorage.getItem(BILLS_KEY)).toBe('{bad')
})

it('AC115: 기록 지우기는 확인한 뒤에만 반영된다', async () => {
  seed(bill())
  const user = await open()
  await user.click(screen.getByText('공과금 기록 (1건)'))
  await user.click(screen.getByRole('button', { name: '2026-10 전기 42,300원 기록 지우기' }))
  expect(screen.getByRole('group', { name: '공과금 기록 지우기 확인' })).toHaveTextContent('이 기록을 지울까요? 비교에서도 빠져요.')
  await user.click(within(screen.getByRole('group', { name: '공과금 기록 지우기 확인' })).getByRole('button', { name: '지우기' }))
  expect(JSON.parse(localStorage.getItem(BILLS_KEY) ?? '{}').items).toEqual([])
  expect(screen.getByText('수도·가스·전기 요금')).toHaveFocus()
})

it('AC115: 같은 달 바꾸기 전에 다른 탭이 저장하면 확인을 닫고 입력을 남긴다', async () => {
  seed(bill())
  const user = await open()
  await user.selectOptions(form().getByLabelText('청구 월'), '10')
  await enterAmount(user, '45000')
  await user.click(form().getByRole('button', { name: '적기' }))
  seed(bill({ amountKrw: 43000 }))
  await user.click(within(screen.getByRole('group', { name: '공과금 바꾸기 확인' })).getByRole('button', { name: '바꾸기' }))
  expect(screen.queryByRole('group', { name: '공과금 바꾸기 확인' })).not.toBeInTheDocument()
  expect(form().getByRole('button', { name: '적기' })).toHaveFocus()
  expect(form().getByLabelText('금액')).toHaveValue('45000')
  expect(screen.getByRole('status', { name: '공과금 알림' })).toBeEmptyDOMElement()
})

it('AC115: 지우기 전에 다른 탭이 저장하면 원래 지우기로 포커스가 돌아간다', async () => {
  seed(bill())
  const user = await open()
  await user.click(screen.getByText('공과금 기록 (1건)'))
  await user.click(screen.getByRole('button', { name: '2026-10 전기 42,300원 기록 지우기' }))
  seed(bill({ amountKrw: 43000 }))
  await user.click(within(screen.getByRole('group', { name: '공과금 기록 지우기 확인' })).getByRole('button', { name: '지우기' }))
  expect(JSON.parse(localStorage.getItem(BILLS_KEY) ?? '{}').items[0].amountKrw).toBe(43000)
  expect(screen.getByRole('button', { name: '2026-10 전기 43,000원 기록 지우기' })).toHaveFocus()
})
