import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// PRD F21 비교 결과를 고민 목록에 담기
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 11, 9))
})

afterEach(() => {
  vi.useRealTimers()
})

const wishForm = () => within(screen.getByRole('form', { name: '물건 담기' }))

describe('비교 결과를 고민 목록에 담기 (F21)', () => {
  it('할인 비교에서 B안으로 담으면 고민 목록으로 가서 가격과 이유를 채우고 상품명에 포커스를 둔다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '가격 비교' }))
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    await user.click(within(screen.getByRole('region', { name: '할인 비교 결과' })).getByRole('button', { name: 'B안으로 담기' }))

    expect(screen.getByRole('tab', { name: '고민 중인 물건', selected: true })).toBeInTheDocument()
    expect(wishForm().getByLabelText('가격')).toHaveValue('72000')
    expect(wishForm().getByLabelText('사고 싶은 이유')).toHaveValue('가격 비교: B안 결제액 72,000원 (할인 8,000원 · 배송비 포함)')
    expect(wishForm().getByLabelText('상품명')).toHaveFocus()
    expect(wishForm().getByText('가격 비교에서 가격과 이유를 가져왔어요. 상품명을 적고 담아 두세요.')).toBeInTheDocument()

    await user.type(wishForm().getByLabelText('상품명'), '무선 헤드폰')
    await user.click(wishForm().getByRole('button', { name: '담아 두기' }))
    expect(within(screen.getByRole('article', { name: '무선 헤드폰' })).getByText('72,000원')).toBeInTheDocument()
    expect(wishForm().queryByText(/가격 비교에서 가격과 이유를 가져왔어요/)).not.toBeInTheDocument()
  })

  it('묶음 비교에서 상품 A로 담으면 그 상품의 가격과 단가를 채운다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '가격 비교' }))
    await user.click(screen.getByRole('tab', { name: '묶음상품 비교' }))
    const bundlePanel = within(screen.getByRole('tabpanel', { name: '묶음상품 비교' }))
    await user.click(bundlePanel.getByRole('button', { name: '예시 넣기' }))
    await user.click(within(screen.getByRole('region', { name: '묶음상품 비교 결과' })).getByRole('button', { name: '상품 A로 담기' }))
    expect(wishForm().getByLabelText('가격')).toHaveValue('18900')
    expect(wishForm().getByLabelText('사고 싶은 이유')).toHaveValue('가격 비교: 상품 A 100mL당 315.00원 (총 6,000mL · 18,900원 · 한 달 600mL면 약 10개월 분량)')
  })

  it('이미 적던 상품명은 지우지 않는다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(wishForm().getByLabelText('상품명'), '캠핑 의자')
    await user.click(screen.getByRole('tab', { name: '가격 비교' }))
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    await user.click(within(screen.getByRole('region', { name: '할인 비교 결과' })).getByRole('button', { name: 'A안으로 담기' }))
    expect(wishForm().getByLabelText('상품명')).toHaveValue('캠핑 의자')
    expect(wishForm().getByLabelText('가격')).toHaveValue('73000')
  })
})
