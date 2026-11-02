import { renderWishlistApp } from './test/renderWishlistApp'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PANTRY_KEY, type PantryItem } from './logic/pantry'

const today = new Date(2026, 10, 1, 9)
const stamp = today.toISOString()
const item: PantryItem = { id: 'p1', name: '세제', kind: 'essential', level: 'low', purchases: [], createdAt: stamp, updatedAt: stamp }
beforeEach(() => { localStorage.clear(); localStorage.setItem(PANTRY_KEY, JSON.stringify({ schemaVersion: 1, items: [item], recipes: [], events: [] })); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); renderWishlistApp(); await user.click(screen.getByText('집에 있는 것')); await user.click(within(screen.getByRole('group', { name: '세제' })).getByText('산 값 적기·비교')); return user }
const form = () => within(screen.getByRole('form', { name: '세제 산 값 적기' }))
async function add(user: ReturnType<typeof userEvent.setup>, place: string, amount: string, size: string, unit: string) {
  await user.clear(form().getByLabelText('곳'))
  await user.type(form().getByLabelText('곳'), place)
  await user.clear(form().getByLabelText('금액'))
  await user.type(form().getByLabelText('금액'), amount)
  await user.clear(form().getByLabelText('용량'))
  await user.type(form().getByLabelText('용량'), size)
  await user.selectOptions(form().getByLabelText('단위'), unit)
  fireEvent.change(form().getByLabelText('산 날'), { target: { value: '2026-11-01' } })
  await user.click(form().getByRole('button', { name: '산 값 적기' }))
}

it('AC121: 마트와 온라인 산 값을 적으면 같은 단위로 단가가 보인다', async () => {
  const user = await open()
  await add(user, '마트', '12000', '1', 'kg')
  await add(user, '온라인', '5000', '500', 'g')
  expect(screen.getByText('마트 100g당 1,200원 · 온라인 100g당 1,000원')).toBeInTheDocument()
  expect(screen.getByText('실제로 필요한 양과 총지출도 함께 보세요.')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}').items[0].purchases).toHaveLength(2)
})

it('AC122: 산 값 5개 뒤에는 더하지 않고 안내한다', async () => {
  const purchases = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, day: '2026-10-31', place: '마트', amountKrw: 12000, size: 1, unit: 'kg', createdAt: stamp }))
  localStorage.setItem(PANTRY_KEY, JSON.stringify({ schemaVersion: 1, items: [{ ...item, purchases }], recipes: [], events: [] }))
  const user = await open()
  await add(user, '온라인', '5000', '500', 'g')
  expect(screen.getByRole('alert')).toHaveTextContent('산 값은 5개까지예요')
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}').items[0].purchases).toHaveLength(5)
})

it('AC121: 산 값을 묶음 비교의 A안으로 보낸다', async () => {
  localStorage.setItem(PANTRY_KEY, JSON.stringify({ schemaVersion: 1, items: [{ ...item, purchases: [{ id: 'a1', day: '2026-10-31', place: '마트', amountKrw: 12000, size: 1, unit: 'kg', createdAt: stamp }] }], recipes: [], events: [] }))
  const user = await open()
  await user.click(screen.getByRole('button', { name: '묶음 비교로 보내기' }))
  expect(screen.getByRole('tab', { name: '가격 비교', selected: true })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '묶음상품 비교', selected: true })).toBeInTheDocument()
  const a = within(screen.getByRole('group', { name: '상품 A' }))
  expect(a.getByLabelText('가격')).toHaveValue('12000')
  expect(a.getByLabelText('단위')).toHaveValue('kg')
})
