import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

const today = new Date(2026, 10, 1, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const base: Subscription = { id: 's1', name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: null, createdAt: stamp, updatedAt: stamp }
const seed = (sub: Subscription) => localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub] }))
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '고정비' })); return user }
async function edit(user: ReturnType<typeof userEvent.setup>, name = '넷플릭스') { await user.click(within(screen.getByRole('article', { name })).getByRole('button', { name: '수정' })); return within(screen.getByRole('form', { name: '고정비 수정' })) }

it('AC104: 요금을 바꾸면 이유를 고르게 하고 서비스 인상은 카드와 요약에 보인다', async () => {
  seed(base)
  const user = await open()
  const form = await edit(user)
  await user.clear(form.getByLabelText('요금'))
  await user.type(form.getByLabelText('요금'), '17000')
  expect(form.getByText('요금이 바뀐 이유')).toBeInTheDocument()
  expect(form.getByRole('radio', { name: '서비스가 요금을 바꿨어요' })).not.toBeChecked()
  await user.click(form.getByRole('radio', { name: '서비스가 요금을 바꿨어요' }))
  await user.click(form.getByRole('button', { name: '저장' }))
  expect(within(screen.getByRole('article', { name: '넷플릭스' })).getByText('2026-11-01부터 13,500원 → 17,000원 (3,500원 올랐어요)')).toBeInTheDocument()
  expect(screen.getByText('최근 90일에 요금이 오른 고정비 1개 · 월 3,500원 늘었어요')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0].priceChanges).toHaveLength(1)
})

it('AC106: 이유 없이 저장하면 오류와 함께 이유 묶음으로 포커스가 간다', async () => {
  seed(base)
  const user = await open()
  const form = await edit(user)
  await user.clear(form.getByLabelText('요금'))
  await user.type(form.getByLabelText('요금'), '17000')
  await user.click(form.getByRole('button', { name: '저장' }))
  expect(form.getByText('요금이 바뀐 이유를 골라 주세요')).toBeInTheDocument()
  expect(form.getByRole('group', { name: '요금이 바뀐 이유' })).toHaveFocus()
})

it('AC106: 결제 주기를 바꾸면 기록을 지운다는 안내가 나온다', async () => {
  seed({ ...base, priceKrw: 17000, priceChanges: [{ day: '2026-10-20', from: 13500, to: 17000, by: 'service' }] })
  const user = await open()
  const form = await edit(user)
  await user.click(form.getByRole('radio', { name: '매년' }))
  expect(form.getByText('결제 주기를 바꾸면 요금 바뀜 기록 1개가 지워져요.')).toBeInTheDocument()
  fireEvent.change(form.getByLabelText('다음 결제일'), { target: { value: '2026-12-01' } })
  await user.click(form.getByRole('button', { name: '저장' }))
  expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0]).not.toHaveProperty('priceChanges')
})

it('AC108: 마지막으로 요금이 바뀐 날보다 앞서 해지할 수 없다', async () => {
  seed({ ...base, priceKrw: 17000, priceChanges: [{ day: '2026-10-20', from: 13500, to: 17000, by: 'service' }] })
  const user = await open()
  await user.click(within(screen.getByRole('article', { name: '넷플릭스' })).getByRole('button', { name: '해지했어요' }))
  const confirm = within(screen.getByRole('group', { name: '해지 확인' }))
  fireEvent.change(confirm.getByLabelText('해지한 날'), { target: { value: '2026-10-15' } })
  await user.click(confirm.getByRole('button', { name: '옮기기' }))
  expect(confirm.getByLabelText('해지한 날')).toHaveAccessibleDescription('해지한 날은 마지막으로 요금이 바뀐 날(2026-10-20)과 같거나 그 뒤여야 해요')
})

it('AC105: 같은 날 다시 요금을 바꾸면 기록이 하나다', async () => {
  seed({ ...base, priceKrw: 17000, priceChanges: [{ day: '2026-11-01', from: 13500, to: 17000, by: 'service' }] })
  const user = await open()
  const form = await edit(user)
  await user.clear(form.getByLabelText('요금'))
  await user.type(form.getByLabelText('요금'), '17500')
  await user.click(form.getByRole('radio', { name: '서비스가 요금을 바꿨어요' }))
  await user.click(form.getByRole('button', { name: '저장' }))
  expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0].priceChanges).toEqual([{ day: '2026-11-01', from: 13500, to: 17500, by: 'service' }])
})

it('AC105: 잘못 적어서 고쳐요는 바뀐 날을 묻지 않고 마지막 값을 고친다', async () => {
  seed({ ...base, priceKrw: 17000, priceChanges: [{ day: '2026-10-20', from: 13500, to: 17000, by: 'service' }] })
  const user = await open()
  const form = await edit(user)
  await user.clear(form.getByLabelText('요금'))
  await user.type(form.getByLabelText('요금'), '16000')
  await user.click(form.getByRole('radio', { name: '잘못 적어서 고쳐요' }))
  expect(form.queryByLabelText('바뀐 날')).not.toBeInTheDocument()
  await user.click(form.getByRole('button', { name: '저장' }))
  expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0].priceChanges).toEqual([{ day: '2026-10-20', from: 13500, to: 16000, by: 'service' }])
})
