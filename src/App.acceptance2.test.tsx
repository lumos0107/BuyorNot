import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// 12단계 통합 점검: 다른 테스트가 화면에서 확인하지 않던 2차 검증 사례 (AC23 해당 없음, AC28 1차 기록)
const T0 = new Date('2026-10-11T09:00:00+09:00')

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

const card = (name: string) => within(screen.getByRole('article', { name }))
const summary = () => within(screen.getByRole('region', { name: '결정 기록 요약' }))

// 1차 앱이 저장하던 형식 그대로: 2차 필드(extensions, decisionNote, answers, satisfaction, reviewNote)가 없다
const phase1Store = {
  schemaVersion: 1,
  items: [
    {
      id: 'c1',
      name: '전동 칫솔',
      priceKrw: 59000,
      reason: '쓰던 게 고장 났다',
      url: null,
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
      reviewAt: '2026-10-13T00:00:00.000Z',
      status: 'considering',
      decidedAt: null,
    },
    {
      id: 's1',
      name: '블루투스 스피커',
      priceKrw: 79000,
      reason: '캠핑 갈 때',
      url: null,
      createdAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
      reviewAt: '2026-09-23T00:00:00.000Z',
      status: 'skipped',
      decidedAt: '2026-09-25T00:00:00.000Z',
    },
    {
      id: 'p1',
      name: '전기 포트',
      priceKrw: 32000,
      reason: '물 끓이기',
      url: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-08T00:00:00.000Z',
      reviewAt: '2026-10-04T00:00:00.000Z',
      status: 'purchased',
      decidedAt: '2026-10-08T00:00:00.000Z',
    },
  ],
}

describe('2차 검증 사례 통합 점검', () => {
  it('AC23: 조건에 맞는 기록이 없으면 안내하고, 요약은 그대로다', async () => {
    const user = userEvent.setup()
    render(<App />)
    const form = within(screen.getByRole('form', { name: '물건 담기' }))
    await user.type(form.getByLabelText('상품명'), '무선 헤드폰')
    await user.type(form.getByLabelText('가격'), '129000')
    await user.type(form.getByLabelText('사고 싶은 이유'), '이유')
    await user.click(form.getByRole('button', { name: '담아 두기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    await user.click(screen.getByRole('button', { name: '구매함 (0)' }))
    expect(screen.getByText('이 조건의 기록이 없어요.')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
    expect(summary().getByText('구매 포기 1건')).toBeInTheDocument()
    expect(summary().getByText('129,000원')).toBeInTheDocument()
  })

  it('AC28: 1차 형식 기록을 열면 그대로 보이고, 연장·메모·답 표시가 없으며 저장값도 바뀌지 않는다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(phase1Store))
    const user = userEvent.setup()
    render(<App />)
    expect(screen.queryByRole('status', { name: '저장 상태' })).not.toBeInTheDocument()
    expect(card('전동 칫솔').getByText(/3일 숙려/)).toBeInTheDocument()
    expect(card('전동 칫솔').queryByText(/번 연장/)).not.toBeInTheDocument()
    expect(card('전동 칫솔').queryByRole('list', { name: '담을 때 답한 것' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(screen.getByRole('button', { name: '전체 (2)', pressed: true })).toBeInTheDocument()
    for (const name of ['블루투스 스피커', '전기 포트']) {
      expect(card(name).queryByText('결정 메모')).not.toBeInTheDocument()
      expect(card(name).queryByText('잘 샀나요?')).not.toBeInTheDocument()
    }
    expect(summary().getByText('구매 포기 1건')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(phase1Store)
  })
})
