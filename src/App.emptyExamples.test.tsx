import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// 빈 화면의 저장되지 않는 예시 (AC216, 2026-11-02 제작자 "전체적으로 비어 있는 데에 기본으로 예시 좀 채워 넣어 줘")
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 3, 9)) })
afterEach(() => vi.useRealTimers())

it('AC216: 물건·결정 기록·모으기가 비어 있으면 저장되지 않는 예시를 보이고 아무것도 저장하지 않는다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '물건' }))
  const wish = within(screen.getByRole('region', { name: '고민 중인 물건 예시' }))
  expect(wish.getByText('(예시) 무선 이어폰')).toBeInTheDocument()
  expect(wish.getByText('이렇게 보여요 (저장되지 않는 예시)')).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: '물건' })); await user.click(screen.getByRole('tab', { name: '결정 기록' }))
  expect(within(screen.getByRole('region', { name: '결정 기록 예시' })).getByText('구매 포기 · 3일 고민')).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: '모으기' }))
  const demo = within(screen.getByRole('region', { name: '모으기 요약 예시' }))
  expect(demo.getByText('줄어든 고정비 (예시) · 해지 1개')).toBeInTheDocument()
  expect(demo.getByText('월 13,500원')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '모으기 요약' })).not.toBeInTheDocument()
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
})

it('AC216: 모으기 요약에서 기록이 없는 칸만 예시 금액으로 채우고, 기록이 있는 칸은 실제 금액을 보인다', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [{
    id: 's1', name: '게임기', priceKrw: 398000, reason: '이유', url: null,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z', reviewAt: '2026-11-02T00:00:00.000Z',
    status: 'skipped', decidedAt: '2026-11-02T00:00:00.000Z',
  }] }))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '모으기' }))
  const summary = within(screen.getByRole('region', { name: '모으기 요약' }))
  expect(summary.getByText('참은 구매 · 구매 포기 1건')).toBeInTheDocument()
  expect(summary.getByText('398,000원')).toBeInTheDocument()
  expect(summary.getByText('옮긴 돈 (예시) · 기록 2건').closest('li')).toHaveClass('is-example')
  expect(summary.getByText(/'\(예시\)' 칸은 아직 기록이 없어 보여 주는 저장되지 않는 예시 금액이에요/)).toBeInTheDocument()
})
