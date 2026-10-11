import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY } from './logic/subscriptions'

// 여러 탭에서 같은 기록을 쓸 때 (GPT 10~11단계 2차 검토 반영):
// 다른 탭의 저장을 말없이 덮어쓰거나, 이 탭에서 저장하지 못한 변경을 말없이 버리지 않는다
const T0 = new Date('2026-10-11T09:00:00+09:00')
const DAY = 24 * 60 * 60 * 1000
const iso = (ms: number) => new Date(ms).toISOString()

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const card = (name: string) => within(screen.getByRole('article', { name }))
const subsForm = () => within(screen.getByRole('form', { name: '구독 담기' }))
const wishForm = () => within(screen.getByRole('form', { name: '물건 담기' }))
const saved = (key: string) => JSON.parse(localStorage.getItem(key) ?? '{}')
const names = (key: string) => saved(key).items.map((i: { name: string }) => i.name)

const sub = (over: Record<string, unknown>) => ({
  id: 's1',
  name: '넷플릭스',
  priceKrw: 13500,
  cycle: 'monthly',
  billingDay: 15,
  lastUsedDate: null,
  createdAt: iso(T0.getTime() - 30 * DAY),
  updatedAt: iso(T0.getTime() - 30 * DAY),
  ...over,
})

const wish = (over: Record<string, unknown>) => ({
  id: 'w1',
  name: '전동 칫솔',
  priceKrw: 59000,
  reason: '쓰던 게 고장 났다',
  url: null,
  createdAt: iso(T0.getTime() - DAY),
  updatedAt: iso(T0.getTime() - DAY),
  reviewAt: iso(T0.getTime() + 2 * DAY),
  status: 'considering',
  decidedAt: null,
  ...over,
})

const store = (...items: unknown[]) => JSON.stringify({ schemaVersion: 1, items })

// 다른 탭이 저장한 것처럼 값을 바꾼다. event를 주면 storage 이벤트도 보낸다
function otherTabWrites(key: string, value: string, event = true) {
  localStorage.setItem(key, value)
  if (event) {
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key }))
    })
  }
}

async function addMonthly(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(subsForm().getByLabelText('구독 이름'), name)
  await user.type(subsForm().getByLabelText('요금'), '9900')
  await user.type(subsForm().getByLabelText('결제일 (매월)'), '5')
  await user.click(subsForm().getByRole('button', { name: '구독 추가' }))
}

async function addWish(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(wishForm().getByLabelText('상품명'), name)
  await user.type(wishForm().getByLabelText('가격'), '30000')
  await user.type(wishForm().getByLabelText('사고 싶은 이유'), '이유')
  await user.click(wishForm().getByRole('button', { name: '담아 두기' }))
}

