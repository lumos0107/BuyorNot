import { renderWishlistApp } from './test/renderWishlistApp'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { STORAGE_KEY } from './logic/storage'

// PRD F85 물건 분류 아이콘 (AC209·AC210, 2026-11-02 제작자 "취미·식비 이런 거 하나 선택해서 아이콘으로")
const T0 = new Date(2026, 10, 3, 9)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

const form = () => within(screen.getByRole('form', { name: '물건 담기' }))
const title = (name: string) => within(screen.getByRole('article', { name })).getByText(name, { selector: 'p' })

it('담을 때 분류를 고르면 카드 표식이 첫 글자 대신 분류 아이콘이 되고, 수정에서 고르지 않음으로 바꾸면 첫 글자로 돌아간다', async () => {
  const user = userEvent.setup()
  renderWishlistApp()
  await user.type(form().getByLabelText('상품명'), '게임기')
  await user.type(form().getByLabelText('가격'), '398000')
  // 분류는 접힌 '더 적기 (선택)' 안에 있다. 고르지 않아도 담을 수 있다
  const picker = within(form().getByRole('group', { name: '분류 (선택)' }))
  expect(picker.getByRole('radio', { name: '고르지 않음' })).toBeChecked()
  await user.click(picker.getByRole('radio', { name: '취미' }))
  await user.click(form().getByRole('button', { name: '담아 두기' }))

  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).items[0].category).toBe('hobby')
  expect(title('게임기')).toHaveClass('has-icon')
  expect(title('게임기')).not.toHaveAttribute('data-initial')
  expect(title('게임기').querySelector('.card-icon-hobby svg')).not.toBeNull()
  // 담는 폼은 다음 물건을 위해 '고르지 않음'으로 돌아간다
  expect(within(form().getByRole('group', { name: '분류 (선택)' })).getByRole('radio', { name: '고르지 않음' })).toBeChecked()

  await user.click(within(screen.getByRole('article', { name: '게임기' })).getByRole('button', { name: '수정' }))
  const edit = within(screen.getByRole('form', { name: '물건 수정' }))
  expect(edit.getByRole('radio', { name: '취미' })).toBeChecked()
  await user.click(edit.getByRole('radio', { name: '고르지 않음' }))
  await user.click(edit.getByRole('button', { name: '저장' }))

  expect('category' in JSON.parse(localStorage.getItem(STORAGE_KEY)!).items[0]).toBe(false)
  expect(title('게임기')).not.toHaveClass('has-icon')
  expect(title('게임기')).toHaveAttribute('data-initial', '게')
})

it('결정 기록 카드도 분류 아이콘을 보여 준다', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [{
    id: 's1', name: '게임기', priceKrw: 398000, reason: '이유', url: null,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z', reviewAt: '2026-11-02T00:00:00.000Z',
    status: 'skipped', decidedAt: '2026-11-02T00:00:00.000Z', category: 'hobby',
  }] }))
  const user = userEvent.setup()
  renderWishlistApp()
  await user.click(screen.getByRole('tab', { name: '물건' })); await user.click(screen.getByRole('tab', { name: '결정 기록' }))
  expect(title('게임기')).toHaveClass('has-icon')
  expect(title('게임기').querySelector('.card-icon-hobby')).not.toBeNull()
})
