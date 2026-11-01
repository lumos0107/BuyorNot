import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

// PRD F45 고정비 정리함: 이름 바꿈(AC83), 종류와 요약(AC81), 예전 기록·예시(AC82), 손상(AC84). 오늘 2026-11-01
const T0 = new Date(2026, 10, 1, 9)

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
  billingDay: 15,
  lastUsedDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})
const seed = (...items: Subscription[]) => localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items }))
const storedItems = (): Record<string, unknown>[] => JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items

async function openFixed() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '고정비' }))
  return user
}

const form = () => within(screen.getByRole('form', { name: '고정비 담기' }))
const card = (name: string) => within(screen.getByRole('article', { name }))
const summary = () => within(screen.getByRole('region', { name: '고정비 요약' }))

type Fill = { name: string; price: string; kind?: string; cycle?: '매월' | '매년'; billingDay?: string; renewal?: string }
async function addFixed(user: ReturnType<typeof userEvent.setup>, f: Fill) {
  if (f.kind) await user.selectOptions(form().getByLabelText('종류'), f.kind)
  await user.type(form().getByLabelText('이름'), f.name)
  await user.type(form().getByLabelText('요금'), f.price)
  await user.click(form().getByRole('radio', { name: f.cycle ?? '매월' }))
  if ((f.cycle ?? '매월') === '매월') await user.type(form().getByLabelText('결제일 (매월)'), f.billingDay ?? '15')
  else fireEvent.change(form().getByLabelText('다음 결제일'), { target: { value: f.renewal ?? '' } })
  await user.click(form().getByRole('button', { name: '고정비 추가' }))
}

describe('고정비 종류와 요약 (F45)', () => {
  it('AC81: 네 고정비를 담으면 월평균·1년과 종류별 줄이 PRD 값이다', async () => {
    const user = await openFixed()
    // 종류 고르기는 7개가 이 순서로 있고 처음 값은 구독이다
    expect(within(form().getByLabelText('종류')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '구독',
      '멤버십',
      '정기배송',
      '통신',
      '월세·관리비',
      '보험',
      '기타',
    ])
    await addFixed(user, { name: '월세', price: '450000', kind: '월세·관리비', billingDay: '25' })
    await addFixed(user, { name: '휴대폰', price: '55000', kind: '통신', billingDay: '10' })
    await addFixed(user, { name: '넷플릭스', price: '13500', billingDay: '15' })
    await addFixed(user, { name: '클라우드', price: '120000', cycle: '매년', renewal: '2027-02-01' })
    expect(summary().getByText('월평균 고정비')).toBeInTheDocument()
    expect(summary().getByText('528,500원')).toBeInTheDocument()
    expect(summary().getByText('연 6,342,000원')).toBeInTheDocument()
    expect(summary().getByText('구독·멤버십 23,500원 · 통신 55,000원 · 월세·관리비 450,000원')).toBeInTheDocument()
    expect(storedItems().find((i) => i.name === '월세')).toMatchObject({ kind: 'housing' })
    expect(storedItems().find((i) => i.name === '휴대폰')).toMatchObject({ kind: 'phone', lastUsedDate: null })
    expect(storedItems().find((i) => i.name === '넷플릭스')).not.toHaveProperty('kind')
  })

  it('AC81: 구독만 있으면 종류별 줄이 없다', async () => {
    seed(sub({}), sub({ id: 's2', name: '클라우드', priceKrw: 120000, cycle: 'yearly', billingDay: undefined, renewalDate: '2027-02-01' }))
    await openFixed()
    expect(summary().getByText('월평균 고정비')).toBeInTheDocument()
    expect(summary().getByText('23,500원')).toBeInTheDocument()
    expect(summary().queryByText(/구독·멤버십 .*원/)).not.toBeInTheDocument()
  })

  it('AC81: 통신 카드에는 종류가 보이고 사용 기록 줄·확인 필요·오늘 썼어요·사용량 적기가 없다', async () => {
    seed(sub({ id: 'p', name: '휴대폰', priceKrw: 55000, billingDay: 10, kind: 'phone' }), sub({}))
    await openFixed()
    const phone = card('휴대폰')
    expect(phone.getByText('통신')).toBeInTheDocument()
    expect(phone.queryByText(/마지막 사용/)).not.toBeInTheDocument()
    expect(phone.queryByText('사용 기록 없음')).not.toBeInTheDocument()
    expect(phone.queryByText('확인 필요')).not.toBeInTheDocument()
    expect(phone.queryByRole('button', { name: '오늘 썼어요' })).not.toBeInTheDocument()
    expect(phone.queryByRole('button', { name: '사용량 적기' })).not.toBeInTheDocument()
    expect(phone.queryByRole('button', { name: '넷플릭스 시청 기록 가져오기' })).not.toBeInTheDocument()
    // 구독 카드는 그대로 둔다
    const netflix = card('넷플릭스')
    expect(netflix.getByText('구독')).toBeInTheDocument()
    expect(netflix.getByText('확인 필요')).toBeInTheDocument()
    expect(netflix.getByRole('button', { name: '오늘 썼어요' })).toBeInTheDocument()
    expect(netflix.getByRole('button', { name: '사용량 적기' })).toBeInTheDocument()
    expect(netflix.getByRole('button', { name: '넷플릭스 시청 기록 가져오기' })).toBeInTheDocument()
  })

  it('AC81: 종류를 통신으로 고르면 담기 폼에서 마지막 사용일 칸이 사라진다', async () => {
    const user = await openFixed()
    expect(form().getByLabelText('마지막 사용일 (선택)')).toBeInTheDocument()
    await user.selectOptions(form().getByLabelText('종류'), '멤버십')
    expect(form().getByLabelText('마지막 사용일 (선택)')).toBeInTheDocument()
    await user.selectOptions(form().getByLabelText('종류'), '통신')
    expect(form().queryByLabelText('마지막 사용일 (선택)')).not.toBeInTheDocument()
  })
})

