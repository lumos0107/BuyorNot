import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderWishlistApp } from './test/renderWishlistApp'
import { makeBackup } from './logic/backup'
import { BENEFITS_KEY, EMPTY_BENEFITS, type BenefitsStore } from './logic/benefits'

const now = new Date(2026, 10, 2, 9)
const base = { items: [], hourlyWage: null, subscriptions: [] }
const benefits: BenefitsStore = { ...EMPTY_BENEFITS, programs: [{ id: 'energy', checkedOn: '2026-11-02', status: 'receiving', receivedKrw: 100000 }] }
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers() })

async function choose(raw: string) {
  const user = userEvent.setup()
  renderWishlistApp()
  await user.click(screen.getByText('기록 백업·복원'))
  await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([raw], 'backup.json', { type: 'application/json' }))
  const group = within(await screen.findByRole('group', { name: '백업 불러오기 확인' }))
  return { user, group }
}

it('AC162: 새 판 3 백업에서 받은 지원금 기록을 복원한다', async () => {
  const { user, group } = await choose(makeBackup({ ...base, benefits }, now))
  await user.click(group.getByRole('button', { name: '바꾸기' }))
  expect(JSON.parse(localStorage.getItem(BENEFITS_KEY) ?? '{}')).toEqual(benefits)
})

it('AC162: 받을 수 있는 돈이 없는 옛 판 3은 현재 기록을 유지한다고 알린다', async () => {
  localStorage.setItem(BENEFITS_KEY, JSON.stringify(benefits))
  const old = JSON.parse(makeBackup(base, now))
  delete old.benefits
  const { user, group } = await choose(JSON.stringify(old))
  expect(group.getByText('이 파일에는 받을 수 있는 돈 기록이 없어 지금 기록을 그대로 둬요.')).toBeInTheDocument()
  await user.click(group.getByRole('button', { name: '바꾸기' }))
  expect(JSON.parse(localStorage.getItem(BENEFITS_KEY) ?? '{}')).toEqual(benefits)
})
