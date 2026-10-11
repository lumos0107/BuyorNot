import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// 2차 9단계: 질문 3개(F09), 비교 링크·내 기록 알림(F10), 안내문(F11) — AC20, AC21, AC22
const T0 = new Date('2026-10-11T09:00:00+09:00')
const HOUR = 60 * 60 * 1000

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<App />)
  return { user, ...utils }
}

const form = () => within(screen.getByRole('form', { name: '물건 담기' }))
const card = (name: string) => within(screen.getByRole('article', { name }))

async function fillBasics(user: ReturnType<typeof userEvent.setup>, name = '무선 헤드폰') {
  await user.type(form().getByLabelText('상품명'), name)
  await user.type(form().getByLabelText('가격'), '129000')
  await user.type(form().getByLabelText('사고 싶은 이유'), '유선 이어폰 선이 끊겨서')
  await user.click(form().getByRole('radio', { name: '1일' }))
}

async function passTime(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
}

describe('담을 때 질문 3개 (F09)', () => {
  it('AC20: 세 질문에 답하고 담으면, 새로고침 뒤 재검토 가능 카드에 답이 보인다', async () => {
    const { user, unmount } = setup()
    await fillBasics(user)
    await user.click(form().getByText('한 번만 생각해 볼까요? (선택)'))
    await user.click(form().getByRole('radio', { name: '없어요' }))
    await user.type(form().getByLabelText('없으면 어떤 문제가 있나요?'), '출퇴근길에 음악을 못 들어요')
    await user.click(form().getByRole('radio', { name: '모르겠어요' }))
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    unmount()
    setup()
    await passTime(25 * HOUR)
    const answers = within(card('무선 헤드폰').getByRole('list', { name: '담을 때 답한 것' }))
    expect(answers.getByText('지금 쓰는 게 없어요')).toBeInTheDocument()
    expect(answers.getByText('없으면 생기는 문제: 출퇴근길에 음악을 못 들어요')).toBeInTheDocument()
    expect(answers.getByText('한 달 뒤에도 쓸지: 모르겠어요')).toBeInTheDocument()
  })

  it('AC20: 일부만 답하면 답한 것만 보이고, 답하지 않아도 담긴다', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.click(form().getByText('한 번만 생각해 볼까요? (선택)'))
    await user.click(form().getByRole('radio', { name: '있어요' }))
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    await fillBasics(user, '로봇청소기')
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    await passTime(25 * HOUR)
    const answers = within(card('무선 헤드폰').getByRole('list', { name: '담을 때 답한 것' }))
    expect(answers.getAllByRole('listitem')).toHaveLength(1)
    expect(answers.getByText('지금 쓰는 게 있어요')).toBeInTheDocument()
    expect(card('로봇청소기').queryByRole('list', { name: '담을 때 답한 것' })).not.toBeInTheDocument()
  })

  it('AC20: 문제 설명이 201자면 오류를 보여주고 담지 않는다', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.click(form().getByText('한 번만 생각해 볼까요? (선택)'))
    const problem = form().getByLabelText('없으면 어떤 문제가 있나요?')
    await user.type(problem, '가'.repeat(201))
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    expect(problem).toHaveAccessibleDescription(/200자/)
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
  })
})

describe('내 기록 알림과 비교 링크 (F10)', () => {
  it("AC21: '게이밍 키보드'를 입력하면 예시의 포기 기록을 알려준다", async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    await user.type(form().getByLabelText('상품명'), '게이밍 키보드')
    const notice = within(form().getByRole('status', { name: '비슷한 기록' }))
    expect(notice.getByText("3일 전에 '(예시) 게이밍 키보드'를 구매 포기했어요")).toBeInTheDocument()
  })

  it("AC21: 비슷한 기록이 없으면 알림이 없다", async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    await user.type(form().getByLabelText('상품명'), '무선 마우스')
    expect(form().queryByText(/구매 포기했어요|구매했어요|담아 뒀어요/)).not.toBeInTheDocument()
  })

  it('AC22: 카드에 상품명으로 만든 검색 링크가 새 창으로 열린다', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    const links = within(card('무선 헤드폰').getByRole('list', { name: '비교해 볼 곳' })).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['네이버쇼핑', '다나와', '쿠팡'])
    for (const a of links) {
      expect(a.getAttribute('href')).toContain('%EB%AC%B4%EC%84%A0%20%ED%97%A4%EB%93%9C%ED%8F%B0')
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
      expect(a).toHaveAccessibleName(/새 창/)
    }
  })

  it('예시 물건의 링크는 "(예시)"를 빼고 검색한다', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    const link = within(card('(예시) 무선 헤드폰').getByRole('list', { name: '비교해 볼 곳' })).getAllByRole('link')[0]!
    expect(link.getAttribute('href')).not.toContain('%EC%98%88%EC%8B%9C')
  })
})

describe('안내문 (F11)', () => {
  it('접힌 안내문을 펼치면 숙려가 왜 도움이 되는지 보인다', async () => {
    const { user } = setup()
    const summary = screen.getByText('숙려가 왜 도움이 되나요?')
    expect(screen.getByText(/사고 싶은 마음은 시간이 지나면/)).not.toBeVisible()
    await user.click(summary)
    expect(screen.getByText(/사고 싶은 마음은 시간이 지나면/)).toBeVisible()
  })
})
