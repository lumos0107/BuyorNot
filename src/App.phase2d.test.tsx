import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// 2차 10단계: 결정 기록 요약(구매 포기 금액·시급 환산)과 구매 후 회고 (F12, AC24, AC25)
const T0 = new Date('2026-10-11T09:00:00+09:00')
const DAY = 24 * 60 * 60 * 1000

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

const card = (name: string) => within(screen.getByRole('article', { name }))
const summary = () => within(screen.getByRole('region', { name: '결정 기록 요약' }))

async function addAndDecide(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  price: string,
  decision: '구매함' | '구매 포기',
) {
  const form = within(screen.getByRole('form', { name: '물건 담기' }))
  await user.type(form.getByLabelText('상품명'), name)
  await user.type(form.getByLabelText('가격'), price)
  await user.type(form.getByLabelText('사고 싶은 이유'), '이유')
  await user.click(form.getByRole('button', { name: '담아 두기' }))
  await user.click(card(name).getByRole('button', { name: decision }))
  await user.click(card(name).getByRole('button', { name: `${decision} 확인` }))
}

async function passTime(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
}

describe('결정 기록 요약 (AC24)', () => {
  it('구매 포기 2건의 합계와 시급 환산을 보여주고, 시급은 새로고침 뒤에도 남는다', async () => {
    const { user, unmount } = setup()
    await addAndDecide(user, '무선 헤드폰', '129000', '구매 포기')
    await addAndDecide(user, '접이식 건조대', '45000', '구매 포기')
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(summary().getByText('구매 포기 2건')).toBeInTheDocument()
    expect(summary().getByText('174,000원')).toBeInTheDocument()
    expect(summary().getByText(/전체 기록 기준/)).toBeInTheDocument()
    expect(summary().queryByText(/환산하면/)).not.toBeInTheDocument()

    await user.type(summary().getByLabelText('시급 (선택)'), '10000')
    expect(summary().getByText('입력한 시급으로 환산하면 약 17.4시간')).toBeInTheDocument()

    unmount()
    const again = setup()
    await again.user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(summary().getByLabelText('시급 (선택)')).toHaveValue('10000')
    expect(summary().getByText('입력한 시급으로 환산하면 약 17.4시간')).toBeInTheDocument()
  })

  it('시급을 비우면 환산을 숨기고, 범위 밖이면 오류를 보여준다', async () => {
    const { user } = setup()
    await addAndDecide(user, '무선 헤드폰', '129000', '구매 포기')
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    const wage = summary().getByLabelText('시급 (선택)')
    await user.type(wage, '999')
    expect(wage).toHaveAccessibleDescription(/1,000원~1,000,000원/)
    expect(summary().queryByText(/환산하면/)).not.toBeInTheDocument()
    await user.clear(wage)
    expect(wage).not.toHaveAccessibleDescription(/1,000원~1,000,000원/)
  })

  it('필터를 바꿔도 요약은 전체 기록 기준 그대로다', async () => {
    const { user } = setup()
    await addAndDecide(user, '무선 헤드폰', '129000', '구매 포기')
    await addAndDecide(user, '무선 청소기', '189000', '구매함')
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    await user.click(screen.getByRole('button', { name: '구매함 (1)' }))
    expect(summary().getByText('구매 포기 1건')).toBeInTheDocument()
    expect(summary().getByText('129,000원')).toBeInTheDocument()
  })

  it('예시 기록이 섞여 있으면 "예시 포함"이라고 적는다', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(summary().getByText(/예시 포함/)).toBeInTheDocument()
  })
})

describe('구매 후 회고 (AC25)', () => {
  it('결정 7일 정각부터 묻고, 답을 저장·고칠 수 있으며 집계에 반영된다', async () => {
    const { user, unmount } = setup()
    await addAndDecide(user, '무선 청소기', '189000', '구매함')
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    await passTime(7 * DAY - 1)
    expect(card('무선 청소기').queryByText('잘 샀나요?')).not.toBeInTheDocument()
    await passTime(1)
    const record = card('무선 청소기')
    expect(record.getByText('잘 샀나요?')).toBeInTheDocument()
    await user.click(record.getByRole('radio', { name: '후회해요' }))
    await user.type(record.getByLabelText('한 줄 회고 (선택)'), '거의 안 씀')
    await user.click(record.getByRole('button', { name: '회고 저장' }))
    expect(card('무선 청소기').getByText('회고: 후회해요 · 거의 안 씀')).toBeInTheDocument()
    expect(summary().getByText('회고 1건 중 후회 1건')).toBeInTheDocument()

    unmount()
    const again = setup()
    await again.user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(card('무선 청소기').getByText('회고: 후회해요 · 거의 안 씀')).toBeInTheDocument()
    await again.user.click(card('무선 청소기').getByRole('button', { name: '회고 고치기' }))
    await again.user.click(card('무선 청소기').getByRole('radio', { name: '잘 샀어요' }))
    await again.user.click(card('무선 청소기').getByRole('button', { name: '회고 저장' }))
    expect(summary().getByText('회고 1건 중 후회 0건')).toBeInTheDocument()
  })

  it('답을 고르지 않으면 저장하지 않고 안내한다', async () => {
    const { user } = setup()
    await addAndDecide(user, '무선 청소기', '189000', '구매함')
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    await passTime(7 * DAY)
    await user.click(card('무선 청소기').getByRole('button', { name: '회고 저장' }))
    expect(card('무선 청소기').getByText('구매 후 느낌을 하나 골라 주세요')).toBeInTheDocument()
  })

  it('예시 데이터에는 회고를 물을 수 있는 구매 기록이 있다', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(card('(예시) 무선 청소기').getByText('잘 샀나요?')).toBeInTheDocument()
  })
})
