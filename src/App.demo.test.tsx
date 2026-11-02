import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { LEDGER_KEY } from './logic/ledger'

beforeEach(() => localStorage.clear())

it('공개 빌드의 예시 사진은 저장된 품목만 보여주고 AI 요청을 보내지 않는다', async () => {
  const user = userEvent.setup()
  const fetch = vi.spyOn(globalThis, 'fetch')
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가격표 사진 예시' }))
  expect(screen.getByText(/지금 버튼은 사진을 다시 분석하지 않고/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '이 사진의 저장된 결과 보기' }))
  const results = within(screen.getByRole('region', { name: '미리 읽은 품목과 가격 비교' }))
  expect(results.getByText('샘표순작연근우엉차')).toBeInTheDocument()
  expect(results.getByText(/7,100원/)).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
  fetch.mockRestore()
})

it('가계부는 달력부터 보여주고 저장되지 않은 예시를 첫 입력 뒤 숨긴다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가계부' }))
  const panel = screen.getByRole('tabpanel', { name: '가계부' })
  const calendar = screen.getByRole('region', { name: '앞으로 30일 결제 달력' })
  const ledger = screen.getByRole('region', { name: '가계부' })
  expect(panel.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(calendar.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('시연용 예시 금액입니다. 저장되지 않으며 첫 내역을 적으면 사라져요.')).toBeInTheDocument()
  expect(localStorage.getItem(LEDGER_KEY)).toBeNull()
  const form = within(screen.getByRole('region', { name: '가계부 내역 적기' }))
  await user.type(form.getByLabelText('내용'), '점심')
  await user.type(form.getByLabelText('금액'), '10000')
  await user.click(form.getByRole('button', { name: '기록하기' }))
  expect(screen.queryByText('시연용 예시 금액입니다. 저장되지 않으며 첫 내역을 적으면 사라져요.')).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(LEDGER_KEY) ?? '{}').entries).toHaveLength(1)
})
