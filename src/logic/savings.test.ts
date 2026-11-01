import { describe, expect, it } from 'vitest'
import {
  EMPTY_SAVINGS,
  TRANSFER_MAX,
  addTransfer,
  clearGoal,
  isSavingsEmpty,
  NOTE_MOVED,
  NOTE_REDUCED,
  NOTE_SEPARATE,
  NOTE_SKIPPED,
  SAVINGS_EMPTY,
  isSavingsStore,
  movedLabel,
  parseSavings,
  reducedLabel,
  removeTransfer,
  savingsNumbers,
  setGoal,
  skippedLabel,
  type Goal,
  type SavingsStore,
  type Transfer,
} from './savings'
import type { Subscription } from './subscriptions'
import { historySummary } from './summary'
import type { WishItem } from './wishlist'

// PRD F48 저장 (AC96): buyornot.savings.v1 = { schemaVersion: 1, transfers, goal }
// plan: 계획의 테스트 이름 끝 (AC96)을 앞으로 옮김(R2)
const T = (over: Partial<Transfer> = {}): Transfer => ({
  id: 't1',
  day: '2026-11-01',
  amountKrw: 100000,
  direction: 'in',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
})
const G = (over: Partial<Goal> = {}): Goal => ({
  name: '비상금',
  targetKrw: 500000,
  startedOn: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
})
const raw = (over: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, transfers: [], goal: null, ...over })
const bad = (r: string | null) => {
  expect(parseSavings(r)).toEqual({ ok: false, reason: 'corrupt' })
}

describe('모으기 기록 복원 (F48 저장)', () => {
  it('AC96: 저장값이 없으면 빈 모으기 기록이다', () => {
    expect(parseSavings(null)).toEqual({ ok: true, store: { schemaVersion: 1, transfers: [], goal: null } })
    expect(EMPTY_SAVINGS).toEqual({ schemaVersion: 1, transfers: [], goal: null })
  })

  it('AC96: 옮긴 돈과 목표가 그대로 복원된다', () => {
    const store: SavingsStore = {
      schemaVersion: 1,
      transfers: [T(), T({ id: 't2', direction: 'out', amountKrw: 20000, memo: '적금 통장' })],
      goal: G({ targetDate: '2027-04-30' }),
    }
    expect(parseSavings(JSON.stringify(store))).toEqual({ ok: true, store })
    expect(isSavingsStore(store)).toBe(true)
  })

  it('AC96: 모르는 키 kept가 있으면 손상이다', () => {
    bad(raw({ kept: [] }))
  })

  it('AC96: JSON이 아니거나 판이 1이 아니거나 키가 모자라면 손상이다', () => {
    bad('{')
    bad(raw({ schemaVersion: 2 }))
    bad(JSON.stringify({ schemaVersion: 1, transfers: [] }))
    bad('null')
  })

  it('AC96: 옮긴 돈이 2,001건이면 손상이다', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => T({ id: `t${i}` }))
    expect(parseSavings(raw({ transfers: many(TRANSFER_MAX) })).ok).toBe(true)
    bad(raw({ transfers: many(TRANSFER_MAX + 1) }))
  })

  it('AC96: 금액 0, 방향이 다름, 메모 31자, 실제가 아닌 날짜, 같은 id 두 개면 손상이다', () => {
    bad(raw({ transfers: [T({ amountKrw: 0 })] }))
    bad(raw({ transfers: [T({ direction: 'sideways' as never })] }))
    bad(raw({ transfers: [T({ memo: 'ㄱ'.repeat(31) })] }))
    bad(raw({ transfers: [T({ day: '2026-02-30' })] }))
    bad(raw({ transfers: [T(), T()] }))
  })

  it('AC96: 금액 1억 원 초과, 정수가 아닌 금액, 빈 id, 빈 메모, 시각이 아닌 값은 손상이고 경계값은 읽힌다', () => {
    expect(parseSavings(raw({ transfers: [T({ amountKrw: 100_000_000 }), T({ id: 't2', memo: 'ㄱ'.repeat(30) })] })).ok).toBe(true)
    bad(raw({ transfers: [T({ amountKrw: 100_000_001 })] }))
    bad(raw({ transfers: [T({ amountKrw: 1.5 })] }))
    bad(raw({ transfers: [T({ id: '' })] }))
    bad(raw({ transfers: [T({ memo: '' })] }))
    bad(raw({ transfers: [T({ createdAt: '어제' })] }))
  })

  it('AC96: 목표 이름 21자, 금액 9,999, 실제가 아닌 정한 날이면 손상이다', () => {
    bad(raw({ goal: G({ name: 'ㄱ'.repeat(21) }) }))
    bad(raw({ goal: G({ targetKrw: 9999 }) }))
    bad(raw({ goal: G({ startedOn: '2026-13-01' }) }))
  })

  it('AC96: 목표의 경계값은 읽히고 1억 원 초과, 빈 이름, 실제가 아닌 목표 날짜, 빈 시각은 손상이다', () => {
    expect(parseSavings(raw({ goal: G({ name: 'ㄱ'.repeat(20), targetKrw: 10000 }) })).ok).toBe(true)
    expect(parseSavings(raw({ goal: G({ targetKrw: 100_000_000 }) })).ok).toBe(true)
    bad(raw({ goal: G({ targetKrw: 100_000_001 }) }))
    bad(raw({ goal: G({ name: '   ' }) }))
    bad(raw({ goal: G({ targetDate: '2027-02-30' }) }))
    bad(raw({ goal: G({ updatedAt: '' }) }))
  })

  it('AC96: 목표 이름은 앞뒤 공백을 뺀 길이로 센다', () => {
    expect(parseSavings(raw({ goal: G({ name: ` ${'ㄱ'.repeat(20)} ` }) })).ok).toBe(true)
  })
})

