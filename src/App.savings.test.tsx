import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SAVINGS_KEY, type SavingsStore, type Transfer } from './logic/savings'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'
import type { WishItem } from './logic/wishlist'

// PRD F48 모으기: 세 숫자를 따로 보이고 더하지 않는다 (AC91), 저장 (AC96). 오늘 2026-11-20
const T0 = new Date(2026, 10, 20, 9)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  name: '넷플릭스',
  priceKrw: 13500,
  cycle: 'monthly',
  billingDay: 10,
  lastUsedDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})
const wish = (over: Partial<WishItem>): WishItem => ({
  id: 'w1',
  name: '무선 헤드폰',
  priceKrw: 129000,
  reason: '이유',
  url: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  reviewAt: '2026-10-04T00:00:00.000Z',
  status: 'skipped',
  decidedAt: '2026-10-02T00:00:00.000Z',
  ...over,
})
const transfer = (over: Partial<Transfer>): Transfer => ({
  id: 't1',
  day: '2026-11-02',
  amountKrw: 100000,
  direction: 'in',
  createdAt: '2026-11-02T01:00:00.000Z',
  ...over,
})

const cancelledSubs = [
  sub({ id: 'a', name: '넷플릭스', priceKrw: 13500, cancelledOn: '2026-11-05' }),
  sub({ id: 'b', name: '클라우드', priceKrw: 120000, cycle: 'yearly', billingDay: undefined, renewalDate: '2027-03-01', cancelledOn: '2026-11-06' }),
  sub({ id: 'c', name: '월세', priceKrw: 450000, kind: 'housing', cancelledOn: '2026-11-07' }),
]
const skippedItems = [wish({ id: 'w1', priceKrw: 129000 }), wish({ id: 'w2', name: '마우스', priceKrw: 45000 })]
const savingsOf = (transfers: Transfer[]): SavingsStore => ({ schemaVersion: 1, transfers, goal: null })

function seed(opts: { items?: WishItem[]; subs?: Subscription[]; savings?: SavingsStore | string }) {
  if (opts.items) localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: opts.items }))
  if (opts.subs) localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: opts.subs }))
  if (opts.savings) localStorage.setItem(SAVINGS_KEY, typeof opts.savings === 'string' ? opts.savings : JSON.stringify(opts.savings))
}

async function openSavings() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '모으기' }))
  return user
}

const EMPTY_TEXT =
  '아직 모은 기록이 없어요. 고민하던 물건을 구매 포기하거나, 고정비를 ‘해지했어요’로 옮기거나, 은행 앱에서 옮긴 돈을 적으면 여기에 보여요.'