describe('구독: 여러 탭', () => {
  async function openSubs() {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '구독' }))
    return user
  }

  it('알림이 오기 전에 다른 탭이 저장했으면 덮어쓰지 않고, 그 내용을 불러와 알린다', async () => {
    localStorage.setItem(SUBS_KEY, store(sub({})))
    const user = await openSubs()
    otherTabWrites(SUBS_KEY, store(sub({}), sub({ id: 's2', name: '왓챠' })), false)
    await addMonthly(user, '유튜브')
    expect(names(SUBS_KEY)).toEqual(['넷플릭스', '왓챠'])
    expect(screen.getByRole('article', { name: '왓챠' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '유튜브' })).not.toBeInTheDocument()
    const banner = within(screen.getByRole('status', { name: '구독 저장 상태' }))
    expect(banner.getByText(/다른 탭에서 저장한 구독을 불러왔어요/)).toBeInTheDocument()
    await user.click(banner.getByRole('button', { name: '확인' }))
    expect(screen.queryByRole('status', { name: '구독 저장 상태' })).not.toBeInTheDocument()
  })

  it('저장하지 못한 변경이 있을 때 다른 탭이 저장하면, 그 내용을 불러오고 이 탭의 변경이 반영되지 않았다고 알린다', async () => {
    const user = await openSubs()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await addMonthly(user, '유튜브')
    spy.mockRestore()
    otherTabWrites(SUBS_KEY, store(sub({ name: '왓챠' })))
    expect(screen.getByRole('article', { name: '왓챠' })).toBeInTheDocument()
    const banner = within(screen.getByRole('status', { name: '구독 저장 상태' }))
    expect(banner.getByText(/저장하지 않은 변경은 반영되지 않았어요/)).toBeInTheDocument()
  })

  it('다른 탭이 읽을 수 없는 값을 저장하면 손상으로 알리고, 이후 추가해도 덮어쓰지 않는다', async () => {
    const user = await openSubs()
    otherTabWrites(SUBS_KEY, '{"schemaVersion":2}')
    expect(within(screen.getByRole('status', { name: '구독 저장 상태' })).getByText(/저장된 구독을 읽을 수 없어요/)).toBeInTheDocument()
    await addMonthly(user, '유튜브')
    expect(localStorage.getItem(SUBS_KEY)).toBe('{"schemaVersion":2}')
  })

  it('수정 폼을 연 뒤 다른 탭에서 같은 구독이 바뀌면 저장을 멈추고 알린다', async () => {
    localStorage.setItem(SUBS_KEY, store(sub({})))
    const user = await openSubs()
    await user.click(card('넷플릭스').getByRole('button', { name: '수정' }))
    otherTabWrites(SUBS_KEY, store(sub({ priceKrw: 17000, updatedAt: iso(T0.getTime()) })))
    const editor = within(screen.getByRole('form', { name: '구독 수정' }))
    await user.type(editor.getByLabelText('메모 (선택)'), '가족 공유')
    await user.click(editor.getByRole('button', { name: '저장' }))
    expect(editor.getByRole('alert')).toHaveTextContent('다른 탭에서 이 구독이 바뀌었어요')
    expect(saved(SUBS_KEY).items[0]).toMatchObject({ priceKrw: 17000 })
    expect(saved(SUBS_KEY).items[0].memo).toBeUndefined()
  })

  it('갱신일 당일에 연 수정 폼을 다음 날 저장해도, 날짜를 바꾸지 않았으면 원래 기준일로 저장된다', async () => {
    localStorage.setItem(SUBS_KEY, store(sub({ name: '클라우드', priceKrw: 120000, cycle: 'yearly', billingDay: undefined, renewalDate: '2025-10-11' })))
    const user = await openSubs()
    expect(card('클라우드').getByText('다음 결제 2026-10-11 · D-0')).toBeInTheDocument()
    await user.click(card('클라우드').getByRole('button', { name: '수정' }))
    vi.setSystemTime(new Date(T0.getTime() + DAY))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    const editor = within(screen.getByRole('form', { name: '구독 수정' }))
    expect(editor.getByLabelText('다음 갱신일')).toHaveValue('2026-10-11')
    await user.type(editor.getByLabelText('메모 (선택)'), '가족 공유')
    await user.click(editor.getByRole('button', { name: '저장' }))
    expect(screen.queryByRole('form', { name: '구독 수정' })).not.toBeInTheDocument()
    expect(saved(SUBS_KEY).items[0]).toMatchObject({ renewalDate: '2025-10-11', memo: '가족 공유' })
  })
})

