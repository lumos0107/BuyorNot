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
  // 2026-11-02 F86: 가격표 사진 예시는 장보기의 마지막 비교 종류다
  await user.click(screen.getByRole('tab', { name: '장보기' }))
  await user.click(screen.getByRole('tab', { name: '가격표 사진 예시' }))
  expect(screen.getByText(/사진 버튼은 사진을 다시 분석하지 않고/)).toBeInTheDocument()
  // 처음 열면 첫 사진(라면 진열대)의 저장된 결과가 이미 펼쳐져 있다 (F83, 2026-11-02 제작자 요청 "들어가자마자 켜져 있도록", "처음 차 말고 라면으로")
  expect(screen.queryByRole('button', { name: '이 사진의 저장된 결과 보기' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /진열대$/ }).map((b) => b.textContent)).toEqual(['라면 진열대', '차 진열대', '젤리 진열대'])
  expect(screen.getByRole('button', { name: '라면 진열대' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('img', { name: /라면 진열대/ })).toHaveAttribute('src', expect.stringMatching(/demo\/ramen\.jpg$/))
  const ramen = within(screen.getByRole('region', { name: '미리 읽은 품목과 가격 비교' }))
  expect(ramen.getByText('농심)신라면블랙')).toBeInTheDocument()
  expect(ramen.getByText('1,900원')).toBeInTheDocument()
  // 라면은 다나와 낱개(1개) 상품 페이지에서 확인한 가격을 버튼 모양 링크와 함께 보여 준다(2026-11-02 제작자 요청)
  expect(ramen.getByRole('heading', { name: '다나와 표시 가격 비교' })).toBeInTheDocument()
  expect(ramen.getByText('사진 1,900원 → 다나와 1,480원')).toBeInTheDocument()
  const blackLink = ramen.getByRole('link', { name: '농심 신라면 블랙 134g (1개) 다나와 상품 보기(새 창)' })
  expect(blackLink).toHaveAttribute('href', 'https://prod.danawa.com/info/?pcode=116017382')
  expect(blackLink).toHaveClass('btn')
  expect(blackLink).toHaveTextContent('다나와 상품 보기')
  // 차 진열대를 고르면 그 사진의 저장된 결과와 다나와 조회값으로 바로 바뀐다
  await user.click(screen.getByRole('button', { name: '차 진열대' }))
  const results = within(screen.getByRole('region', { name: '미리 읽은 품목과 가격 비교' }))
  expect(results.queryByText('농심)신라면블랙')).not.toBeInTheDocument()
  expect(results.getByText('샘표순작연근우엉차')).toBeInTheDocument()
  expect(results.getByText('7,100원')).toBeInTheDocument()
  expect(results.getByRole('heading', { name: '다나와 표시 가격 비교' })).toBeInTheDocument()
  expect(results.getByRole('link', { name: /순작 연근우엉차 40T/ })).toHaveAttribute('href', 'https://prod.danawa.com/info/?pcode=4282090')
  expect(results.getByText('사진 7,100원 → 다나와 3,920원')).toBeInTheDocument()
  // 젤리 사진: Gemini가 가격을 읽지 못한 상품은 값을 지어내지 않고 그대로 '가격표를 읽지 못함'으로 둔다
  await user.click(screen.getByRole('button', { name: '젤리 진열대' }))
  const jelly = within(screen.getByRole('region', { name: '미리 읽은 품목과 가격 비교' }))
  expect(jelly.getByText('왕꿈틀이')).toBeInTheDocument()
  expect(jelly.getAllByText('가격표를 읽지 못함')).toHaveLength(3)
  expect(jelly.getByText('사진 1,200원 → 다나와 800원')).toBeInTheDocument()
  expect(jelly.getAllByRole('link', { name: /다나와 상품 보기/ })).toHaveLength(3)
  expect(fetch).not.toHaveBeenCalled()
  fetch.mockRestore()
})

it('가계부는 요약 뒤에 달력을 보여주고 저장되지 않은 예시를 첫 입력 뒤 숨긴다', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '가계부' }))
  // 2026-11-02 F86: 요약 → 접힌 수입·지출 적기 → 달력 순서(전: 달력이 맨 위)
  const summary = screen.getByRole('region', { name: '이달 가계부 요약' })
  const calendar = screen.getByRole('region', { name: '결제·지출 달력' })
  expect(summary.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('시연용 예시 금액입니다. 저장되지 않으며 첫 내역을 적으면 사라져요.')).toBeInTheDocument()
  expect(localStorage.getItem(LEDGER_KEY)).toBeNull()
  const form = within(screen.getByRole('group', { name: '수입·지출 적기' }))
  await user.type(form.getByLabelText('내용'), '점심')
  await user.type(form.getByLabelText('금액'), '10000')
  await user.click(form.getByRole('button', { name: '기록하기' }))
  expect(screen.queryByText('시연용 예시 금액입니다. 저장되지 않으며 첫 내역을 적으면 사라져요.')).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(LEDGER_KEY) ?? '{}').entries).toHaveLength(1)
})
