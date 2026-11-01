import { calendarDaysBetween } from './dates'
import { isDay, isIntBetween, isRecord, isString, isTimestamp } from './guards'
import { formatWon, parseInteger } from './number'
import { kindOf, monthlyEquivalent, parseDay, toDayIso, yearsLater, type Subscription } from './subscriptions'
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

// ---------- 옮긴 돈 적기·기록 (F48) ----------

export type TransferRawInput = { direction: TransferDirection; amount: string; day: string; memo: string }
export type TransferFieldErrors = Partial<Record<'amount' | 'day' | 'memo', string>>

export const TRANSFER_INTRO = '앱은 돈을 옮기지 않아요. 은행 앱에서 옮긴 뒤 금액을 적어 주세요.'
export const TRANSFER_FULL = '기록이 너무 많아 더 적을 수 없어요. 백업한 뒤 오래된 기록을 지워 주세요.'
export const TRANSFER_DELETE_CONFIRM = '이 기록을 지울까요? 저축 목표와 옮긴 돈 합계에서도 빠져요.'

/** 옮긴 돈 검사. 날짜는 1년 전 같은 날(없으면 그 달 말일)부터 오늘까지 */
export function validateTransferInput(
  raw: TransferRawInput,
  today: Date,
): { value?: Omit<Transfer, 'id' | 'createdAt'>; errors: TransferFieldErrors } {
  const errors: TransferFieldErrors = {}
  const value: Omit<Transfer, 'id' | 'createdAt'> = { direction: raw.direction, amountKrw: 0, day: '' }

  const amount = parseInteger(raw.amount)
  if (amount === null) errors.amount = '금액을 숫자로 입력해 주세요'
  else if (amount < 1 || amount > AMOUNT_MAX) errors.amount = '금액은 1원~1억 원 사이여야 해요'
  else value.amountKrw = amount

  const dayText = raw.day.trim()
  const day = parseDay(dayText)
  if (!day) errors.day = '올바른 날짜를 골라 주세요'
  else if (calendarDaysBetween(day, today) < 0 || calendarDaysBetween(yearsLater(today, -1), day) < 0) {
    errors.day = '날짜는 1년 전부터 오늘 사이여야 해요'
  } else value.day = dayText

  const memo = raw.memo.trim()
  if (memo.length > MEMO_MAX) errors.memo = `메모는 ${MEMO_MAX}자 이하로 적어 주세요`
  else if (memo !== '') value.memo = memo

  return Object.keys(errors).length > 0 ? { errors } : { value, errors }
}

/** 메모가 비면 넣지 않는다 */
export function createTransfer(value: Omit<Transfer, 'id' | 'createdAt'>, now: Date, id: string): Transfer {
  const { memo, ...rest } = value
  return { id, ...rest, ...(memo ? { memo } : {}), createdAt: now.toISOString() }
}

const directionText = (t: Pick<Transfer, 'direction'>) => (t.direction === 'in' ? '넣었어요' : '꺼냈어요')

/** "100,000원을 넣었다고 적었어요." / "20,000원을 꺼냈다고 적었어요." */
export function transferSavedMessage(t: Transfer): string {
  return `${formatWon(t.amountKrw)}을 ${t.direction === 'in' ? '넣었다고' : '꺼냈다고'} 적었어요.` // copy-check: ignore josa formatWon은 늘 '원'으로 끝난다
}

/** 기록 줄: "2026-11-20 · 꺼냈어요 · 20,000원 · 적금 통장" (메모가 없으면 마지막 부분 없음) */
export function transferLine(t: Transfer): string {
  return [t.day, directionText(t), formatWon(t.amountKrw), ...(t.memo ? [t.memo] : [])].join(' · ')
}

/** 지우기 버튼의 접근 가능한 이름 */
export function transferDeleteName(t: Transfer): string {
  return `${t.day} ${directionText(t)} ${formatWon(t.amountKrw)} 기록 지우기`
}

/** 날짜 최신순, 같은 날은 늦게 적은 것 먼저(적은 시각까지 같으면 저장 순서가 늦은 것 먼저) */
export function sortTransfers(transfers: readonly Transfer[]): Transfer[] {
  return transfers
    .map((t, index) => ({ t, index }))
    .sort((a, b) => b.t.day.localeCompare(a.t.day) || b.t.createdAt.localeCompare(a.t.createdAt) || b.index - a.index)
    .map(({ t }) => t)
}

// ---------- 저축 목표 (F48): 정한 날부터 적은 옮긴 돈으로만 채운다 ----------

export type GoalRawInput = { name: string; target: string; targetDate: string }
export type GoalFieldErrors = Partial<Record<'name' | 'target' | 'targetDate', string>>
export type GoalValue = Pick<Goal, 'name' | 'targetKrw' | 'targetDate'>

