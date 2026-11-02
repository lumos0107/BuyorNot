import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SAVINGS_KEY, type Goal, type SavingsStore, type Transfer } from './logic/savings'
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
  vi.restoreAllMocks()
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
    const explanation = within(screen.getByRole('region', { name: '모으기 계산 설명' }))
    expect(explanation.getByText('줄어든 고정비는 ‘해지했어요’로 옮긴 고정비의 요금을 한 달 기준으로 더한 값이에요. 월세·관리비는 세지 않아요.')).toBeInTheDocument()
    expect(explanation.getByText('참은 구매는 구매 포기한 물건을 담을 때 적은 가격의 합이에요. 실제로 아낀 돈과는 다를 수 있어요.')).toBeInTheDocument()
    expect(explanation.getByText('옮긴 돈은 은행 앱에서 실제로 옮긴 뒤 적은 금액이에요. 넣었어요에서 꺼냈어요를 뺐어요.')).toBeInTheDocument()
    expect(explanation.getByText('세 숫자는 서로 다른 돈이라 더하지 않아요. 저축 목표는 옮긴 돈으로만 채워요.')).toBeInTheDocument()
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

// ---------- 옮긴 돈 적기·기록·저축 목표 (F48, AC92~AC96). 오늘 2026-11-20 ----------

const goalOf = (over: Partial<Goal> = {}): Goal => ({
  name: '비상금',
  targetKrw: 500000,
  startedOn: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
})
const savingsWith = (transfers: Transfer[], goal: Goal | null = null): SavingsStore => ({ schemaVersion: 1, transfers, goal })
const stored = (): SavingsStore => JSON.parse(localStorage.getItem(SAVINGS_KEY) ?? 'null')
const heading = () => screen.getByRole('heading', { level: 2, name: '모으기' })
const transferForm = () => within(screen.getByRole('form', { name: '옮긴 돈 적기' }))
const transferNotice = () => screen.getByRole('status', { name: '옮긴 돈 알림' })
const goalCard = () => within(screen.getByRole('region', { name: '저축 목표' }))
const banner = () => within(screen.getByRole('status', { name: '모으기 저장 상태' }))
const setDay = (label: string, value: string) => fireEvent.change(
  label === '날짜' ? transferForm().getByLabelText(label) : screen.getByLabelText(label),
  { target: { value } },
)
const REPLACED = '다른 탭에서 저장한 모으기 기록을 불러왔어요. 이 탭에서 저장하지 않은 변경은 반영되지 않았어요.'

type User = ReturnType<typeof userEvent.setup>
async function writeTransfer(user: User, fields: { direction?: '넣었어요' | '꺼냈어요'; amount?: string; day?: string; memo?: string }) {
  const form = transferForm()
  if (fields.direction) await user.click(form.getByRole('radio', { name: fields.direction }))
  if (fields.amount !== undefined) await user.type(form.getByLabelText('금액'), fields.amount)
  if (fields.day !== undefined) setDay('날짜', fields.day)
  if (fields.memo !== undefined) await user.type(form.getByLabelText('메모 (선택)'), fields.memo)
  await user.click(form.getByRole('button', { name: '적기' }))
}

