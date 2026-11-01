import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'

// PRD F47 해지했어요 (AC88~AC90). 오늘 2026-11-01
const T0 = new Date(2026, 10, 1, 9)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  cleanup()
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

const list = () => within(screen.getByRole('region', { name: '고정비 목록' }))
const summary = () => within(screen.getByRole('region', { name: '고정비 요약' }))
const confirm = () => within(screen.getByRole('group', { name: '해지 확인' }))
const notice = () => within(screen.getByRole('status', { name: '해지 알림' }))
const heading = () => screen.getByRole('heading', { level: 2, name: '고정비' })
const openCancel = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(within(screen.getByRole('article', { name })).getByRole('button', { name: '해지했어요' }))
const openCancelled = async (user: ReturnType<typeof userEvent.setup>, count = 1) => user.click(screen.getByText(`해지한 것 ${count}개`))
const cancelledCard = (name: string) => within(screen.getByRole('article', { name }))

const FIRST = '‘넷플릭스’를 해지한 것으로 옮길까요? 실제 해지는 그곳에서 직접 해야 해요.'
const SECOND = '옮기면 합계에서 빠지고, 모으기의 ‘줄어든 고정비’에 월 13,500원이 더해져요.'
const THIRD = '다른 곳으로 갈아탄 거라면 해지 대신 ‘수정’에서 요금을 바꿔 주세요. 해지로 옮기면 이 요금 전체를 줄어든 고정비로 세요.'

