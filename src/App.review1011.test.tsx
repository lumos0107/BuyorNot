import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SETTINGS_KEY } from './logic/settings'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY } from './logic/subscriptions'

// GPT 10~11단계 검토 반영 (화면·저장·접근성)
const T0 = new Date('2026-10-11T09:00:00+09:00')
const DAY = 24 * 60 * 60 * 1000
const iso = (ms: number) => new Date(ms).toISOString()

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const card = (name: string) => within(screen.getByRole('article', { name }))
const subsForm = () => within(screen.getByRole('form', { name: '구독 담기' }))
const wishForm = () => within(screen.getByRole('form', { name: '물건 담기' }))
const summary = () => within(screen.getByRole('region', { name: '결정 기록 요약' }))

const sub = (over: Record<string, unknown>) => ({
  id: 's1',
  name: '클라우드',
  priceKrw: 120000,
  cycle: 'yearly',
  renewalDate: '2026-03-01',
  lastUsedDate: null,
  createdAt: iso(T0.getTime() - 300 * DAY),
  updatedAt: iso(T0.getTime() - 300 * DAY),
  ...over,
})

const wish = (over: Record<string, unknown>) => ({
  id: 'w1',
  name: '전기 포트',
  priceKrw: 32000,
  reason: '물 끓이기',
  url: null,
  createdAt: iso(T0.getTime() - 12 * DAY),
  updatedAt: iso(T0.getTime() - 8 * DAY),
  reviewAt: iso(T0.getTime() - 9 * DAY),
  status: 'purchased',
  decidedAt: iso(T0.getTime() - 8 * DAY),
  ...over,
})

async function openSubs(user: ReturnType<typeof userEvent.setup>) {
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '구독' }))
}

async function addMonthly(user: ReturnType<typeof userEvent.setup>, name: string, price = '13500', day = '15') {
  await user.type(subsForm().getByLabelText('구독 이름'), name)
  await user.type(subsForm().getByLabelText('요금'), price)
  await user.type(subsForm().getByLabelText('결제일 (매월)'), day)
  await user.click(subsForm().getByRole('button', { name: '구독 추가' }))
}