describe('옮긴 돈 적기 (F48)', () => {
  it('AC92: 넣었어요 100,000원을 적으면 알림과 기록 줄이 보이고 금액 칸이 비워진다', async () => {
    const user = await openSavings()
    expect(screen.getByText('앱은 돈을 옮기지 않아요. 은행 앱에서 옮긴 뒤 금액을 적어 주세요.')).toBeInTheDocument()
    expect(transferForm().getByRole('radio', { name: '넣었어요' })).toBeChecked()
    expect(transferForm().getByLabelText('날짜')).toHaveValue('2026-11-20')
    expect(transferNotice()).toBeEmptyDOMElement()

    await writeTransfer(user, { amount: '100000' })
    expect(within(transferNotice()).getByText('100,000원을 넣었다고 적었어요.')).toBeInTheDocument()
    expect(screen.getByText('옮긴 돈 기록 (1건)')).toBeInTheDocument()
    expect(screen.getByText('2026-11-20 · 넣었어요 · 100,000원')).toBeInTheDocument()
    expect(transferForm().getByLabelText('금액')).toHaveValue('')
    expect(transferForm().getByRole('button', { name: '적기' })).toHaveFocus()
    expect(stored().transfers).toMatchObject([{ day: '2026-11-20', amountKrw: 100000, direction: 'in' }])
    // 빈 화면 문장 대신 세 숫자 카드가 보이고 옮긴 돈에 반영된다
    const card = within(screen.getByRole('region', { name: '모으기 요약' }))
    expect(card.getByText('옮긴 돈 · 기록 1건')).toBeInTheDocument()
    expect(card.getByText('100,000원')).toBeInTheDocument()
  })

  it('AC92: 꺼냈어요 20,000원과 메모를 적으면 기록 맨 위 줄이다', async () => {
    seed({ savings: savingsWith([transfer({ id: 'in1', day: '2026-11-02' })]) })
    const user = await openSavings()
    await writeTransfer(user, { direction: '꺼냈어요', amount: '20000', memo: '적금 통장' })
    expect(within(transferNotice()).getByText('20,000원을 꺼냈다고 적었어요.')).toBeInTheDocument()
    const rows = within(screen.getByText('옮긴 돈 기록 (2건)').closest('details')!).getAllByRole('listitem')
    expect(within(rows[0]).getByText('2026-11-20 · 꺼냈어요 · 20,000원 · 적금 통장')).toBeInTheDocument()
    expect(within(rows[1]).getByText('2026-11-02 · 넣었어요 · 100,000원')).toBeInTheDocument()
    // 금액·메모는 비워지고 방향은 넣었어요, 날짜는 오늘로 되돌아간다
    expect(transferForm().getByLabelText('금액')).toHaveValue('')
    expect(transferForm().getByLabelText('메모 (선택)')).toHaveValue('')
    expect(transferForm().getByRole('radio', { name: '넣었어요' })).toBeChecked()
    expect(transferForm().getByLabelText('날짜')).toHaveValue('2026-11-20')
    expect(stored().transfers[1]).toMatchObject({ direction: 'out', amountKrw: 20000, memo: '적금 통장' })
  })

  it('AC92: 잘못된 금액·날짜·메모는 오류와 함께 첫 오류 칸으로 포커스한다', async () => {
    const user = await openSavings()
    const form = transferForm()
    await user.click(form.getByRole('button', { name: '적기' }))
    expect(form.getByText('금액을 숫자로 입력해 주세요')).toBeInTheDocument()
    expect(transferForm().getByLabelText('금액')).toHaveFocus()

    await user.type(transferForm().getByLabelText('금액'), '0')
    await user.click(form.getByRole('button', { name: '적기' }))
    expect(form.getByText('금액은 1원~1억 원 사이여야 해요')).toBeInTheDocument()
    expect(transferForm().getByLabelText('금액')).toHaveFocus()

    await user.clear(transferForm().getByLabelText('금액'))
    await user.type(transferForm().getByLabelText('금액'), '100000')
    setDay('날짜', '2025-11-19')
    await user.click(form.getByRole('button', { name: '적기' }))
    expect(form.getByText('날짜는 1년 전부터 오늘 사이여야 해요')).toBeInTheDocument()
    expect(transferForm().getByLabelText('날짜')).toHaveFocus()

    setDay('날짜', '2026-11-21')
    await user.click(form.getByRole('button', { name: '적기' }))
    expect(form.getByText('날짜는 1년 전부터 오늘 사이여야 해요')).toBeInTheDocument()

    setDay('날짜', '2026-11-20')
    await user.type(transferForm().getByLabelText('메모 (선택)'), 'ㄱ'.repeat(31))
    await user.click(form.getByRole('button', { name: '적기' }))
    expect(form.getByText('메모는 30자 이하로 적어 주세요')).toBeInTheDocument()
    expect(transferForm().getByLabelText('메모 (선택)')).toHaveFocus()
    // 하나도 저장하지 않았다
    expect(localStorage.getItem(SAVINGS_KEY)).toBeNull()
    expect(within(transferNotice()).queryByText(/적었어요/)).not.toBeInTheDocument()

    // 1년 전 같은 날은 통과한다
    await user.clear(transferForm().getByLabelText('메모 (선택)'))
    setDay('날짜', '2025-11-20')
    await user.click(form.getByRole('button', { name: '적기' }))
    expect(stored().transfers).toMatchObject([{ day: '2025-11-20', amountKrw: 100000 }])
  })

  it('AC92: 기록이 2,000건이면 적지 않고 너무 많다고 알린다', async () => {
    const full = Array.from({ length: 2000 }, (_, i) => transfer({ id: `t${i}`, amountKrw: 1000 }))
    seed({ savings: savingsWith(full) })
    const user = await openSavings()
    await writeTransfer(user, { amount: '5000' })
    expect(within(screen.getByRole('alert')).getByText('기록이 너무 많아 더 적을 수 없어요. 백업한 뒤 오래된 기록을 지워 주세요.')).toBeInTheDocument()
    expect(stored().transfers).toHaveLength(2000)
    expect(within(transferNotice()).queryByText(/적었어요/)).not.toBeInTheDocument()
    // 입력은 그대로 남고, 오래된 기록을 몰래 지우지 않았다
    expect(transferForm().getByLabelText('금액')).toHaveValue('5000')
    expect(stored().transfers[0].id).toBe('t0')
  })

  it('AC92: 너무 많다는 경고는 다른 탭이 기록을 줄이면 사라진다', async () => {
    const full = Array.from({ length: 2000 }, (_, i) => transfer({ id: `t${i}`, amountKrw: 1000 }))
    seed({ savings: savingsWith(full) })
    const user = await openSavings()
    await writeTransfer(user, { amount: '5000' })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(savingsWith(full.slice(0, 1999))))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SAVINGS_KEY }))
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('AC92: 적은 뒤 다른 탭이 그 기록을 없애면 적었다는 알림도 사라진다', async () => {
    const user = await openSavings()
    await writeTransfer(user, { amount: '100000' })
    expect(within(transferNotice()).getByText('100,000원을 넣었다고 적었어요.')).toBeInTheDocument()
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(savingsWith([transfer({ id: 'elsewhere' })])))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SAVINGS_KEY }))
    })
    expect(transferNotice()).toBeEmptyDOMElement()
  })
})

