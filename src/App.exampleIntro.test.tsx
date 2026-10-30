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

// 이럴 때 써요 안내 (PRD F06, 판정 R29-I2, AC74): 칸이 처음부터 채워져 있다는 사실과 맞는 문장
const INTRO_NOTE =
  '처음에는 예시 값이 들어 있어요. 비교할 금액과 조건으로 바꿔 보세요. ‘초기화’를 누르면 입력칸을 비우고, ‘예시 넣기’를 누르면 예시 값을 다시 넣어요.'
const OLD_INTRO_NOTE = '‘예시 넣기’를 누르면 아래 칸이 채워져요.'
const introBox = (tab: string) => panel(tab).getByRole('region', { name: '이럴 때 써요' })
// 예시 값을 확인하는 칸: 할인 비교는 A안의 상품 금액(80000), 묶음상품 비교는 상품 A의 가격(18900)
const discountPrice = () => within(panel('할인 비교').getByRole('group', { name: 'A안' })).getByLabelText('상품 금액')
const bundlePrice = () => within(panel('묶음상품 비교').getByRole('group', { name: '상품 A' })).getByLabelText('가격')

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
    expect(within(panel('묶음상품 비교').getByRole('region', { name: '이럴 때 써요' })).getByText('100mL당 가격은 상품 A가 낮지만, 총지출은 상품 B가 9,000원 적어요')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '묶음상품 비교 결과' })).getByText('단가는 상품 A가 낮지만, 총지출은 상품 B가 9,000원 적어요')).toBeInTheDocument()
    // 예시가 어떤 물건인지 상자 위에 밝힌다 (GPT 32번)
    expect(within(panel('묶음상품 비교').getByRole('region', { name: '이럴 때 써요' })).getByText('예: 세탁 세제')).toBeInTheDocument()
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

describe('이럴 때 써요 안내는 처음부터 채워진 칸과 맞다 (AC74)', () => {
  it('AC74: 할인 비교와 묶음상품 비교의 이럴 때 써요 안내가 처음부터 채워진 칸과 맞다', async () => {
    const user = await openCompare()

    // 할인 비교(처음 엶): 새 문장, 예전 문장 없음, 칸에 예시 값
    expect(within(introBox('할인 비교')).getByText(INTRO_NOTE)).toBeInTheDocument()
    expect(introBox('할인 비교')).not.toHaveTextContent(OLD_INTRO_NOTE)
    expect(discountPrice()).toHaveValue('80000')

    await user.click(screen.getByRole('tab', { name: '묶음상품 비교' }))

    expect(within(introBox('묶음상품 비교')).getByText(INTRO_NOTE)).toBeInTheDocument()
    expect(introBox('묶음상품 비교')).not.toHaveTextContent(OLD_INTRO_NOTE)
    expect(bundlePrice()).toHaveValue('18900')
  })

  it('AC74: 초기화 뒤와 예시 넣기 뒤에도 같은 안내다', async () => {
    const user = await openCompare()

    await user.click(panel('할인 비교').getByRole('button', { name: '초기화' }))
    expect(within(introBox('할인 비교')).getByText(INTRO_NOTE)).toBeInTheDocument()
    expect(discountPrice()).toHaveValue('')
    await user.click(panel('할인 비교').getByRole('button', { name: '예시 넣기' }))
    expect(within(introBox('할인 비교')).getByText(INTRO_NOTE)).toBeInTheDocument()
    expect(discountPrice()).toHaveValue('80000')

    await user.click(screen.getByRole('tab', { name: '묶음상품 비교' }))
    await user.click(panel('묶음상품 비교').getByRole('button', { name: '초기화' }))
    expect(within(introBox('묶음상품 비교')).getByText(INTRO_NOTE)).toBeInTheDocument()
    expect(bundlePrice()).toHaveValue('')
    await user.click(panel('묶음상품 비교').getByRole('button', { name: '예시 넣기' }))
    expect(within(introBox('묶음상품 비교')).getByText(INTRO_NOTE)).toBeInTheDocument()
    expect(bundlePrice()).toHaveValue('18900')
  })
})

describe('첫 화면의 예시 물건 넣기', () => {
  it('비어 있을 때 예시 물건 넣기가 담기 폼보다 위에 있다', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: '예시 물건 넣기' })
    expect(button.compareDocumentPosition(screen.getByRole('form', { name: '물건 담기' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