describe('물건 기록: 여러 탭', () => {
  it('알림이 오기 전에 다른 탭이 저장했으면 덮어쓰지 않고, 그 내용을 불러와 알린다', async () => {
    localStorage.setItem(STORAGE_KEY, store(wish({})))
    const user = userEvent.setup()
    render(<App />)
    otherTabWrites(STORAGE_KEY, store(wish({}), wish({ id: 'w2', name: '전기 포트' })), false)
    await addWish(user, '무선 헤드폰')
    expect(names(STORAGE_KEY)).toEqual(['전동 칫솔', '전기 포트'])
    expect(screen.getByRole('article', { name: '전기 포트' })).toBeInTheDocument()
    const banner = within(screen.getByRole('status', { name: '저장 상태' }))
    expect(banner.getByText(/다른 탭에서 저장한 기록을 불러왔어요/)).toBeInTheDocument()
    await user.click(banner.getByRole('button', { name: '확인' }))
    expect(screen.queryByRole('status', { name: '저장 상태' })).not.toBeInTheDocument()
  })

  it('저장하지 못한 변경이 있을 때 다른 탭이 저장하면, 그 내용을 불러오고 이 탭의 변경이 반영되지 않았다고 알린다', async () => {
    const user = userEvent.setup()
    render(<App />)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await addWish(user, '무선 헤드폰')
    spy.mockRestore()
    otherTabWrites(STORAGE_KEY, store(wish({ name: '전기 포트' })))
    expect(screen.getByRole('article', { name: '전기 포트' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('status', { name: '저장 상태' })).getByText(/저장하지 않은 변경은 반영되지 않았어요/)).toBeInTheDocument()
  })

  it('다른 탭이 읽을 수 없는 값을 저장하면 손상으로 알리고, 이후 담아도 덮어쓰지 않는다', async () => {
    const user = userEvent.setup()
    render(<App />)
    otherTabWrites(STORAGE_KEY, '{"schemaVersion":2}')
    expect(within(screen.getByRole('status', { name: '저장 상태' })).getByText(/저장된 기록을 읽을 수 없어요/)).toBeInTheDocument()
    await addWish(user, '무선 헤드폰')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{"schemaVersion":2}')
  })

  it('물건 수정 폼을 연 뒤 다른 탭에서 같은 물건이 바뀌면 저장을 멈추고 알린다', async () => {
    localStorage.setItem(STORAGE_KEY, store(wish({})))
    const user = userEvent.setup()
    render(<App />)
    await user.click(card('전동 칫솔').getByRole('button', { name: '수정' }))
    otherTabWrites(STORAGE_KEY, store(wish({ priceKrw: 49000, updatedAt: iso(T0.getTime()) })))
    const editor = within(screen.getByRole('form', { name: '물건 수정' }))
    await user.type(editor.getByLabelText('사고 싶은 이유'), ' 급함')
    await user.click(editor.getByRole('button', { name: '저장' }))
    expect(editor.getByRole('alert')).toHaveTextContent('다른 탭에서 이 물건이 바뀌었어요')
    expect(saved(STORAGE_KEY).items[0]).toMatchObject({ priceKrw: 49000, reason: '쓰던 게 고장 났다' })
  })

  it('회고를 고치는 중에 다른 탭에서 같은 기록이 바뀌면 저장을 멈추고 알린다', async () => {
    const bought = wish({
      name: '전기 포트',
      status: 'purchased',
      createdAt: iso(T0.getTime() - 12 * DAY),
      updatedAt: iso(T0.getTime() - 8 * DAY),
      decidedAt: iso(T0.getTime() - 8 * DAY),
      reviewAt: iso(T0.getTime() - 9 * DAY),
      satisfaction: 'good',
    })
    localStorage.setItem(STORAGE_KEY, store(bought))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    await user.click(card('전기 포트').getByRole('button', { name: '회고 고치기' }))
    otherTabWrites(STORAGE_KEY, store({ ...bought, satisfaction: 'regret', updatedAt: iso(T0.getTime()) }))
    const retro = within(screen.getByRole('form', { name: '구매 후 회고' }))
    await user.click(retro.getByRole('radio', { name: '그저 그래요' }))
    await user.click(retro.getByRole('button', { name: '회고 저장' }))
    expect(retro.getByRole('alert')).toHaveTextContent('다른 탭에서 이 기록이 바뀌었어요')
    expect(saved(STORAGE_KEY).items[0].satisfaction).toBe('regret')
  })
})

it('수정 폼 저장 경고는 취소하면 사라지고, 다시 열면 바뀐 내용으로 고칠 수 있다', async () => {
  localStorage.setItem(SUBS_KEY, store(sub({})))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '구독' }))
  await user.click(card('넷플릭스').getByRole('button', { name: '수정' }))
  otherTabWrites(SUBS_KEY, store(sub({ priceKrw: 17000, updatedAt: iso(T0.getTime()) })))
  await user.click(within(screen.getByRole('form', { name: '구독 수정' })).getByRole('button', { name: '저장' }))
  await user.click(within(screen.getByRole('form', { name: '구독 수정' })).getByRole('button', { name: '취소' }))
  await user.click(card('넷플릭스').getByRole('button', { name: '수정' }))
  const editor = within(screen.getByRole('form', { name: '구독 수정' }))
  expect(editor.getByLabelText('요금')).toHaveValue('17000')
  fireEvent.change(editor.getByLabelText('메모 (선택)'), { target: { value: '가족 공유' } })
  await user.click(editor.getByRole('button', { name: '저장' }))
  expect(saved(SUBS_KEY).items[0]).toMatchObject({ priceKrw: 17000, memo: '가족 공유' })
})