describe('해지했어요 (F47)', () => {
  it('AC88: 해지했어요를 누르면 확인 두 줄과 오늘 날짜가 보이고 옮기기에 포커스가 간다', async () => {
    seed(sub({}))
    const user = await openFixed()
    await openCancel(user, '넷플릭스')
    expect(confirm().getByText(FIRST)).toBeInTheDocument()
    expect(confirm().getByText(SECOND)).toBeInTheDocument()
    expect(confirm().queryByText(THIRD)).not.toBeInTheDocument()
    expect(confirm().getByLabelText('해지한 날')).toHaveValue('2026-11-01')
    expect(confirm().getByLabelText('해지한 날')).toHaveAttribute('type', 'date')
    expect(confirm().getByRole('button', { name: '옮기기' })).toHaveFocus()
    expect(confirm().getByRole('button', { name: '취소' })).toBeInTheDocument()
  })

  it('AC88: 옮기면 목록과 요약에서 빠지고 해지 알림이 보이며 화면 제목에 포커스가 간다', async () => {
    seed(sub({}), sub({ id: 's2', name: '왓챠', priceKrw: 7900, billingDay: 20 }))
    const user = await openFixed()
    expect(summary().getByText('21,400원')).toBeInTheDocument()
    await openCancel(user, '넷플릭스')
    await user.click(confirm().getByRole('button', { name: '옮기기' }))
    expect(list().queryByRole('article', { name: '넷플릭스' })).not.toBeInTheDocument()
    expect(list().getByRole('article', { name: '왓챠' })).toBeInTheDocument()
    expect(summary().getByText('7,900원')).toBeInTheDocument()
    expect(summary().getByText('연 94,800원')).toBeInTheDocument()
    expect(notice().getByText('‘넷플릭스’를 해지한 것으로 옮겼어요.')).toBeInTheDocument()
    expect(notice().getByRole('button', { name: '되돌리기' })).toBeInTheDocument()
    expect(heading()).toHaveFocus()
    expect(storedItems().find((i) => i.name === '넷플릭스')).toMatchObject({ cancelledOn: '2026-11-01' })
  })

  it('AC88: 되돌리기를 누르면 목록과 요약에 돌아오고 알림이 사라진다', async () => {
    seed(sub({}), sub({ id: 's2', name: '왓챠', priceKrw: 7900, billingDay: 20 }))
    const user = await openFixed()
    await openCancel(user, '넷플릭스')
    await user.click(confirm().getByRole('button', { name: '옮기기' }))
    await user.click(notice().getByRole('button', { name: '되돌리기' }))
    expect(list().getByRole('article', { name: '넷플릭스' })).toBeInTheDocument()
    expect(summary().getByText('21,400원')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '해지 알림' })).toBeEmptyDOMElement()
    expect(screen.queryByText(/해지한 것 \d개/)).not.toBeInTheDocument()
    expect(heading()).toHaveFocus()
    expect(storedItems().find((i) => i.name === '넷플릭스')).not.toHaveProperty('cancelledOn')
  })

  it('AC88: 해지한 것을 펼치면 해지한 날과 요금, 다시 쓰기·삭제만 있다', async () => {
    seed(sub({}), sub({ id: 's2', name: '왓챠', priceKrw: 7900, billingDay: 20, cancelledOn: '2026-10-20', memo: '이사 가며 해지' }))
    const user = await openFixed()
    await openCancelled(user)
    const card = cancelledCard('왓챠')
    expect(card.getByText('2026-10-20 해지 · 월 7,900원')).toBeInTheDocument()
    expect(card.getByText('이사 가며 해지')).toBeInTheDocument()
    expect(card.getByText('구독')).toBeInTheDocument()
    expect(card.getByRole('button', { name: '다시 쓰기' })).toBeInTheDocument()
    expect(card.getByRole('button', { name: '삭제' })).toBeInTheDocument()
    expect(card.getAllByRole('button').map((b) => b.textContent)).toEqual(['다시 쓰기', '삭제'])
    // 수정·오늘 썼어요·사용량·다음 결제 줄은 없다
    expect(card.queryByText(/다음 결제/)).not.toBeInTheDocument()
    expect(card.queryByText('해지 후보')).not.toBeInTheDocument()
  })

  it('AC88: 해지한 것이 여럿이면 해지한 날 최신순, 같으면 이름 순이다', async () => {
    seed(
      sub({ id: 'a', name: '다', cancelledOn: '2026-10-01' }),
      sub({ id: 'b', name: '나', cancelledOn: '2026-10-20' }),
      sub({ id: 'c', name: '가', cancelledOn: '2026-10-20' }),
    )
    const user = await openFixed()
    await openCancelled(user, 3)
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['가', '나', '다'])
    // 쓰는 중인 고정비가 없으면 빈 목록 상자가 보이고 해지한 것은 그 아래에 있다
    expect(screen.getByText('아직 등록한 고정비가 없어요.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '고정비 요약' })).not.toBeInTheDocument()
  })

  it('AC88: 연 요금 고정비의 해지 확인은 월 10,000원이다', async () => {
    seed(sub({ id: 'c', name: '클라우드', priceKrw: 120000, cycle: 'yearly', billingDay: undefined, renewalDate: '2027-02-01' }))
    const user = await openFixed()
    await openCancel(user, '클라우드')
    expect(confirm().getByText('옮기면 합계에서 빠지고, 모으기의 ‘줄어든 고정비’에 월 10,000원이 더해져요.')).toBeInTheDocument()
    await user.click(confirm().getByRole('button', { name: '옮기기' }))
    await openCancelled(user)
    expect(cancelledCard('클라우드').getByText('2026-11-01 해지 · 연 120,000원 · 월평균 10,000원')).toBeInTheDocument()
  })

  it('AC89: 통신과 보험의 해지 확인에는 갈아탄 경우 문장이 있다', async () => {
    seed(sub({ id: 'p', name: '휴대폰', priceKrw: 55000, kind: 'phone' }), sub({ id: 'i', name: '보험', priceKrw: 30000, kind: 'insurance' }))
    const user = await openFixed()
    await openCancel(user, '휴대폰')
    expect(confirm().getByText(THIRD)).toBeInTheDocument()
    expect(confirm().getByText('옮기면 합계에서 빠지고, 모으기의 ‘줄어든 고정비’에 월 55,000원이 더해져요.')).toBeInTheDocument()
    await user.click(confirm().getByRole('button', { name: '취소' }))
    await openCancel(user, '보험')
    expect(confirm().getByText(THIRD)).toBeInTheDocument()
  })

  it('AC89: 월세의 해지 확인은 줄어든 고정비로 세지 않는다고 한다', async () => {
    seed(sub({ id: 'h', name: '월세', priceKrw: 450000, kind: 'housing', billingDay: 25 }))
    const user = await openFixed()
    await openCancel(user, '월세')
    expect(confirm().getByText('옮기면 합계에서 빠져요. 월세·관리비는 줄어든 고정비로 세지 않아요.')).toBeInTheDocument()
    expect(confirm().queryByText(THIRD)).not.toBeInTheDocument()
    expect(confirm().queryByText(/에 월 450,000원이 더해져요/)).not.toBeInTheDocument()
  })

  it('AC89: 해지한 날이 범위 밖이거나 비면 오류와 함께 칸으로 포커스한다', async () => {
    seed(sub({}))
    const user = await openFixed()
    await openCancel(user, '넷플릭스')
    const day = confirm().getByLabelText('해지한 날')
    for (const [value, error] of [
      ['2026-08-02', '해지한 날은 90일 전부터 오늘 사이여야 해요'],
      ['2026-11-02', '해지한 날은 90일 전부터 오늘 사이여야 해요'],
      ['', '해지한 날을 골라 주세요'],
    ] as const) {
      fireEvent.change(day, { target: { value } })
      await user.click(confirm().getByRole('button', { name: '옮기기' }))
      expect(confirm().getByText(error)).toBeInTheDocument()
      expect(day).toHaveAttribute('aria-invalid', 'true')
      expect(day).toHaveAccessibleDescription(error)
      expect(day).toHaveFocus()
      expect(storedItems()[0]).not.toHaveProperty('cancelledOn')
    }
    // 90일 전은 받는다
    fireEvent.change(day, { target: { value: '2026-08-03' } })
    await user.click(confirm().getByRole('button', { name: '옮기기' }))
    expect(storedItems()[0]).toMatchObject({ cancelledOn: '2026-08-03' })
  })

  it('AC89: 취소하면 확인이 닫히고 해지했어요에 포커스가 간다', async () => {
    seed(sub({}))
    const user = await openFixed()
    await openCancel(user, '넷플릭스')
    await user.click(confirm().getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('group', { name: '해지 확인' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '넷플릭스' })).getByRole('button', { name: '해지했어요' })).toHaveFocus()
    expect(storedItems()[0]).not.toHaveProperty('cancelledOn')
  })

  it('AC88: 쓰는 중인 카드의 버튼 줄은 수정, 해지했어요, 삭제 순이다', async () => {
    seed(sub({}))
    await openFixed()
    const names = within(screen.getByRole('article', { name: '넷플릭스' }))
      .getAllByRole('button')
      .map((b) => b.textContent)
    const at = (n: string) => names.indexOf(n)
    expect(at('수정')).toBeGreaterThan(-1)
    expect(at('수정')).toBeLessThan(at('해지했어요'))
    expect(at('해지했어요')).toBeLessThan(at('삭제'))
  })
})

