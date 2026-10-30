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

// PRD F31 사진 초안의 링크 (판정 R29-P2): 사진이 채운 다나와 링크는 처음 읽은 상품명으로 찾은 주소라, 상품명을 바꾸면 지우고 문장으로 알린다
const CLEARED =
  '상품명을 바꿔서 가격표 사진에서 가져온 다나와 검색 링크를 지웠어요. 바꾼 상품명의 검색 링크는 담은 뒤 카드의 ‘비교해 볼 곳’에 있어요.'
const COMPARE_GUIDE = '가격 비교에서 가격과 이유를 가져왔어요. 상품명을 적고 담아 두세요.'

describe('사진 초안의 다나와 링크와 상품명 (F31, AC69)', () => {
  const nameInput = () => wishForm().getByLabelText('상품명')
  const linkInput = () => wishForm().getByLabelText('링크 (선택)')
  // 상품명을 지우고 새로 적는다: 지우는 첫 순간부터 이전 이름과 달라진다
  async function rename(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.clear(nameInput())
    await user.type(nameInput(), name)
  }

  it('AC69: 사진 결과 뒤 상품명을 고치면 링크를 지우고 안내를 바꾼다', async () => {
    const user = userEvent.setup()
    screenWith(PHOTO)

    await rename(user, '짬뽕 컵라면')

    expect(nameInput()).toHaveValue('짬뽕 컵라면')
    expect(linkInput()).toHaveValue('')
    expect(wishForm().getByText(CLEARED)).toBeInTheDocument()
    expect(wishForm().queryByText(GUIDE)).not.toBeInTheDocument()
  })

  it('AC69: 그 뒤 이유를 적고 담으면 링크 없이 담긴다', async () => {
    const user = userEvent.setup()
    const { onAdd } = screenWith(PHOTO)
    await rename(user, '짬뽕 컵라면')

    await user.type(wishForm().getByLabelText('사고 싶은 이유'), '집에 비상식량이 떨어져서')
    await user.click(wishForm().getByRole('button', { name: '담아 두기' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    // 빈 링크 칸은 validateWishInput이 null로 바꾼다
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: '짬뽕 컵라면', priceKrw: 3980, url: null }))
  })

  it('AC69: 상품명 끝에 공백만 더하면 링크와 안내가 그대로다', async () => {
    const user = userEvent.setup()
    screenWith(PHOTO)

    await user.type(nameInput(), ' ')

    expect(nameInput()).toHaveValue('농심 오징어짬뽕 소컵 6입 ')
    expect(linkInput()).toHaveValue('https://search.danawa.com/?query=x')
    expect(wishForm().getByText(GUIDE)).toBeInTheDocument()
    expect(wishForm().queryByText(CLEARED)).not.toBeInTheDocument()
  })

  it('AC69: 링크를 손으로 고친 뒤 상품명을 고치면 고친 링크와 안내가 그대로다', async () => {
    const user = userEvent.setup()
    screenWith(PHOTO)
    await user.clear(linkInput())
    await user.type(linkInput(), 'https://example.com/a')

    await rename(user, '짬뽕 컵라면')

    expect(linkInput()).toHaveValue('https://example.com/a')
    expect(wishForm().getByText(GUIDE)).toBeInTheDocument()
    expect(wishForm().queryByText(CLEARED)).not.toBeInTheDocument()
  })

  // 링크 칸을 손으로 만지면 사진 초안의 링크가 아니다: 같은 주소를 다시 적어도 기준을 되살리지 않는다
  it('AC69: 링크를 손으로 지웠다가 같은 주소를 다시 적은 뒤 상품명을 고쳐도 링크와 안내가 그대로다', async () => {
    const user = userEvent.setup()
    screenWith(PHOTO)
    await user.clear(linkInput())
    await user.type(linkInput(), 'https://search.danawa.com/?query=x')

    await rename(user, '짬뽕 컵라면')

    expect(linkInput()).toHaveValue('https://search.danawa.com/?query=x')
    expect(wishForm().getByText(GUIDE)).toBeInTheDocument()
    expect(wishForm().queryByText(CLEARED)).not.toBeInTheDocument()
  })

  it('AC69: 상품명·가격을 적어 둔 폼에서 사진이 링크만 채운 뒤 상품명을 고치면 링크를 지운다', async () => {
    const user = userEvent.setup()
    const { show } = screenWith(null)
    await user.type(nameInput(), '라면')
    await user.type(wishForm().getByLabelText('가격'), '4500')
    show(PHOTO)
    expect(linkInput()).toHaveValue('https://search.danawa.com/?query=x')

    await rename(user, '컵라면')

    expect(linkInput()).toHaveValue('')
    expect(wishForm().getByText(CLEARED)).toBeInTheDocument()
    expect(wishForm().queryByText(/이미 적은 칸은 그대로 뒀어요/)).not.toBeInTheDocument()
  })

  it('AC69: 링크를 적어 둔 폼은 사진 결과 뒤 상품명을 고쳐도 링크가 그대로다', async () => {
    const user = userEvent.setup()
    const { show } = screenWith(null)
    await user.type(linkInput(), 'https://example.com/a')
    show(PHOTO)
    expect(nameInput()).toHaveValue('농심 오징어짬뽕 소컵 6입')

    await rename(user, '짬뽕 컵라면')

    expect(linkInput()).toHaveValue('https://example.com/a')
    expect(wishForm().getByText(GUIDE)).toBeInTheDocument()
    expect(wishForm().queryByText(CLEARED)).not.toBeInTheDocument()
  })

  it('AC69: 지운 링크는 상품명을 되돌려도 다시 넣지 않는다', async () => {
    const user = userEvent.setup()
    screenWith(PHOTO)
    await rename(user, '짬뽕 컵라면')

    await rename(user, '농심 오징어짬뽕 소컵 6입')

    expect(nameInput()).toHaveValue('농심 오징어짬뽕 소컵 6입')
    expect(linkInput()).toHaveValue('')
    expect(wishForm().getByText(CLEARED)).toBeInTheDocument()
  })

  it('AC69: 가격 비교에서 담기 뒤 상품명을 적어도 링크·안내가 그대로다', async () => {
    const user = userEvent.setup()
    screenWith({ source: 'compare', value: { price: 72000, reason: '가격 비교: B안 결제액 72,000원 (할인 8,000원 · 배송비 포함)' } })

    await user.type(nameInput(), '컵라면')

    expect(linkInput()).toHaveValue('')
    expect(wishForm().getByText(COMPARE_GUIDE)).toBeInTheDocument()
    expect(wishForm().queryByText(CLEARED)).not.toBeInTheDocument()
  })

  it('AC69: 예시 물건 넣기로 폼이 바뀐 뒤 상품명을 고쳐도 링크 안내가 나오지 않는다', async () => {
    const user = userEvent.setup()
    // 예시 물건 넣기 버튼은 onAddDemo가 있고 목록이 비어 있을 때 그려진다
    render(<WishlistScreen items={[]} now={NOW} onAdd={vi.fn()} onEdit={vi.fn()} onDecide={vi.fn()} onExtend={vi.fn()} onRemove={vi.fn()} onAddDemo={vi.fn()} draft={PHOTO} />)
    expect(linkInput()).toHaveValue('https://search.danawa.com/?query=x')

    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    expect(nameInput()).toHaveValue('(예시) 전기 포트')
    await user.type(nameInput(), '키')

    expect(nameInput()).toHaveValue('(예시) 전기 포트키')
    expect(wishForm().queryByText(CLEARED)).not.toBeInTheDocument()
    expect(wishForm().queryByText(GUIDE)).not.toBeInTheDocument()
  })

  it('AC69: 두 번째 사진 결과가 링크를 채우지 않았으면 첫 사진의 링크 기준이 그대로다', async () => {
    const user = userEvent.setup()
    const { show } = screenWith(PHOTO)
    // 폼에 이미 링크가 있어 두 번째 결과는 링크 칸을 채우지 않는다
    show({ source: 'photo', value: { name: '다른 상품', price: 1000, url: 'https://search.danawa.com/?query=y' } })
    expect(nameInput()).toHaveValue('농심 오징어짬뽕 소컵 6입')
    expect(linkInput()).toHaveValue('https://search.danawa.com/?query=x')

    await rename(user, '짬뽕 컵라면')

    expect(linkInput()).toHaveValue('')
    expect(wishForm().getByText(CLEARED)).toBeInTheDocument()
  })

  // 판정 R31: 다른 탭 때문에 담기가 반영되지 않으면(onAdd가 null) 입력이 그대로 남으므로 링크 기준도 그대로 남는다
  it('AC69: 담기가 반영되지 않아 입력이 남으면 링크 기준도 남아서 그 뒤 상품명을 고치면 링크를 지운다', async () => {
    const user = userEvent.setup()
    const { onAdd } = screenWith(PHOTO, vi.fn(() => null))
    await user.type(wishForm().getByLabelText('사고 싶은 이유'), '집에 비상식량이 떨어져서')
    await user.click(wishForm().getByRole('button', { name: '담아 두기' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(linkInput()).toHaveValue('https://search.danawa.com/?query=x')
    expect(wishForm().getByText(GUIDE)).toBeInTheDocument()

    await rename(user, '짬뽕 컵라면')

    expect(linkInput()).toHaveValue('')
    expect(wishForm().getByText(CLEARED)).toBeInTheDocument()
  })
})
