import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => { cleanup(); vi.unstubAllEnvs(); localStorage.clear() })

it('AI 서버가 있으면 가격 비교의 가격표 사진부터 열린다 (AC195)', () => {
  vi.stubEnv('VITE_AI_SERVER_URL', 'https://ai.test')
  render(<App />)
  expect(screen.getByRole('tab', { name: '가격 비교', selected: true })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '가격표 사진', selected: true })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 3, name: '가격표 사진' })).toBeInTheDocument()
})

it('AI 서버가 없으면 가격표 사진 예시로 시작한다 (AC196)', () => {
  vi.stubEnv('VITE_AI_SERVER_URL', '')
  render(<App />)
  expect(screen.getByRole('tab', { name: '가격 비교', selected: true })).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: '가격표 사진' })).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '가격표 사진 예시', selected: true })).toBeInTheDocument()
})

it('사진을 고르기 전에 행동과 조회 한계·개인정보 안내가 보인다 (AC197)', () => {
  vi.stubEnv('VITE_AI_SERVER_URL', 'https://ai.test')
  render(<App />)
  expect(screen.getByText('가격표를 찍고 상품명·매장 가격을 확인해 보세요.')).toBeInTheDocument()
  expect(screen.getByLabelText('가격표 사진 찍기')).toHaveAttribute('type', 'file')
  expect(screen.getByText('다나와 자동 조회는 꺼져 있을 수 있어요. 그때는 검색 링크를 보여 줘요.')).toBeInTheDocument()
  expect(screen.getAllByText(/사진은 읽기 위해 Google Gemini로 보내져요/).length).toBeGreaterThan(0)
})
