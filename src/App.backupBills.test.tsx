import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { makeBackup } from './logic/backup'
import { BILLS_KEY, type BillsStore } from './logic/bills'

const now = new Date(2026, 10, 1, 9)
const bills: BillsStore = { schemaVersion: 1, items: [{ id: 'b1', kind: 'electric', month: '2026-10', amountKrw: 42300, createdAt: now.toISOString(), updatedAt: now.toISOString() }] }
const base = { items: [], hourlyWage: null, subscriptions: [] }
const asV2 = (raw: string) => {
  const old = JSON.parse(raw)
  old.backupVersion = 2
  delete old.pantry
  delete old.spending
  return JSON.stringify(old)
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

async function openBackup() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByText('기록 백업·복원'))
  return user
}
async function choose(user: ReturnType<typeof userEvent.setup>, raw: string) {
  await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([raw], 'backup.json', { type: 'application/json' }))
  return within(await screen.findByRole('group', { name: '백업 불러오기 확인' }))
}

it('AC116: 받은 v2 파일을 불러오면 공과금 기록까지 같다', async () => {
  const user = await openBackup()
  const group = await choose(user, asV2(makeBackup({ ...base, bills }, now)))
  await user.click(group.getByRole('button', { name: '바꾸기' }))
  expect(JSON.parse(localStorage.getItem(BILLS_KEY) ?? '{}')).toEqual(bills)
  expect(screen.getByRole('status', { name: '백업 상태' })).toHaveTextContent('백업 파일의 기록으로 바꿨어요.')
})

it('AC116: 공과금이 없는 옛 v2를 고르면 안내하고 지금 공과금은 그대로 둔다', async () => {
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills))
  const old = JSON.parse(asV2(makeBackup(base, now)))
  delete old.bills
  const user = await openBackup()
  const group = await choose(user, JSON.stringify(old))
  expect(group.getByText('이 파일에는 공과금 기록이 없어 지금 공과금 기록을 그대로 둬요.')).toBeInTheDocument()
  await user.click(group.getByRole('button', { name: '바꾸기' }))
  expect(JSON.parse(localStorage.getItem(BILLS_KEY) ?? '{}')).toEqual(bills)
})

it('AC116: 손상된 공과금이 든 v2는 전체를 읽지 않는다', async () => {
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills))
  const bad = JSON.parse(asV2(makeBackup(base, now)))
  bad.bills = { ...bills, items: [{ ...bills.items[0], amountKrw: 0 }] }
  const user = await openBackup()
  await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([JSON.stringify(bad)], 'bad.json', { type: 'application/json' }))
  expect(await screen.findByText('백업 파일을 읽을 수 없어요. 살까말까에서 받은 백업 파일인지 확인해 주세요.')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(BILLS_KEY) ?? '{}')).toEqual(bills)
})
