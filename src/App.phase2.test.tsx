import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// 2차 7단계: 더 고민하기(F07), 결정 메모(F08), 결정 기록 필터(F12) — AC18, AC19, AC23
const T0 = new Date('2026-10-11T09:00:00+09:00')
const HOUR = 60 * 60 * 1000

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<App />)
  return { user, ...utils }
}

type Fill = { name?: string; price?: string; reason?: string; days?: '1' | '3' | '7' }

async function addItem(user: ReturnType<typeof userEvent.setup>, fill: Fill = {}) {
  const { name = '무선 헤드폰', price = '129000', reason = '유선 이어폰 선이 자꾸 끊겨서', days = '3' } = fill
  const form = within(screen.getByRole('form', { name: '물건 담기' }))
  await user.type(form.getByLabelText('상품명'), name)
  await user.type(form.getByLabelText('가격'), price)
  await user.type(form.getByLabelText('사고 싶은 이유'), reason)
  await user.click(form.getByRole('radio', { name: `${days}일` }))
  await user.click(form.getByRole('button', { name: '담아 두기' }))
}

const card = (name: string) => within(screen.getByRole('article', { name }))

async function passTime(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
}

describe('더 고민하기 (F07)', () => {
  it('AC18: 3일을 연장하면 남은 시간이 늘고 "1번 연장"이 보인다', async () => {
    const { user } = setup()
    await addItem(user)
    await passTime(24 * HOUR)
    expect(card('무선 헤드폰').getByText('고민 중 · 2일 남음')).toBeInTheDocument()
    await user.click(card('무선 헤드폰').getByRole('button', { name: '더 고민하기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '3일 더' }))
    expect(card('무선 헤드폰').getByText('고민 중 · 5일 남음')).toBeInTheDocument()
    expect(card('무선 헤드폰').getByText(/1번 연장/)).toBeInTheDocument()
  })

  it('고민 기간 끝 상태에서 연장하면 고민 중으로 돌아간다', async () => {
    const { user } = setup()
    await addItem(user, { days: '1' })
    await passTime(48 * HOUR)
    expect(card('무선 헤드폰').getByText('고민 기간 끝')).toBeInTheDocument()
    await user.click(card('무선 헤드폰').getByRole('button', { name: '더 고민하기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '1일 더' }))
    expect(card('무선 헤드폰').getByText('고민 중 · 1일 남음')).toBeInTheDocument()
  })
})

describe('결정 메모 (F08)', () => {
  it('AC19: 구매 포기 때 메모를 적으면 결정 기록에 보인다', async () => {
    const { user } = setup()
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.type(card('무선 헤드폰').getByLabelText('결정 메모 (선택)'), '지금 이어폰도 쓸 만해서')
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(card('무선 헤드폰').getByText('지금 이어폰도 쓸 만해서')).toBeInTheDocument()
  })

  it('AC19: 메모 없이 확인해도 결정되고, 취소하면 고민 중에 남는다', async () => {
    const { user } = setup()
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '취소' }))
    expect(card('무선 헤드폰').getByRole('button', { name: '구매함' })).toBeInTheDocument()
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함 확인' }))
    expect(screen.getByText('아직 담아 둔 물건이 없어요.')).toBeInTheDocument()
  })

  it('AC19: 메모가 201자면 오류를 보여주고 결정하지 않는다', async () => {
    const { user } = setup()
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    const note = card('무선 헤드폰').getByLabelText('결정 메모 (선택)')
    await user.type(note, '가'.repeat(201))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    expect(note).toHaveAccessibleDescription(/200자/)
    expect(screen.getByRole('article', { name: '무선 헤드폰' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(screen.getByText('아직 결정한 물건이 없어요.')).toBeInTheDocument()
  })
})

describe('키보드 포커스 (F06, GPT 2차 PRD 검토)', () => {
  it('더 고민하기를 열면 첫 선택지로, 취소하면 다시 더 고민하기로 포커스가 간다', async () => {
    const { user } = setup()
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '더 고민하기' }))
    expect(card('무선 헤드폰').getByRole('button', { name: '1일 더' })).toHaveFocus()
    await user.click(card('무선 헤드폰').getByRole('button', { name: '취소' }))
    expect(card('무선 헤드폰').getByRole('button', { name: '더 고민하기' })).toHaveFocus()
  })

  it('결정 확인을 열면 확인 폼으로(메모 입력은 자동으로 열지 않음), 취소하면 누른 버튼으로 포커스가 돌아간다', async () => {
    const { user } = setup()
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    expect(card('무선 헤드폰').getByRole('form', { name: '구매 포기 확인' })).toHaveFocus()
    expect(card('무선 헤드폰').getByLabelText('결정 메모 (선택)')).not.toHaveFocus()
    await user.click(card('무선 헤드폰').getByRole('button', { name: '취소' }))
    expect(card('무선 헤드폰').getByRole('button', { name: '구매 포기' })).toHaveFocus()
  })

  it('메모 입력에서 Enter는 줄바꿈이고 결정을 확정하지 않는다', async () => {
    const { user } = setup()
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    await user.keyboard('세일이라서{Enter}')
    expect(card('무선 헤드폰').getByRole('button', { name: '구매함 확인' })).toBeInTheDocument()
  })
})

describe('결정 기록 필터 (F12)', () => {
  it('AC23: 구매함만 걸러 보고 건수가 맞다', async () => {
    const { user } = setup()
    await addItem(user, { name: '무선 헤드폰' })
    await addItem(user, { name: '로봇청소기', price: '450000', reason: '청소' })
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    await user.click(card('로봇청소기').getByRole('button', { name: '구매함' }))
    await user.click(card('로봇청소기').getByRole('button', { name: '구매함 확인' }))
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(screen.getByRole('button', { name: '전체 (2)', pressed: true })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '구매함 (1)' }))
    expect(screen.getByRole('button', { name: '구매함 (1)', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '로봇청소기' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '구매 포기 (1)' }))
    expect(screen.getByRole('article', { name: '무선 헤드폰' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '로봇청소기' })).not.toBeInTheDocument()
  })
})
