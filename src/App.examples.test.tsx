import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY } from './logic/subscriptions'

// 개선: 예시만 지우기 — 예시가 실제 기록·합계에 섞이지 않게 예시만 골라 지운다
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 11, 9))
})

afterEach(() => {
  vi.useRealTimers()
})

const names = (key: string) => JSON.parse(localStorage.getItem(key) ?? '{"items":[]}').items.map((i: { name: string }) => i.name)

describe('예시만 지우기', () => {
  it('예시 물건만 지우고(결정 기록 포함) 직접 담은 물건은 남긴다', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.queryByRole('button', { name: '예시만 지우기' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    const form = within(screen.getByRole('form', { name: '물건 담기' }))
    await user.type(form.getByLabelText('상품명'), '전동 칫솔')
    await user.type(form.getByLabelText('가격'), '59000')
    await user.type(form.getByLabelText('사고 싶은 이유'), '고장')
    await user.click(form.getByRole('button', { name: '담아 두기' }))

    await user.click(screen.getByRole('button', { name: '예시만 지우기' }))
    const confirm = within(screen.getByRole('group', { name: '예시 지우기 확인' }))
    expect(confirm.getByText('예시 물건 4개를 지울까요? 결정 기록의 예시도 함께 지워지고, 직접 담은 물건은 그대로예요.')).toBeInTheDocument()
    expect(confirm.getByRole('button', { name: '지우기' })).toHaveFocus()
    await user.click(confirm.getByRole('button', { name: '지우기' }))

    expect(names(STORAGE_KEY)).toEqual(['전동 칫솔'])
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: '예시만 지우기' })).not.toBeInTheDocument()
  })

  it('취소하면 아무것도 지우지 않고 버튼으로 돌아간다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    await user.click(screen.getByRole('button', { name: '예시만 지우기' }))
    await user.click(within(screen.getByRole('group', { name: '예시 지우기 확인' })).getByRole('button', { name: '취소' }))
    expect(names(STORAGE_KEY)).toHaveLength(4)
    expect(screen.getByRole('button', { name: '예시만 지우기' })).toHaveFocus()
  })

  it('구독에서도 예시 구독만 지운다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '구독' }))
    await user.click(screen.getByRole('button', { name: '예시 구독 넣기' }))
    const form = within(screen.getByRole('form', { name: '구독 담기' }))
    await user.type(form.getByLabelText('구독 이름'), '티빙')
    await user.type(form.getByLabelText('요금'), '9500')
    await user.type(form.getByLabelText('결제일 (매월)'), '10')
    await user.click(form.getByRole('button', { name: '구독 추가' }))

    await user.click(screen.getByRole('button', { name: '예시 구독만 지우기' }))
    const confirm = within(screen.getByRole('group', { name: '예시 지우기 확인' }))
    expect(confirm.getByText('예시 구독 5개를 지울까요? 직접 넣은 구독은 그대로예요.')).toBeInTheDocument()
    await user.click(confirm.getByRole('button', { name: '지우기' }))
    expect(names(SUBS_KEY)).toEqual(['티빙'])
    expect(screen.getByRole('heading', { level: 2, name: '구독' })).toHaveFocus()
  })
})
