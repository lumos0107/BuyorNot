import { kindOf, monthlyEquivalent, parseDay, type Subscription } from './subscriptions'
import { historySummary } from './summary'
import { isExample, type WishItem } from './wishlist'

// PRD F48 모으기 저장. 키 buyornot.savings.v1, 날짜는 'YYYY-MM-DD'(현지 달력), 시각은 ISO
export type TransferDirection = 'in' | 'out'

/** 은행 앱에서 실제로 옮긴 뒤 적은 돈 한 건. 넣었어요('in')·꺼냈어요('out') */
export type Transfer = {
  id: string
  day: string
  amountKrw: number
  direction: TransferDirection
  memo?: string
  createdAt: string
}

/** 저축 목표. startedOn(정한 날)부터 적은 옮긴 돈으로만 채운다 */
export type Goal = {
  name: string
  targetKrw: number
  startedOn: string
  targetDate?: string
  createdAt: string
  updatedAt: string
}

export type SavingsStore = { schemaVersion: 1; transfers: Transfer[]; goal: Goal | null }
export type SavingsLoadResult = { ok: true; store: SavingsStore } | { ok: false; reason: 'corrupt' | 'unavailable' }

export const SAVINGS_KEY = 'buyornot.savings.v1'
export const EMPTY_SAVINGS: SavingsStore = { schemaVersion: 1, transfers: [], goal: null }
export const TRANSFER_MAX = 2000
export const AMOUNT_MAX = 100_000_000
export const MEMO_MAX = 30
export const GOAL_NAME_MAX = 20
export const GOAL_MIN = 10_000
export const GOAL_MAX = 100_000_000

const isString = (v: unknown): v is string => typeof v === 'string'
const isDay = (v: unknown) => isString(v) && parseDay(v) !== null
const isTimestamp = (v: unknown) => isString(v) && Number.isFinite(Date.parse(v))
const isIntBetween = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function isTransfer(v: unknown): v is Transfer {
  if (!isRecord(v)) return false
  if (!isString(v.id) || v.id.length === 0) return false
  if (!isDay(v.day)) return false
  if (!isIntBetween(v.amountKrw, 1, AMOUNT_MAX)) return false
  if (v.direction !== 'in' && v.direction !== 'out') return false
  if (v.memo !== undefined && !(isString(v.memo) && v.memo.length >= 1 && v.memo.length <= MEMO_MAX)) return false
  return isTimestamp(v.createdAt)
}

function isGoal(v: unknown): v is Goal {
  if (!isRecord(v)) return false
  if (!isString(v.name) || v.name.trim().length < 1 || v.name.trim().length > GOAL_NAME_MAX) return false
  if (!isIntBetween(v.targetKrw, GOAL_MIN, GOAL_MAX)) return false
  if (!isDay(v.startedOn)) return false
  // 목표 날짜가 오늘보다 앞인지 뒤인지는 복원 때 따지지 않는다 (F14 원칙)
  if (v.targetDate !== undefined && !isDay(v.targetDate)) return false
  return isTimestamp(v.createdAt) && isTimestamp(v.updatedAt)
}

/**
 * 저장 모양이 맞는지. schemaVersion·transfers·goal 말고 다른 키가 있으면 아니다:
 * 뒤 판의 앱이 더한 기록을 이 판이 다시 쓰다 빠뜨리지 않게 한다
 */
export function isSavingsStore(v: unknown): v is SavingsStore {
  if (!isRecord(v)) return false
  if (Object.keys(v).some((key) => key !== 'schemaVersion' && key !== 'transfers' && key !== 'goal')) return false
  if (v.schemaVersion !== 1 || !Array.isArray(v.transfers) || !('goal' in v)) return false
  if (v.transfers.length > TRANSFER_MAX || !v.transfers.every(isTransfer)) return false
  if (new Set(v.transfers.map((t) => t.id)).size !== v.transfers.length) return false
  return v.goal === null || isGoal(v.goal)
}

export function parseSavings(raw: string | null): SavingsLoadResult {
  if (raw === null) return { ok: true, store: EMPTY_SAVINGS }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  return isSavingsStore(parsed) ? { ok: true, store: parsed } : { ok: false, reason: 'corrupt' }
}

