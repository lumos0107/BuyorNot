import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FormDraft } from '../logic/draft'
import { WishlistScreen } from './WishlistScreen'

// PRD F31 담기 폼에 넣을 때는 빈 칸만 채운다. 사진 탭(Task 10)이 생기기 전이라 App이 넘기는 props와 같은 값을 직접 넘긴다
const NOW = new Date(2026, 9, 30, 9)

const PHOTO: FormDraft = {
  source: 'photo',
  value: { name: '농심 오징어짬뽕 소컵 6입', price: 3980, url: 'https://search.danawa.com/?query=x' },
}

const GUIDE = '가격표 사진에서 상품명과 가격을 가져왔어요. 사고 싶은 이유를 적고 담아 두세요.'

function screenWith(draft: FormDraft | null, onAdd = vi.fn()) {
  const props = { items: [], now: NOW, onAdd, onEdit: vi.fn(), onDecide: vi.fn(), onExtend: vi.fn(), onRemove: vi.fn() }
  const view = render(<WishlistScreen {...props} draft={draft} />)
  return { ...view, onAdd, show: (next: FormDraft | null) => view.rerender(<WishlistScreen {...props} draft={next} />) }
}

const wishForm = () => within(screen.getByRole('form', { name: '물건 담기' }))

describe('사진 결과로 담기 폼 채우기 (F31)', () => {
  // plan: photo draft fills empty add-form fields and focuses the reason
  it('AC54: 폼이 비어 있으면 상품명·가격·링크를 채우고 이유는 비워 둔 채 이유 칸에 포커스를 둔다', () => {
    screenWith(PHOTO)

    expect(wishForm().getByLabelText('상품명')).toHaveValue('농심 오징어짬뽕 소컵 6입')
    expect(wishForm().getByLabelText('가격')).toHaveValue('3980')
    expect(wishForm().getByLabelText('링크 (선택)')).toHaveValue('https://search.danawa.com/?query=x')
    expect(wishForm().getByLabelText('사고 싶은 이유')).toHaveValue('')
    expect(wishForm().getByLabelText('사고 싶은 이유')).toHaveFocus()
    expect(wishForm().getByText(GUIDE)).toBeInTheDocument()
    expect(wishForm().queryByText(/이미 적은 칸은 그대로 뒀어요/)).not.toBeInTheDocument()
    expect(wishForm().queryByText(/가격 비교에서 가격과 이유를 가져왔어요/)).not.toBeInTheDocument()
  })

  // plan: photo draft keeps what the user already typed
  it('AC54: 상품명 "라면"·가격 "4500"을 적어 둔 폼은 그대로 두고 링크만 채우며 안내 끝에 둔 칸을 알린다', async () => {
    const user = userEvent.setup()
    const { show } = screenWith(null)
    await user.type(wishForm().getByLabelText('상품명'), '라면')
    await user.type(wishForm().getByLabelText('가격'), '4500')

    show(PHOTO)

    expect(wishForm().getByLabelText('상품명')).toHaveValue('라면')
    expect(wishForm().getByLabelText('가격')).toHaveValue('4500')
    expect(wishForm().getByLabelText('링크 (선택)')).toHaveValue('https://search.danawa.com/?query=x')
    expect(wishForm().getByLabelText('사고 싶은 이유')).toHaveFocus()
    expect(wishForm().getByText(`${GUIDE} 이미 적은 칸은 그대로 뒀어요: 상품명·가격`)).toBeInTheDocument()
  })

  it('가격만 적어 둔 폼은 상품명을 채우고 가격은 그대로 두며 이유 칸에 포커스를 둔다', async () => {
    const user = userEvent.setup()
    const { show } = screenWith(null)
    await user.type(wishForm().getByLabelText('가격'), '4500')

    show(PHOTO)

    expect(wishForm().getByLabelText('상품명')).toHaveValue('농심 오징어짬뽕 소컵 6입')
    expect(wishForm().getByLabelText('가격')).toHaveValue('4500')
    expect(wishForm().getByLabelText('사고 싶은 이유')).toHaveFocus()
    expect(wishForm().getByText(`${GUIDE} 이미 적은 칸은 그대로 뒀어요: 가격`)).toBeInTheDocument()
  })

  it('읽은 상품명이 비어 있고 폼도 비어 있으면 상품명 칸에 포커스를 둔다', () => {
    screenWith({ source: 'photo', value: { name: '', price: 3980, url: 'https://search.danawa.com/?query=x' } })

    expect(wishForm().getByLabelText('가격')).toHaveValue('3980')
    expect(wishForm().getByLabelText('상품명')).toHaveValue('')
    expect(wishForm().getByLabelText('상품명')).toHaveFocus()
  })

  it('같은 사진 결과를 다시 그려도 그 뒤에 고친 값을 덮어쓰지 않는다', async () => {
    const user = userEvent.setup()
    const { show } = screenWith(PHOTO)
    await user.clear(wishForm().getByLabelText('상품명'))
    await user.type(wishForm().getByLabelText('상품명'), '짬뽕 컵라면')

    show(PHOTO)

    expect(wishForm().getByLabelText('상품명')).toHaveValue('짬뽕 컵라면')
  })

  it('AC54: 이유를 비운 채 담아 두면 "사고 싶은 이유를 적어 주세요"가 나오고 담기지 않는다', async () => {
    const user = userEvent.setup()
    const { onAdd } = screenWith(PHOTO)

    await user.click(wishForm().getByRole('button', { name: '담아 두기' }))

    expect(wishForm().getByText('사고 싶은 이유를 적어 주세요')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('AC54: 이유를 적고 담아 두면 채운 상품명·가격·링크로 담기고 안내는 사라진다', async () => {
    const user = userEvent.setup()
    const { onAdd } = screenWith(PHOTO)

    await user.type(wishForm().getByLabelText('사고 싶은 이유'), '집에 비상식량이 떨어져서')
    await user.click(wishForm().getByRole('button', { name: '담아 두기' }))

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '농심 오징어짬뽕 소컵 6입',
        priceKrw: 3980,
        reason: '집에 비상식량이 떨어져서',
        url: 'https://search.danawa.com/?query=x',
      }),
    )
    expect(wishForm().queryByText(GUIDE)).not.toBeInTheDocument()
  })
})
