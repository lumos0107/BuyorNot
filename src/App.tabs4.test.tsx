import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BENEFITS_KEY, EMPTY_BENEFITS } from './logic/benefits'
import { STORAGE_KEY } from './logic/storage'
import { SUBS_KEY, type Subscription } from './logic/subscriptions'
import type { WishItem } from './logic/wishlist'

// PRD F86 주요 메뉴 네 개와 첫 화면 가계부 (AC217~AC223, 2026-11-03 제작자 요청 "탭은 4개로 가자", "3번은 가계부로 하자")
const now = new Date(2026, 10, 2, 9)
const stamp = '2026-10-20T00:00:00.000Z'
const wish = (id: string, over: Partial<WishItem> = {}): WishItem => ({ id, name: id, priceKrw: 59000, reason: '필요해서', url: null, createdAt: stamp, updatedAt: stamp, reviewAt: '2026-11-01T00:00:00.000Z', status: 'considering', decidedAt: null, ...over })
const sub: Subscription = { id: 's', name: '인터넷 요금', priceKrw: 30000, kind: 'phone', cycle: 'monthly', billingDay: 3, lastUsedDate: null, createdAt: stamp, updatedAt: stamp }
const tab = (name: string) => screen.getByRole('tab', { name })
// 문서 순서대로 앞에 있으면 true
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })

