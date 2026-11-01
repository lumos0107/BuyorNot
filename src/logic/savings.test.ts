import { describe, expect, it } from 'vitest'
import {
  EMPTY_SAVINGS,
  GOAL_EMPTY_NOTE,
  GOAL_STALE,
  TRANSFER_DELETE_CONFIRM,
  TRANSFER_FULL,
  TRANSFER_INTRO,
  TRANSFER_MAX,
  addTransfer,
  clearGoal,
  createTransfer,
  editGoal,
  goalDeleteConfirm,
  goalLines,
  goalProgress,
  newGoal,
  sortTransfers,
  transferDeleteName,
  transferLine,
  transferSavedMessage,
  validateGoalInput,
  validateTransferInput,
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

// PRD F48 옮긴 돈 적기·기록·저축 목표 (AC92~AC95). 오늘 2026-11-20
// plan: 계획의 테스트 이름 끝 (AC92) 등을 앞으로 옮김(R2)
const TODAY = new Date(2026, 10, 20, 9)
const rawTransfer = (over: Partial<{ direction: 'in' | 'out'; amount: string; day: string; memo: string }> = {}) => ({
  direction: 'in' as const,
  amount: '100000',
  day: '2026-11-20',
  memo: '',
  ...over,
})
const rawGoal = (over: Partial<{ name: string; target: string; targetDate: string }> = {}) => ({
  name: '비상금',
  target: '500000',
  targetDate: '',
  ...over,
})

describe('옮긴 돈 적기 (F48)', () => {
  it('AC92: 옮긴 돈 검사', () => {
    expect(validateTransferInput(rawTransfer({ amount: '0' }), TODAY).errors.amount).toBe('금액은 1원~1억 원 사이여야 해요')
    expect(validateTransferInput(rawTransfer({ amount: '100000001' }), TODAY).errors.amount).toBe('금액은 1원~1억 원 사이여야 해요')
    expect(validateTransferInput(rawTransfer({ amount: '' }), TODAY).errors.amount).toBe('금액을 숫자로 입력해 주세요')
    expect(validateTransferInput(rawTransfer({ amount: '1.5' }), TODAY).errors.amount).toBe('금액을 숫자로 입력해 주세요')
    expect(validateTransferInput(rawTransfer({ day: '2025-11-19' }), TODAY).errors.day).toBe('날짜는 1년 전부터 오늘 사이여야 해요')
    expect(validateTransferInput(rawTransfer({ day: '2026-11-21' }), TODAY).errors.day).toBe('날짜는 1년 전부터 오늘 사이여야 해요')
    expect(validateTransferInput(rawTransfer({ day: '' }), TODAY).errors.day).toBe('올바른 날짜를 골라 주세요')
    expect(validateTransferInput(rawTransfer({ day: '2026-02-30' }), TODAY).errors.day).toBe('올바른 날짜를 골라 주세요')
    expect(validateTransferInput(rawTransfer({ memo: 'ㄱ'.repeat(31) }), TODAY).errors.memo).toBe('메모는 30자 이하로 적어 주세요')

    const ok = validateTransferInput(rawTransfer({ day: '2025-11-20', amount: '1,000', memo: '  적금 통장  ' }), TODAY)
    expect(ok.errors).toEqual({})
    expect(ok.value).toEqual({ direction: 'in', amountKrw: 1000, day: '2025-11-20', memo: '적금 통장' })
    // 경계: 메모 30자, 오늘, 1억 원
    expect(validateTransferInput(rawTransfer({ memo: 'ㄱ'.repeat(30), amount: '100000000', day: '2026-11-20' }), TODAY).errors).toEqual({})
    // 오류가 있으면 value가 없다
    expect(validateTransferInput(rawTransfer({ amount: '0' }), TODAY).value).toBeUndefined()
  })

  it('AC92: 적은 뒤 문장과 기록 줄', () => {
    const inT = createTransfer({ direction: 'in', amountKrw: 100000, day: '2026-11-20' }, new Date('2026-11-20T00:00:00.000Z'), 'a')
    const outT = createTransfer({ direction: 'out', amountKrw: 20000, day: '2026-11-20', memo: '적금 통장' }, new Date('2026-11-20T01:00:00.000Z'), 'b')
    expect(transferSavedMessage(inT)).toBe('100,000원을 넣었다고 적었어요.')
    expect(transferSavedMessage(outT)).toBe('20,000원을 꺼냈다고 적었어요.')
    expect(transferLine(outT)).toBe('2026-11-20 · 꺼냈어요 · 20,000원 · 적금 통장')
    expect(inT).toEqual({ id: 'a', direction: 'in', amountKrw: 100000, day: '2026-11-20', createdAt: '2026-11-20T00:00:00.000Z' })
    // 만든 기록은 저장 모양 검사를 통과한다
    expect(isSavingsStore({ schemaVersion: 1, transfers: [inT, outT], goal: null })).toBe(true)
  })

  it('AC92: 메모가 없으면 기록 줄에 메모가 없다', () => {
    const t = createTransfer({ direction: 'in', amountKrw: 100000, day: '2026-11-20', memo: '' }, new Date(), 'a')
    expect('memo' in t).toBe(false)
    expect(transferLine(t)).toBe('2026-11-20 · 넣었어요 · 100,000원')
  })

  it('AC92: 기록은 날짜 최신순이고 같은 날은 늦게 적은 것이 먼저다', () => {
    const a = T({ id: 'a', day: '2026-11-02', createdAt: '2026-11-02T01:00:00.000Z' })
    const b = T({ id: 'b', day: '2026-11-20', createdAt: '2026-11-20T01:00:00.000Z' })
    const c = T({ id: 'c', day: '2026-11-20', createdAt: '2026-11-20T05:00:00.000Z' })
    const list = [a, b, c]
    expect(sortTransfers(list).map((t) => t.id)).toEqual(['c', 'b', 'a'])
    expect(list.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('AC92: 안내 문장은 PRD 문장 그대로다', () => {
    expect(TRANSFER_INTRO).toBe('앱은 돈을 옮기지 않아요. 은행 앱에서 옮긴 뒤 금액을 적어 주세요.')
    expect(TRANSFER_FULL).toBe('기록이 너무 많아 더 적을 수 없어요. 백업한 뒤 오래된 기록을 지워 주세요.')
  })

  it('AC93: 지우기 버튼 이름', () => {
    const t = T({ day: '2026-11-20', direction: 'out', amountKrw: 20000 })
    expect(transferDeleteName(t)).toBe('2026-11-20 꺼냈어요 20,000원 기록 지우기')
    expect(TRANSFER_DELETE_CONFIRM).toBe('이 기록을 지울까요? 저축 목표와 옮긴 돈 합계에서도 빠져요.')
  })
})

describe('저축 목표 (F48)', () => {
  const goal = G({ startedOn: '2026-11-01' })
  const moves = [
    T({ id: 'in1', day: '2026-11-02', amountKrw: 100000 }),
    T({ id: 'out1', day: '2026-11-20', amountKrw: 20000, direction: 'out' }),
    T({ id: 'old', day: '2026-10-30', amountKrw: 50000 }),
  ]

  it('AC94: 정한 날 전의 넣었어요는 세지 않아 80,000원 16%다', () => {
    expect(goalProgress(goal, moves)).toEqual({ filled: 80000, percent: 16, reached: false })
    const lines = goalLines(goal, moves, TODAY)
    expect(lines.head).toBe('비상금 · 500,000원 중 80,000원 (16%)')
    expect(lines.note).toBe('목표를 정한 날(2026-11-01)부터 적은 옮긴 돈으로 채워요. 줄어든 고정비와 참은 구매는 더하지 않아요.')
    expect(lines.plan).toBeNull()
    // 정한 날과 같은 날의 기록은 센다
    expect(goalProgress(goal, [T({ day: '2026-11-01', amountKrw: 10000 })]).filled).toBe(10000)
    // 0 아래면 0
    expect(goalProgress(goal, [T({ direction: 'out', day: '2026-11-05' })])).toEqual({ filled: 0, percent: 0, reached: false })
  })

  it('AC94: 목표 날짜까지 161일이면 한 달에 약 70,000원이다', () => {
    const g = G({ startedOn: '2026-11-01', targetDate: '2027-04-30' })
    expect(goalLines(g, moves, TODAY).plan).toBe('목표 날짜 2027-04-30까지 161일 · 한 달에 약 70,000원씩 옮기면 닿아요')
    // 남은 금액을 남은 달로 나눈 몫은 올림이다 (100,000 / 6 = 16,667)
    const g2 = G({ startedOn: '2026-11-01', targetDate: '2027-04-30', targetKrw: 100000 })
    expect(goalLines(g2, [], TODAY).plan).toBe('목표 날짜 2027-04-30까지 161일 · 한 달에 약 16,667원씩 옮기면 닿아요')
    // 내일이 목표 날짜여도 남은 달은 1
    expect(goalLines(G({ targetDate: '2026-11-21' }), [], TODAY).plan).toBe('목표 날짜 2026-11-21까지 1일 · 한 달에 약 500,000원씩 옮기면 닿아요')
  })

  it('AC94: 목표 날짜가 오늘이면 오늘이 목표 날짜라고, 지났으면 지났다고 한다', () => {
    expect(goalLines(G({ targetDate: '2026-11-20' }), moves, TODAY).plan).toBe('오늘이 목표 날짜예요.')
    expect(goalLines(G({ targetDate: '2026-11-10' }), moves, TODAY).plan).toBe('목표 날짜가 지났어요.')
  })

  it('AC94: 목표에 닿으면 100%에서 멈추고 날짜 줄 대신 닿았다고 한다', () => {
    const more = [...moves, T({ id: 'big', day: '2026-11-10', amountKrw: 420000 })]
    expect(goalProgress(goal, more)).toEqual({ filled: 500000, percent: 100, reached: true })
    const lines = goalLines(G({ startedOn: '2026-11-01', targetDate: '2027-04-30' }), more, TODAY)
    expect(lines.head).toBe('비상금 · 500,000원 중 500,000원 (100%)')
    expect(lines.plan).toBe('목표 금액에 닿았어요.')
  })

  it('AC94: 목표를 넘으면 채운 금액은 그대로이고 100%다', () => {
    const over = [...moves, T({ id: 'big', day: '2026-11-10', amountKrw: 520000 })]
    expect(goalProgress(goal, over)).toEqual({ filled: 600000, percent: 100, reached: true })
    expect(goalLines(goal, over, TODAY).head).toBe('비상금 · 500,000원 중 600,000원 (100%)')
  })

  it('AC94: 날짜가 없고 닿지 않았으면 날짜 줄이 없다', () => {
    expect(goalLines(goal, moves, TODAY).plan).toBeNull()
  })

  it('AC95: 목표 검사', () => {
    expect(validateGoalInput(rawGoal({ name: '   ' }), TODAY).errors.name).toBe('목표 이름을 적어 주세요')
    expect(validateGoalInput(rawGoal({ name: 'ㄱ'.repeat(21) }), TODAY).errors.name).toBe('목표 이름은 20자 이하로 적어 주세요')
    expect(validateGoalInput(rawGoal({ target: '9999' }), TODAY).errors.target).toBe('목표 금액은 1만 원~1억 원 사이여야 해요')
    expect(validateGoalInput(rawGoal({ target: '100000001' }), TODAY).errors.target).toBe('목표 금액은 1만 원~1억 원 사이여야 해요')
    expect(validateGoalInput(rawGoal({ target: '' }), TODAY).errors.target).toBe('목표 금액을 숫자로 입력해 주세요')
    expect(validateGoalInput(rawGoal({ targetDate: '2026-11-20' }), TODAY).errors.targetDate).toBe('목표 날짜는 내일부터 10년 안이어야 해요')
    expect(validateGoalInput(rawGoal({ targetDate: '2036-11-21' }), TODAY).errors.targetDate).toBe('목표 날짜는 내일부터 10년 안이어야 해요')
    expect(validateGoalInput(rawGoal({ targetDate: '2026-13-01' }), TODAY).errors.targetDate).toBe('올바른 날짜를 골라 주세요')

    const ok = validateGoalInput(rawGoal({ name: ' 비상금 ', target: '500,000', targetDate: '2036-11-20' }), TODAY)
    expect(ok.errors).toEqual({})
    expect(ok.value).toEqual({ name: '비상금', targetKrw: 500000, targetDate: '2036-11-20' })
    expect(validateGoalInput(rawGoal({ targetDate: '2026-11-21' }), TODAY).errors).toEqual({})
    // 날짜는 선택이라 비우면 값에 없다
    expect('targetDate' in validateGoalInput(rawGoal(), TODAY).value!).toBe(false)
    // 경계: 이름 20자, 1만 원, 1억 원
    expect(validateGoalInput(rawGoal({ name: 'ㄱ'.repeat(20), target: '10000' }), TODAY).errors).toEqual({})
    expect(validateGoalInput(rawGoal({ target: '100000000' }), TODAY).errors).toEqual({})
  })

  it('AC95: 고칠 때 채워 둔 목표 날짜를 그대로 두면 범위를 다시 따지지 않는다', () => {
    const past = rawGoal({ targetDate: '2026-11-10' })
    expect(validateGoalInput(past, TODAY).errors.targetDate).toBe('목표 날짜는 내일부터 10년 안이어야 해요')
    expect(validateGoalInput(past, TODAY, '2026-11-10').errors).toEqual({})
    // 다른 날짜로 바꾸면 다시 따진다
    expect(validateGoalInput(rawGoal({ targetDate: '2026-11-11' }), TODAY, '2026-11-10').errors.targetDate).toBe('목표 날짜는 내일부터 10년 안이어야 해요')
  })

  it('AC95: 목표를 고쳐도 정한 날은 그대로다', () => {
    const made = newGoal({ name: '비상금', targetKrw: 500000 }, new Date(2026, 10, 20, 9), new Date('2026-11-20T00:00:00.000Z'))
    expect(made).toEqual({
      name: '비상금',
      targetKrw: 500000,
      startedOn: '2026-11-20',
      createdAt: '2026-11-20T00:00:00.000Z',
      updatedAt: '2026-11-20T00:00:00.000Z',
    })
    const edited = editGoal(made, { name: '비상금', targetKrw: 600000, targetDate: '2027-01-01' }, new Date('2026-12-01T00:00:00.000Z'))
    expect(edited).toEqual({
      name: '비상금',
      targetKrw: 600000,
      targetDate: '2027-01-01',
      startedOn: '2026-11-20',
      createdAt: '2026-11-20T00:00:00.000Z',
      updatedAt: '2026-12-01T00:00:00.000Z',
    })
    // 목표 날짜를 비우고 고치면 키가 없다
    expect('targetDate' in editGoal(edited, { name: '비상금', targetKrw: 600000 }, new Date())).toBe(false)
    expect(isSavingsStore({ schemaVersion: 1, transfers: [], goal: edited })).toBe(true)
  })

  it('AC95: 안내 문장은 PRD 문장 그대로다', () => {
    expect(GOAL_EMPTY_NOTE).toBe('목표는 옮긴 돈으로만 채워요.')
    expect(GOAL_STALE).toBe('다른 탭에서 이 목표가 바뀌었어요. 취소한 뒤 다시 열어 고쳐 주세요.')
    expect(goalDeleteConfirm(G())).toBe('‘비상금’ 목표를 지울까요? 옮긴 돈 기록은 그대로 남아요.')
  })
})
