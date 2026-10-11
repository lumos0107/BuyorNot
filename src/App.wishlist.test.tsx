import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// 4단계: 등록 → 숙려 → 결정 → 결정 기록, 새로고침 복원 (PRD F01, F02, F03, F06 / AC01~AC04)
const T0 = new Date('2026-10-11T09:00:00+09:00')
const HOUR = 60 * 60 * 1000

beforeEach(() => {
  localStorage.clear()
  // Date만 가짜로 둔다. setTimeout까지 가짜로 바꾸면 Testing Library의 내부 대기가 끝나지 않는다
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
  if (name) await user.type(form.getByLabelText('상품명'), name)
  await user.type(form.getByLabelText('가격'), price)
  await user.type(form.getByLabelText('사고 싶은 이유'), reason)
  await user.click(form.getByRole('radio', { name: `${days}일` }))
  await user.click(form.getByRole('button', { name: '담아 두기' }))
}

const card = (name: string) => within(screen.getByRole('article', { name }))

// 시간을 옮긴 뒤 창 포커스 복귀 이벤트를 보내 남은 시간을 다시 계산하게 한다. (F02: 포커스 복귀 시 재계산)
async function passTime(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
}

describe('숙려 리스트', () => {
  it('담으면 숙려 중 카드로 보이고 폼은 비워진다', async () => {
    const { user } = setup()
    await addItem(user)
    expect(card('무선 헤드폰').getByText('129,000원')).toBeInTheDocument()
    expect(card('무선 헤드폰').getByText('숙려 중 · 3일 남음')).toBeInTheDocument()
    expect(within(screen.getByRole('form', { name: '물건 담기' })).getByLabelText('상품명')).toHaveValue('')
    expect(screen.queryByText('아직 담아 둔 물건이 없어요.')).not.toBeInTheDocument()
  })

  it('AC01: 새로고침해도 상품과 종료 시각이 남는다', async () => {
    const { user, unmount } = setup()
    await addItem(user)
    await passTime(HOUR)
    unmount()
    setup()
    expect(card('무선 헤드폰').getByText('숙려 중 · 2일 23시간 남음')).toBeInTheDocument()
  })

  it('AC02·AC03: 숙려가 끝나면 재검토 가능이 되고, 결정하기 전까지 고민 중에 남는다', async () => {
    const { user } = setup()
    await addItem(user, { days: '1' })
    await passTime(24 * HOUR - 60 * 1000)
    expect(card('무선 헤드폰').getByText('숙려 중 · 1분 남음')).toBeInTheDocument()
    await passTime(60 * 1000)
    expect(card('무선 헤드폰').getByText('재검토 가능')).toBeInTheDocument()
    expect(card('무선 헤드폰').getByText('아직 필요한가요?')).toBeInTheDocument()
    await passTime(100 * HOUR)
    expect(card('무선 헤드폰').getByText('재검토 가능')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(screen.getByText('아직 결정한 물건이 없어요.')).toBeInTheDocument()
  })

  it('구매함을 고르면 결정 기록으로 옮겨진다', async () => {
    const { user } = setup()
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    expect(screen.getByText('아직 담아 둔 물건이 없어요.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    const record = card('무선 헤드폰')
    expect(record.getByText('구매함')).toBeInTheDocument()
    expect(record.getByText('129,000원')).toBeInTheDocument()
    expect(record.getByText('유선 이어폰 선이 자꾸 끊겨서')).toBeInTheDocument()
    expect(record.getByText(/결정 2026-10-11/)).toBeInTheDocument()
  })

  it('AC04: 포기한 기록은 새로고침 후에도 남고, 지우면 사라진다', async () => {
    const { user, unmount } = setup()
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    unmount()
    const again = setup()
    await again.user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(card('무선 헤드폰').getByText('구매 포기')).toBeInTheDocument()
    await again.user.click(card('무선 헤드폰').getByRole('button', { name: '삭제' }))
    await again.user.click(card('무선 헤드폰').getByRole('button', { name: '지우기' }))
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
    again.unmount()
    const third = setup()
    await third.user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(screen.getByText('아직 결정한 물건이 없어요.')).toBeInTheDocument()
  })

  it('빈 상품명은 오류를 보여주고 담지 않는다', async () => {
    const { user } = setup()
    await addItem(user, { name: '' })
    const form = within(screen.getByRole('form', { name: '물건 담기' }))
    expect(form.getByText('상품명을 입력해 주세요')).toBeInTheDocument()
    expect(form.getByLabelText('상품명')).toHaveAccessibleDescription(/상품명을 입력/)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('고민 중인 상품을 수정해도 종료 시각은 그대로다', async () => {
    const { user } = setup()
    await addItem(user)
    await passTime(HOUR)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '수정' }))
    const editor = within(screen.getByRole('form', { name: '물건 수정' }))
    await user.clear(editor.getByLabelText('상품명'))
    await user.type(editor.getByLabelText('상품명'), '헤드폰')
    await user.click(editor.getByRole('button', { name: '저장' }))
    expect(card('헤드폰').getByText('숙려 중 · 2일 23시간 남음')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
  })

  it('숙려 기간을 직접 입력할 수 있다', async () => {
    const { user } = setup()
    const form = within(screen.getByRole('form', { name: '물건 담기' }))
    await user.type(form.getByLabelText('상품명'), '로봇청소기')
    await user.type(form.getByLabelText('가격'), '450000')
    await user.type(form.getByLabelText('사고 싶은 이유'), '청소할 시간이 없어서')
    await user.click(form.getByRole('radio', { name: '직접 입력' }))
    await user.type(form.getByLabelText('숙려 일수'), '10')
    await user.click(form.getByRole('button', { name: '담아 두기' }))
    expect(card('로봇청소기').getByText('숙려 중 · 10일 남음')).toBeInTheDocument()
  })

  it('삭제는 확인을 거치고, 취소하면 남는다', async () => {
    const { user } = setup()
    await addItem(user)
    await user.click(card('무선 헤드폰').getByRole('button', { name: '삭제' }))
    expect(card('무선 헤드폰').getByText('‘무선 헤드폰’을 지울까요?')).toBeInTheDocument()
    await user.click(card('무선 헤드폰').getByRole('button', { name: '취소' }))
    expect(screen.getByRole('article', { name: '무선 헤드폰' })).toBeInTheDocument()
    await user.click(card('무선 헤드폰').getByRole('button', { name: '삭제' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '지우기' }))
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
    expect(screen.getByText('아직 담아 둔 물건이 없어요.')).toBeInTheDocument()
  })
})

// GPT 4단계 검토 반영: 직접 입력 일수의 오류 연결
describe('직접 입력 일수', () => {
  it('범위를 벗어나면 그 입력에 오류가 연결된다', async () => {
    const { user } = setup()
    const form = within(screen.getByRole('form', { name: '물건 담기' }))
    await user.type(form.getByLabelText('상품명'), '로봇청소기')
    await user.type(form.getByLabelText('가격'), '450000')
    await user.type(form.getByLabelText('사고 싶은 이유'), '이유')
    await user.click(form.getByRole('radio', { name: '직접 입력' }))
    await user.type(form.getByLabelText('숙려 일수'), '40')
    await user.click(form.getByRole('button', { name: '담아 두기' }))
    const days = form.getByLabelText('숙려 일수')
    expect(days).toHaveAttribute('aria-invalid', 'true')
    expect(days).toHaveAccessibleDescription(/1~30일/)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