describe('예전 기록과 예시 (F45)', () => {
  it('AC82: 종류가 없는 예전 기록은 구독이고 해지 후보다', async () => {
    seed(sub({ lastUsedDate: '2026-09-20' }))
    await openFixed()
    expect(card('넷플릭스').getByText('구독')).toBeInTheDocument()
    expect(card('넷플릭스').getByText('해지 후보')).toBeInTheDocument()
    expect(summary().getByText('해지 후보 1개 · 월평균 13,500원')).toBeInTheDocument()
  })

  it('AC82: 예시 구독은 AC30 그대로다', async () => {
    const user = await openFixed()
    await user.click(screen.getByRole('button', { name: '예시 구독 넣기' }))
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(summary().getByText('46,280원')).toBeInTheDocument()
    expect(summary().getByText('연 555,360원')).toBeInTheDocument()
    expect(summary().getByText('해지 후보 1개 · 월평균 10,900원')).toBeInTheDocument()
    expect(summary().queryByText(/구독·멤버십 .*원/)).not.toBeInTheDocument()
  })

  it('AC82: 종류를 통신으로 바꿨다가 다시 구독으로 바꾸면 확인 필요다', async () => {
    seed(sub({ lastUsedDate: '2026-09-20' }))
    const user = await openFixed()
    const edit = async (kind: string) => {
      await user.click(card('넷플릭스').getByRole('button', { name: '수정' }))
      const editor = within(screen.getByRole('form', { name: '고정비 수정' }))
      await user.selectOptions(editor.getByLabelText('종류'), kind)
      await user.click(editor.getByRole('button', { name: '저장' }))
    }
    await edit('통신')
    expect(storedItems()[0]).toMatchObject({ kind: 'phone', lastUsedDate: null })
    expect(card('넷플릭스').getByText('통신')).toBeInTheDocument()
    expect(summary().queryByText(/^해지 후보 [0-9]+개/)).not.toBeInTheDocument()
    expect(card('넷플릭스').queryByText('해지 후보')).not.toBeInTheDocument()
    expect(screen.queryByText('확인 필요')).not.toBeInTheDocument()
    await edit('구독')
    expect(storedItems()[0]).not.toHaveProperty('kind')
    // 마지막 사용일은 돌아오지 않는다
    expect(storedItems()[0]).toMatchObject({ lastUsedDate: null })
    expect(card('넷플릭스').getByText('확인 필요')).toBeInTheDocument()
    expect(summary().queryByText(/^해지 후보 [0-9]+개/)).not.toBeInTheDocument()
    expect(card('넷플릭스').queryByText('해지 후보')).not.toBeInTheDocument()
  })
})

