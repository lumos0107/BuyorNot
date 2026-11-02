import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

// PRD F49 주요 메뉴 다섯 개 (AC97)
const tab = (name: string) => screen.getByRole('tab', { name })

beforeEach(() => {
  localStorage.clear()
})

describe('주요 메뉴 다섯 개 (F49)', () => {
  it('AC97: 탭 다섯 개가 가격 비교·물건·결정 기록·고정비·모으기 순서이고 가격 비교로 시작한다', () => {
    render(<App />)
    const main = screen.getByRole('tablist', { name: '주요 메뉴' })
    const names = Array.from(main.querySelectorAll('[role="tab"]')).map((el) => el.textContent)
    expect(names).toEqual(['가격 비교', '물건', '결정 기록', '가계부', '모으기'])
    expect(tab('가격 비교')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 2, name: '가격 비교' })).toBeInTheDocument()
  })

  it('AC97: 고정비에서 오른쪽 화살표는 모으기, 모으기에서 오른쪽은 가격 비교, 가격 비교에서 왼쪽은 모으기다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('가계부'))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '모으기', selected: true })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '가격 비교', selected: true })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: '모으기', selected: true })).toHaveFocus()
  })

  it('AC97: End는 모으기, Home은 가격 비교다', async () => {
    const user = userEvent.setup()
    render(<App />)
    tab('가격 비교').focus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: '모으기', selected: true })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: '가격 비교', selected: true })).toHaveFocus()
  })

  it('AC97: 모으기를 누르면 화면 제목이 모으기이고 패널과 탭이 이어진다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('모으기'))
    expect(screen.getByRole('heading', { level: 2, name: '모으기' })).toBeInTheDocument()
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('id', 'panel-savings')
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-savings')
    expect(tab('모으기')).toHaveAttribute('id', 'tab-savings')
    expect(tab('모으기')).toHaveAttribute('aria-controls', 'panel-savings')
  })
})