describe('다시 쓰기·삭제·여러 탭·예시 (F47)', () => {
  const resumeGroup = () => within(screen.getByRole('group', { name: '다시 쓰기 확인' }))

  it('AC90: 다시 쓰기 확인을 거쳐 옮기면 목록에 돌아오고 화면 제목에 포커스가 간다', async () => {
    seed(sub({ cancelledOn: '2026-10-20' }))
    const user = await openFixed()
    await openCancelled(user)
    await user.click(cancelledCard('넷플릭스').getByRole('button', { name: '다시 쓰기' }))
    expect(resumeGroup().getByText('‘넷플릭스’를 다시 쓰는 것으로 옮길까요? 모으기의 ‘줄어든 고정비’에서도 빠져요.')).toBeInTheDocument()
    expect(resumeGroup().getByRole('button', { name: '옮기기' })).toHaveFocus()
    await user.click(resumeGroup().getByRole('button', { name: '옮기기' }))
    expect(list().getByRole('article', { name: '넷플릭스' })).toBeInTheDocument()
    expect(summary().getByText('13,500원')).toBeInTheDocument()
    expect(screen.queryByText(/해지한 것 \d개/)).not.toBeInTheDocument()
    expect(heading()).toHaveFocus()
    expect(storedItems()[0]).not.toHaveProperty('cancelledOn')
  })

  it('AC90: 다시 쓰기 확인을 취소하면 다시 쓰기에 포커스가 간다', async () => {
    seed(sub({ cancelledOn: '2026-10-20' }))
    const user = await openFixed()
    await openCancelled(user)
    await user.click(cancelledCard('넷플릭스').getByRole('button', { name: '다시 쓰기' }))
    await user.click(resumeGroup().getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('group', { name: '다시 쓰기 확인' })).not.toBeInTheDocument()
    expect(cancelledCard('넷플릭스').getByRole('button', { name: '다시 쓰기' })).toHaveFocus()
    expect(storedItems()[0]).toHaveProperty('cancelledOn', '2026-10-20')
  })

  it('AC90: 월세의 다시 쓰기 확인은 앞 문장만이다', async () => {
    seed(sub({ id: 'h', name: '월세', priceKrw: 450000, kind: 'housing', cancelledOn: '2026-10-20' }))
    const user = await openFixed()
    await openCancelled(user)
    await user.click(cancelledCard('월세').getByRole('button', { name: '다시 쓰기' }))
    expect(resumeGroup().getByText('‘월세’를 다시 쓰는 것으로 옮길까요?')).toBeInTheDocument()
    expect(resumeGroup().queryByText(/줄어든 고정비/)).not.toBeInTheDocument()
  })

  it('AC90: 해지한 것을 삭제하면 기록이 사라진다', async () => {
    seed(sub({ cancelledOn: '2026-10-20' }), sub({ id: 's2', name: '왓챠', priceKrw: 7900, billingDay: 20 }))
    const user = await openFixed()
    await openCancelled(user)
    await user.click(cancelledCard('넷플릭스').getByRole('button', { name: '삭제' }))
    const group = within(screen.getByRole('group', { name: '삭제 확인' }))
    expect(group.getByRole('button', { name: '지우기' })).toHaveFocus()
    await user.click(group.getByRole('button', { name: '지우기' }))
    expect(storedItems().map((i) => i.name)).toEqual(['왓챠'])
    expect(screen.queryByText(/해지한 것 \d개/)).not.toBeInTheDocument()
    expect(heading()).toHaveFocus()
  })

  it('AC90: 수정 폼을 연 동안 다른 탭이 해지하면 폼이 닫히고 해지한 것에 있다', async () => {
    seed(sub({}))
    const user = await openFixed()
    await user.click(within(screen.getByRole('article', { name: '넷플릭스' })).getByRole('button', { name: '수정' }))
    expect(screen.getByRole('form', { name: '고정비 수정' })).toBeInTheDocument()
    seed(sub({ cancelledOn: '2026-10-20' }))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SUBS_KEY }))
    })
    expect(screen.queryByRole('form', { name: '고정비 수정' })).not.toBeInTheDocument()
    await openCancelled(user)
    expect(cancelledCard('넷플릭스').getByText('2026-10-20 해지 · 월 13,500원')).toBeInTheDocument()
  })

  it('AC90: 다른 탭이 해지를 되돌리면 해지 알림이 사라진다', async () => {
    seed(sub({}))
    const user = await openFixed()
    await openCancel(user, '넷플릭스')
    await user.click(confirm().getByRole('button', { name: '옮기기' }))
    expect(notice().getByText('‘넷플릭스’를 해지한 것으로 옮겼어요.')).toBeInTheDocument()
    seed(sub({}))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SUBS_KEY }))
    })
    expect(screen.getByRole('status', { name: '해지 알림' })).toBeEmptyDOMElement()
  })

  it('AC90: 예시를 해지한 뒤 예시 구독만 지우기를 하면 해지한 예시도 지워진다', async () => {
    const user = await openFixed()
    await user.click(screen.getByRole('button', { name: '예시 구독 넣기' }))
    await openCancel(user, '(예시) 넷플릭스')
    await user.click(confirm().getByRole('button', { name: '옮기기' }))
    await user.click(screen.getByRole('button', { name: '예시 구독만 지우기' }))
    expect(screen.getByText("이름이 '(예시)'로 시작하는 구독 5개를 지울까요?")).toBeInTheDocument()
    await user.click(within(screen.getByRole('group', { name: '예시 지우기 확인' })).getByRole('button', { name: '지우기' }))
    expect(storedItems()).toEqual([])
    expect(screen.queryByText(/해지한 것 \d개/)).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: '해지 알림' })).toBeEmptyDOMElement()
  })

  it('AC90: 해지는 고정비 키 하나만 쓴다', async () => {
    seed(sub({}))
    const user = await openFixed()
    const keys: string[] = []
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      keys.push(key)
      return original.call(this, key, value)
    })
    await openCancel(user, '넷플릭스')
    await user.click(confirm().getByRole('button', { name: '옮기기' }))
    await user.click(notice().getByRole('button', { name: '되돌리기' }))
    expect(keys).toEqual([SUBS_KEY, SUBS_KEY])
  })
})
