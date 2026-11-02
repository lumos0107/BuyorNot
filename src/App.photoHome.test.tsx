import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => { cleanup(); vi.unstubAllEnvs(); localStorage.clear() })

it('AI 서버가 있어도 첫 화면은 가계부이고, 장보기를 누르면 가격표 사진이 첫 비교 종류다 (AC195)', async () => {
  vi.stubEnv('VITE_AI_SERVER_URL', 'https://ai.test')
  render(<App />)
  expect(screen.getByRole('tab', { name: '가계부', selected: true })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: '장보기' }))
  expect(screen.getByRole('tab', { name: '가격표 사진', selected: true })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 3, name: '가격표 사진' })).toBeInTheDocument()
})

it('AI 서버가 없으면 장보기는 할인 비교부터이고 가격표 사진 예시는 마지막 비교 종류다 (AC196)', () => {
  vi.stubEnv('VITE_AI_SERVER_URL', '')
  render(<App />)
  fireEvent.click(screen.getByRole('tab', { name: '장보기' }))
  expect(screen.queryByRole('tab', { name: '가격표 사진' })).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '할인 비교', selected: true })).toBeInTheDocument()
  const kinds = screen.getAllByRole('tab').filter((el) => el.closest('[aria-label="가격 비교 종류"]'))
  expect(kinds.at(-1)).toHaveTextContent('가격표 사진 예시')
})

it('사진을 고르기 전에 행동과 조회 한계·개인정보 안내가 보인다 (AC197)', () => {
  vi.stubEnv('VITE_AI_SERVER_URL', 'https://ai.test')
  render(<App />)
  expect(screen.getByText('가격표를 찍고 상품명·매장 가격을 확인해 보세요.')).toBeInTheDocument()
  expect(screen.getByLabelText('가격표 사진 찍기')).toHaveAttribute('type', 'file')
  expect(screen.getByText('다나와 자동 조회는 꺼져 있을 수 있어요. 그때는 검색 링크를 보여 줘요.')).toBeInTheDocument()
  expect(screen.getAllByText(/사진은 읽기 위해 Google Gemini로 보내져요/).length).toBeGreaterThan(0)
})