export const GOAL_EMPTY_NOTE = '목표는 옮긴 돈으로만 채워요.'
export const GOAL_STALE = '다른 탭에서 이 목표가 바뀌었어요. 취소한 뒤 다시 열어 고쳐 주세요.'

/**
 * 목표 검사. unchangedTargetDate: 고치기 폼에 채워 둔 목표 날짜. 그대로 두면 범위를 다시 따지지 않는다
 */
export function validateGoalInput(
  raw: GoalRawInput,
  today: Date,
  unchangedTargetDate?: string,
): { value?: GoalValue; errors: GoalFieldErrors } {
  const errors: GoalFieldErrors = {}
  const value: GoalValue = { name: '', targetKrw: 0 }

  const name = raw.name.trim()
  if (name.length === 0) errors.name = '목표 이름을 적어 주세요'
  else if (name.length > GOAL_NAME_MAX) errors.name = `목표 이름은 ${GOAL_NAME_MAX}자 이하로 적어 주세요`
  else value.name = name

  const target = parseInteger(raw.target)
  if (target === null) errors.target = '목표 금액을 숫자로 입력해 주세요'
  else if (target < GOAL_MIN || target > GOAL_MAX) errors.target = '목표 금액은 1만 원~1억 원 사이여야 해요'
  else value.targetKrw = target

  const dateText = raw.targetDate.trim()
  if (dateText !== '') {
    const date = parseDay(dateText)
    if (!date) errors.targetDate = '올바른 날짜를 골라 주세요'
    else if (dateText !== unchangedTargetDate && (calendarDaysBetween(today, date) < 1 || calendarDaysBetween(date, yearsLater(today, 10)) < 0)) {
      errors.targetDate = '목표 날짜는 내일부터 10년 안이어야 해요'
    } else value.targetDate = dateText
  }

  return Object.keys(errors).length > 0 ? { errors } : { value, errors }
}

/** 새 목표. 정한 날은 오늘 */
export function newGoal(value: GoalValue, today: Date, now: Date): Goal {
  const at = now.toISOString()
  return { name: value.name, targetKrw: value.targetKrw, ...(value.targetDate ? { targetDate: value.targetDate } : {}), startedOn: toDayIso(today), createdAt: at, updatedAt: at }
}

/** 목표 고치기. 정한 날·만든 시각은 그대로 */
export function editGoal(goal: Goal, value: GoalValue, now: Date): Goal {
  return {
    name: value.name,
    targetKrw: value.targetKrw,
    ...(value.targetDate ? { targetDate: value.targetDate } : {}),
    startedOn: goal.startedOn,
    createdAt: goal.createdAt,
    updatedAt: now.toISOString(),
  }
}

/** 채운 금액 = 정한 날(같은 날 포함) 이후 넣었어요 − 꺼냈어요(0 아래면 0). 퍼센트는 내림해 100에서 멈춘다 */
export function goalProgress(goal: Goal, transfers: readonly Transfer[]): { filled: number; percent: number; reached: boolean } {
  const sum = transfers
    .filter((t) => t.day >= goal.startedOn)
    .reduce((total, t) => total + (t.direction === 'in' ? t.amountKrw : -t.amountKrw), 0)
  const filled = Math.max(0, sum)
  return { filled, percent: Math.min(100, Math.floor((filled * 100) / goal.targetKrw)), reached: filled >= goal.targetKrw }
}

/** 목표 카드의 글: 머리, 안내, 목표 날짜 줄(닿았으면 닿았다는 문장, 날짜가 없으면 null) */
export function goalLines(goal: Goal, transfers: readonly Transfer[], today: Date): { head: string; note: string; plan: string | null } {
  const { filled, percent, reached } = goalProgress(goal, transfers)
  const head = `${goal.name} · ${formatWon(goal.targetKrw)} 중 ${formatWon(filled)} (${percent}%)`
  const note = `목표를 정한 날(${goal.startedOn})부터 적은 옮긴 돈으로 채워요. 줄어든 고정비와 참은 구매는 더하지 않아요.`
  if (reached) return { head, note, plan: '목표 금액에 닿았어요.' }
  const date = goal.targetDate ? parseDay(goal.targetDate) : null
  if (!goal.targetDate || !date) return { head, note, plan: null }
  const left = calendarDaysBetween(today, date)
  if (left < 0) return { head, note, plan: '목표 날짜가 지났어요.' }
  if (left === 0) return { head, note, plan: '오늘이 목표 날짜예요.' }
  const perMonth = Math.ceil((goal.targetKrw - filled) / Math.ceil(left / 30))
  return { head, note, plan: `목표 날짜 ${goal.targetDate}까지 ${left}일 · 한 달에 약 ${formatWon(perMonth)}씩 옮기면 닿아요` }
}

export const goalDeleteConfirm = (goal: Pick<Goal, 'name'>) => `‘${goal.name}’ 목표를 지울까요? 옮긴 돈 기록은 그대로 남아요.`
