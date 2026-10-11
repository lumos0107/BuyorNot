import { calendarDaysBetween } from './dates'
import { MAX_WON, parseInteger } from './number'
import { NOTE_MAX, validateNote } from './wishlist'

// PRD F14 구독 정리함. 날짜는 'YYYY-MM-DD'(현지 달력), 시각은 ISO.
export type Cycle = 'monthly' | 'yearly'

export type Subscription = {
  id: string
  name: string
  priceKrw: number
  cycle: Cycle
  /** 월 구독: 매월 결제일 1~31 */
  billingDay?: number
  /** 연 구독: 다음(또는 지난) 갱신일. 지났으면 1년씩 더해 계산한다 */
  renewalDate?: string
  /** 마지막으로 쓴 날. 비어 있으면 해지 후보 */
  lastUsedDate: string | null
  memo?: string
  createdAt: string
  updatedAt: string
}

export const SUBS_KEY = 'buyornot.subscriptions.v1'
export const SUB_NAME_MAX = 40
export const CANCEL_AFTER_DAYS = 31

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()

/** 'YYYY-MM-DD'가 실제로 있는 날짜면 현지 Date(정오), 아니면 null */
export function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null
  return new Date(y, mo - 1, d, 12)
}

export function daysUntil(iso: string, today: Date): number {
  return calendarDaysBetween(today, parseDay(iso) ?? today)
}

/** 연 요금은 ÷12를 원 미만 반올림한 값으로 표시만 한다. 합계는 원액으로 계산한다 */
export function monthlyEquivalent(sub: Subscription): number {
  return sub.cycle === 'monthly' ? sub.priceKrw : Math.round(sub.priceKrw / 12)
}

export function nextBillingDate(sub: Subscription, today: Date): string {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  const d = today.getDate()
  if (sub.cycle === 'monthly') {
    const want = sub.billingDay ?? 1
    const thisMonth = Math.min(want, daysInMonth(y, m))
    if (thisMonth >= d) return toIso(y, m, thisMonth)
    const ny = m === 12 ? y + 1 : y
    const nm = m === 12 ? 1 : m + 1
    return toIso(ny, nm, Math.min(want, daysInMonth(ny, nm)))
  }
  const base = parseDay(sub.renewalDate ?? '')
  if (!base) return toIso(y, m, d)
  const bm = base.getMonth() + 1
  const bd = base.getDate()
  // 원래 월·일을 유지하고 해마다 말일로 맞춘다 (2월 29일 → 평년 2월 28일)
  for (let year = base.getFullYear(); ; year++) {
    const candidate = toIso(year, bm, Math.min(bd, daysInMonth(year, bm)))
    if (daysUntil(candidate, today) >= 0) return candidate
  }
}

export function isCancelCandidate(sub: Subscription, today: Date): boolean {
  if (!sub.lastUsedDate) return true
  const used = parseDay(sub.lastUsedDate)
  return !used || calendarDaysBetween(used, today) >= CANCEL_AFTER_DAYS
}

export type SubscriptionSummary = {
  /** 월 구독 요금 합 + 연 구독 월 환산 합 (표시용) */
  monthlyTotal: number
  /** 월 구독 요금 합 × 12 + 연 구독 원액 합 */
  yearlyTotal: number
  candidateCount: number
  candidateMonthly: number
}

export function subscriptionSummary(subs: readonly Subscription[], today: Date): SubscriptionSummary {
  const monthlyRaw = subs.filter((s) => s.cycle === 'monthly').reduce((sum, s) => sum + s.priceKrw, 0)
  const yearlyRaw = subs.filter((s) => s.cycle === 'yearly').reduce((sum, s) => sum + s.priceKrw, 0)
  const candidates = subs.filter((s) => isCancelCandidate(s, today))
  return {
    monthlyTotal: subs.reduce((sum, s) => sum + monthlyEquivalent(s), 0),
    yearlyTotal: monthlyRaw * 12 + yearlyRaw,
    candidateCount: candidates.length,
    candidateMonthly: candidates.reduce((sum, s) => sum + monthlyEquivalent(s), 0),
  }
}

export function sortSubscriptions(subs: readonly Subscription[], today: Date): Subscription[] {
  return [...subs].sort(
    (a, b) =>
      daysUntil(nextBillingDate(a, today), today) - daysUntil(nextBillingDate(b, today), today) ||
      a.name.localeCompare(b.name, 'ko'),
  )
}

// ---------- 입력 검증 ----------

export type SubscriptionRawInput = {
  name: string
  price: string
  cycle: Cycle
  billingDay: string
  renewalDate: string
  lastUsedDate: string
  memo: string
}
export type SubscriptionInput = Pick<Subscription, 'name' | 'priceKrw' | 'cycle' | 'billingDay' | 'renewalDate' | 'lastUsedDate' | 'memo'>
export type SubscriptionFieldErrors = Partial<Record<Exclude<keyof SubscriptionRawInput, 'cycle'>, string>>

