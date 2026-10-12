import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY } from './logic/subscriptions'

// PRD F25 구독 사용량 직접 적기 (AC44): 스크린 타임·주문 내역에서 본 최근 30일 사용 시간·횟수를 적으면 한 번에 드는 돈을 보여준다
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 11, 9))
})

afterEach(() => {
  vi.useRealTimers()
})

const at = '2026-10-01T00:00:00.000Z'
const sub = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  name: '티빙',
  priceKrw: 9500,
  cycle: 'monthly',
  billingDay: 10,
  lastUsedDate: null,
  createdAt: at,
  updatedAt: at,
  ...over,
})
async function open(...items: unknown[]) {
  localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items }))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '구독' }))
  return user
}
const card = (name: string) => within(screen.getByRole('article', { name }))
const usageForm = (name: string) => within(card(name).getByRole('form', { name: '사용량 적기' }))
const saved = () => JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0]

describe('구독 사용량 직접 적기 (F25, AC44)', () => {
  it('사용 시간을 적으면 1시간에 드는 돈을 보여주고 확인 필요가 사라진다. 저장하면 버튼으로 포커스가 돌아간다', async () => {
    const user = await open(sub())
    expect(card('티빙').getByText('확인 필요')).toBeInTheDocument()
    await user.click(card('티빙').getByRole('button', { name: '사용량 적기' }))
    const input = usageForm('티빙').getByLabelText('최근 30일 사용 시간 (시간)')
    expect(input).toHaveFocus()
    expect(input).toHaveAccessibleDescription(/스크린 타임/)
    await user.type(input, '18')
    await user.click(usageForm('티빙').getByRole('button', { name: '저장' }))
    expect(card('티빙').getByText('사용량(10/11에 적음): 최근 30일 18시간 · 1시간에 약 530원꼴')).toBeInTheDocument()
    expect(card('티빙').queryByText('확인 필요')).not.toBeInTheDocument()
    expect(saved().usageEntry).toEqual({ kind: 'minutes', value: 1080, day: '2026-10-11' })
    expect(card('티빙').getByRole('button', { name: '사용량 다시 적기' })).toHaveFocus()
  })

  it('사용 횟수를 고르면 1번에 드는 돈을 보여준다', async () => {
    const user = await open(sub({ name: '배민클럽', priceKrw: 3990 }))
    await user.click(card('배민클럽').getByRole('button', { name: '사용량 적기' }))
    await user.click(usageForm('배민클럽').getByRole('radio', { name: '사용 횟수' }))
    await user.type(usageForm('배민클럽').getByLabelText('최근 30일 사용 횟수 (번)'), '6')
    await user.click(usageForm('배민클럽').getByRole('button', { name: '저장' }))
    expect(card('배민클럽').getByText('사용량(10/11에 적음): 최근 30일 6번 사용 · 1번에 약 670원꼴')).toBeInTheDocument()
  })

  it('0을 적으면 사용 없음이고 해지 후보가 된다', async () => {
    const user = await open(sub())
    await user.click(card('티빙').getByRole('button', { name: '사용량 적기' }))
    await user.type(usageForm('티빙').getByLabelText('최근 30일 사용 시간 (시간)'), '0')
    await user.click(usageForm('티빙').getByRole('button', { name: '저장' }))
    expect(card('티빙').getByText('사용량(10/11에 적음): 최근 30일 사용 없음')).toBeInTheDocument()
    expect(card('티빙').getByText('해지 후보')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '구독 요약' })).getByText('해지 후보 1개 · 월평균 9,500원')).toBeInTheDocument()
  })

  it('범위를 벗어나거나 숫자가 아니면 오류를 입력에 연결하고 저장하지 않는다', async () => {
    const user = await open(sub())
    await user.click(card('티빙').getByRole('button', { name: '사용량 적기' }))
    const input = usageForm('티빙').getByLabelText('최근 30일 사용 시간 (시간)')
    await user.type(input, '721')
    await user.click(usageForm('티빙').getByRole('button', { name: '저장' }))
    expect(input).toHaveAccessibleDescription(/사용 시간은 0~720시간, 소수 첫째 자리까지 적어 주세요/)
    expect(input).toHaveFocus()
    expect(saved()).not.toHaveProperty('usageEntry')
  })

  it('적은 지 30일이 넘으면 다시 적으라고 보여준다', async () => {
    await open(sub({ usageEntry: { kind: 'count', value: 3, day: '2026-09-01' } }))
    expect(card('티빙').getByText('사용량(9/1에 적음 · 다시 적어 주세요): 최근 30일 3번 사용 · 1번에 약 3,170원꼴')).toBeInTheDocument()
  })

  it('다시 적기에서 지우면 확인 필요로 돌아가고, 취소하면 아무것도 바뀌지 않는다', async () => {
    const user = await open(sub({ usageEntry: { kind: 'minutes', value: 90, day: '2026-10-11' } }))
    await user.click(card('티빙').getByRole('button', { name: '사용량 다시 적기' }))
    expect(usageForm('티빙').getByLabelText('최근 30일 사용 시간 (시간)')).toHaveValue('1.5')
    await user.click(usageForm('티빙').getByRole('button', { name: '취소' }))
    expect(saved().usageEntry).toEqual({ kind: 'minutes', value: 90, day: '2026-10-11' })
    expect(card('티빙').getByRole('button', { name: '사용량 다시 적기' })).toHaveFocus()
    await user.click(card('티빙').getByRole('button', { name: '사용량 다시 적기' }))
    await user.click(usageForm('티빙').getByRole('button', { name: '지우기' }))
    expect(saved()).not.toHaveProperty('usageEntry')
    expect(card('티빙').getByText('확인 필요')).toBeInTheDocument()
    expect(card('티빙').getByRole('button', { name: '사용량 적기' })).toHaveFocus()
  })

  it('예시 구독에 적으면 예시 숫자 대신 적은 사용량을 보여준다', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '예시 구독 넣기' }))
    await user.click(card('(예시) 넷플릭스').getByRole('button', { name: '사용량 적기' }))
    await user.type(usageForm('(예시) 넷플릭스').getByLabelText('최근 30일 사용 시간 (시간)'), '3')
    await user.click(usageForm('(예시) 넷플릭스').getByRole('button', { name: '저장' }))
    expect(card('(예시) 넷플릭스').getByText('사용량(10/11에 적음): 최근 30일 3시간 · 1시간에 약 4,500원꼴')).toBeInTheDocument()
    expect(card('(예시) 넷플릭스').queryByText(/사용량\(예시\)/)).not.toBeInTheDocument()
  })
})
