import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

// 1단계: 세 메뉴와 두 가격 비교 탭을 이동할 수 있다. 화면 전환은 React 상태로 처리한다. (TODO 1-7, 1-8, PRD #4)
describe('메뉴와 탭 이동', () => {
  it('처음 열면 고민 중인 물건 화면이 보인다', () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: '고민 중인 물건', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toBeInTheDocument()
  })

  it('가격 비교 메뉴를 누르면 할인 비교 탭이 먼저 열린다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '가격 비교' }))
    expect(screen.getByRole('tab', { name: '할인 비교', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '할인 비교' })).toBeInTheDocument()
  })

  it('묶음상품 비교 탭으로 바꾸면 할인 비교 화면은 사라진다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '가격 비교' }))
    await user.click(screen.getByRole('tab', { name: '묶음상품 비교' }))
    expect(screen.getByRole('tab', { name: '묶음상품 비교', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '묶음상품 비교' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: '할인 비교' })).not.toBeInTheDocument()
  })

  it('결정 기록 메뉴로 이동할 수 있다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(screen.getByRole('heading', { level: 2, name: '결정 기록' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: '고민 중인 물건' })).not.toBeInTheDocument()
  })

  it('키보드만으로 다음 메뉴로 이동할 수 있다', async () => {
    const user = userEvent.setup()
    render(<App />)
    screen.getByRole('tab', { name: '고민 중인 물건' }).focus()
    await user.keyboard('{Tab}{Enter}')
    expect(screen.getByRole('tab', { name: '가격 비교', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '가격 비교' })).toBeInTheDocument()
  })
})
