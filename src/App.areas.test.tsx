import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

const today = new Date(2026, 10, 1, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const sub = (id: string, name: string, priceKrw: number, areas?: Subscription['areas']): Subscription => ({ id, name, priceKrw, kind: 'membership', cycle: 'monthly', billingDay: 15, lastUsedDate: null, ...(areas ? { areas } : {}), createdAt: stamp, updatedAt: stamp })
const first = sub('a', '배달의민족 배민클럽', 3990, ['delivery'])
const second = sub('b', '쿠팡 와우 멤버십', 7890, ['shopping', 'delivery'])
const seed = (...items: Subscription[]) => localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items }))
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => { vi.useRealTimers() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '고정비' })); return user }

it('AC109: 배달에 쓰는 멤버십 둘은 요약과 카드에 겹침이 보인다', async () => {
  seed(first, second)
  await open()
  const summary = within(screen.getByRole('region', { name: '고정비 요약' }))
  expect(summary.getByText('같은 곳에 쓰는 구독·멤버십: 배달 2개(배달의민족 배민클럽, 쿠팡 와우 멤버십) · 월 11,880원')).toBeInTheDocument()
  expect(summary.getByText('모두 쓰는지는 각 카드의 사용 기록에서 볼 수 있어요.')).toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: '배달의민족 배민클럽' })).getByText('배달에 쓰는 것이 하나 더 있어요: 쿠팡 와우 멤버십')).toBeInTheDocument()
})

it('AC109: 하나를 해지하면 겹침 줄이 사라진다', async () => {
  seed(first, second)
  const user = await open()
  await user.click(within(screen.getByRole('article', { name: '배달의민족 배민클럽' })).getByRole('button', { name: '해지했어요' }))
  await user.click(within(screen.getByRole('article', { name: '배달의민족 배민클럽' })).getByRole('button', { name: '옮기기' }))
  expect(screen.queryByText(/같은 곳에 쓰는 구독·멤버십: 배달/)).not.toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: '쿠팡 와우 멤버십' })).queryByText(/배달에 쓰는 것이/)).not.toBeInTheDocument()
})

it('AC110: 쓰는 곳을 저장하면 수정 폼에 체크되고 통신 폼에는 없다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '고정비 담기' }))
  await user.selectOptions(form.getByLabelText('종류'), 'membership')
  await user.type(form.getByLabelText('이름'), '배민클럽')
  await user.type(form.getByLabelText('요금'), '3990')
  await user.type(form.getByLabelText('결제일 (매월)'), '15')
  await user.click(form.getByText('쓰는 곳 (선택) · 후보 보기'))
  await user.click(form.getByRole('checkbox', { name: '배달' }))
  await user.click(form.getByRole('button', { name: '고정비 추가' }))
  expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0].areas).toEqual(['delivery'])
  await user.click(within(screen.getByRole('article', { name: '배민클럽' })).getByRole('button', { name: '수정' }))
  const editor = within(screen.getByRole('form', { name: '고정비 수정' }))
  await user.click(editor.getByText('쓰는 곳 (선택) · 1개 선택'))
  expect(editor.getByRole('checkbox', { name: '배달' })).toBeChecked()
})

it('AC149: 쓰는 곳 후보를 눌러 펼치고 접어도 여러 선택이 유지된다', async () => {
  const user = await open()
  const form = within(screen.getByRole('form', { name: '고정비 담기' }))
  const trigger = form.getByText('쓰는 곳 (선택) · 후보 보기')
  expect(trigger.closest('details')).not.toHaveAttribute('open')
  await user.click(trigger)
  expect(trigger.closest('details')).toHaveAttribute('open')
  await user.click(form.getByRole('checkbox', { name: '배달' }))
  await user.click(form.getByRole('checkbox', { name: '쇼핑' }))
  const selected = form.getByText('쓰는 곳 (선택) · 2개 선택')
  await user.click(selected)
  expect(selected.closest('details')).not.toHaveAttribute('open')
  await user.click(selected)
  expect(form.getByRole('checkbox', { name: '배달' })).toBeChecked()
  expect(form.getByRole('checkbox', { name: '쇼핑' })).toBeChecked()
})
