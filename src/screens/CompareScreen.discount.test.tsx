import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CompareScreen } from './CompareScreen'

// 3단계: 할인 비교 화면이 입력 → 검증 → 계산 → 결과·근거 표시까지 이어진다. (TODO 3-2 ~ 3-14, PRD F04)
function card(name: string) {
  return within(screen.getByRole('group', { name }))
}
const result = () => within(screen.getByRole('region', { name: '할인 비교 결과' }))
const noResult = () => expect(screen.queryByRole('region', { name: '할인 비교 결과' })).not.toBeInTheDocument()

describe('할인 비교 화면', () => {
  it('예시 넣기를 누르면 AC05·AC06 값이 채워지고 B안이 1,000원 저렴하다고 보여준다', async () => {
    const user = userEvent.setup()
    render(<CompareScreen />)
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    expect(card('A안').getByLabelText('상품 금액')).toHaveValue('80000')
    expect(card('A안').getByLabelText('최대 할인액')).toHaveValue('10000')
    expect(card('B안').getByLabelText('쿠폰 종류')).toHaveValue('amount')
    expect(result().getByText('73,000원')).toBeInTheDocument()
    expect(result().getByText('72,000원')).toBeInTheDocument()
    expect(result().getByText('B안이 1,000원 저렴해요')).toBeInTheDocument()
  })

  it('계산 근거를 한 줄씩 보여준다', async () => {
    const user = userEvent.setup()
    render(<CompareScreen />)
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    const steps = within(result().getByRole('list', { name: 'A안 계산 근거' }))
    expect(steps.getByText(/80,000원 × 15% = 12,000원/)).toBeInTheDocument()
    expect(steps.getByText(/최대 할인액 10,000원 적용/)).toBeInTheDocument()
    expect(steps.getByText(/= 결제액 73,000원/)).toBeInTheDocument()
  })

  it('AC07: 최소 주문액에 못 미치면 적용 불가와 부족한 금액을 보여준다', async () => {
    const user = userEvent.setup()
    render(<CompareScreen />)
    const a = card('A안')
    await user.type(a.getByLabelText('상품 금액'), '49000')
    await user.selectOptions(a.getByLabelText('쿠폰 종류'), 'rate')
    await user.type(a.getByLabelText('할인율 (%)'), '10')
    await user.type(a.getByLabelText('최소 주문액'), '50000')
    await user.type(a.getByLabelText('배송비'), '3000')
    const b = card('B안')
    await user.type(b.getByLabelText('상품 금액'), '49000')
    await user.selectOptions(b.getByLabelText('쿠폰 종류'), 'none')

    expect(result().getByText('쿠폰 적용 불가 · 최소 주문액까지 1,000원 부족')).toBeInTheDocument()
    expect(result().getByText('52,000원')).toBeInTheDocument()
    expect(result().getByText('49,000원')).toBeInTheDocument()
    expect(result().getByText('B안이 3,000원 저렴해요')).toBeInTheDocument()
  })

  it('AC16: 결제액이 같으면 동률로 보여준다', async () => {
    const user = userEvent.setup()
    render(<CompareScreen />)
    const a = card('A안')
    await user.type(a.getByLabelText('상품 금액'), '50000')
    await user.selectOptions(a.getByLabelText('쿠폰 종류'), 'rate')
    await user.type(a.getByLabelText('할인율 (%)'), '10')
    const b = card('B안')
    await user.type(b.getByLabelText('상품 금액'), '50000')
    await user.selectOptions(b.getByLabelText('쿠폰 종류'), 'amount')
    await user.type(b.getByLabelText('할인액 (원)'), '5000')
    expect(result().getByText('두 안의 결제액이 같아요')).toBeInTheDocument()
  })

  it('쿠폰 종류에 따라 필요한 입력만 보여준다', async () => {
    const user = userEvent.setup()
    render(<CompareScreen />)
    const a = card('A안')
    await user.selectOptions(a.getByLabelText('쿠폰 종류'), 'none')
    expect(a.queryByLabelText(/할인율|할인액/)).not.toBeInTheDocument()
    expect(a.queryByLabelText('최소 주문액')).not.toBeInTheDocument()
    expect(a.queryByLabelText('최대 할인액')).not.toBeInTheDocument()

    await user.selectOptions(a.getByLabelText('쿠폰 종류'), 'amount')
    expect(a.getByLabelText('할인액 (원)')).toBeInTheDocument()
    expect(a.getByLabelText('최소 주문액')).toBeInTheDocument()
    expect(a.queryByLabelText('최대 할인액')).not.toBeInTheDocument()

    await user.selectOptions(a.getByLabelText('쿠폰 종류'), 'rate')
    expect(a.getByLabelText('할인율 (%)')).toBeInTheDocument()
    expect(a.getByLabelText('최대 할인액')).toBeInTheDocument()
  })

  it('할인율이 100%를 넘으면 그 입력 아래에 오류를 보여주고 결과는 숨긴다', async () => {
    const user = userEvent.setup()
    render(<CompareScreen />)
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    const rate = card('A안').getByLabelText('할인율 (%)')
    await user.clear(rate)
    await user.type(rate, '120')
    expect(card('A안').getByText('할인율은 0~100% 사이여야 해요')).toBeInTheDocument()
    expect(rate).toHaveAccessibleDescription(/0~100%/)
    noResult()
  })

  it('초기화를 누르면 입력과 결과가 사라진다', async () => {
    const user = userEvent.setup()
    render(<CompareScreen />)
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    await user.click(screen.getByRole('button', { name: '초기화' }))
    expect(card('A안').getByLabelText('상품 금액')).toHaveValue('')
    noResult()
  })
})
