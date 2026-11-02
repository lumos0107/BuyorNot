import { renderWishlistApp } from './test/renderWishlistApp'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

// PRD F24 첫 화면 (AC79, 판정 R38-I3): 고민 중인 물건이 없을 때 서비스 설명을 담기 폼 위, "처음이라면 예시로 둘러보세요." 줄 바로 앞으로 옮긴다.
// 문장은 빈 목록 상자에 있던 그대로이고, 빈 목록 상자에는 "아직 담아 둔 물건이 없어요."만 남는다. 고민 중인 물건이 하나라도 있으면 보이지 않는다
const SERVICE_INTRO = '물건을 담아 두면 며칠 뒤 다시 보고 결정할 수 있어요.'
const EXAMPLE_LINE = '처음이라면 예시로 둘러보세요.'
const EMPTY_LINE = '아직 담아 둔 물건이 없어요.'

beforeEach(() => {
  localStorage.clear()
})

const form = () => screen.getByRole('form', { name: '물건 담기' })
const card = (name: string) => within(screen.getByRole('article', { name }))

async function addItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const f = within(form())
  await user.type(f.getByLabelText('상품명'), name)
  await user.type(f.getByLabelText('가격'), '129000')
  await user.type(f.getByLabelText('사고 싶은 이유'), '유선 이어폰 선이 자꾸 끊겨서')
  await user.click(f.getByRole('radio', { name: '3일' }))
  await user.click(f.getByRole('button', { name: '담아 두기' }))
}

describe('첫 화면의 서비스 설명 (F24, AC79)', () => {
  it('AC79: 기록 없이 처음 열면 담기 폼 위, 예시 줄 바로 앞에 서비스 설명이 있고 빈 목록 상자에는 아직 담아 둔 물건이 없어요만 있다', () => {
    renderWishlistApp()
    const intro = screen.getByText(SERVICE_INTRO)
    const exampleLine = screen.getByText(EXAMPLE_LINE)
    // 설명이 예시 줄과 담기 폼보다 앞이고, 예시 줄 바로 앞이다
    expect(intro.compareDocumentPosition(exampleLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(intro.compareDocumentPosition(form()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(intro.nextElementSibling).toContainElement(exampleLine)
    // 빈 목록 상자에는 설명 문장이 없고, 문서 안에 설명 문장은 하나다
    const emptyBox = screen.getByText(EMPTY_LINE).parentElement as HTMLElement
    expect(within(emptyBox).queryByText(SERVICE_INTRO)).not.toBeInTheDocument()
    expect(emptyBox).toHaveTextContent(new RegExp(`^${EMPTY_LINE}$`))
    expect(screen.getAllByText(SERVICE_INTRO)).toHaveLength(1)
  })

  it('AC79: 예시 물건 넣기 뒤에는 서비스 설명이 없다', async () => {
    const user = userEvent.setup()
    renderWishlistApp()
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    expect(screen.getByRole('article', { name: '(예시) 무선 헤드폰' })).toBeInTheDocument()
    expect(screen.queryByText(SERVICE_INTRO)).not.toBeInTheDocument()
  })

  it('AC79: 물건을 하나 담으면 서비스 설명이 없다', async () => {
    const user = userEvent.setup()
    renderWishlistApp()
    await addItem(user, '무선 헤드폰')
    expect(screen.getByRole('article', { name: '무선 헤드폰' })).toBeInTheDocument()
    expect(screen.queryByText(SERVICE_INTRO)).not.toBeInTheDocument()
  })

  it('AC79: 고민 중인 물건을 모두 결정하면 서비스 설명이 담기 폼 위에 다시 보인다', async () => {
    const user = userEvent.setup()
    renderWishlistApp()
    await addItem(user, '무선 헤드폰')
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
    const intro = screen.getByText(SERVICE_INTRO)
    expect(intro.compareDocumentPosition(form()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByText(SERVICE_INTRO)).toHaveLength(1)
  })
})
