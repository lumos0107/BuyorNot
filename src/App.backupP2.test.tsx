import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { makeBackup } from './logic/backup'
import { EMPTY_PANTRY, PANTRY_KEY, type PantryStore } from './logic/pantry'
import { EMPTY_SPENDING, SPENDING_KEY, type SpendingStore } from './logic/spending'

const now = new Date(2026, 10, 1, 9)
const stamp = now.toISOString()
const pantry: PantryStore = { ...EMPTY_PANTRY, items: [{ id: 'p1', name: '세제', kind: 'essential', level: 'plenty', purchases: [], createdAt: stamp, updatedAt: stamp }] }
const spending: SpendingStore = { ...EMPTY_SPENDING, templates: [{ id: 't1', name: '커피', kind: 'cafe', amountKrw: 4500, createdAt: stamp, updatedAt: stamp }] }
const base = { items: [], hourlyWage: null, subscriptions: [] }
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByText('기록 백업·복원')); return user }
async function choose(user: ReturnType<typeof userEvent.setup>, raw: string) {
  await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([raw], 'backup.json', { type: 'application/json' }))
  return within(await screen.findByRole('group', { name: '백업 불러오기 확인' }))
}

it('AC131: 판 3 파일을 불러오면 집에 있는 것과 자잘한 지출도 복원된다', async () => {
  const user = await open()
  const group = await choose(user, makeBackup({ ...base, pantry, spending }, now))
  await user.click(group.getByRole('button', { name: '바꾸기' }))
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}')).toEqual(pantry)
  expect(JSON.parse(localStorage.getItem(SPENDING_KEY) ?? '{}')).toEqual(spending)
})

it('AC132: 판 2 파일에서 두 새 기록이 없으면 현재 기록을 유지한다고 알린다', async () => {
  localStorage.setItem(PANTRY_KEY, JSON.stringify(pantry))
  localStorage.setItem(SPENDING_KEY, JSON.stringify(spending))
  const old = JSON.parse(makeBackup(base, now))
  old.backupVersion = 2
  delete old.pantry
  delete old.spending
  const user = await open()
  const group = await choose(user, JSON.stringify(old))
  expect(group.getByText('이 파일에는 집에 있는 것 기록이 없어 지금 기록을 그대로 둬요.')).toBeInTheDocument()
  expect(group.getByText('이 파일에는 자잘한 지출 기록이 없어 지금 기록을 그대로 둬요.')).toBeInTheDocument()
  await user.click(group.getByRole('button', { name: '바꾸기' }))
  expect(JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}')).toEqual(pantry)
  expect(JSON.parse(localStorage.getItem(SPENDING_KEY) ?? '{}')).toEqual(spending)
})
