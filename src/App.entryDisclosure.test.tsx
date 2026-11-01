import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'

beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 2, 9)) })
afterEach(() => { vi.useRealTimers() })

it('AC150: 물건 담기를 접었다 펼쳐도 입력 중인 상품명이 남는다', async () => {
  const user = userEvent.setup()
  render(<App />)
  const form = within(screen.getByRole('form', { name: '물건 담기' }))
  const trigger = form.getByText('물건 담기')
  expect(trigger.closest('details')).not.toHaveAttribute('open')
  await user.click(trigger)
  await user.type(form.getByLabelText('상품명'), '무선 헤드폰')
  await user.click(trigger)
  expect(trigger.closest('details')).not.toHaveAttribute('open')
  await user.click(trigger)
  expect(form.getByLabelText('상품명')).toHaveValue('무선 헤드폰')
})

it('AC150: 고정비 담기를 접었다 펼쳐도 입력 중인 이름이 남는다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '고정비' }))
  const form = within(screen.getByRole('form', { name: '고정비 담기' }))
  const trigger = form.getByText('고정비 담기')
  expect(trigger.closest('details')).not.toHaveAttribute('open')
  await user.click(trigger)
  await user.type(form.getByLabelText('이름'), '넷플릭스')
  await user.click(trigger)
  expect(trigger.closest('details')).not.toHaveAttribute('open')
  await user.click(trigger)
  expect(form.getByLabelText('이름')).toHaveValue('넷플릭스')
})

it('AC150: 고정비를 추가하면 담기 폼이 다시 접힌다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '고정비' }))
  const form = within(screen.getByRole('form', { name: '고정비 담기' }))
  const trigger = form.getByText('고정비 담기')
  await user.click(trigger)
  await user.type(form.getByLabelText('이름'), '넷플릭스')
  await user.type(form.getByLabelText('요금'), '9900')
  await user.type(form.getByLabelText('결제일 (매월)'), '15')
  await user.click(form.getByRole('button', { name: '고정비 추가' }))
  expect(trigger.closest('details')).not.toHaveAttribute('open')
})
