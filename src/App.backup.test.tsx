import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeBackup } from './logic/backup'
import { SETTINGS_KEY } from './logic/settings'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY } from './logic/subscriptions'

// PRD F20 백업·복원
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
const backup = makeBackup(
  {
    items: [{ ...current, id: 'w1', name: '전동 칫솔', priceKrw: 59000, reason: '고장' }],
    hourlyWage: 12000,
    subscriptions: [
      {
        id: 's1',
        name: '티빙',
        priceKrw: 9500,
        cycle: 'monthly',
        billingDay: 10,
        lastUsedDate: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  },
  T0,
)

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

describe('백업·복원 (F20)', () => {
  it('백업 파일 받기: 날짜를 붙인 이름으로 지금 기록을 내려받는다', async () => {
    let blob: Blob | undefined
    let fileName = ''
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b
      return 'blob:mock'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      fileName = this.download
    })
    const user = await openBackup()
    await user.click(screen.getByRole('button', { name: '백업 파일 받기' }))
    expect(fileName).toBe('buyornot-backup-2026-10-11.json')
    const saved = JSON.parse(await readBlob(blob!))
    expect(saved.app).toBe('buyornot')
    expect(saved.wishlist.items.map((i: { name: string }) => i.name)).toEqual(['로봇청소기'])
  })

  it('불러오기: 파일 내용을 확인한 뒤 바꾸면 기록이 그 파일의 기록으로 바뀐다', async () => {
    const user = await openBackup()
    await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([backup], 'b.json', { type: 'application/json' }))
    const confirm = within(await screen.findByRole('group', { name: '백업 불러오기 확인' }))
    expect(confirm.getByText('파일 내용: 물건 기록 1건, 구독 1개, 시급 12,000원. 지금 기록을 이 파일의 기록으로 바꿀까요?')).toBeInTheDocument()
    expect(confirm.getByRole('button', { name: '바꾸기' })).toHaveFocus()
    await user.click(confirm.getByRole('button', { name: '바꾸기' }))

    expect(screen.getByRole('article', { name: '전동 칫솔' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '로봇청소기' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].name).toBe('전동 칫솔')
    expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0].name).toBe('티빙')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').hourlyWage).toBe(12000)
    const status = screen.getByRole('status', { name: '백업 상태' })
    expect(status).toHaveTextContent('백업 파일의 기록으로 바꿨어요.')
    expect(status).toHaveFocus()
  })

  it('읽을 수 없는 파일이면 알리고 아무것도 바꾸지 않는다', async () => {
    const user = await openBackup()
    const input = screen.getByLabelText('백업 파일 불러오기')
    await user.upload(input, new File(['{"app":"other"}'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByText('백업 파일을 읽을 수 없어요. 살까말까에서 받은 백업 파일인지 확인해 주세요.')).toBeInTheDocument()
    expect(input).toHaveAccessibleDescription(/백업 파일을 읽을 수 없어요/)
    expect(screen.queryByRole('group', { name: '백업 불러오기 확인' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].name).toBe('로봇청소기')
  })

  it('5MB보다 큰 파일은 읽지 않고 알린다 (보안 점검: 큰 파일로 탭이 멈추지 않게)', async () => {
    const user = await openBackup()
    const read = vi.spyOn(FileReader.prototype, 'readAsText')
    const input = screen.getByLabelText('백업 파일 불러오기')
    await user.upload(input, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.json', { type: 'application/json' }))
    expect(await screen.findByText('백업 파일이 너무 커요. 5MB 이하의 살까말까 백업 파일을 골라 주세요.')).toBeInTheDocument()
    expect(input).toHaveAccessibleDescription(/백업 파일이 너무 커요/)
    expect(read).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: '백업 불러오기 확인' })).not.toBeInTheDocument()
    read.mockRestore()
  })

  it('취소하면 아무것도 바꾸지 않고 파일 고르기로 돌아간다', async () => {
    const user = await openBackup()
    const input = screen.getByLabelText('백업 파일 불러오기')
    await user.upload(input, new File([backup], 'b.json', { type: 'application/json' }))
    const confirm = within(await screen.findByRole('group', { name: '백업 불러오기 확인' }))
    await user.click(confirm.getByRole('button', { name: '취소' }))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].name).toBe('로봇청소기')
    expect(input).toHaveFocus()
  })
})
