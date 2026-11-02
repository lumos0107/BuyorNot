import { renderWishlistApp } from './test/renderWishlistApp'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY } from './logic/storage'
import { reconsiderItem, type WishItem } from './logic/wishlist'

// PRD F18 실수 되돌리기: 결정 직후 되돌리기, 결정 기록에서 다시 고민하기
const T0 = new Date('2026-10-11T09:00:00+09:00')
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(T0.getTime() + days * DAY).toISOString()

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

const card = (name: string) => within(screen.getByRole('article', { name }))
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0]

const bought: WishItem = {
  id: 'p1',
  name: '전기 포트',
  priceKrw: 32000,
  reason: '물 끓이기',
  url: null,
  createdAt: at(-12),
  updatedAt: at(-8),
  reviewAt: at(-9),
  status: 'purchased',
  decidedAt: at(-8),
  decisionNote: '세일이라서',
  satisfaction: 'regret',
  reviewNote: '거의 안 씀',
  extensions: 1,
  answers: { haveOne: 'no' },
}

describe('다시 고민하기 계산 (F18)', () => {
  it('고민 중으로 돌리고 결정 시각·결정 메모·회고는 지우며, 고민 기간·연장·답은 그대로 둔다', () => {
    const next = reconsiderItem(bought, T0)
    expect(next).toEqual({
      id: 'p1',
      name: '전기 포트',
      priceKrw: 32000,
      reason: '물 끓이기',
      url: null,
      createdAt: at(-12),
      updatedAt: T0.toISOString(),
      reviewAt: at(-9),
      status: 'considering',
      decidedAt: null,
      extensions: 1,
      answers: { haveOne: 'no' },
    })
  })
})

