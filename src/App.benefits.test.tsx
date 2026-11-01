import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { BENEFITS_KEY } from './logic/benefits'

beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 2, 9)) })
afterEach(() => vi.useRealTimers())

it('AC151·AC152: 공식 링크에서 조건을 확인하고 직접 적은 날·상태를 저장한다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '모으기' }))
  await user.click(screen.getByText('받을 수 있는 돈'))
  await user.click(screen.getByText('에너지바우처'))
  const program = screen.getByRole('link', { name: '에너지바우처 공식 안내' })
  expect(program).toHaveAttribute('href', 'https://www.energyv.or.kr/info/support_info.do')
  expect(program).toHaveAttribute('target', '_blank')
  const form = within(screen.getByRole('form', { name: '에너지바우처 확인' }))
  await user.selectOptions(form.getByLabelText('상태'), 'applied')
  await user.click(form.getByRole('button', { name: '저장' }))
  expect(JSON.parse(localStorage.getItem(BENEFITS_KEY) ?? '{}').programs).toEqual([{ id: 'energy', checkedOn: '2026-11-02', status: 'applied' }])
  expect(screen.getByText('신청함 · 2026-11-02에 확인')).toBeInTheDocument()
})

it('AC153: 직접 적은 지원금은 생긴 돈에만 들어간다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '모으기' }))
  await user.click(screen.getByText('받을 수 있는 돈'))
  await user.click(screen.getByText('에너지바우처'))
  const form = within(screen.getByRole('form', { name: '에너지바우처 확인' }))
  await user.selectOptions(form.getByLabelText('상태'), 'receiving')
  await user.type(form.getByLabelText('받은 금액 (선택)'), '100000')
  await user.click(form.getByRole('button', { name: '저장' }))
  expect(within(screen.getByRole('region', { name: '생긴 돈' })).getByText('100,000원')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '모으기 요약' })).not.toBeInTheDocument()
})