describe('모으기 기록 바꾸기 (F48 저장)', () => {
  it('AC96: 옮긴 돈을 더하고 지운다', () => {
    const added = addTransfer(EMPTY_SAVINGS, T())
    expect(added).toEqual({ schemaVersion: 1, transfers: [T()], goal: null })
    expect(removeTransfer(added as SavingsStore, 't1').transfers).toEqual([])
  })

  it('AC96: 2,000건이면 더 더하지 않는다', () => {
    const full: SavingsStore = { ...EMPTY_SAVINGS, transfers: Array.from({ length: TRANSFER_MAX }, (_, i) => T({ id: `t${i}` })) }
    expect(addTransfer(full, T({ id: 'extra' }))).toBe('full')
  })

  it('AC96: 목표를 정하고 지워도 옮긴 돈은 남는다', () => {
    const withGoal = setGoal({ ...EMPTY_SAVINGS, transfers: [T()] }, G())
    expect(withGoal.goal).toEqual(G())
    expect(clearGoal(withGoal)).toEqual({ schemaVersion: 1, transfers: [T()], goal: null })
  })
})

// PRD F48 세 숫자 (AC91). 계획의 테스트 이름 끝 번호를 앞으로 옮김(R2)
const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  name: '넷플릭스',
  priceKrw: 13500,
  cycle: 'monthly',
  billingDay: 10,
  lastUsedDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})
const wish = (over: Partial<WishItem>): WishItem => ({
  id: 'w1',
  name: '무선 헤드폰',
  priceKrw: 129000,
  reason: '이유',
  url: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  reviewAt: '2026-10-04T00:00:00.000Z',
  status: 'skipped',
  decidedAt: '2026-10-02T00:00:00.000Z',
  ...over,
})
const store = (transfers: Transfer[]): SavingsStore => ({ ...EMPTY_SAVINGS, transfers })

