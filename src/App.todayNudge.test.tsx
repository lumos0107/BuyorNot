import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// 2026-10-13 G 오늘의 고민으로 이동 (PRD F30, AC49): 담기 폼 위 한 줄로 오늘 갖고 싶은 정도를 안 적은 물건 수를 알리고,
// "적으러 가기"로 목록 순서상 첫 물건의 오늘의 고민으로 옮긴다. 앱 밖에서 부르는 알림이 아니라 연 뒤 할 일을 찾는 장치다
const T0 = new Date(2026, 9, 11, 9)
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(T0.getTime() + days * DAY).toISOString()

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

const base = { priceKrw: 10000, reason: '필요해서', url: null, decidedAt: null, status: 'considering' }
// 고민 기간이 먼저 끝나는 순서: 헤드폰(2일 남음) → 건조대(4일 남음). 둘 다 어제 기록만 있다
const headphone = { ...base, id: 'h1', name: '무선 헤드폰', createdAt: at(-3), updatedAt: at(-1), reviewAt: at(2), desireChecks: [{ day: '2026-10-10', level: 3 }] }
const rack = { ...base, id: 'r1', name: '접이식 건조대', createdAt: at(-2), updatedAt: at(-1), reviewAt: at(4), desireChecks: [{ day: '2026-10-10', level: 3 }] }

function setup(items: unknown[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items }))
  const user = userEvent.setup()
  render(<App />)
  return user
}
const card = (name: string) => within(screen.getByRole('article', { name }))
const nudge = () => screen.queryByRole('status', { name: '오늘 적을 물건' })
const noteTitle = (name: string) => within(card(name).getByRole('region', { name: '오늘의 고민' })).getByText('오늘의 고민')

async function passTime(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
}

describe('오늘의 고민으로 이동 (G, AC49)', () => {
  it('담기 폼 위에 안 적은 물건 수를 보여 주고, 적으러 가기는 목록 순서상 첫 물건의 오늘의 고민으로 옮긴다', async () => {
    const user = setup([rack, headphone])
    const line = nudge()!
    expect(line).toHaveTextContent('오늘 갖고 싶은 정도를 안 적은 물건 2개')
    // 담기 폼보다 위에 있다
    expect(line.compareDocumentPosition(screen.getByRole('form', { name: '물건 담기' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '적으러 가기' }))
    expect(noteTitle('무선 헤드폰')).toHaveFocus()
  })

  it('한 물건에 적으면 수가 줄고 다음 물건으로 간다. 모두 적으면 줄이 사라진다', async () => {
    const user = setup([headphone, rack])
    await user.click(card('무선 헤드폰').getByRole('radio', { name: '2 조금' }))
    expect(nudge()).toHaveTextContent('오늘 갖고 싶은 정도를 안 적은 물건 1개')
    await user.click(screen.getByRole('button', { name: '적으러 가기' }))
    expect(noteTitle('접이식 건조대')).toHaveFocus()
    await user.click(card('접이식 건조대').getByRole('radio', { name: '3 보통' }))
    expect(nudge()).toBeEmptyDOMElement()
  })

  it('이미 적은 물건의 정도를 다시 바꿔도 수와 다음 이동 대상은 그대로다 (GPT 28번)', async () => {
    const user = setup([headphone, rack])
    await user.click(card('무선 헤드폰').getByRole('radio', { name: '2 조금' }))
    await user.click(card('무선 헤드폰').getByRole('radio', { name: '1 별로' }))
    expect(nudge()).toHaveTextContent('오늘 갖고 싶은 정도를 안 적은 물건 1개')
    await user.click(screen.getByRole('button', { name: '적으러 가기' }))
    expect(noteTitle('접이식 건조대')).toHaveFocus()
  })

  it('알림 칸에는 문장만 있고 버튼은 칸 밖에 있다 (수가 바뀔 때 버튼 이름까지 읽히지 않게, GPT 28번)', () => {
    setup([headphone])
    expect(within(nudge()!).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '적으러 가기' })).toBeInTheDocument()
  })

  it('오늘 담으며 정도를 적은 물건은 세지 않고, 고민 중인 물건이 없으면 줄이 없다', () => {
    setup([{ ...headphone, createdAt: at(0), desireChecks: undefined, desireStart: 4, desireStartDay: '2026-10-11' }])
    expect(nudge()).toBeEmptyDOMElement()
  })

  it('결정한 물건은 세지 않는다', () => {
    setup([{ ...headphone, status: 'purchased', decidedAt: at(-1) }])
    expect(nudge()).toBeEmptyDOMElement()
  })

  it('포커스 이벤트 없이 화면을 계속 보고 있어도 자정이 지나면 주기 갱신으로 나타난다 (GPT 28번)', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 9, 11, 23, 59, 50))
    setup([{ ...headphone, desireChecks: [{ day: '2026-10-11', level: 2 }] }])
    expect(nudge()).toBeEmptyDOMElement()
    act(() => {
      vi.advanceTimersByTime(60 * 1000)
    })
    expect(nudge()).toHaveTextContent('오늘 갖고 싶은 정도를 안 적은 물건 1개')
  })

  it('화면을 연 채 자정이 지나 다시 돌아오면 다시 나타난다', async () => {
    const user = setup([headphone])
    await user.click(card('무선 헤드폰').getByRole('radio', { name: '2 조금' }))
    expect(nudge()).toBeEmptyDOMElement()
    await passTime(15 * 60 * 60 * 1000 + 60 * 1000)
    expect(nudge()).toHaveTextContent('오늘 갖고 싶은 정도를 안 적은 물건 1개')
  })
})
