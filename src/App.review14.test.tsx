import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeBackup } from './logic/backup'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY } from './logic/subscriptions'

// GPT 3차 후반 검토 반영 (화면)
const T0 = new Date(2026, 9, 11, 9)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const card = (name: string) => within(screen.getByRole('article', { name }))
const sub = (over: Record<string, unknown>) => ({
  id: 's1',
  name: '티빙',
  priceKrw: 9500,
  cycle: 'monthly',
  billingDay: 10,
  lastUsedDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})
const backupOf = (subs: unknown[]) =>
  makeBackup({ items: [], hourlyWage: null, subscriptions: subs as never }, T0)

async function openBackup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('기록 백업·복원'))
}

describe('빈 사용 기록 (높음)', () => {
  it('저장된 구독의 사용 기록이 빈 배열이어도 화면이 깨지지 않고 기록 없음으로 본다', async () => {
    localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub({ useDates: [] })] }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '구독' }))
    expect(card('티빙').getByText('사용 기록 없음')).toBeInTheDocument()
    // 사용 기록이 없으면 해지 후보가 아니라 확인 필요다 (F23)
    expect(card('티빙').getByText('확인 필요')).toBeInTheDocument()
  })
})

describe('되돌리기 알림의 유효성 (중간)', () => {
  it('결정 기록에서 다시 고민하기로 되돌리면 고민 목록의 되돌리기 알림은 사라진다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    expect(within(screen.getByRole('status', { name: '결정 알림' })).getByRole('button', { name: '되돌리기' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '다시 고민하기' }))
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '옮기기' }))
    await user.click(screen.getByRole('tab', { name: '고민 중인 물건' }))
    expect(within(screen.getByRole('status', { name: '결정 알림' })).queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
  })

  it('예시만 지우기로 결정한 예시가 사라지면 되돌리기 알림도 사라진다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    await user.click(screen.getByRole('button', { name: '예시만 지우기' }))
    await user.click(within(screen.getByRole('group', { name: '예시 지우기 확인' })).getByRole('button', { name: '지우기' }))
    expect(within(screen.getByRole('status', { name: '결정 알림' })).queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
  })

  it('AC32: 되돌리면 결정 기록의 요약과 필터 개수에서도 빠진다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.click(card('(예시) 무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    await user.click(within(screen.getByRole('status', { name: '결정 알림' })).getByRole('button', { name: '되돌리기' }))
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(within(screen.getByRole('region', { name: '결정 기록 요약' })).getByText('구매 포기 1건')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '구매 포기 (1)' })).toBeInTheDocument()
  })
})

describe('0원 결과는 담을 수 없음 (낮음)', () => {
  it('묶음 비교에서 가격이 0원인 상품은 담기 버튼 대신 안내를 보여준다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: '가격 비교' }))
    await user.click(screen.getByRole('tab', { name: '묶음상품 비교' }))
    const panel = within(screen.getByRole('tabpanel', { name: '묶음상품 비교' }))
    // 앱에서는 예시가 채워진 채로 열리므로 비우고 시작한다
    await user.click(panel.getByRole('button', { name: '초기화' }))
    const a = within(panel.getByRole('group', { name: '상품 A' }))
    const b = within(panel.getByRole('group', { name: '상품 B' }))
    await user.type(a.getByLabelText('가격'), '0')
    await user.type(a.getByLabelText('개당 무게·용량'), '500')
    await user.type(a.getByLabelText('묶음 개수'), '1')
    await user.type(b.getByLabelText('가격'), '3000')
    await user.type(b.getByLabelText('개당 무게·용량'), '500')
    await user.type(b.getByLabelText('묶음 개수'), '1')
    const result = within(screen.getByRole('region', { name: '묶음상품 비교 결과' }))
    expect(result.queryByRole('button', { name: '상품 A로 담기' })).not.toBeInTheDocument()
    expect(result.getByRole('button', { name: '상품 B로 담기' })).toBeInTheDocument()
    expect(result.getByText('0원인 쪽은 고민 목록에 담을 수 없어요.')).toBeInTheDocument()
  })
})

describe('백업 불러오기 보완 (중간·낮음)', () => {
  it('확인 문구는 파일 내용과 질문을 나눠 적는다 (시급 없음)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBackup(user)
    await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([backupOf([sub({})])], 'b.json'))
    const confirm = within(await screen.findByRole('group', { name: '백업 불러오기 확인' }))
    expect(confirm.getByText('파일 내용: 물건 기록 0건, 구독 1개, 시급 없음. 지금 기록을 이 파일의 기록으로 바꿀까요?')).toBeInTheDocument()
  })

  it('새 파일을 고르면 이전 확인을 바로 닫는다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBackup(user)
    const input = screen.getByLabelText('백업 파일 불러오기')
    await user.upload(input, new File([backupOf([sub({})])], 'b.json'))
    await screen.findByRole('group', { name: '백업 불러오기 확인' })
    await user.upload(input, new File(['{"app":"other"}'], 'x.json'))
    expect(await screen.findByText('백업 파일을 읽을 수 없어요. 살까말까에서 받은 백업 파일인지 확인해 주세요.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '백업 불러오기 확인' })).not.toBeInTheDocument()
  })

  it('일부를 저장하지 못하면 그렇다고 알린다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openBackup(user)
    await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([backupOf([sub({})])], 'b.json'))
    const confirm = within(await screen.findByRole('group', { name: '백업 불러오기 확인' }))
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === SUBS_KEY) throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    await user.click(confirm.getByRole('button', { name: '바꾸기' }))
    expect(screen.getByRole('status', { name: '백업 상태' })).toHaveTextContent('백업 파일의 기록으로 바꿨지만 구독을 저장하지 못했어요. 각 화면의 저장 안내를 확인해 주세요.')
    await user.click(screen.getByRole('tab', { name: '구독' }))
    expect(screen.getByRole('status', { name: '구독 저장 상태' })).toBeInTheDocument()
  })

  it('손상 상태에서도 확인하면 백업으로 바꾸고 저장 안내가 사라진다', async () => {
    localStorage.setItem(STORAGE_KEY, '{bad')
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('status', { name: '저장 상태' })).toBeInTheDocument()
    await openBackup(user)
    await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([backupOf([])], 'b.json'))
    await user.click(within(await screen.findByRole('group', { name: '백업 불러오기 확인' })).getByRole('button', { name: '바꾸기' }))
    expect(screen.queryByRole('status', { name: '저장 상태' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items).toEqual([])
    await act(async () => {})
  })
})
