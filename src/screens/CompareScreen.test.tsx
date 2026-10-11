import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CompareScreen } from './CompareScreen'

// 2단계: 묶음상품 비교 화면이 입력 → 검증 → 계산 → 결과 표시까지 이어진다. (TODO 2-3 ~ 2-12)
async function openBundle() {
  const user = userEvent.setup()
  render(<CompareScreen />)
  await user.click(screen.getByRole('tab', { name: '묶음상품 비교' }))
  return user
}

function card(name: string) {
  return within(screen.getByRole('group', { name }))
}

describe('묶음상품 비교 화면', () => {
  it('두 상품을 입력하면 단가와 더 싼 쪽을 보여준다', async () => {
    const user = await openBundle()
    const a = card('상품 A')
    const b = card('상품 B')
    await user.type(a.getByLabelText('가격'), '2000')
    await user.selectOptions(a.getByLabelText('단위'), 'L')
    await user.type(a.getByLabelText('개당 용량'), '1')
    await user.type(a.getByLabelText('묶음 개수'), '1')
    await user.type(b.getByLabelText('가격'), '1500')
    await user.selectOptions(b.getByLabelText('단위'), 'mL')
    await user.type(b.getByLabelText('개당 용량'), '500')
    await user.type(b.getByLabelText('묶음 개수'), '1')

    const result = within(screen.getByRole('region', { name: '묶음상품 비교 결과' }))
    expect(result.getByText('200.00원')).toBeInTheDocument()
    expect(result.getByText('300.00원')).toBeInTheDocument()
    expect(result.getByText('상품 A가 단가 33.3% 낮아요')).toBeInTheDocument()
    expect(result.getByText('단가는 상품 A가 낮지만, 총지출은 상품 B가 500원 적어요')).toBeInTheDocument()
  })

  it('예시 넣기를 누르면 AC10 값이 채워지고 결과가 나온다', async () => {
    const user = await openBundle()
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    expect(card('상품 A').getByLabelText('가격')).toHaveValue('6000')
    expect(card('상품 B').getByLabelText('단위')).toHaveValue('L')
    const result = within(screen.getByRole('region', { name: '묶음상품 비교 결과' }))
    expect(result.getByText('333.33원')).toBeInTheDocument()
    expect(result.getByText('360.00원')).toBeInTheDocument()
    expect(result.getByText('상품 A가 단가 7.4% 낮아요')).toBeInTheDocument()
    expect(result.getByText('단가는 상품 A가 낮지만, 총지출은 상품 B가 600원 적어요')).toBeInTheDocument()
  })

  it('초기화를 누르면 입력과 결과가 사라진다', async () => {
    const user = await openBundle()
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    await user.click(screen.getByRole('button', { name: '초기화' }))
    expect(card('상품 A').getByLabelText('가격')).toHaveValue('')
    expect(screen.queryByRole('region', { name: '묶음상품 비교 결과' })).not.toBeInTheDocument()
  })

  it('개수가 0이면 그 입력 아래에 오류를 보여주고 결과는 숨긴다', async () => {
    const user = await openBundle()
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    const count = card('상품 A').getByLabelText('묶음 개수')
    await user.clear(count)
    await user.type(count, '0')
    expect(card('상품 A').getByText('묶음 개수는 1개 이상이어야 해요')).toBeInTheDocument()
    expect(count).toHaveAccessibleDescription(/1개 이상/)
    expect(screen.queryByRole('region', { name: '묶음상품 비교 결과' })).not.toBeInTheDocument()
  })

  it('단위 종류가 다르면 비교할 수 없다고 알려준다', async () => {
    const user = await openBundle()
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    await user.selectOptions(card('상품 B').getByLabelText('단위'), 'g')
    expect(screen.getByText('부피와 무게는 비교할 수 없어요. 같은 종류의 단위를 골라 주세요.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '묶음상품 비교 결과' })).not.toBeInTheDocument()
  })

  it('단가가 같으면 동률로 표시한다', async () => {
    const user = await openBundle()
    const a = card('상품 A')
    const b = card('상품 B')
    await user.type(a.getByLabelText('가격'), '8000')
    await user.selectOptions(a.getByLabelText('단위'), 'g')
    await user.type(a.getByLabelText('개당 용량'), '500')
    await user.type(a.getByLabelText('묶음 개수'), '2')
    await user.type(b.getByLabelText('가격'), '8000')
    await user.selectOptions(b.getByLabelText('단위'), 'kg')
    await user.type(b.getByLabelText('개당 용량'), '1')
    await user.type(b.getByLabelText('묶음 개수'), '1')
    const result = within(screen.getByRole('region', { name: '묶음상품 비교 결과' }))
    expect(result.getByText('두 상품의 단가가 같아요')).toBeInTheDocument()
  })

  it('개수 단위를 고르면 개당 용량 입력이 사라진다', async () => {
    const user = await openBundle()
    await user.selectOptions(card('상품 A').getByLabelText('단위'), 'ea')
    expect(card('상품 A').queryByLabelText('개당 용량')).not.toBeInTheDocument()
  })
})

// GPT 2·3단계 검토 반영: 총지출 표시, 아주 작은 차이, 단위 불일치의 입력 연결, AC17 화면 흐름
describe('묶음상품 비교 화면 (검토 반영)', () => {
  it('단가 옆에 각 상품의 총용량과 총지출을 함께 보여준다', async () => {
    const user = await openBundle()
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    const result = within(screen.getByRole('region', { name: '묶음상품 비교 결과' }))
    expect(result.getByText(/총 1,800mL · 6,000원/)).toBeInTheDocument()
    expect(result.getByText(/총 1,500mL · 5,400원/)).toBeInTheDocument()
  })

  it('표시 비율이 0.0%로 반올림되면 "아주 조금"으로 안내한다', async () => {
    const user = await openBundle()
    const a = card('상품 A')
    const b = card('상품 B')
    await user.type(a.getByLabelText('가격'), '1000')
    await user.selectOptions(a.getByLabelText('단위'), 'g')
    await user.type(a.getByLabelText('개당 용량'), '300')
    await user.type(a.getByLabelText('묶음 개수'), '1')
    await user.type(b.getByLabelText('가격'), '3000')
    await user.selectOptions(b.getByLabelText('단위'), 'g')
    await user.type(b.getByLabelText('개당 용량'), '900.01')
    await user.type(b.getByLabelText('묶음 개수'), '1')
    const result = within(screen.getByRole('region', { name: '묶음상품 비교 결과' }))
    expect(result.getByText('상품 B가 단가 아주 조금 낮아요')).toBeInTheDocument()
    expect(result.getByText('표시 단가는 같지만 아주 작은 차이가 있어요.')).toBeInTheDocument()
  })

  it('단위 종류가 다르면 두 단위 입력에 오류가 연결된다', async () => {
    const user = await openBundle()
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    await user.selectOptions(card('상품 B').getByLabelText('단위'), 'g')
    expect(card('상품 A').getByLabelText('단위')).toHaveAccessibleDescription(/비교할 수 없어요/)
    expect(card('상품 B').getByLabelText('단위')).toHaveAttribute('aria-invalid', 'true')
  })

  it('AC17: 개수 단위로 12개 4,800원과 6개 2,500원을 비교한다', async () => {
    const user = await openBundle()
    const a = card('상품 A')
    const b = card('상품 B')
    await user.selectOptions(a.getByLabelText('단위'), 'ea')
    await user.type(a.getByLabelText('가격'), '4800')
    await user.type(a.getByLabelText('묶음 개수'), '12')
    await user.selectOptions(b.getByLabelText('단위'), 'ea')
    await user.type(b.getByLabelText('가격'), '2500')
    await user.type(b.getByLabelText('묶음 개수'), '6')
    const result = within(screen.getByRole('region', { name: '묶음상품 비교 결과' }))
    expect(result.getByText('400.00원')).toBeInTheDocument()
    expect(result.getByText('416.67원')).toBeInTheDocument()
    expect(result.getByText('상품 A가 단가 4.0% 낮아요')).toBeInTheDocument()
  })

  it('가격 입력에 배송비 포함 안내가 있다', async () => {
    await openBundle()
    expect(card('상품 A').getByLabelText('가격')).toHaveAccessibleDescription(/배송비/)
  })
})