describe('GPT 10~11단계 검토 반영', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
  })

  describe('다른 탭과 맞추기', () => {
    it('다른 탭에서 구독을 저장하면 이 탭도 맞추고, 이어서 추가해도 그 기록을 덮어쓰지 않는다', async () => {
      const user = userEvent.setup()
      await openSubs(user)
      localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub({ id: 'o1', name: '왓챠', priceKrw: 7900, cycle: 'monthly', renewalDate: undefined, billingDay: 20 })] }))
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: SUBS_KEY }))
      })
      expect(screen.getByRole('article', { name: '왓챠' })).toBeInTheDocument()
      await addMonthly(user, '넷플릭스')
      const names = JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items.map((s: { name: string }) => s.name)
      expect(names).toEqual(expect.arrayContaining(['왓챠', '넷플릭스']))
    })

    it('다른 탭에서 시급을 바꾸면 이 탭의 시급 입력과 환산도 바뀐다', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [wish({ name: '무선 헤드폰', priceKrw: 129000, status: 'skipped' })] }))
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('tab', { name: '결정 기록' }))
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ schemaVersion: 1, hourlyWage: 10000 }))
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY }))
      })
      expect(summary().getByLabelText('시급 (선택)')).toHaveValue('10000')
      expect(summary().getByText('입력한 시급으로 환산하면 약 12.9시간')).toBeInTheDocument()
    })
  })

  describe('지난 연 갱신일 수정', () => {
    it('갱신일이 지난 연 구독은 수정 폼에 다음 갱신일이 채워지고, 메모만 고쳐도 저장되며 원래 기준일은 유지된다', async () => {
      localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub({})] }))
      const user = userEvent.setup()
      await openSubs(user)
      expect(card('클라우드').getByText('다음 결제 2027-03-01 · D-141')).toBeInTheDocument()
      await user.click(card('클라우드').getByRole('button', { name: '수정' }))
      const editor = within(screen.getByRole('form', { name: '구독 수정' }))
      expect(editor.getByLabelText('다음 갱신일')).toHaveValue('2027-03-01')
      await user.type(editor.getByLabelText('메모 (선택)'), '가족 공유')
      await user.click(editor.getByRole('button', { name: '저장' }))
      expect(screen.queryByRole('form', { name: '구독 수정' })).not.toBeInTheDocument()
      const saved = JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0]
      expect(saved.renewalDate).toBe('2026-03-01')
      expect(saved.memo).toBe('가족 공유')
    })

    it('수정에서 다음 갱신일을 바꾸면 그 날짜로 저장한다', async () => {
      localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub({})] }))
      const user = userEvent.setup()
      await openSubs(user)
      await user.click(card('클라우드').getByRole('button', { name: '수정' }))
      const editor = within(screen.getByRole('form', { name: '구독 수정' }))
      fireEvent.change(editor.getByLabelText('다음 갱신일'), { target: { value: '2027-01-15' } })
      await user.click(editor.getByRole('button', { name: '저장' }))
      expect(JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0].renewalDate).toBe('2027-01-15')
    })
  })

  describe('제출 실패 시 첫 오류로 포커스', () => {
    it('상품명 오류와 질문 오류가 함께 있으면 질문 영역을 펼치고, 첫 오류 입력(상품명)으로 포커스를 옮긴다', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.type(wishForm().getByLabelText('가격'), '129000')
      await user.type(wishForm().getByLabelText('사고 싶은 이유'), '이유')
      const summaryToggle = wishForm().getByText('한 번만 생각해 볼까요? (선택)')
      await user.click(summaryToggle)
      await user.type(wishForm().getByLabelText('없으면 어떤 문제가 있나요?'), '가'.repeat(201))
      await user.click(summaryToggle)
      await user.click(wishForm().getByRole('button', { name: '담아 두기' }))
      expect(summaryToggle.closest('details')).toHaveAttribute('open')
      expect(wishForm().getByLabelText('없으면 어떤 문제가 있나요?')).toHaveAccessibleDescription(/200자 이하/)
      expect(wishForm().getByLabelText('상품명')).toHaveFocus()
    })

    it('물건 수정도 저장에 실패하면 첫 오류 입력으로 포커스를 옮긴다', async () => {
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
      await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '수정' }))
      const editor = within(screen.getByRole('form', { name: '물건 수정' }))
      await user.clear(editor.getByLabelText('가격'))
      await user.click(editor.getByRole('button', { name: '저장' }))
      expect(editor.getByLabelText('가격')).toHaveFocus()
    })

    it('구독 담기도 저장에 실패하면 첫 오류 입력으로 포커스를 옮긴다', async () => {
      const user = userEvent.setup()
      await openSubs(user)
      await user.type(subsForm().getByLabelText('구독 이름'), '넷플릭스')
      await user.type(subsForm().getByLabelText('결제일 (매월)'), '15')
      await user.click(subsForm().getByRole('button', { name: '구독 추가' }))
      expect(subsForm().getByLabelText('요금')).toHaveFocus()
    })
  })

  describe('구매 후 회고 접근성', () => {
    async function openHistory() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [wish({})] }))
      const user = userEvent.setup()
      render(<App />)
      await user.click(screen.getByRole('tab', { name: '결정 기록' }))
      return user
    }

    it('답을 고르지 않고 저장하면 오류를 선택지에 연결하고 첫 선택지로 포커스를 옮긴다', async () => {
      const user = await openHistory()
      await user.click(card('전기 포트').getByRole('button', { name: '회고 저장' }))
      const first = card('전기 포트').getByRole('radio', { name: '잘 샀어요' })
      expect(first).toHaveFocus()
      expect(first).toHaveAccessibleDescription('잘 샀는지 하나를 골라 주세요')
    })

    it('저장하면 "회고 고치기"로, 고치기를 열면 고른 답으로, 취소하면 다시 "회고 고치기"로 포커스가 간다', async () => {
      const user = await openHistory()
      await user.click(card('전기 포트').getByRole('radio', { name: '그저 그래요' }))
      await user.click(card('전기 포트').getByRole('button', { name: '회고 저장' }))
      expect(card('전기 포트').getByRole('button', { name: '회고 고치기' })).toHaveFocus()
      await user.click(card('전기 포트').getByRole('button', { name: '회고 고치기' }))
      expect(card('전기 포트').getByRole('radio', { name: '그저 그래요' })).toHaveFocus()
      await user.click(card('전기 포트').getByRole('button', { name: '취소' }))
      expect(card('전기 포트').getByRole('button', { name: '회고 고치기' })).toHaveFocus()
    })

    it('한 줄 회고가 201자면 오류를 보여주고 저장하지 않는다', async () => {
      const user = await openHistory()
      await user.click(card('전기 포트').getByRole('radio', { name: '잘 샀어요' }))
      const note = card('전기 포트').getByLabelText('한 줄 회고 (선택)')
      await user.type(note, '가'.repeat(201))
      await user.click(card('전기 포트').getByRole('button', { name: '회고 저장' }))
      expect(note).toHaveAccessibleDescription(/200자 이하/)
      expect(note).toHaveFocus()
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items[0].satisfaction).toBeUndefined()
    })
  })

  describe('초기화 확인의 포커스', () => {
    it('구독 기록 초기화: 확인으로 들어가면 "초기화"에, 취소하면 원래 버튼에, 초기화하면 화면 제목에 포커스가 간다', async () => {
      localStorage.setItem(SUBS_KEY, '{bad')
      const user = userEvent.setup()
      await openSubs(user)
      const banner = within(screen.getByRole('status', { name: '구독 저장 상태' }))
      await user.click(banner.getByRole('button', { name: '구독 기록 초기화' }))
      expect(banner.getByRole('button', { name: '초기화' })).toHaveFocus()
      await user.click(banner.getByRole('button', { name: '취소' }))
      expect(banner.getByRole('button', { name: '구독 기록 초기화' })).toHaveFocus()
      await user.click(banner.getByRole('button', { name: '구독 기록 초기화' }))
      await user.click(banner.getByRole('button', { name: '초기화' }))
      expect(screen.getByRole('heading', { level: 2, name: '구독' })).toHaveFocus()
    })

    it('물건 기록 초기화도 같은 순서로 포커스를 옮기고, 초기화 뒤에는 사이트 제목으로 간다', async () => {
      localStorage.setItem(STORAGE_KEY, '{bad')
      const user = userEvent.setup()
      render(<App />)
      const banner = within(screen.getByRole('status', { name: '저장 상태' }))
      await user.click(banner.getByRole('button', { name: '기록 초기화' }))
      expect(banner.getByRole('button', { name: '초기화' })).toHaveFocus()
      await user.click(banner.getByRole('button', { name: '취소' }))
      expect(banner.getByRole('button', { name: '기록 초기화' })).toHaveFocus()
      await user.click(banner.getByRole('button', { name: '기록 초기화' }))
      await user.click(banner.getByRole('button', { name: '초기화' }))
      expect(screen.getByRole('heading', { level: 1, name: '살까말까' })).toHaveFocus()
    })
  })

  describe('구독 저장 실패와 손상 보존', () => {
    it('구독 저장에 실패하면 알리고, 다시 저장할 수 있다', async () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError')
      })
      const user = userEvent.setup()
      await openSubs(user)
      await addMonthly(user, '넷플릭스')
      const banner = within(screen.getByRole('status', { name: '구독 저장 상태' }))
      expect(banner.getByText(/구독을 저장하지 못했어요/)).toBeInTheDocument()
      spy.mockRestore()
      await user.click(banner.getByRole('button', { name: '다시 저장' }))
      expect(screen.queryByRole('status', { name: '구독 저장 상태' })).not.toBeInTheDocument()
      expect(localStorage.getItem(SUBS_KEY)).toContain('넷플릭스')
    })

    it('손상된 구독 데이터가 있으면 새 구독을 넣어도 원래 데이터를 덮어쓰지 않는다', async () => {
      localStorage.setItem(SUBS_KEY, '{bad')
      const user = userEvent.setup()
      await openSubs(user)
      await addMonthly(user, '넷플릭스')
      expect(screen.getByRole('article', { name: '넷플릭스' })).toBeInTheDocument()
      expect(localStorage.getItem(SUBS_KEY)).toBe('{bad')
    })
  })

  it('자정이 지나면 구독의 D-n이 하루 줄어든다', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 23, 59, 50))
    const user = userEvent.setup()
    await openSubs(user)
    await addMonthly(user, '넷플릭스', '13500', '15')
    expect(card('넷플릭스').getByText('다음 결제 2026-10-15 · D-1')).toBeInTheDocument()
    vi.setSystemTime(new Date(2026, 9, 15, 0, 0, 30))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(card('넷플릭스').getByText('다음 결제 2026-10-15 · D-0')).toBeInTheDocument()
  })

  it('삭제 확인 문구의 조사가 이름의 받침에 맞는다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    await user.click(card('(예시) 접이식 건조대').getByRole('button', { name: '삭제' }))
    expect(card('(예시) 접이식 건조대').getByText('‘(예시) 접이식 건조대’를 지울까요?')).toBeInTheDocument()
    await user.click(card('(예시) 접이식 건조대').getByRole('button', { name: '취소' }))
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '삭제' }))
    expect(card('(예시) 무선 헤드폰').getByText('‘(예시) 무선 헤드폰’을 지울까요?')).toBeInTheDocument()
  })
})

describe('열린 화면의 회고 시점', () => {
  it('포커스 이벤트 없이도 결정 7일 정각이 지나면 "잘 샀나요?"가 나타난다', async () => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [wish({ decidedAt: iso(T0.getTime() - 7 * DAY + 10_000) })] }))
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '결정 기록' }))
    const ask = () => within(screen.getByRole('article', { name: '전기 포트' })).queryByText('잘 샀나요?')
    expect(ask()).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(9_000)
    })
    expect(ask()).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(1_100)
    })
    expect(ask()).not.toBeNull()
  })
})