export function validateSubscriptionInput(
  raw: SubscriptionRawInput,
  today: Date,
): { value?: SubscriptionInput; errors: SubscriptionFieldErrors } {
  const errors: SubscriptionFieldErrors = {}
  const value: SubscriptionInput = { name: '', priceKrw: 0, cycle: raw.cycle, lastUsedDate: null }

  const name = raw.name.trim()
  if (name.length === 0) errors.name = '구독 이름을 입력해 주세요'
  else if (name.length > SUB_NAME_MAX) errors.name = `이름은 ${SUB_NAME_MAX}자 이하로 적어 주세요`
  else value.name = name

  const price = parseInteger(raw.price)
  if (price === null) errors.price = '요금을 숫자로 입력해 주세요'
  else if (price < 1 || price > MAX_WON) errors.price = '요금은 1원~10억 원 사이여야 해요'
  else value.priceKrw = price

  if (raw.cycle === 'monthly') {
    const billingDay = parseInteger(raw.billingDay)
    if (billingDay === null || billingDay < 1 || billingDay > 31) errors.billingDay = '결제일은 1~31일 사이여야 해요'
    else value.billingDay = billingDay
  } else {
    const renewal = parseDay(raw.renewalDate.trim())
    const until = renewal ? calendarDaysBetween(today, renewal) : -1
    const yearLater = calendarDaysBetween(today, new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()))
    if (!renewal) errors.renewalDate = '다음 갱신일을 골라 주세요'
    else if (until < 0 || until > yearLater) errors.renewalDate = '다음 갱신일은 오늘부터 1년 안이어야 해요'
    else value.renewalDate = raw.renewalDate.trim()
  }

  const lastUsedRaw = raw.lastUsedDate.trim()
  if (lastUsedRaw !== '') {
    const used = parseDay(lastUsedRaw)
    if (!used) errors.lastUsedDate = '올바른 날짜를 골라 주세요'
    else if (calendarDaysBetween(used, today) < 0) errors.lastUsedDate = '마지막 사용일은 오늘이거나 그 전이어야 해요'
    else value.lastUsedDate = lastUsedRaw
  }

  const memo = validateNote(raw.memo)
  if (memo.error) errors.memo = memo.error
  else if (memo.value) value.memo = memo.value

  if (Object.keys(errors).length > 0) return { errors }
  return { value, errors }
}

export function createSubscription(input: SubscriptionInput, now: Date, id: string): Subscription {
  const at = now.toISOString()
  return cleanSub({ id, ...input, createdAt: at, updatedAt: at })
}

export function updateSubscription(sub: Subscription, input: SubscriptionInput, now: Date): Subscription {
  return cleanSub({ id: sub.id, ...input, createdAt: sub.createdAt, updatedAt: now.toISOString() })
}

// 주기에 맞지 않는 필드(월 구독의 갱신일 등)와 빈 메모는 저장하지 않는다
function cleanSub(sub: Subscription): Subscription {
  const out: Subscription = { ...sub }
  if (out.cycle === 'monthly') delete out.renewalDate
  else delete out.billingDay
  if (!out.memo) delete out.memo
  return out
}

/** 현지 날짜를 'YYYY-MM-DD'로 */
export function toDayIso(date: Date): string {
  return toIso(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

// 발표·시연용 예시 구독. 월 구독 2개(하나는 해지 후보), 연 구독 1개
export function demoSubscriptions(today: Date, nextId: () => string): Subscription[] {
  const shift = (days: number) => toDayIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days))
  const in3Months = toDayIso(new Date(today.getFullYear(), today.getMonth() + 3, Math.min(today.getDate(), 28)))
  return [
    createSubscription({ name: '(예시) 넷플릭스', priceKrw: 13500, cycle: 'monthly', billingDay: 15, lastUsedDate: shift(-3) }, today, nextId()),
    createSubscription(
      { name: '(예시) 음악 스트리밍', priceKrw: 10900, cycle: 'monthly', billingDay: 1, lastUsedDate: null, memo: '요즘 거의 안 들음' },
      today,
      nextId(),
    ),
    createSubscription(
      { name: '(예시) 클라우드 저장공간', priceKrw: 120000, cycle: 'yearly', renewalDate: in3Months, lastUsedDate: shift(-10) },
      today,
      nextId(),
    ),
  ]
}

// ---------- 저장 데이터 ----------

export type SubscriptionStore = { schemaVersion: 1; items: Subscription[] }
export type SubsLoadResult = { ok: true; store: SubscriptionStore } | { ok: false; reason: 'corrupt' | 'unavailable' }

const isString = (v: unknown): v is string => typeof v === 'string'
const isDay = (v: unknown) => isString(v) && parseDay(v) !== null
const isTimestamp = (v: unknown) => isString(v) && Number.isFinite(Date.parse(v))

function isSubscription(v: unknown): v is Subscription {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (!isString(o.id) || o.id.length === 0) return false
  if (!isString(o.name) || o.name.length === 0 || o.name.length > SUB_NAME_MAX) return false
  if (!Number.isInteger(o.priceKrw) || (o.priceKrw as number) < 1 || (o.priceKrw as number) > MAX_WON) return false
  if (o.cycle === 'monthly') {
    if (!Number.isInteger(o.billingDay) || (o.billingDay as number) < 1 || (o.billingDay as number) > 31) return false
  } else if (o.cycle === 'yearly') {
    if (!isDay(o.renewalDate)) return false
  } else return false
  if (o.lastUsedDate !== null && !isDay(o.lastUsedDate)) return false
  if (o.memo !== undefined && !(isString(o.memo) && o.memo.length <= NOTE_MAX)) return false
  return isTimestamp(o.createdAt) && isTimestamp(o.updatedAt)
}

export function parseSubscriptions(raw: string | null): SubsLoadResult {
  if (raw === null) return { ok: true, store: { schemaVersion: 1, items: [] } }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  const o = parsed as Record<string, unknown> | null
  if (!o || o.schemaVersion !== 1 || !Array.isArray(o.items) || !o.items.every(isSubscription)) {
    return { ok: false, reason: 'corrupt' }
  }
  const items = o.items as Subscription[]
  if (new Set(items.map((s) => s.id)).size !== items.length) return { ok: false, reason: 'corrupt' }
  return { ok: true, store: { schemaVersion: 1, items } }
}