describe('손상 상태와 다른 탭', () => {
  it('손상 상태에서 화면에만 담은 물건은 다른 탭이 정상 저장하면 반영되지 않았다고 알린다', async () => {
    localStorage.setItem(STORAGE_KEY, '{bad')
    const user = userEvent.setup()
    render(<App />)
    await addWish(user, '무선 헤드폰')
    otherTabWrites(STORAGE_KEY, store(wish({ name: '전기 포트' })))
    expect(screen.getByRole('article', { name: '전기 포트' })).toBeInTheDocument()
    expect(within(screen.getByRole('status', { name: '저장 상태' })).getByText(/저장하지 않은 변경은 반영되지 않았어요/)).toBeInTheDocument()
  })

  it('손상 상태에서 구독을 화면에만 넣었을 때 다른 탭이 정상 저장해도 알린다', async () => {
    localStorage.setItem(SUBS_KEY, '{bad')
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '구독' }))
    await addMonthly(user, '유튜브')
    otherTabWrites(SUBS_KEY, store(sub({ name: '왓챠' })))
    expect(screen.getByRole('article', { name: '왓챠' })).toBeInTheDocument()
    expect(within(screen.getByRole('status', { name: '구독 저장 상태' })).getByText(/저장하지 않은 변경은 반영되지 않았어요/)).toBeInTheDocument()
  })

  it('손상 상태에서 아무것도 바꾸지 않았다면 다른 탭이 정상 저장했을 때 안내 없이 맞춘다', async () => {
    localStorage.setItem(STORAGE_KEY, '{bad')
    render(<App />)
    otherTabWrites(STORAGE_KEY, store(wish({ name: '전기 포트' })))
    expect(screen.getByRole('article', { name: '전기 포트' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '저장 상태' })).not.toBeInTheDocument()
  })

  it('초기화를 누르기 직전에 다른 탭이 정상 기록을 저장했다면 덮어쓰지 않고 그 기록을 불러온다', async () => {
    localStorage.setItem(STORAGE_KEY, '{bad')
    const user = userEvent.setup()
    render(<App />)
    const banner = within(screen.getByRole('status', { name: '저장 상태' }))
    await user.click(banner.getByRole('button', { name: '기록 초기화' }))
    otherTabWrites(STORAGE_KEY, store(wish({ name: '전기 포트' })), false)
    await user.click(banner.getByRole('button', { name: '초기화' }))
    expect(names(STORAGE_KEY)).toEqual(['전기 포트'])
    expect(screen.getByRole('article', { name: '전기 포트' })).toBeInTheDocument()
  })

  it('구독 초기화도 직전에 다른 탭이 정상 저장했다면 덮어쓰지 않는다', async () => {
    localStorage.setItem(SUBS_KEY, '{bad')
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '구독' }))
    const banner = within(screen.getByRole('status', { name: '구독 저장 상태' }))
    await user.click(banner.getByRole('button', { name: '구독 기록 초기화' }))
    otherTabWrites(SUBS_KEY, store(sub({ name: '왓챠' })), false)
    await user.click(banner.getByRole('button', { name: '초기화' }))
    expect(names(SUBS_KEY)).toEqual(['왓챠'])
    expect(screen.getByRole('article', { name: '왓챠' })).toBeInTheDocument()
  })
})

describe('수정 폼의 바뀜 판단과 처음 회고', () => {
  it('기록 시각이 같아도 내용이 바뀌었으면 구독 수정을 멈추고 알린다', async () => {
    localStorage.setItem(SUBS_KEY, store(sub({})))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '구독' }))
    await user.click(card('넷플릭스').getByRole('button', { name: '수정' }))
    otherTabWrites(SUBS_KEY, store(sub({ priceKrw: 17000 })))
    const editor = within(screen.getByRole('form', { name: '구독 수정' }))
    await user.click(editor.getByRole('button', { name: '저장' }))
    expect(editor.getByRole('alert')).toHaveTextContent('다른 탭에서 이 구독이 바뀌었어요')
    expect(saved(SUBS_KEY).items[0].priceKrw).toBe(17000)
  })

  it('처음 회고를 고르던 중 다른 탭이 먼저 회고를 저장하면, 폼을 닫지 않고 저장할 때 알린다', async () => {
    const bought = wish({
      name: '전기 포트',
      status: 'purchased',
      createdAt: iso(T0.getTime() - 12 * DAY),
      updatedAt: iso(T0.getTime() - 8 * DAY),
      decidedAt: iso(T0.getTime() - 8 * DAY),
      reviewAt: iso(T0.getTime() - 9 * DAY),
    })
    localStorage.setItem(STORAGE_KEY, store(bought))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    await user.click(card('전기 포트').getByRole('radio', { name: '잘 샀어요' }))
    otherTabWrites(STORAGE_KEY, store({ ...bought, satisfaction: 'regret', updatedAt: iso(T0.getTime()) }))
    const retro = within(screen.getByRole('form', { name: '구매 후 회고' }))
    await user.click(retro.getByRole('button', { name: '회고 저장' }))
    expect(retro.getByRole('alert')).toHaveTextContent('다른 탭에서 이 기록이 바뀌었어요')
    expect(saved(STORAGE_KEY).items[0].satisfaction).toBe('regret')
    await user.click(retro.getByRole('button', { name: '취소' }))
    expect(card('전기 포트').getByText(/회고: 후회해요/)).toBeInTheDocument()
  })

  it('처음 회고를 아직 건드리지 않았다면 다른 탭이 저장한 회고로 바로 바뀐다', async () => {
    const bought = wish({
      name: '전기 포트',
      status: 'purchased',
      createdAt: iso(T0.getTime() - 12 * DAY),
      updatedAt: iso(T0.getTime() - 8 * DAY),
      decidedAt: iso(T0.getTime() - 8 * DAY),
      reviewAt: iso(T0.getTime() - 9 * DAY),
    })
    localStorage.setItem(STORAGE_KEY, store(bought))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    otherTabWrites(STORAGE_KEY, store({ ...bought, satisfaction: 'good', updatedAt: iso(T0.getTime()) }))
    expect(screen.queryByRole('form', { name: '구매 후 회고' })).not.toBeInTheDocument()
    expect(card('전기 포트').getByText(/회고: 잘 샀어요/)).toBeInTheDocument()
  })
})
