import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeBackup } from './logic/backup'
import { SAVINGS_KEY, type SavingsStore } from './logic/savings'
import { SETTINGS_KEY } from './logic/settings'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY } from './logic/subscriptions'

// PRD F20 보강 백업 v2 (AC99). 열기 도우미는 App.backup.test.tsx의 openBackup을 따른다
const T0 = new Date(2026, 9, 11, 9)

const current = {
  id: 'old',
  name: '로봇청소기',
  priceKrw: 450000,
  reason: '청소',
  url: null,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
  reviewAt: '2026-10-13T00:00:00.000Z',
  status: 'considering' as const,
  decidedAt: null,
}
const fileItem = { ...current, id: 'w1', name: '전동 칫솔', priceKrw: 59000, reason: '고장' }
const fileSub = {
  id: 's1',
  name: '티빙',
  priceKrw: 9500,
  cycle: 'monthly' as const,
  billingDay: 10,
  lastUsedDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}
const fileSavings: SavingsStore = {
  schemaVersion: 1,
  transfers: [{ id: 't1', day: '2026-10-20', amountKrw: 30000, direction: 'in', memo: '월급날', createdAt: '2026-10-20T01:00:00.000Z' }],
  goal: { name: '여행 자금', targetKrw: 500000, startedOn: '2026-10-01', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' },
}
const nowSavings: SavingsStore = {
  schemaVersion: 1,
  transfers: [{ id: 'now1', day: '2026-10-05', amountKrw: 12000, direction: 'in', createdAt: '2026-10-05T01:00:00.000Z' }],
  goal: null,
}

const base = { items: [fileItem], hourlyWage: 12000, subscriptions: [fileSub] }
const v2 = makeBackup({ ...base, savings: fileSavings }, T0)
// v1 모양 원문을 손으로 만든다 (backupVersion 1, savings 없음)
const v1 = JSON.stringify({
  app: 'buyornot',
  backupVersion: 1,
  exportedAt: T0.toISOString(),
  wishlist: { schemaVersion: 1, items: [fileItem] },
  settings: { schemaVersion: 1, hourlyWage: 12000 },
  subscriptions: { schemaVersion: 1, items: [fileSub] },
})
const v2With = (over: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(v2), ...over })

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [current] }))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })
}

async function openBackup() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByText('기록 백업·복원'))
  return user
}

async function choose(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([text], 'b.json', { type: 'application/json' }))
}

const confirmGroup = () => screen.findByRole('group', { name: '백업 불러오기 확인' })
const READ_ERROR = '백업 파일을 읽을 수 없어요. 살까말까에서 받은 백업 파일인지 확인해 주세요.'
const NOTE = '이 파일에는 모으기 기록이 없어 지금 모으기 기록을 그대로 둬요.'

