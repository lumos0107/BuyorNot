/// <reference types="node" />
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// PRD F49 주요 메뉴 다섯 개 (AC97, AC98)
// 계획은 index.css?raw로 읽으라고 했지만 vitest가 CSS 파일을 빈 문자열로 바꿔서(길이 0) 파일을 직접 읽는다
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
const tab = (name: string) => screen.getByRole('tab', { name })

beforeEach(() => {
  localStorage.clear()
})

describe('주요 메뉴 다섯 개 (F49)', () => {
  it('AC97: 탭 다섯 개가 물건·가격 비교·결정 기록·고정비·모으기 순서이고 첫 화면 제목은 그대로다', () => {
    render(<App />)
    const main = screen.getByRole('tablist', { name: '주요 메뉴' })
    const names = Array.from(main.querySelectorAll('[role="tab"]')).map((el) => el.textContent)
    expect(names).toEqual(['물건', '가격 비교', '결정 기록', '고정비', '모으기'])
    expect(tab('물건')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toBeInTheDocument()
  })

  it('AC97: 고정비에서 오른쪽 화살표는 모으기, 모으기에서 오른쪽은 물건, 물건에서 왼쪽은 모으기다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('고정비'))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '모으기', selected: true })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '물건', selected: true })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: '모으기', selected: true })).toHaveFocus()
  })

  it('AC97: End는 모으기, Home은 물건이다', async () => {
    const user = userEvent.setup()
    render(<App />)
    tab('물건').focus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: '모으기', selected: true })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: '물건', selected: true })).toHaveFocus()
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

  it('AC98: 좁은 화면의 주요 탭 규칙에 최소 너비 44px이 있다', () => {
    // 실제로 한 줄에 들어가는지는 사람이 360px 브라우저로 본다 (jsdom은 배치를 계산하지 않는다)
    const start = css.indexOf('@media (max-width: 420px)')
    expect(start).toBeGreaterThanOrEqual(0)
    const block = css.slice(start, css.indexOf('\n}\n', start) + 3)
    const rule = /\.tabs:not\(\.tabs-sub\) \.tab \{([^}]*)\}/.exec(block)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/min-width:\s*44px/)
  })
})