describe('모으기 세 숫자 (F48)', () => {
  const cancelled = [
    sub({ id: 'a', name: '넷플릭스', priceKrw: 13500, cancelledOn: '2026-11-05' }),
    sub({ id: 'b', name: '클라우드', priceKrw: 120000, cycle: 'yearly', renewalDate: '2027-03-01', cancelledOn: '2026-11-06' }),
    sub({ id: 'c', name: '월세', priceKrw: 450000, kind: 'housing', cancelledOn: '2026-11-07' }),
  ]

  it('AC91: 해지한 월세는 줄어든 고정비에 없고, 연 요금은 12로 나눠 반올림해 더한다', () => {
    const n = savingsNumbers([], cancelled, EMPTY_SAVINGS)
    expect(n.reducedCount).toBe(2)
    expect(n.reducedMonthly).toBe(23500)
  })

  it('AC91: 해지하지 않은 고정비는 세지 않는다', () => {
    const n = savingsNumbers([], [sub({ priceKrw: 13500 }), ...cancelled], EMPTY_SAVINGS)
    expect(n.reducedCount).toBe(2)
  })

  it('AC91: 참은 구매는 결정 기록 요약의 구매 포기 금액과 같다', () => {
    const items = [
      wish({ id: 'w1', priceKrw: 129000 }),
      wish({ id: 'w2', name: '마우스', priceKrw: 45000 }),
      wish({ id: 'w3', name: '키보드', priceKrw: 99000, status: 'purchased' }),
      wish({ id: 'w4', name: '의자', priceKrw: 70000, status: 'considering', decidedAt: null }),
    ]
    const n = savingsNumbers(items, [], EMPTY_SAVINGS)
    expect(n.skippedCount).toBe(2)
    expect(n.skippedTotal).toBe(174000)
    expect(n.skippedCount).toBe(historySummary(items, null).skippedCount)
    expect(n.skippedTotal).toBe(historySummary(items, null).skippedTotal)
  })

  it('AC91: 옮긴 돈은 넣었어요에서 꺼냈어요를 뺀다', () => {
    const both = store([T({ id: 'in1', amountKrw: 100000 }), T({ id: 'out1', amountKrw: 20000, direction: 'out' })])
    expect(savingsNumbers([], [], both)).toMatchObject({ transferCount: 2, movedTotal: 80000 })
    const outOnly = store([T({ id: 'out1', amountKrw: 30000, direction: 'out' })])
    expect(savingsNumbers([], [], outOnly)).toMatchObject({ transferCount: 1, movedTotal: -30000 })
  })

  it('AC91: 해지한 월세만 있으면 비어 있다', () => {
    const n = savingsNumbers([], [cancelled[2]], EMPTY_SAVINGS)
    expect(isSavingsEmpty(n)).toBe(true)
    expect(isSavingsEmpty(savingsNumbers([], cancelled, EMPTY_SAVINGS))).toBe(false)
    expect(isSavingsEmpty(savingsNumbers([wish({})], [], EMPTY_SAVINGS))).toBe(false)
    expect(isSavingsEmpty(savingsNumbers([], [], store([T()])))).toBe(false)
  })

  it('AC91: 세는 기록에 예시가 있으면 예시 포함이다', () => {
    expect(savingsNumbers([], cancelled, EMPTY_SAVINGS).includesExample).toBe(false)
    expect(savingsNumbers([wish({ name: '(예시) 헤드폰' })], [], EMPTY_SAVINGS).includesExample).toBe(true)
    expect(savingsNumbers([], [sub({ name: '(예시) 넷플릭스', cancelledOn: '2026-11-05' })], EMPTY_SAVINGS).includesExample).toBe(true)
    // 세지 않는 기록(구매함, 해지한 월세)의 예시는 예시 포함이 아니다
    expect(savingsNumbers([wish({ name: '(예시) 청소기', status: 'purchased' })], [], EMPTY_SAVINGS).includesExample).toBe(false)
    expect(savingsNumbers([], [sub({ name: '(예시) 월세', kind: 'housing', cancelledOn: '2026-11-05' })], EMPTY_SAVINGS).includesExample).toBe(false)
  })

  it('AC91: 줄 이름은 PRD 문장 그대로다', () => {
    const n = savingsNumbers(
      [wish({ id: 'w1', priceKrw: 129000 }), wish({ id: 'w2', priceKrw: 45000 })],
      cancelled,
      store([T({ id: 'in1', amountKrw: 100000 }), T({ id: 'out1', amountKrw: 20000, direction: 'out' })]),
    )
    expect(reducedLabel(n)).toBe('줄어든 고정비 · 해지 2개')
    expect(skippedLabel(n)).toBe('참은 구매 · 구매 포기 2건')
    expect(movedLabel(n)).toBe('옮긴 돈 · 기록 2건')
  })

  it('AC91: 빈 화면과 안내 문장은 PRD 문장 그대로다', () => {
    expect(SAVINGS_EMPTY).toBe('아직 모은 기록이 없어요. 고민하던 물건을 구매 포기하거나, 고정비를 ‘해지했어요’로 옮기거나, 은행 앱에서 옮긴 돈을 적으면 여기에 보여요.')
    expect(NOTE_REDUCED).toBe('줄어든 고정비는 ‘해지했어요’로 옮긴 고정비의 요금을 한 달 기준으로 더한 값이에요. 월세·관리비는 세지 않아요.')
    expect(NOTE_SKIPPED).toBe('참은 구매는 구매 포기한 물건을 담을 때 적은 가격의 합이에요. 실제로 아낀 돈과는 다를 수 있어요.')
    expect(NOTE_MOVED).toBe('옮긴 돈은 은행 앱에서 실제로 옮긴 뒤 적은 금액이에요. 넣었어요에서 꺼냈어요를 뺐어요.')
    expect(NOTE_SEPARATE).toBe('세 숫자는 서로 다른 돈이라 더하지 않아요. 저축 목표는 옮긴 돈으로만 채워요.')
  })
})
