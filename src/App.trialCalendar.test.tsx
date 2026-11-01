import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'
import { downloadText } from './ui/download'

vi.mock('./ui/download', () => ({ downloadText: vi.fn() }))
const now = new Date(2026, 10, 1, 9)
const stamp = '2026-11-01T00:00:00.000Z'
const sub = (over: Partial<Subscription> = {}): Subscription => ({ id: 's1', name: '넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 14, trialEndDate: '2026-11-14', lastUsedDate: null, createdAt: stamp, updatedAt: stamp, ...over })
const seed = (s: Subscription) => localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [s] }))
beforeEach(() => { localStorage.clear(); vi.mocked(downloadText).mockClear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
async function open() { const user = userEvent.setup(); render(<App />); await user.click(screen.getByRole('tab', { name: '고정비' })); return user }

it('AC103: 체험 중인 카드에는 전날 캘린더 줄과 안내가 있다', async () => {
  seed(sub())
  await open()
  const card = within(screen.getByRole('article', { name: '넷플릭스' }))
  const group = card.getByRole('group', { name: '체험 끝나기 전날 캘린더에 넣기:' })
  expect(group).toHaveTextContent('구글 캘린더를 누르면 고정비 이름과 날짜가 구글로 전달돼요.')
  const link = within(group).getByRole('link', { name: '구글 캘린더' })
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(link.getAttribute('href')).toContain('dates=20261113/20261114')
})

it('AC103: 캘린더 파일은 체험 끝 전날 이름으로 내려받는다', async () => {
  seed(sub())
  const user = await open()
  await user.click(within(screen.getByRole('article', { name: '넷플릭스' })).getByRole('button', { name: '캘린더 파일(.ics)' }))
  expect(downloadText).toHaveBeenCalledWith('buyornot-trial-2026-11-13.ics', expect.stringContaining('DTSTART;VALUE=DATE:20261113'), 'text/calendar;charset=utf-8')
})

it('AC103: 체험이 오늘 끝나거나 체험이 없으면 캘린더 줄이 없다', async () => {
  seed(sub({ trialEndDate: '2026-11-01' }))
  await open()
  expect(screen.queryByRole('group', { name: '체험 끝나기 전날 캘린더에 넣기:' })).not.toBeInTheDocument()
})