describe('이름 바꿈 (F45)', () => {
  it('AC83: 탭과 화면 제목, 담기 폼, 이름 칸, 빈 목록, 수정 폼 이름이 고정비다', async () => {
    const user = await openFixed()
    expect(screen.getByRole('tab', { name: '고정비', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '고정비' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: '구독' })).not.toBeInTheDocument()
    expect(form().getByText('고정비 담기')).toBeInTheDocument()
    expect(form().getByLabelText('종류')).toHaveValue('subscription')
    expect(form().getByRole('option', { name: '구독', selected: true })).toBeInTheDocument()
    expect(form().getByLabelText('이름')).toHaveAttribute('placeholder', '예: 넷플릭스, 배민클럽, 휴대폰 요금')
    expect(form().getByRole('button', { name: '고정비 추가' })).toBeInTheDocument()
    expect(screen.getByText('아직 등록한 고정비가 없어요.')).toBeInTheDocument()
    expect(screen.getByText('구독·멤버십·통신·월세처럼 매월·매년 나가는 돈을 적어 두면 다음 결제일과 합계를 확인할 수 있어요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '예시 구독 넣기' })).toBeInTheDocument()
    expect(screen.queryByText(/아직 등록한 구독/)).not.toBeInTheDocument()

    await addFixed(user, { name: '넷플릭스', price: '13500' })
    expect(screen.getByRole('region', { name: '고정비 목록' })).toBeInTheDocument()
    expect(summary().getByText('월평균 고정비')).toBeInTheDocument()
    expect(summary().queryByText('월평균 구독료')).not.toBeInTheDocument()
    await user.click(card('넷플릭스').getByRole('button', { name: '수정' }))
    const editor = within(screen.getByRole('form', { name: '고정비 수정' }))
    expect(editor.getByLabelText('이름')).toBeInTheDocument()
  })

  it('AC83: 이름을 비우고 추가하면 오류와 함께 이름 칸으로 포커스한다', async () => {
    const user = await openFixed()
    await user.type(form().getByLabelText('요금'), '13500')
    await user.type(form().getByLabelText('결제일 (매월)'), '15')
    await user.click(form().getByRole('button', { name: '고정비 추가' }))
    expect(form().getByText('이름을 입력해 주세요')).toBeInTheDocument()
    expect(form().getByLabelText('이름')).toHaveFocus()
    expect(localStorage.getItem(SUBS_KEY)).toBeNull()
  })
})

describe('손상 (F45)', () => {
  it('AC84: 모르는 종류가 저장돼 있으면 구독 손상 안내를 보이고 덮어쓰지 않는다', async () => {
    const bad = JSON.stringify({ schemaVersion: 1, items: [{ ...sub({}), kind: 'pet' }] })
    localStorage.setItem(SUBS_KEY, bad)
    const user = await openFixed()
    const banner = screen.getByRole('status', { name: '구독 저장 상태' })
    expect(banner).toHaveTextContent('저장된 구독을 읽을 수 없어요. 초기화하기 전까지는 새로 넣은 구독이 저장되지 않아요.')
    await addFixed(user, { name: '휴대폰', price: '55000', kind: '통신', billingDay: '10' })
    expect(localStorage.getItem(SUBS_KEY)).toBe(bad)
  })
})
