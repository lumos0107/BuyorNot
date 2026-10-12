import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

// 가격 비교 예시 카드와 처음부터 채워진 예시, 첫 화면의 예시 물건 넣기 (PRD F05·F13 보강, 2026-10-11 제작자 요청)
beforeEach(() => {
  localStorage.clear()
})

async function openCompare() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가격 비교' }))
  return user
}
const panel = (name: string) => within(screen.getByRole('tabpanel', { name }))

describe('가격 비교는 예시가 채워진 채로 열린다', () => {
  it('할인 비교: 이럴 때 써요 카드와 예시 결과가 바로 보인다', async () => {
    await openCompare()
    const intro = within(panel('할인 비교').getByRole('region', { name: '이럴 때 써요' }))
    expect(intro.getByText('A안의 할인율이 더 높아도, 배송비까지 더하면 B안이 1,000원 저렴해요')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '할인 비교 결과' })).getByText('B안이 1,000원 저렴해요')).toBeInTheDocument()
  })

  it('묶음상품 비교도 예시 결과가 바로 보인다', async () => {
    const user = await openCompare()
    await user.click(screen.getByRole('tab', { name: '묶음상품 비교' }))
    expect(within(panel('묶음상품 비교').getByRole('region', { name: '이럴 때 써요' })).getByText('100mL당 가격은 상품 A가 낮지만, 총지출은 상품 B가 600원 적어요')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '묶음상품 비교 결과' })).getByText('단가는 상품 A가 낮지만, 총지출은 상품 B가 600원 적어요')).toBeInTheDocument()
  })

  it('초기화하면 비우고 결과를 감추며, 예시 넣기로 다시 채운다', async () => {
    const user = await openCompare()
    await user.click(panel('할인 비교').getByRole('button', { name: '초기화' }))
    expect(screen.queryByRole('region', { name: '할인 비교 결과' })).not.toBeInTheDocument()
    expect(within(panel('할인 비교').getByRole('group', { name: 'A안' })).getByLabelText('상품 금액')).toHaveValue('')
    await user.click(panel('할인 비교').getByRole('button', { name: '예시 넣기' }))
    expect(screen.getByRole('region', { name: '할인 비교 결과' })).toBeInTheDocument()
  })
})

describe('첫 화면의 예시 물건 넣기', () => {
  it('비어 있을 때 예시 물건 넣기가 담기 폼보다 위에 있다', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: '예시 물건 넣기' })
    expect(button.compareDocumentPosition(screen.getByRole('form', { name: '물건 담기' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