describe('결정 직후 되돌리기 (F18)', () => {
  it('구매 포기를 확인하면 알림과 되돌리기가 보이고, 누르면 고민 중으로 돌아온다', async () => {
    const user = userEvent.setup()
    renderWishlistApp()
    const form = within(screen.getByRole('form', { name: '물건 담기' }))
    await user.type(form.getByLabelText('상품명'), '무선 헤드폰')
    await user.type(form.getByLabelText('가격'), '129000')
    await user.type(form.getByLabelText('사고 싶은 이유'), '이유')
    await user.click(form.getByRole('button', { name: '담아 두기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.type(card('무선 헤드폰').getByLabelText('결정 메모 (선택)'), '참기로')
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))

    const notice = within(screen.getByRole('status', { name: '결정 알림' }))
    expect(notice.getByText('‘무선 헤드폰’을 구매 포기로 옮겼어요.')).toBeInTheDocument()
    await user.click(notice.getByRole('button', { name: '되돌리기' }))

    expect(screen.getByRole('article', { name: '무선 헤드폰' })).toBeInTheDocument()
    expect(stored()).toMatchObject({ status: 'considering', decidedAt: null })
    expect(stored().decisionNote).toBeUndefined()
    expect(screen.queryByText('‘무선 헤드폰’을 구매 포기로 옮겼어요.')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toHaveFocus()
  })

  it('구매함으로 옮긴 알림은 받침에 맞는 조사로 쓴다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [{ ...reconsiderItem(bought, T0), name: '키보드' }] }))
    const user = userEvent.setup()
    renderWishlistApp()
    await user.click(card('키보드').getByRole('button', { name: '구매함' }))
    await user.click(card('키보드').getByRole('button', { name: '구매함 확인' }))
    expect(within(screen.getByRole('status', { name: '결정 알림' })).getByText('‘키보드’를 구매함으로 옮겼어요.')).toBeInTheDocument()
  })

  // AC78 (F18 구매함 직후 회고 안내): 두 물건을 고민 중으로 두고 '키보드'는 구매함, '마우스'는 구매 포기로 옮긴다
  const MOVED = '‘키보드’를 구매함으로 옮겼어요.'
  const RETRO_LINE = '7일 뒤부터 결정 기록에서 잘 샀는지 적을 수 있어요.'
  const seedTwo = () =>
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        items: [
          { ...reconsiderItem(bought, T0), name: '키보드' },
          { ...reconsiderItem(bought, T0), id: 'p2', name: '마우스' },
        ],
      }),
    )
  const notice = () => within(screen.getByRole('status', { name: '결정 알림' }))
  async function buy(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(card(name).getByRole('button', { name: '구매함' }))
    await user.click(card(name).getByRole('button', { name: '구매함 확인' }))
  }

  it('AC78: 구매함을 확인하면 결정 알림에 옮겼어요 문장과 그 아래 7일 뒤부터 회고를 적을 수 있다는 줄이 함께 보인다', async () => {
    seedTwo()
    const user = userEvent.setup()
    renderWishlistApp()
    await buy(user, '키보드')

    const moved = notice().getByText(MOVED)
    const retro = notice().getByText(RETRO_LINE)
    expect(moved).not.toBe(retro)
    expect(moved.compareDocumentPosition(retro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(notice().getByRole('button', { name: '되돌리기' })).toBeInTheDocument()
  })

  it('AC78: 구매 포기를 확인하면 회고 줄이 없다', async () => {
    seedTwo()
    const user = userEvent.setup()
    renderWishlistApp()
    await user.click(card('키보드').getByRole('button', { name: '구매 포기' }))
    await user.click(card('키보드').getByRole('button', { name: '구매 포기 확인' }))

    expect(notice().getByText('‘키보드’를 구매 포기로 옮겼어요.')).toBeInTheDocument()
    expect(screen.queryByText(RETRO_LINE)).not.toBeInTheDocument()
  })

  it('AC78: 되돌리기를 누르면 회고 줄도 함께 사라진다', async () => {
    seedTwo()
    const user = userEvent.setup()
    renderWishlistApp()
    await buy(user, '키보드')
    expect(notice().getByText(RETRO_LINE)).toBeInTheDocument()
    await user.click(notice().getByRole('button', { name: '되돌리기' }))

    expect(screen.queryByText(MOVED)).not.toBeInTheDocument()
    expect(screen.queryByText(RETRO_LINE)).not.toBeInTheDocument()
  })

  // AC96 (F18 보강): 구매 포기를 확인한 직후 '참은 구매' 안내 줄
  const SKIPPED_LINE = '구매 포기한 금액은 모으기의 ‘참은 구매’에 더해져요.'

  it('AC96: 구매 포기를 확인하면 결정 알림에 참은 구매 안내 줄이 따로 보인다', async () => {
    seedTwo()
    const user = userEvent.setup()
    renderWishlistApp()
    await user.click(card('키보드').getByRole('button', { name: '구매 포기' }))
    await user.click(card('키보드').getByRole('button', { name: '구매 포기 확인' }))

    const moved = notice().getByText('‘키보드’를 구매 포기로 옮겼어요.')
    const line = notice().getByText(SKIPPED_LINE)
    expect(moved).not.toBe(line)
    expect(moved.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(notice().getByRole('button', { name: '되돌리기' })).toBeInTheDocument()
    expect(screen.queryByText(RETRO_LINE)).not.toBeInTheDocument()
  })

  it('AC96: 구매함을 확인하면 그 줄이 없고 회고 줄은 그대로다', async () => {
    seedTwo()
    const user = userEvent.setup()
    renderWishlistApp()
    await buy(user, '키보드')

    expect(screen.queryByText(SKIPPED_LINE)).not.toBeInTheDocument()
    expect(notice().getByText(RETRO_LINE)).toBeInTheDocument()
  })

  it('AC96: 되돌리기를 누르면 그 줄도 사라진다', async () => {
    seedTwo()
    const user = userEvent.setup()
    renderWishlistApp()
    await user.click(card('키보드').getByRole('button', { name: '구매 포기' }))
    await user.click(card('키보드').getByRole('button', { name: '구매 포기 확인' }))
    expect(notice().getByText(SKIPPED_LINE)).toBeInTheDocument()
    await user.click(notice().getByRole('button', { name: '되돌리기' }))

    expect(screen.queryByText(SKIPPED_LINE)).not.toBeInTheDocument()
  })

  it('AC78: 구매함 뒤 다른 물건을 구매 포기하면 알림이 바뀌고 회고 줄이 없다', async () => {
    seedTwo()
    const user = userEvent.setup()
    renderWishlistApp()
    await buy(user, '키보드')
    expect(notice().getByText(RETRO_LINE)).toBeInTheDocument()
    await user.click(card('마우스').getByRole('button', { name: '구매 포기' }))
    await user.click(card('마우스').getByRole('button', { name: '구매 포기 확인' }))

    expect(notice().getByText('‘마우스’를 구매 포기로 옮겼어요.')).toBeInTheDocument()
    expect(screen.queryByText(MOVED)).not.toBeInTheDocument()
    expect(screen.queryByText(RETRO_LINE)).not.toBeInTheDocument()
  })

  it('AC78: 구매함 뒤 새로고침하면 결정 알림과 회고 줄이 없다', async () => {
    seedTwo()
    const user = userEvent.setup()
    const first = renderWishlistApp()
    await buy(user, '키보드')
    expect(notice().getByText(RETRO_LINE)).toBeInTheDocument()
    first.unmount()

    renderWishlistApp()
    expect(screen.queryByText(MOVED)).not.toBeInTheDocument()
    expect(screen.queryByText(RETRO_LINE)).not.toBeInTheDocument()
    expect(notice().queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
  })
})

describe('결정 기록에서 다시 고민하기 (F18)', () => {
  async function openHistory() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [bought] }))
    const user = userEvent.setup()
    renderWishlistApp()
    await user.click(screen.getByRole('tab', { name: '물건' })); await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    return user
  }

  it('확인하면 고민 중인 물건으로 옮기고 결정 메모와 회고를 지운다', async () => {
    const user = await openHistory()
    await user.click(card('전기 포트').getByRole('button', { name: '다시 고민하기' }))
    const confirm = within(card('전기 포트').getByRole('group', { name: '다시 고민하기 확인' }))
    expect(confirm.getByText('‘전기 포트’를 다시 고민 중으로 옮길까요? 결정 메모와 회고는 지워져요.')).toBeInTheDocument()
    expect(confirm.getByRole('button', { name: '옮기기' })).toHaveFocus()
    await user.click(confirm.getByRole('button', { name: '옮기기' }))

    expect(screen.queryByRole('article', { name: '전기 포트' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '결정 기록' })).toHaveFocus()
    expect(stored()).toMatchObject({ status: 'considering', decidedAt: null })
    expect(stored().satisfaction).toBeUndefined()
    await user.click(screen.getByRole('tab', { name: '물건' }))
    expect(card('전기 포트').getByText('고민 기간 끝')).toBeInTheDocument()
  })

  it('취소하면 그대로 두고 다시 고민하기 버튼으로 돌아간다', async () => {
    const user = await openHistory()
    await user.click(card('전기 포트').getByRole('button', { name: '다시 고민하기' }))
    await user.click(within(card('전기 포트').getByRole('group', { name: '다시 고민하기 확인' })).getByRole('button', { name: '취소' }))
    expect(card('전기 포트').getByRole('button', { name: '다시 고민하기' })).toHaveFocus()
    expect(stored().status).toBe('purchased')
  })
})
