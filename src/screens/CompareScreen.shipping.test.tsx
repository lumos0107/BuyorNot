import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CompareScreen } from './CompareScreen'

// 8단계: 무료배송 채우기 화면 (TODO 8-3, 8-4, PRD F13, AC26)
async function openShipping() {
  const user = userEvent.setup()
  render(<CompareScreen />)
  await user.click(screen.getByRole('tab', { name: '무료배송 채우기' }))
  return user
}

const form = () => within(screen.getByRole('group', { name: '주문 정보' }))
const result = () => within(screen.getByRole('region', { name: '무료배송 채우기 결과' }))

describe('무료배송 채우기 화면', () => {
  it('예시 넣기를 누르면 30,000원 → 35,000원과 판정 문구가 보인다', async () => {
    const user = await openShipping()
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    expect(form().getByLabelText('현재 상품 금액')).toHaveValue('27000')
    expect(result().getByText('30,000원')).toBeInTheDocument()
    expect(result().getByText('35,000원')).toBeInTheDocument()
    expect(result().getByText('배송비는 3,000원 줄고, 총지출은 5,000원 늘어요')).toBeInTheDocument()
    expect(result().getByText(/추가하는 물건이 정말 필요한지/)).toBeInTheDocument()
  })

  it('추가해도 기준에 못 미치면 모자란 금액을 알려준다', async () => {
    const user = await openShipping()
    await user.type(form().getByLabelText('현재 상품 금액'), '27000')
    await user.type(form().getByLabelText('배송비'), '3000')
    await user.type(form().getByLabelText('무료배송 기준 금액'), '30000')
    await user.type(form().getByLabelText('추가할 상품 금액'), '2000')
    expect(result().getByText('무료배송 기준 금액에 1,000원이 부족해요')).toBeInTheDocument()
  })

  it('이미 기준 이상이면 이미 무료배송이라고 알려준다', async () => {
    const user = await openShipping()
    await user.type(form().getByLabelText('현재 상품 금액'), '30000')
    await user.type(form().getByLabelText('배송비'), '3000')
    await user.type(form().getByLabelText('무료배송 기준 금액'), '30000')
    await user.type(form().getByLabelText('추가할 상품 금액'), '0')
    expect(result().getByText('이미 무료배송이에요')).toBeInTheDocument()
  })

  it('잘못된 입력은 그 입력 아래에 오류를 보여주고 결과를 숨긴다', async () => {
    const user = await openShipping()
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    const add = form().getByLabelText('추가할 상품 금액')
    await user.clear(add)
    await user.type(add, '-1')
    expect(add).toHaveAccessibleDescription(/0원 이상/)
    expect(screen.queryByRole('region', { name: '무료배송 채우기 결과' })).not.toBeInTheDocument()
  })

  it('초기화하면 입력과 결과가 사라진다', async () => {
    const user = await openShipping()
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    await user.click(screen.getByRole('button', { name: '초기화' }))
    expect(form().getByLabelText('현재 상품 금액')).toHaveValue('')
    expect(screen.queryByRole('region', { name: '무료배송 채우기 결과' })).not.toBeInTheDocument()
  })
})
