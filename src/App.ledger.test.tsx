import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { LEDGER_KEY } from './logic/ledger'

beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 2, 9)) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('가계부에서 수입과 지출을 별도로 기록하고, 다른 달 내역은 합계에서 제외한다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가계부' }))
  const form = within(screen.getByRole('region', { name: '가계부 내역 적기' }))
  await user.type(form.getByLabelText('내용'), '점심')
  await user.type(form.getByLabelText('금액'), '12000')
  await user.click(form.getByRole('button', { name: '기록하기' }))
  await user.selectOptions(form.getByLabelText('종류'), 'income')
  await user.type(form.getByLabelText('내용'), '용돈')
  await user.type(form.getByLabelText('금액'), '50000')
  await user.click(form.getByRole('button', { name: '기록하기' }))
  const summary = within(screen.getByRole('region', { name: '이달 가계부 요약' }))
  expect(summary.getByText('38,000원')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(LEDGER_KEY) ?? '{}').entries).toHaveLength(2)
  await user.clear(summary.getByLabelText('볼 달'))
  await user.type(summary.getByLabelText('볼 달'), '2026-10')
  expect(summary.getAllByText('0원')).toHaveLength(3)
})