describe('백업 v2 (F20 보강, AC99)', () => {
  it('AC99: 백업 파일에 backupVersion 2와 모으기 기록이 들어간다', async () => {
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(nowSavings))
    let blob: Blob | undefined
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b
      return 'blob:mock'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = await openBackup()
    await user.click(screen.getByRole('button', { name: '백업 파일 받기' }))
    const saved = JSON.parse(await readBlob(blob!))
    expect(saved.backupVersion).toBe(2)
    expect(saved.savings).toEqual(nowSavings)
  })

  it('AC99: 받은 v2를 불러와 바꾸면 물건·시급·고정비·모으기가 같은 기록이다', async () => {
    const user = await openBackup()
    await choose(user, v2)
    const confirm = within(await confirmGroup())
    expect(confirm.getByText('파일 내용: 물건 기록 1건, 구독 1개, 시급 12,000원. 지금 기록을 이 파일의 기록으로 바꿀까요?')).toBeInTheDocument()
    expect(confirm.queryByText(NOTE)).not.toBeInTheDocument()
    await user.click(confirm.getByRole('button', { name: '바꾸기' }))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items).toEqual([fileItem])
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').hourlyWage).toBe(12000)
    expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items).toEqual([fileSub])
    expect(JSON.parse(localStorage.getItem(SAVINGS_KEY) ?? '{}')).toEqual(fileSavings)
    expect(screen.getByRole('status', { name: '백업 상태' })).toHaveTextContent('백업 파일의 기록으로 바꿨어요.')
  })

  it('AC99: v1 파일을 고르면 확인 문장 아래 따로 된 줄로 모으기를 그대로 둔다고 알린다', async () => {
    const user = await openBackup()
    await choose(user, v1)
    const group = await confirmGroup()
    const sentence = within(group).getByText('파일 내용: 물건 기록 1건, 구독 1개, 시급 12,000원. 지금 기록을 이 파일의 기록으로 바꿀까요?')
    const note = within(group).getByText(NOTE)
    expect(note).not.toBe(sentence)
    // 둘째 줄은 확인 문장 바로 아래
    expect(sentence.nextElementSibling).toBe(note)
  })

  it('AC99: v1을 바꾸면 모으기는 그대로다', async () => {
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(nowSavings))
    const user = await openBackup()
    await choose(user, v1)
    await user.click(within(await confirmGroup()).getByRole('button', { name: '바꾸기' }))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items).toEqual([fileItem])
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').hourlyWage).toBe(12000)
    expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items).toEqual([fileSub])
    expect(JSON.parse(localStorage.getItem(SAVINGS_KEY) ?? '{}')).toEqual(nowSavings)
    expect(screen.getByRole('status', { name: '백업 상태' })).toHaveTextContent('백업 파일의 기록으로 바꿨어요.')
  })

  it('AC99: 모으기가 손상된 v2, 판 3, 모으기 없는 v2는 읽을 수 없다는 오류이고 아무것도 바뀌지 않는다', async () => {
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(nowSavings))
    const user = await openBackup()
    const input = screen.getByLabelText('백업 파일 불러오기')
    const cases = [
      v2With({ savings: { ...fileSavings, transfers: [{ ...fileSavings.transfers[0], amountKrw: -1 }] } }),
      v2With({ backupVersion: 3 }),
      v2With({ savings: undefined }),
    ]
    for (const text of cases) {
      await choose(user, text)
      expect(await screen.findByText(READ_ERROR)).toBeInTheDocument()
      expect(input).toHaveAccessibleDescription(/백업 파일을 읽을 수 없어요/)
      expect(screen.queryByRole('group', { name: '백업 불러오기 확인' })).not.toBeInTheDocument()
    }
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].name).toBe('로봇청소기')
    expect(localStorage.getItem(SUBS_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem(SAVINGS_KEY) ?? '{}')).toEqual(nowSavings)
  })

  it('AC99: 모으기만 저장에 실패하면 모으기 기록을 저장하지 못했다고 알린다', async () => {
    const user = await openBackup()
    await choose(user, v2)
    const confirm = within(await confirmGroup())
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === SAVINGS_KEY) throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    await user.click(confirm.getByRole('button', { name: '바꾸기' }))
    expect(screen.getByRole('status', { name: '백업 상태' })).toHaveTextContent(
      '백업 파일의 기록으로 바꿨지만 모으기 기록을 저장하지 못했어요. 각 화면의 저장 안내를 확인해 주세요.',
    )
  })

  it('AC99: 구독과 모으기 저장에 실패하면 둘을 함께 알린다', async () => {
    const user = await openBackup()
    await choose(user, v2)
    const confirm = within(await confirmGroup())
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === SUBS_KEY || key === SAVINGS_KEY) throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    await user.click(confirm.getByRole('button', { name: '바꾸기' }))
    expect(screen.getByRole('status', { name: '백업 상태' })).toHaveTextContent(
      '백업 파일의 기록으로 바꿨지만 구독·모으기 기록을 저장하지 못했어요. 각 화면의 저장 안내를 확인해 주세요.',
    )
  })
})
