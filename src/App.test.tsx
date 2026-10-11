import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

// 1단계: 세 메뉴와 두 가격 비교 탭을 이동할 수 있다. 화면 전환은 React 상태로 처리한다. (TODO 1-7, 1-8, PRD #4)
// GPT 1단계 검토 반영: ARIA 탭 패턴(방향키·tabindex·aria-controls), 역방향 이동, 입력 보존
const tab = (name: string) => screen.getByRole('tab', { name })

describe('메뉴와 탭 이동', () => {
  it('처음 열면 고민 중인 물건 화면이 보인다', () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: '고민 중인 물건', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toBeInTheDocument()
  })

  it('가격 비교 메뉴를 누르면 할인 비교 탭이 먼저 열린다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('가격 비교'))
    expect(screen.getByRole('tab', { name: '할인 비교', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '할인 비교' })).toBeInTheDocument()
  })

  it('묶음상품 비교 탭으로 바꾸면 할인 비교 화면은 사라지고, 다시 돌아올 수 있다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('가격 비교'))
    await user.click(tab('묶음상품 비교'))
    expect(screen.getByRole('tab', { name: '묶음상품 비교', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '묶음상품 비교' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: '할인 비교' })).not.toBeInTheDocument()

    await user.click(tab('할인 비교'))
    expect(screen.getByRole('tab', { name: '묶음상품 비교', selected: false })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '할인 비교' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: '묶음상품 비교' })).not.toBeInTheDocument()
  })

  it('결정 기록으로 갔다가 고민 중인 물건으로 돌아올 수 있다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('결정 기록'))
    expect(screen.getByRole('heading', { level: 2, name: '결정 기록' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: '고민 중인 물건' })).not.toBeInTheDocument()

    await user.click(tab('고민 중인 물건'))
    expect(screen.getByRole('tab', { name: '결정 기록', selected: false })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: '결정 기록' })).not.toBeInTheDocument()
  })

  it('다른 메뉴에 다녀와도 가격 비교에 입력한 값과 선택한 탭이 남아 있다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('가격 비교'))
    await user.click(tab('묶음상품 비교'))
    const priceA = within(screen.getByRole('group', { name: '상품 A' })).getByLabelText('가격')
    await user.type(priceA, '6000')

    await user.click(tab('고민 중인 물건'))
    await user.click(tab('가격 비교'))
    expect(screen.getByRole('tab', { name: '묶음상품 비교', selected: true })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: '상품 A' })).getByLabelText('가격')).toHaveValue('6000')
  })
})

describe('키보드 조작 (ARIA 탭 패턴)', () => {
  it('선택된 탭만 Tab 순서에 있고, 각 탭은 자기 패널을 가리킨다', () => {
    render(<App />)
    expect(tab('고민 중인 물건')).toHaveAttribute('tabindex', '0')
    expect(tab('가격 비교')).toHaveAttribute('tabindex', '-1')
    expect(tab('결정 기록')).toHaveAttribute('tabindex', '-1')
    expect(tab('구독')).toHaveAttribute('tabindex', '-1')
    const panel = screen.getByRole('tabpanel')
    expect(tab('고민 중인 물건')).toHaveAttribute('aria-controls', panel.id)
  })

  it('오른쪽 방향키로 다음 메뉴가 선택되고 포커스도 옮겨간다', async () => {
    const user = userEvent.setup()
    render(<App />)
    tab('고민 중인 물건').focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '가격 비교', selected: true })).toHaveFocus()
    expect(screen.getByRole('heading', { level: 2, name: '가격 비교' })).toBeInTheDocument()
  })

  it('첫 탭에서 왼쪽 방향키를 누르면 마지막 탭으로, End·Home 키로 양 끝으로 간다', async () => {
    const user = userEvent.setup()
    render(<App />)
    tab('고민 중인 물건').focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: '구독', selected: true })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: '고민 중인 물건', selected: true })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: '구독', selected: true })).toHaveFocus()
  })

  it('하위 탭도 방향키로 옮길 수 있다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('가격 비교'))
    tab('할인 비교').focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '묶음상품 비교', selected: true })).toHaveFocus()
    expect(screen.getByRole('heading', { level: 3, name: '묶음상품 비교' })).toBeInTheDocument()
  })
})