describe('주요 메뉴 네 개 (F86)', () => {
  it('AC217: 처음 열면 가계부이고 메뉴는 가계부·물건·장보기·모으기 네 개다', () => {
    render(<App />)
    const main = screen.getByRole('tablist', { name: '주요 메뉴' })
    expect(within(main).getAllByRole('tab').map((el) => el.textContent)).toEqual(['가계부', '물건', '장보기', '모으기'])
    expect(tab('가계부')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 2, name: '가계부' })).toBeInTheDocument()
    expect(within(main).queryByRole('tab', { name: '가격 비교' })).not.toBeInTheDocument()
    expect(within(main).queryByRole('tab', { name: '결정 기록' })).not.toBeInTheDocument()
    for (const name of ['살까 고민 중', '장보러 가요', '고정비 살펴보기']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('AC218: 물건에는 고민 중·결정 기록 하위 탭이 있고 물건 메뉴를 다시 누르면 고민 중으로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('물건'))
    const sub = screen.getByRole('tablist', { name: '물건 보기' })
    expect(within(sub).getAllByRole('tab').map((el) => el.textContent)).toEqual(['고민 중', '결정 기록'])
    expect(tab('고민 중')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toBeInTheDocument()
    await user.click(tab('결정 기록'))
    expect(screen.getByRole('heading', { level: 2, name: '결정 기록' })).toBeInTheDocument()
    expect(screen.getByText('산 뒤에').closest('details')).not.toHaveAttribute('open')
    await user.click(tab('장보기'))
    await user.click(tab('물건'))
    expect(tab('고민 중')).toHaveAttribute('aria-selected', 'true')
  })

  it('AC219: 장보기는 할인 비교부터, 가격표 사진 예시는 마지막이고 아래에 집에 있는 것이 접혀 있다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', '')
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('장보기'))
    expect(screen.getByRole('heading', { level: 2, name: '장보기' })).toBeInTheDocument()
    const kinds = screen.getByRole('tablist', { name: '가격 비교 종류' })
    expect(within(kinds).getAllByRole('tab').map((el) => el.textContent)).toEqual(['할인 비교', '묶음상품 비교', '배달', '가격표 사진 예시'])
    expect(tab('할인 비교')).toHaveAttribute('aria-selected', 'true')
    const pantry = document.getElementById('pantry-section') as HTMLDetailsElement
    expect(pantry.closest('#panel-compare')).not.toBeNull()
    expect(pantry.open).toBe(false)
  })

  it('AC219: 주소에 ?tab=photo를 붙여 열면 장보기의 가격표 사진 예시가 바로 열린다', () => {
    vi.stubEnv('VITE_AI_SERVER_URL', '')
    window.history.replaceState(null, '', '/?tab=photo')
    render(<App />)
    expect(tab('장보기')).toHaveAttribute('aria-selected', 'true')
    expect(tab('가격표 사진 예시')).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('region', { name: '미리 읽은 품목과 가격 비교' })).getByText('농심)신라면블랙')).toBeInTheDocument()
  })

  it('AC220: 가계부는 요약·적기(접힘)·달력·내역·현황판·분류별·고정비·공과금(접힘)·자잘한 지출(접힘) 순서다', async () => {
    const user = userEvent.setup()
    render(<App />)
    const order = [
      screen.getByRole('region', { name: '이달 가계부 요약' }),
      screen.getByRole('group', { name: '수입·지출 적기' }),
      screen.getByRole('region', { name: '결제·지출 달력' }),
      screen.getByRole('region', { name: '가계부 내역' }),
      screen.getByRole('region', { name: '이달 현황판' }),
      screen.getByRole('region', { name: '분류별 지출' }),
      screen.getByRole('group', { name: '고정비·공과금' }),
      screen.getByRole('group', { name: '자잘한 지출' }),
    ]
    for (let i = 1; i < order.length; i += 1) expect(before(order[i - 1], order[i])).toBe(true)
    expect(order[1]).not.toHaveAttribute('open')
    expect(order[2]).toHaveAttribute('open')
    expect(screen.getByText('날짜별 목록').closest('details')).not.toHaveAttribute('open')
    expect(order[6]).not.toHaveAttribute('open')
    expect(order[7]).not.toHaveAttribute('open')
    expect(screen.queryByText(/중복 계산을 막기 위해/)).not.toBeInTheDocument()
    await user.click(screen.getByText('수입·지출 적기'))
    expect(order[1]).toHaveAttribute('open')
  })

  it('AC221: 달력 칸을 누르면 날짜별 목록이 펼쳐지고 그날로 포커스가 간다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^2026-11-05 결제 예정/ }))
    expect(screen.getByText('날짜별 목록').closest('details')).toHaveAttribute('open')
    expect(screen.getByRole('region', { name: '2026-11-05 결제 예정' })).toHaveFocus()
  })

  it('AC221: 고정비 보기와 가계부 바로가기는 고정비·공과금을 펼친다', async () => {
    localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub] }))
    const user = userEvent.setup()
    render(<App />)
    const group = screen.getByRole('group', { name: '고정비·공과금' })
    expect(group).not.toHaveAttribute('open')
    await user.click(within(screen.getByRole('navigation', { name: '가계부 안에서 이동' })).getByRole('button', { name: '고정비·공과금' }))
    expect(group).toHaveAttribute('open')
    ;(group as HTMLDetailsElement).open = false
    await user.click(tab('물건'))
    await user.click(within(screen.getByRole('region', { name: '오늘 확인할 것' })).getByRole('button', { name: '고정비 보기' }))
    expect(tab('가계부')).toHaveAttribute('aria-selected', 'true')
    expect(group).toHaveAttribute('open')
    expect(screen.getByRole('article', { name: '인터넷 요금' })).toHaveFocus()
  })

  it('AC221: 고정비 저장 기록이 손상되면 고정비·공과금이 처음부터 펼쳐져 저장 안내가 보인다', () => {
    localStorage.setItem(SUBS_KEY, '{망가진')
    render(<App />)
    const group = screen.getByRole('group', { name: '고정비·공과금' })
    expect(group).toHaveAttribute('open')
    expect(within(group).getByText(/읽을 수 없어요/)).toBeInTheDocument()
  })

  it('AC222: 반품 기한 보기는 물건의 결정 기록 하위 탭을 열고 산 뒤 확인으로 포커스한다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [wish('반품 물건', { status: 'purchased', decidedAt: stamp, returnBy: '2026-11-05' })] }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('물건'))
    await user.click(within(screen.getByRole('region', { name: '오늘 확인할 것' })).getByRole('button', { name: '반품 기한 보기' }))
    expect(tab('물건')).toHaveAttribute('aria-selected', 'true')
    expect(tab('결정 기록')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: '반품 물건 산 뒤 확인' })).toHaveFocus()
  })

  it('AC223: 모으기는 요약·저축 목표·옮긴 돈 적기 다음에 받을 수 있는 돈이 접혀 있다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('모으기'))
    const summary = screen.getByRole('region', { name: '모으기 요약 예시' })
    const goal = screen.getByRole('region', { name: '저축 목표' })
    const transfer = screen.getByText('옮긴 돈 적기', { selector: 'summary' })
    const benefits = screen.getByText('받을 수 있는 돈', { selector: 'summary' }).closest('details') as HTMLDetailsElement
    expect(before(summary, goal)).toBe(true)
    expect(before(goal, transfer)).toBe(true)
    expect(before(transfer, benefits)).toBe(true)
    expect(benefits.open).toBe(false)
  })

  it('AC223: 만료일 보기는 받을 수 있는 돈을 펼치고 그 쿠폰으로 포커스한다', async () => {
    localStorage.setItem(BENEFITS_KEY, JSON.stringify({ ...EMPTY_BENEFITS, expiries: [{ id: 'e', name: '쿠폰', expiresOn: '2026-11-04' }] }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(tab('물건'))
    await user.click(within(screen.getByRole('region', { name: '오늘 확인할 것' })).getByRole('button', { name: '만료일 보기' }))
    expect(tab('모으기')).toHaveAttribute('aria-selected', 'true')
    expect((screen.getByText('받을 수 있는 돈', { selector: 'summary' }).closest('details') as HTMLDetailsElement).open).toBe(true)
    expect(screen.getByRole('article', { name: '쿠폰' })).toHaveFocus()
  })
})