// ---------- 저장 동작(순수) ----------

/** 옮긴 돈을 맨 끝에 더한다. 이미 2,000건이면 더하지 않고 'full'(오래된 기록을 몰래 지우지 않는다) */
export function addTransfer(store: SavingsStore, transfer: Transfer): SavingsStore | 'full' {
  if (store.transfers.length >= TRANSFER_MAX) return 'full'
  return { ...store, transfers: [...store.transfers, transfer] }
}

export function removeTransfer(store: SavingsStore, id: string): SavingsStore {
  return { ...store, transfers: store.transfers.filter((t) => t.id !== id) }
}

export function setGoal(store: SavingsStore, goal: Goal): SavingsStore {
  return { ...store, goal }
}

/** 목표만 지운다. 옮긴 돈 기록은 남는다 */
export function clearGoal(store: SavingsStore): SavingsStore {
  return { ...store, goal: null }
}

// ---------- 세 숫자 (F48): 저장하지 않고 볼 때마다 계산하며, 어디서도 더하지 않는다 ----------

export type SavingsNumbers = {
  /** 해지한 고정비(월세·관리비 빼고)의 개수와 카드 월평균 합 */
  reducedCount: number
  reducedMonthly: number
  /** 구매 포기 기록의 건수와 등록 가격 합 (결정 기록 요약과 같은 값) */
  skippedCount: number
  skippedTotal: number
  /** 옮긴 돈 기록 건수와 넣었어요 − 꺼냈어요 */
  transferCount: number
  movedTotal: number
  /** 세는 기록 가운데 이름이 "(예시)"로 시작하는 것이 있는지 */
  includesExample: boolean
}

export function savingsNumbers(items: readonly WishItem[], subs: readonly Subscription[], store: SavingsStore): SavingsNumbers {
  const reduced = subs.filter((sub) => sub.cancelledOn !== undefined && kindOf(sub) !== 'housing')
  const skipped = historySummary(items, null)
  const movedTotal = store.transfers.reduce((sum, t) => sum + (t.direction === 'in' ? t.amountKrw : -t.amountKrw), 0)
  return {
    reducedCount: reduced.length,
    reducedMonthly: reduced.reduce((sum, sub) => sum + monthlyEquivalent(sub), 0),
    skippedCount: skipped.skippedCount,
    skippedTotal: skipped.skippedTotal,
    transferCount: store.transfers.length,
    movedTotal,
    includesExample:
      reduced.some((sub) => isExample(sub.name)) || items.some((item) => item.status === 'skipped' && isExample(item.name)),
  }
}

/** 세 기록이 모두 0건이면 빈 화면 (월세·관리비 해지만 있으면 0건) */
export function isSavingsEmpty(n: SavingsNumbers): boolean {
  return n.reducedCount === 0 && n.skippedCount === 0 && n.transferCount === 0
}

export const SAVINGS_EMPTY =
  '아직 모은 기록이 없어요. 고민하던 물건을 구매 포기하거나, 고정비를 ‘해지했어요’로 옮기거나, 은행 앱에서 옮긴 돈을 적으면 여기에 보여요.'
export const NOTE_REDUCED = '줄어든 고정비는 ‘해지했어요’로 옮긴 고정비의 요금을 한 달 기준으로 더한 값이에요. 월세·관리비는 세지 않아요.'
export const NOTE_SKIPPED = '참은 구매는 구매 포기한 물건을 담을 때 적은 가격의 합이에요. 실제로 아낀 돈과는 다를 수 있어요.'
export const NOTE_MOVED = '옮긴 돈은 은행 앱에서 실제로 옮긴 뒤 적은 금액이에요. 넣었어요에서 꺼냈어요를 뺐어요.'
export const NOTE_SEPARATE = '세 숫자는 서로 다른 돈이라 더하지 않아요. 저축 목표는 옮긴 돈으로만 채워요.'

export const reducedLabel = (n: SavingsNumbers) => `줄어든 고정비 · 해지 ${n.reducedCount}개`
export const skippedLabel = (n: SavingsNumbers) => `참은 구매 · 구매 포기 ${n.skippedCount}건`
export const movedLabel = (n: SavingsNumbers) => `옮긴 돈 · 기록 ${n.transferCount}건`