describe('모으기 세 숫자 (F48)', () => {
  it('AC91: 세 숫자를 따로 보이고 더하지 않는다는 안내가 있다', async () => {
    seed({
      items: skippedItems,
      subs: cancelledSubs,
      savings: savingsOf([transfer({ id: 'in1' }), transfer({ id: 'out1', day: '2026-11-20', amountKrw: 20000, direction: 'out' })]),
    })
    await openSavings()
    const card = within(screen.getByRole('region', { name: '모으기 요약' }))
    expect(card.getByText('지금까지')).toBeInTheDocument()
    expect(card.getByText('전체 기록 기준')).toBeInTheDocument()
    expect(card.getByText('줄어든 고정비 · 해지 2개')).toBeInTheDocument()
    expect(card.getByText('월 23,500원')).toBeInTheDocument()
    expect(card.getByText('참은 구매 · 구매 포기 2건')).toBeInTheDocument()
    expect(card.getByText('174,000원')).toBeInTheDocument()
    expect(card.getByText('옮긴 돈 · 기록 2건')).toBeInTheDocument()
    expect(card.getByText('80,000원')).toBeInTheDocument()
    expect(card.getByText('줄어든 고정비는 ‘해지했어요’로 옮긴 고정비의 요금을 한 달 기준으로 더한 값이에요. 월세·관리비는 세지 않아요.')).toBeInTheDocument()
    expect(card.getByText('참은 구매는 구매 포기한 물건을 담을 때 적은 가격의 합이에요. 실제로 아낀 돈과는 다를 수 있어요.')).toBeInTheDocument()
    expect(card.getByText('옮긴 돈은 은행 앱에서 실제로 옮긴 뒤 적은 금액이에요. 넣었어요에서 꺼냈어요를 뺐어요.')).toBeInTheDocument()
    expect(card.getByText('세 숫자는 서로 다른 돈이라 더하지 않아요. 저축 목표는 옮긴 돈으로만 채워요.')).toBeInTheDocument()
    expect(card.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('heading', { level: 2, name: '모으기' })).toBeInTheDocument()
  })

  it('AC91: 세 숫자를 더한 금액은 화면 어디에도 없다', async () => {
    seed({
      items: skippedItems,
      subs: cancelledSubs,
      savings: savingsOf([transfer({ id: 'in1' }), transfer({ id: 'out1', day: '2026-11-20', amountKrw: 20000, direction: 'out' })]),
    })
    await openSavings()
    // 23,500 + 174,000 + 80,000 = 277,500
    expect(screen.queryByText(/277,500원/)).toBeNull()
    expect(document.body.textContent).not.toContain('277,500')
  })

  it('AC91: 기록이 모두 없으면 빈 화면 문장이다', async () => {
    await openSavings()
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '모으기 요약' })).not.toBeInTheDocument()
  })

  it('AC91: 해지한 월세만 있으면 빈 화면 문장이다', async () => {
    seed({ subs: [cancelledSubs[2]] })
    await openSavings()
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '모으기 요약' })).not.toBeInTheDocument()
  })

  it('AC91: 예시 물건을 넣으면 전체 기록 기준 · 예시 포함이다', async () => {
    seed({ items: [wish({ id: 'w1', name: '(예시) 무선 헤드폰' })] })
    await openSavings()
    const card = within(screen.getByRole('region', { name: '모으기 요약' }))
    expect(card.getByText('전체 기록 기준 · 예시 포함')).toBeInTheDocument()
  })

  it('AC91: 꺼냈어요만 있으면 옮긴 돈이 -30,000원이다', async () => {
    seed({ savings: savingsOf([transfer({ id: 'out1', day: '2026-11-10', amountKrw: 30000, direction: 'out' })]) })
    await openSavings()
    const card = within(screen.getByRole('region', { name: '모으기 요약' }))
    expect(card.getByText('옮긴 돈 · 기록 1건')).toBeInTheDocument()
    expect(card.getByText('-30,000원')).toBeInTheDocument()
  })
})

describe('모으기 저장 상태 (F48)', () => {
  it('AC96: 저장된 모으기 기록에 모르는 키가 있으면 손상 안내를 보이고 덮어쓰지 않는다', async () => {
    const stored = JSON.stringify({ schemaVersion: 1, transfers: [], goal: null, kept: true })
    seed({ savings: stored })
    const user = await openSavings()
    const banner = within(screen.getByRole('status', { name: '모으기 저장 상태' }))
    expect(banner.getByText('저장된 모으기 기록을 읽을 수 없어요. 초기화하기 전까지는 새로 적은 기록이 저장되지 않아요.')).toBeInTheDocument()
    expect(localStorage.getItem(SAVINGS_KEY)).toBe(stored)

    await user.click(banner.getByRole('button', { name: '모으기 기록 초기화' }))
    expect(screen.getByText('초기화하면 읽을 수 없는 모으기 기록은 사라지고, 지금 화면의 기록만 저장돼요.')).toBeInTheDocument()
    expect(localStorage.getItem(SAVINGS_KEY)).toBe(stored)
  })

  it('AC96: 저장이 되는 때는 저장 안내가 없다', async () => {
    await openSavings()
    expect(screen.queryByRole('status', { name: '모으기 저장 상태' })).not.toBeInTheDocument()
  })
})
