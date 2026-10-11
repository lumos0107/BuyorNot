import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY } from './logic/subscriptions'

// 2차 11단계: 구독 정리함 (F14, AC27)
const T0 = new Date(2026, 9, 11, 9, 0) // 2026-10-11 현지 시각

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

async function openSubs() {
  const user = userEvent.setup()
  const utils = render(<App />)
  await user.click(screen.getByRole('tab', { name: '구독' }))
  return { user, ...utils }
}

const form = () => within(screen.getByRole('form', { name: '구독 담기' }))
const card = (name: string) => within(screen.getByRole('article', { name }))
const summary = () => within(screen.getByRole('region', { name: '구독 요약' }))

type Fill = { name: string; price: string; cycle?: '매월' | '매년'; billingDay?: string; renewal?: string; lastUsed?: string }

async function addSub(user: ReturnType<typeof userEvent.setup>, f: Fill) {
  if (f.name) await user.type(form().getByLabelText('구독 이름'), f.name)
  await user.type(form().getByLabelText('요금'), f.price)
  await user.click(form().getByRole('radio', { name: f.cycle ?? '매월' }))
  if ((f.cycle ?? '매월') === '매월') await user.type(form().getByLabelText('결제일 (매월)'), f.billingDay ?? '15')
  else fireEvent.change(form().getByLabelText('다음 갱신일'), { target: { value: f.renewal ?? '' } })
  if (f.lastUsed) fireEvent.change(form().getByLabelText('마지막 사용일 (선택)'), { target: { value: f.lastUsed } })
  await user.click(form().getByRole('button', { name: '구독 추가' }))
}

describe('구독 정리함 (F14)', () => {
  it('네 번째 메뉴로 열리고, 비어 있으면 안내한다', async () => {
    await openSubs()
    expect(screen.getByRole('tab', { name: '구독', selected: true })).toBeInTheDocument()
    expect(screen.getByText('아직 등록한 구독이 없어요.')).toBeInTheDocument()
  })

  it('AC27: 월 구독을 넣으면 다음 결제일·D-n과 요약이 보인다', async () => {
    const { user } = await openSubs()
    await addSub(user, { name: '넷플릭스', price: '13500', billingDay: '15', lastUsed: '2026-10-01' })
    expect(card('넷플릭스').getByText('월 13,500원')).toBeInTheDocument()
    expect(card('넷플릭스').getByText('다음 결제 2026-10-15 · D-4')).toBeInTheDocument()
    expect(card('넷플릭스').queryByText('해지 후보')).not.toBeInTheDocument()
    expect(summary().getByText('월 13,500원')).toBeInTheDocument()
    expect(summary().getByText('연 162,000원')).toBeInTheDocument()
  })

  it('AC27: 연 구독은 월 환산을 함께 보여주고, 사용 기록이 없으면 해지 후보다', async () => {
    const { user } = await openSubs()
    await addSub(user, { name: '클라우드', price: '120005', cycle: '매년', renewal: '2027-01-01' })
    expect(card('클라우드').getByText('연 120,005원 · 월 10,000원')).toBeInTheDocument()
    expect(card('클라우드').getByText('다음 결제 2027-01-01 · D-82')).toBeInTheDocument()
    expect(card('클라우드').getByText('해지 후보')).toBeInTheDocument()
    expect(summary().getByText('해지 후보 1개 · 월 10,000원')).toBeInTheDocument()
  })

  it('잘못된 입력은 오류를 보여주고 추가하지 않는다', async () => {
    const { user } = await openSubs()
    await addSub(user, { name: '', price: '13500', billingDay: '32' })
    expect(form().getByLabelText('구독 이름')).toHaveAccessibleDescription(/이름을 입력/)
    expect(form().getByLabelText('결제일 (매월)')).toHaveAccessibleDescription(/1~31일/)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('새로고침해도 남고, 수정·삭제(확인)할 수 있다', async () => {
    const { user, unmount } = await openSubs()
    await addSub(user, { name: '넷플릭스', price: '13500', billingDay: '15', lastUsed: '2026-10-01' })
    unmount()
    const again = await openSubs()
    await again.user.click(card('넷플릭스').getByRole('button', { name: '수정' }))
    const editor = within(screen.getByRole('form', { name: '구독 수정' }))
    await again.user.clear(editor.getByLabelText('요금'))
    await again.user.type(editor.getByLabelText('요금'), '17000')
    await again.user.click(editor.getByRole('button', { name: '저장' }))
    expect(card('넷플릭스').getByText('월 17,000원')).toBeInTheDocument()
    await again.user.click(card('넷플릭스').getByRole('button', { name: '삭제' }))
    await again.user.click(card('넷플릭스').getByRole('button', { name: '지우기' }))
    expect(screen.queryByRole('article', { name: '넷플릭스' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items).toEqual([])
  })

  it('손상된 구독 데이터는 덮어쓰지 않고 알리며, 확인 후 초기화한다', async () => {
    localStorage.setItem(SUBS_KEY, '{bad')
    const { user } = await openSubs()
    const banner = within(screen.getByRole('status', { name: '구독 저장 상태' }))
    expect(banner.getByText(/저장된 구독을 읽을 수 없어요/)).toBeInTheDocument()
    await user.click(banner.getByRole('button', { name: '구독 기록 초기화' }))
    await user.click(banner.getByRole('button', { name: '초기화' }))
    expect(screen.queryByRole('status', { name: '구독 저장 상태' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').schemaVersion).toBe(1)
  })

  it('수정을 열면 이름에, 삭제 취소는 삭제 버튼에, 지우면 화면 제목에 포커스가 간다', async () => {
    const { user } = await openSubs()
    await addSub(user, { name: '넷플릭스', price: '13500', billingDay: '15' })
    await user.click(card('넷플릭스').getByRole('button', { name: '수정' }))
    expect(within(screen.getByRole('form', { name: '구독 수정' })).getByLabelText('구독 이름')).toHaveFocus()
    await user.click(within(screen.getByRole('form', { name: '구독 수정' })).getByRole('button', { name: '취소' }))
    await user.click(card('넷플릭스').getByRole('button', { name: '삭제' }))
    await user.click(card('넷플릭스').getByRole('button', { name: '취소' }))
    expect(card('넷플릭스').getByRole('button', { name: '삭제' })).toHaveFocus()
    await user.click(card('넷플릭스').getByRole('button', { name: '삭제' }))
    await user.click(card('넷플릭스').getByRole('button', { name: '지우기' }))
    expect(screen.getByRole('heading', { level: 2, name: '구독' })).toHaveFocus()
  })

  it('예시 구독을 넣으면 월·연 구독과 해지 후보가 함께 보인다', async () => {
    const { user } = await openSubs()
    await user.click(screen.getByRole('button', { name: '예시 구독 넣기' }))
    expect(screen.getAllByRole('article').length).toBe(3)
    expect(summary().getByText(/해지 후보 1개/)).toBeInTheDocument()
  })
})
