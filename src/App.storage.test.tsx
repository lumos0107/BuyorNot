import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// 4단계: 저장 오류 안내(AC13), 저장 제한 안내(4-21), 가격 비교 → 등록 화면 이동(4-22), 시연용 예시 데이터
beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function addItem(user: ReturnType<typeof userEvent.setup>, name = '무선 헤드폰') {
  const form = within(screen.getByRole('form', { name: '물건 담기' }))
  await user.type(form.getByLabelText('상품명'), name)
  await user.type(form.getByLabelText('가격'), '129000')
  await user.type(form.getByLabelText('사고 싶은 이유'), '이유')
  await user.click(form.getByRole('button', { name: '담아 두기' }))
}

describe('저장 오류 안내 (AC13)', () => {
  it('손상된 데이터는 덮어쓰지 않고 알리며, 확인 후 초기화하면 빈 목록으로 시작한다', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const user = userEvent.setup()
    render(<App />)
    const banner = within(screen.getByRole('status'))
    expect(banner.getByText(/저장된 기록을 읽을 수 없어요/)).toBeInTheDocument()

    // 초기화 전에는 손상된 원본을 그대로 둔다
    await addItem(user)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not json')
    expect(screen.getByRole('article', { name: '무선 헤드폰' })).toBeInTheDocument()

    await user.click(banner.getByRole('button', { name: '기록 초기화' }))
    await user.click(banner.getByRole('button', { name: '초기화' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(saved.schemaVersion).toBe(1)
    expect(saved.items.map((i: { name: string }) => i.name)).toEqual(['무선 헤드폰'])
  })

  it('저장에 실패하면 성공으로 보이지 않고, 다시 저장할 수 있다', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const user = userEvent.setup()
    render(<App />)
    await addItem(user)
    const banner = within(screen.getByRole('status'))
    expect(banner.getByText(/저장하지 못했어요/)).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    spy.mockRestore()
    await user.click(banner.getByRole('button', { name: '다시 저장' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toContain('무선 헤드폰')
  })

  it('저장소를 쓸 수 없으면 이번 방문 동안만 유지된다고 알린다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    render(<App />)
    expect(within(screen.getByRole('status')).getByText(/이 브라우저에서는 기록을 저장할 수 없어요/)).toBeInTheDocument()
  })
})

describe('화면 연결과 안내', () => {
  it('기록이 이 브라우저에만 저장된다고 안내한다 (4-21)', () => {
    render(<App />)
    expect(screen.getByText(/기록은 이 브라우저에만 저장돼요/)).toBeInTheDocument()
  })

  it('가격 비교에서 숙려 리스트로 바로 갈 수 있다 (4-22)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '가격 비교' }))
    await user.click(screen.getByRole('button', { name: '숙려 리스트에 담으러 가기' }))
    expect(screen.getByRole('tab', { name: '고민 중인 물건', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: '물건 담기' })).toBeInTheDocument()
  })

  it('목록이 비어 있으면 예시 물건을 넣어 재검토 가능 상태를 바로 볼 수 있다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    const panel = within(screen.getByRole('tabpanel'))
    const articles = panel.getAllByRole('article')
    expect(articles.length).toBeGreaterThanOrEqual(2)
    expect(panel.getByText('재검토 가능')).toBeInTheDocument()
    expect(panel.getAllByText(/^\(예시\)/).length).toBe(articles.length)
    // 예시도 보통 기록처럼 저장된다
    expect(localStorage.getItem(STORAGE_KEY)).toContain('(예시)')
    expect(screen.queryByRole('button', { name: '예시 물건 넣기' })).not.toBeInTheDocument()
  })
})

// GPT 4단계 검토 반영: 다른 탭의 변경 반영, 초기화 취소
describe('여러 탭과 초기화 취소', () => {
  it('다른 탭에서 저장한 기록을 이 탭에도 반영한다', async () => {
    render(<App />)
    expect(screen.getByText('아직 담아 둔 물건이 없어요.')).toBeInTheDocument()
    const item = {
      id: 'other-tab',
      name: '다른 탭 물건',
      priceKrw: 1000,
      reason: '이유',
      url: null,
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
      reviewAt: '2026-10-14T00:00:00.000Z',
      status: 'considering',
      decidedAt: null,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [item] }))
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    })
    expect(screen.getByRole('article', { name: '다른 탭 물건' })).toBeInTheDocument()
  })

  it('초기화를 취소하면 손상 안내와 원본이 그대로 남는다', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const user = userEvent.setup()
    render(<App />)
    const banner = within(screen.getByRole('status'))
    await user.click(banner.getByRole('button', { name: '기록 초기화' }))
    await user.click(banner.getByRole('button', { name: '취소' }))
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not json')
  })
})
