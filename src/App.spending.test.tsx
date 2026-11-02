import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SPENDING_KEY } from './logic/spending'

const today = new Date(2026, 10, 1, 9)
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(today) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '모으기' })); return user }
async function addCoffee(user: ReturnType<typeof userEvent.setup>) {
  const form = within(screen.getByRole('form', { name: '자잘한 지출 버튼 만들기' }))
  await user.type(form.getByLabelText('이름'), '커피')
  await user.selectOptions(form.getByLabelText('곳 종류'), 'cafe')
  await user.type(form.getByLabelText('금액'), '4500')
  await user.click(form.getByRole('button', { name: '만들기' }))
}

it('AC127: 커피 버튼에서 썼어요를 누르면 이번 달 카페 횟수·금액이 보인다', async () => {
  const user = await open()
  await addCoffee(user)
  await user.click(screen.getByRole('button', { name: '커피 썼어요' }))
  expect(screen.getByText('이번 달 카페 1번 · 4,500원')).toBeInTheDocument()
  expect(screen.getByText('지난달 같은 날까지 카페 0번 · 0원')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(SPENDING_KEY) ?? '{}').entries).toHaveLength(1)
})

it('AC128: 참았어요는 실제 옮긴 돈과 별도 카드로 보인다', async () => {
  const user = await open()
  await addCoffee(user)
  await user.click(screen.getByRole('button', { name: '커피 참았어요' }))
  expect(screen.getByText('참았다고 적은 작은 지출')).toBeInTheDocument()
  expect(screen.getByText('4,500원')).toBeInTheDocument()
  expect(screen.getByText('참았다고 적은 금액은 실제로 옮긴 돈이 아니에요.')).toBeInTheDocument()
})

it('AC127: 지출 기록은 확인 뒤 지우고 이번 달 합계에서 빠진다', async () => {
  const user = await open()
  await addCoffee(user)
  await user.click(screen.getByRole('button', { name: '커피 썼어요' }))
  await user.click(screen.getByText('자잘한 지출 기록 (1건)'))
  await user.click(screen.getByRole('button', { name: '2026-11-01 커피 기록 지우기' }))
  const confirm = within(screen.getByRole('group', { name: '자잘한 지출 기록 지우기 확인' }))
  await user.click(confirm.getByRole('button', { name: '지우기' }))
  expect(screen.getByText('이번 달 카페 0번 · 0원')).toBeInTheDocument()
})

it('AC128: 다른 탭이 먼저 적으면 이 탭의 썼어요를 덮어쓰지 않는다', async () => {
  const user = await open()
  await addCoffee(user)
  const current = JSON.parse(localStorage.getItem(SPENDING_KEY) ?? '{}')
  const other = JSON.stringify({ ...current, entries: [{ id: 'other', templateId: current.templates[0].id, name: '커피', kind: 'cafe', amountKrw: 4500, day: '2026-11-01', action: 'spent', createdAt: today.toISOString() }] })
  localStorage.setItem(SPENDING_KEY, other)
  await user.click(screen.getByRole('button', { name: '커피 썼어요' }))
  expect(localStorage.getItem(SPENDING_KEY)).toBe(other)
  expect(screen.getByRole('status', { name: '자잘한 지출 저장 상태' })).toHaveTextContent('다른 탭에서 저장한 자잘한 지출 기록을 불러왔어요.')
  expect(screen.getByRole('status', { name: '자잘한 지출 알림' })).toBeEmptyDOMElement()
})

it('AC184: 지난주 두 번 썼으면 이번 주 한 번 덜 쓰기 문장을 보인다', async () => {
  const stamp = today.toISOString()
  localStorage.setItem(SPENDING_KEY, JSON.stringify({ schemaVersion: 1, templates: [{ id: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, createdAt: stamp, updatedAt: stamp }], entries: [
    { id: 'e1', templateId: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, day: '2026-10-20', action: 'spent', createdAt: stamp },
    { id: 'e2', templateId: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, day: '2026-10-25', action: 'spent', createdAt: stamp },
  ] }))
  const user = await open()
  await user.click(screen.getByRole('button', { name: '커피 썼어요' }))
  expect(within(screen.getByRole('group', { name: '커피' })).getByText('직전 7일 2번 · 최근 7일 1번 · 이번에는 1번까지 시도해 보세요.')).toBeInTheDocument()
})

it('AC192·AC194: 한 주 시도 선택은 새로고침 뒤에도 남고 버튼을 지우면 없어진다', async () => {
  const stamp = today.toISOString()
  localStorage.setItem(SPENDING_KEY, JSON.stringify({ schemaVersion: 1, templates: [{ id: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, createdAt: stamp, updatedAt: stamp }], entries: [
    { id: 'e1', templateId: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, day: '2026-10-25', action: 'spent', createdAt: stamp },
    { id: 'e2', templateId: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, day: '2026-10-31', action: 'spent', createdAt: stamp },
  ] }))
  const user = await open()
  await user.click(screen.getByRole('button', { name: '커피 한 주 시도 시작' }))
  expect(screen.getByText('이번 주 시도 · 이전 7일 2번 · 목표 1번 이하 · 지금 0번')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(SPENDING_KEY) ?? '{}').experiment.templateId).toBe('t1')
  const { cleanup } = await import('@testing-library/react')
  cleanup()
  await open()
  expect(screen.getByText('이번 주 시도 · 이전 7일 2번 · 목표 1번 이하 · 지금 0번')).toBeInTheDocument()
  await user.click(within(screen.getByRole('group', { name: '커피' })).getByRole('button', { name: '지우기' }))
  await user.click(within(screen.getByRole('group', { name: '자잘한 지출 버튼 지우기 확인' })).getByRole('button', { name: '지우기' }))
  expect(JSON.parse(localStorage.getItem(SPENDING_KEY) ?? '{}')).not.toHaveProperty('experiment')
})

it('AC194: 다른 버튼을 고르면 한 주 시도가 바뀌고 중단하면 선택이 사라진다', async () => {
  const stamp = today.toISOString()
  localStorage.setItem(SPENDING_KEY, JSON.stringify({ schemaVersion: 1, templates: [
    { id: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, createdAt: stamp, updatedAt: stamp },
    { id: 't2', name: '배달', kind: 'delivery', amountKrw: 20000, createdAt: stamp, updatedAt: stamp },
  ], entries: [
    { id: 'e1', templateId: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, day: '2026-10-31', action: 'spent', createdAt: stamp },
    { id: 'e2', templateId: 't2', name: '배달', kind: 'delivery', amountKrw: 20000, day: '2026-10-31', action: 'spent', createdAt: stamp },
  ] }))
  const user = await open()
  await user.click(screen.getByRole('button', { name: '커피 한 주 시도 시작' }))
  await user.click(screen.getByRole('button', { name: '배달 한 주 시도 시작' }))
  expect(JSON.parse(localStorage.getItem(SPENDING_KEY) ?? '{}').experiment.templateId).toBe('t2')
  await user.click(screen.getByRole('button', { name: '배달 시도 중단' }))
  expect(JSON.parse(localStorage.getItem(SPENDING_KEY) ?? '{}')).not.toHaveProperty('experiment')
})