describe('옮긴 돈 기록 지우기 (F48)', () => {
  const rows = () => [transfer({ id: 'in1', day: '2026-11-02' }), transfer({ id: 'out1', day: '2026-11-20', amountKrw: 20000, direction: 'out', createdAt: '2026-11-20T01:00:00.000Z' })]

  it('AC93: 기록 지우기 확인과 취소, 지운 뒤 화면 제목 포커스', async () => {
    seed({ savings: savingsWith(rows()) })
    const user = await openSavings()
    const open = () => user.click(screen.getByRole('button', { name: '2026-11-20 꺼냈어요 20,000원 기록 지우기' }))
    await open()
    const confirm = within(screen.getByRole('group', { name: '기록 지우기 확인' }))
    expect(confirm.getByText('이 기록을 지울까요? 저축 목표와 옮긴 돈 합계에서도 빠져요.')).toBeInTheDocument()
    expect(confirm.getByRole('button', { name: '지우기' })).toHaveFocus()

    await user.click(confirm.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('group', { name: '기록 지우기 확인' })).not.toBeInTheDocument()
    expect(screen.getByText('2026-11-20 · 꺼냈어요 · 20,000원')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-11-20 꺼냈어요 20,000원 기록 지우기' })).toHaveFocus()
    expect(stored().transfers).toHaveLength(2)

    await open()
    await user.click(within(screen.getByRole('group', { name: '기록 지우기 확인' })).getByRole('button', { name: '지우기' }))
    expect(screen.queryByText('2026-11-20 · 꺼냈어요 · 20,000원')).not.toBeInTheDocument()
    expect(screen.getByText('옮긴 돈 기록 (1건)')).toBeInTheDocument()
    expect(stored().transfers.map((t) => t.id)).toEqual(['in1'])
    const card = within(screen.getByRole('region', { name: '모으기 요약' }))
    expect(card.getByText('옮긴 돈 · 기록 1건')).toBeInTheDocument()
    expect(card.getByText('100,000원')).toBeInTheDocument()
    expect(heading()).toHaveFocus()
  })

  it('AC93: 기록이 없으면 옮긴 돈 기록 접힘이 없다', async () => {
    await openSavings()
    expect(screen.queryByText(/옮긴 돈 기록 \(/)).not.toBeInTheDocument()
  })

  it('AC93: 지우면 저축 목표 진행에서도 빠진다', async () => {
    seed({ savings: savingsWith(rows(), goalOf()) })
    const user = await openSavings()
    expect(goalCard().getByText('비상금 · 500,000원 중 80,000원 (16%)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '2026-11-02 넣었어요 100,000원 기록 지우기' }))
    await user.click(within(screen.getByRole('group', { name: '기록 지우기 확인' })).getByRole('button', { name: '지우기' }))
    expect(goalCard().getByText('비상금 · 500,000원 중 0원 (0%)')).toBeInTheDocument()
  })
})

describe('저축 목표 (F48)', () => {
  const moves = [
    transfer({ id: 'in1', day: '2026-11-02', amountKrw: 100000 }),
    transfer({ id: 'out1', day: '2026-11-20', amountKrw: 20000, direction: 'out' }),
    transfer({ id: 'old', day: '2026-10-30', amountKrw: 50000 }),
  ]

  it('AC94: 목표 진행 문장과 진행 막대, 목표 날짜 줄', async () => {
    seed({ savings: savingsWith(moves, goalOf({ targetDate: '2027-04-30' })) })
    await openSavings()
    const card = goalCard()
    expect(card.getByText('저축 목표')).toBeInTheDocument()
    expect(card.getByText('비상금 · 500,000원 중 80,000원 (16%)')).toBeInTheDocument()
    expect(card.getByText('목표를 정한 날(2026-11-01)부터 적은 옮긴 돈으로 채워요. 줄어든 고정비와 참은 구매는 더하지 않아요.')).toBeInTheDocument()
    const bar = card.getByRole('progressbar', { name: '저축 목표 진행' })
    expect(bar).toHaveAttribute('value', '16')
    expect(bar).toHaveAttribute('max', '100')
    expect(card.getByText('목표 날짜 2027-04-30까지 161일 · 한 달에 약 70,000원씩 옮기면 닿아요')).toBeInTheDocument()
    expect(card.getByRole('button', { name: '목표 고치기' })).toBeInTheDocument()
    expect(card.getByRole('button', { name: '목표 지우기' })).toBeInTheDocument()
    expect(card.queryByRole('button', { name: '목표 정하기' })).not.toBeInTheDocument()
  })

  it('AC94: 목표 날짜가 오늘이면 오늘이 목표 날짜라고 한다', async () => {
    seed({ savings: savingsWith(moves, goalOf({ targetDate: '2026-11-20' })) })
    await openSavings()
    expect(goalCard().getByText('오늘이 목표 날짜예요.')).toBeInTheDocument()
  })

  it('AC94: 목표 날짜가 지났으면 지났다고 한다', async () => {
    seed({ savings: savingsWith(moves, goalOf({ targetDate: '2026-11-10' })) })
    await openSavings()
    expect(goalCard().getByText('목표 날짜가 지났어요.')).toBeInTheDocument()
  })

  it('AC94: 목표에 닿으면 닿았다는 문장만 있다', async () => {
    seed({ savings: savingsWith([...moves, transfer({ id: 'big', day: '2026-11-10', amountKrw: 420000 })], goalOf({ targetDate: '2027-04-30' })) })
    await openSavings()
    const card = goalCard()
    expect(card.getByText('비상금 · 500,000원 중 500,000원 (100%)')).toBeInTheDocument()
    expect(card.getByText('목표 금액에 닿았어요.')).toBeInTheDocument()
    expect(card.queryByText(/목표 날짜 2027/)).not.toBeInTheDocument()
    expect(card.getByRole('progressbar', { name: '저축 목표 진행' })).toHaveAttribute('value', '100')
  })

  it('AC94: 목표를 넘으면 채운 금액은 그대로이고 100%다', async () => {
    seed({ savings: savingsWith([...moves, transfer({ id: 'big', day: '2026-11-10', amountKrw: 520000 })], goalOf()) })
    await openSavings()
    expect(goalCard().getByText('비상금 · 500,000원 중 600,000원 (100%)')).toBeInTheDocument()
    expect(goalCard().getByRole('progressbar', { name: '저축 목표 진행' })).toHaveAttribute('value', '100')
  })

  it('AC94: 줄어든 고정비와 참은 구매는 목표를 채우지 않는다', async () => {
    seed({ items: skippedItems, subs: cancelledSubs, savings: savingsWith([], goalOf()) })
    await openSavings()
    expect(goalCard().getByText('비상금 · 500,000원 중 0원 (0%)')).toBeInTheDocument()
    expect(goalCard().getByRole('progressbar', { name: '저축 목표 진행' })).toHaveAttribute('value', '0')
  })

  it('AC95: 목표 정하기 폼과 오류, 저장 뒤 카드 제목 포커스', async () => {
    const user = await openSavings()
    expect(goalCard().getByText('목표는 옮긴 돈으로만 채워요.')).toBeInTheDocument()
    await user.click(goalCard().getByRole('button', { name: '목표 정하기' }))
    const form = within(screen.getByRole('form', { name: '저축 목표 정하기' }))
    expect(screen.getByLabelText('목표 이름')).toHaveFocus()
    expect(screen.getByLabelText('목표 날짜 (선택)')).toHaveAttribute('type', 'date')

    await user.click(form.getByRole('button', { name: '목표 저장' }))
    expect(form.getByText('목표 이름을 적어 주세요')).toBeInTheDocument()
    expect(form.getByText('목표 금액을 숫자로 입력해 주세요')).toBeInTheDocument()
    expect(screen.getByLabelText('목표 이름')).toHaveFocus()

    await user.type(screen.getByLabelText('목표 이름'), 'ㄱ'.repeat(21))
    await user.type(screen.getByLabelText('목표 금액'), '9999')
    await user.click(form.getByRole('button', { name: '목표 저장' }))
    expect(form.getByText('목표 이름은 20자 이하로 적어 주세요')).toBeInTheDocument()
    expect(form.getByText('목표 금액은 1만 원~1억 원 사이여야 해요')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('목표 이름'))
    await user.type(screen.getByLabelText('목표 이름'), '비상금')
    await user.clear(screen.getByLabelText('목표 금액'))
    await user.type(screen.getByLabelText('목표 금액'), '100000001')
    await user.click(form.getByRole('button', { name: '목표 저장' }))
    expect(form.getByText('목표 금액은 1만 원~1억 원 사이여야 해요')).toBeInTheDocument()
    expect(screen.getByLabelText('목표 금액')).toHaveFocus()

    await user.clear(screen.getByLabelText('목표 금액'))
    await user.type(screen.getByLabelText('목표 금액'), '500000')
    setDay('목표 날짜 (선택)', '2026-11-20')
    await user.click(form.getByRole('button', { name: '목표 저장' }))
    expect(form.getByText('목표 날짜는 내일부터 10년 안이어야 해요')).toBeInTheDocument()
    expect(screen.getByLabelText('목표 날짜 (선택)')).toHaveFocus()
    setDay('목표 날짜 (선택)', '2036-11-21')
    await user.click(form.getByRole('button', { name: '목표 저장' }))
    expect(form.getByText('목표 날짜는 내일부터 10년 안이어야 해요')).toBeInTheDocument()
    expect(localStorage.getItem(SAVINGS_KEY)).toBeNull()

    setDay('목표 날짜 (선택)', '')
    await user.click(form.getByRole('button', { name: '목표 저장' }))
    expect(screen.queryByRole('form', { name: '저축 목표 정하기' })).not.toBeInTheDocument()
    expect(goalCard().getByText('비상금 · 500,000원 중 0원 (0%)')).toBeInTheDocument()
    expect(goalCard().getByText(/목표를 정한 날\(2026-11-20\)부터/)).toBeInTheDocument()
    expect(goalCard().getByText('저축 목표')).toHaveFocus()
    expect(stored().goal).toMatchObject({ name: '비상금', targetKrw: 500000, startedOn: '2026-11-20' })
  })

  it('AC95: 목표 정하기를 취소하면 연 버튼으로 포커스가 돌아간다', async () => {
    const user = await openSavings()
    await user.click(goalCard().getByRole('button', { name: '목표 정하기' }))
    await user.click(within(screen.getByRole('form', { name: '저축 목표 정하기' })).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('form', { name: '저축 목표 정하기' })).not.toBeInTheDocument()
    expect(goalCard().getByRole('button', { name: '목표 정하기' })).toHaveFocus()
    expect(localStorage.getItem(SAVINGS_KEY)).toBeNull()
  })

  it('AC95: 목표를 고쳐도 정한 날이 그대로다', async () => {
    seed({ savings: savingsWith([], goalOf()) })
    const user = await openSavings()
    await user.click(goalCard().getByRole('button', { name: '목표 고치기' }))
    const form = within(screen.getByRole('form', { name: '저축 목표 고치기' }))
    expect(screen.getByLabelText('목표 이름')).toHaveFocus()
    expect(screen.getByLabelText('목표 이름')).toHaveValue('비상금')
    expect(screen.getByLabelText('목표 금액')).toHaveValue('500000')
    await user.clear(screen.getByLabelText('목표 금액'))
    await user.type(screen.getByLabelText('목표 금액'), '600000')
    await user.click(form.getByRole('button', { name: '목표 저장' }))
    expect(goalCard().getByText('비상금 · 600,000원 중 0원 (0%)')).toBeInTheDocument()
    expect(goalCard().getByText(/목표를 정한 날\(2026-11-01\)부터/)).toBeInTheDocument()
    expect(goalCard().getByText('저축 목표')).toHaveFocus()
    expect(stored().goal).toMatchObject({ targetKrw: 600000, startedOn: '2026-11-01', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: T0.toISOString() })
  })

  it('AC95: 이미 지난 목표 날짜는 그대로 두면 다른 칸만 고쳐도 저장된다', async () => {
    seed({ savings: savingsWith([], goalOf({ targetDate: '2026-11-10' })) })
    const user = await openSavings()
    await user.click(goalCard().getByRole('button', { name: '목표 고치기' }))
    expect(screen.getByLabelText('목표 날짜 (선택)')).toHaveValue('2026-11-10')
    await user.clear(screen.getByLabelText('목표 금액'))
    await user.type(screen.getByLabelText('목표 금액'), '600000')
    await user.click(within(screen.getByRole('form', { name: '저축 목표 고치기' })).getByRole('button', { name: '목표 저장' }))
    expect(stored().goal).toMatchObject({ targetKrw: 600000, targetDate: '2026-11-10' })
  })

  it('AC95: 목표 지우기를 누르면 확인의 지우기에 포커스가 간다', async () => {
    seed({ savings: savingsWith([], goalOf()) })
    const user = await openSavings()
    await user.click(goalCard().getByRole('button', { name: '목표 지우기' }))
    expect(within(screen.getByRole('group', { name: '목표 지우기 확인' })).getByRole('button', { name: '지우기' })).toHaveFocus()
  })

  it('AC95: 목표를 지워도 옮긴 돈 기록은 그대로다', async () => {
    seed({ savings: savingsWith([transfer({ id: 'in1' })], goalOf()) })
    const user = await openSavings()
    await user.click(goalCard().getByRole('button', { name: '목표 지우기' }))
    const confirm = within(screen.getByRole('group', { name: '목표 지우기 확인' }))
    expect(confirm.getByText('‘비상금’ 목표를 지울까요? 옮긴 돈 기록은 그대로 남아요.')).toBeInTheDocument()

    await user.click(confirm.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('group', { name: '목표 지우기 확인' })).not.toBeInTheDocument()
    expect(goalCard().getByRole('button', { name: '목표 지우기' })).toHaveFocus()
    expect(stored().goal).not.toBeNull()

    await user.click(goalCard().getByRole('button', { name: '목표 지우기' }))
    await user.click(within(screen.getByRole('group', { name: '목표 지우기 확인' })).getByRole('button', { name: '지우기' }))
    expect(goalCard().getByRole('button', { name: '목표 정하기' })).toBeInTheDocument()
    expect(goalCard().getByText('저축 목표')).toHaveFocus()
    expect(stored().goal).toBeNull()
    expect(stored().transfers).toHaveLength(1)
    expect(screen.getByText('옮긴 돈 기록 (1건)')).toBeInTheDocument()
  })
})

describe('모으기 저장·여러 탭 (F48)', () => {
  it('AC96: 다른 탭이 저장한 뒤 이 탭에서 옮긴 돈을 적으면 덮어쓰지 않고 불러왔다고 알린다', async () => {
    const user = await openSavings()
    const other = JSON.stringify(savingsWith([transfer({ id: 'elsewhere', amountKrw: 5000 })]))
    localStorage.setItem(SAVINGS_KEY, other)
    await writeTransfer(user, { amount: '100000', memo: '적금' })
    expect(banner().getByText(REPLACED)).toBeInTheDocument()
    expect(localStorage.getItem(SAVINGS_KEY)).toBe(other)
    // 반영되지 않았으니 성공 안내도 없고 적던 입력은 그대로 남는다
    expect(within(transferNotice()).queryByText(/적었어요/)).not.toBeInTheDocument()
    expect(transferForm().getByLabelText('금액')).toHaveValue('100000')
    expect(transferForm().getByLabelText('메모 (선택)')).toHaveValue('적금')
    expect(screen.getByText('2026-11-02 · 넣었어요 · 5,000원')).toBeInTheDocument()
  })

  it('AC96: 목표 고치기 폼을 연 동안 다른 탭이 목표를 고치면 저장하지 않고 알린다', async () => {
    seed({ savings: savingsWith([], goalOf()) })
    const user = await openSavings()
    await user.click(goalCard().getByRole('button', { name: '목표 고치기' }))
    const changed = JSON.stringify(savingsWith([], goalOf({ name: '여행', updatedAt: '2026-11-10T00:00:00.000Z' })))
    localStorage.setItem(SAVINGS_KEY, changed)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SAVINGS_KEY }))
    })
    await user.clear(screen.getByLabelText('목표 금액'))
    await user.type(screen.getByLabelText('목표 금액'), '600000')
    await user.click(within(screen.getByRole('form', { name: '저축 목표 고치기' })).getByRole('button', { name: '목표 저장' }))
    expect(within(screen.getByRole('alert')).getByText('다른 탭에서 이 목표가 바뀌었어요. 취소한 뒤 다시 열어 고쳐 주세요.')).toBeInTheDocument()
    expect(localStorage.getItem(SAVINGS_KEY)).toBe(changed)
    expect(screen.getByRole('form', { name: '저축 목표 고치기' })).toBeInTheDocument()

    // 취소한 뒤 다시 열면 바뀐 목표로 고칠 수 있다
    await user.click(within(screen.getByRole('form', { name: '저축 목표 고치기' })).getByRole('button', { name: '취소' }))
    await user.click(goalCard().getByRole('button', { name: '목표 고치기' }))
    expect(screen.getByLabelText('목표 이름')).toHaveValue('여행')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('AC96: 목표 정하기 중 다른 탭이 먼저 저장했으면 덮어쓰지 않고 불러왔다고 알린다', async () => {
    const user = await openSavings()
    await user.click(goalCard().getByRole('button', { name: '목표 정하기' }))
    await user.type(screen.getByLabelText('목표 이름'), '여행')
    await user.type(screen.getByLabelText('목표 금액'), '300000')
    const other = JSON.stringify(savingsWith([transfer({ id: 'elsewhere' })], goalOf({ name: '비상금' })))
    localStorage.setItem(SAVINGS_KEY, other)
    await user.click(within(screen.getByRole('form', { name: '저축 목표 정하기' })).getByRole('button', { name: '목표 저장' }))
    expect(banner().getByText(REPLACED)).toBeInTheDocument()
    expect(localStorage.getItem(SAVINGS_KEY)).toBe(other)
    expect(goalCard().getByText('비상금 · 500,000원 중 100,000원 (20%)')).toBeInTheDocument()
    // 정하기 폼이 사라져 포커스가 body로 빠지므로 카드 제목으로 옮긴다 (saving 1a 최종 검토 M3). 저장 성공 때의 이동과는 다른 길이다
    expect(goalCard().getByText('저축 목표')).toHaveFocus()
  })

  it('AC96: 기록 지우기 확인 중 다른 탭이 먼저 저장했으면 덮어쓰지 않고 불러왔다고 알린다', async () => {
    seed({ savings: savingsWith([transfer({ id: 'in1' })]) })
    const user = await openSavings()
    await user.click(screen.getByRole('button', { name: '2026-11-02 넣었어요 100,000원 기록 지우기' }))
    const other = JSON.stringify(savingsWith([transfer({ id: 'in1' }), transfer({ id: 'elsewhere', day: '2026-11-03', amountKrw: 7000 })]))
    localStorage.setItem(SAVINGS_KEY, other)
    await user.click(within(screen.getByRole('group', { name: '기록 지우기 확인' })).getByRole('button', { name: '지우기' }))
    expect(banner().getByText(REPLACED)).toBeInTheDocument()
    expect(localStorage.getItem(SAVINGS_KEY)).toBe(other)
    expect(screen.getByText('옮긴 돈 기록 (2건)')).toBeInTheDocument()
    // 지워지지 않았으니 확인만 닫히고, 화면 제목이 아니라 그 줄의 지우기로 포커스가 돌아간다
    expect(screen.queryByRole('group', { name: '기록 지우기 확인' })).not.toBeInTheDocument()
    expect(heading()).not.toHaveFocus()
    expect(screen.getByRole('button', { name: '2026-11-02 넣었어요 100,000원 기록 지우기' })).toHaveFocus()
  })

  it('AC96: 목표 정하기 중 다른 탭이 목표를 정했다 지워도 폼이 다시 열리지 않고 포커스는 카드 제목에 있다', async () => {
    const user = await openSavings()
    await user.click(goalCard().getByRole('button', { name: '목표 정하기' }))
    expect(screen.getByLabelText('목표 이름')).toHaveFocus()
    const tabEvent = () =>
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: SAVINGS_KEY }))
      })
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(savingsWith([], goalOf())))
    tabEvent()
    expect(screen.queryByRole('form', { name: '저축 목표 정하기' })).not.toBeInTheDocument()
    expect(goalCard().getByText('비상금 · 500,000원 중 0원 (0%)')).toBeInTheDocument()
    expect(goalCard().getByText('저축 목표')).toHaveFocus()
    // 다른 탭이 다시 지워도 정하기 폼이 저절로 열리지 않는다
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(savingsWith([], null)))
    tabEvent()
    expect(screen.queryByRole('form', { name: '저축 목표 정하기' })).not.toBeInTheDocument()
    expect(goalCard().getByRole('button', { name: '목표 정하기' })).toBeInTheDocument()
  })

  it('AC96: 기록 지우기 확인 중 다른 탭이 그 기록을 지우면 포커스가 화면 제목으로 간다', async () => {
    seed({ savings: savingsWith([transfer({ id: 'in1' }), transfer({ id: 'in2', day: '2026-11-03', amountKrw: 7000 })]) })
    const user = await openSavings()
    await user.click(screen.getByRole('button', { name: '2026-11-02 넣었어요 100,000원 기록 지우기' }))
    expect(within(screen.getByRole('group', { name: '기록 지우기 확인' })).getByRole('button', { name: '지우기' })).toHaveFocus()
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(savingsWith([transfer({ id: 'in2', day: '2026-11-03', amountKrw: 7000 })])))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SAVINGS_KEY }))
    })
    expect(screen.queryByRole('group', { name: '기록 지우기 확인' })).not.toBeInTheDocument()
    expect(heading()).toHaveFocus()
  })

  it('AC96: 저장에 실패하면 모으기 저장 실패 안내와 다시 저장 버튼이 보인다', async () => {
    const user = await openSavings()
    const original = Storage.prototype.setItem
    let failing = true
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (failing) throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    await writeTransfer(user, { amount: '100000' })
    expect(banner().getByText('모으기 기록을 저장하지 못했어요. 브라우저 저장 공간이나 설정을 확인한 뒤 다시 저장해 주세요.')).toBeInTheDocument()
    // 화면에는 반영돼 있다
    expect(screen.getByText('2026-11-20 · 넣었어요 · 100,000원')).toBeInTheDocument()
    expect(localStorage.getItem(SAVINGS_KEY)).toBeNull()

    failing = false
    await user.click(banner().getByRole('button', { name: '다시 저장' }))
    expect(screen.queryByRole('status', { name: '모으기 저장 상태' })).not.toBeInTheDocument()
    expect(stored().transfers).toMatchObject([{ amountKrw: 100000 }])
  })

  it('AC96: 옮긴 돈 적기는 모으기 키 하나만 쓴다', async () => {
    seed({ subs: [sub({})], items: skippedItems })
    const user = await openSavings()
    const keys: string[] = []
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      keys.push(key)
      return original.call(this, key, value)
    })
    await writeTransfer(user, { amount: '100000' })
    expect(keys).toEqual([SAVINGS_KEY])
    await user.click(goalCard().getByRole('button', { name: '목표 정하기' }))
    await user.type(screen.getByLabelText('목표 이름'), '비상금')
    await user.type(screen.getByLabelText('목표 금액'), '500000')
    await user.click(within(screen.getByRole('form', { name: '저축 목표 정하기' })).getByRole('button', { name: '목표 저장' }))
    expect(keys).toEqual([SAVINGS_KEY, SAVINGS_KEY])
  })

  it('AC96: 손상된 저장값 위에는 적어도 저장하지 않는다', async () => {
    const broken = JSON.stringify({ schemaVersion: 1, transfers: [], goal: null, kept: true })
    seed({ savings: broken })
    const user = await openSavings()
    await writeTransfer(user, { amount: '100000' })
    expect(localStorage.getItem(SAVINGS_KEY)).toBe(broken)
    expect(banner().getByText('저장된 모으기 기록을 읽을 수 없어요. 초기화하기 전까지는 새로 적은 기록이 저장되지 않아요.')).toBeInTheDocument()
  })
})
