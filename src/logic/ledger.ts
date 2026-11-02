import { isDay, isIntBetween, isRecord, isString, isTimestamp } from './guards'
import { formatWon } from './number'

export type LedgerKind = 'income' | 'expense'
export type LedgerCategory = 'salary' | 'food' | 'daily' | 'transport' | 'housing' | 'health' | 'other'
export type LedgerEntry = {
  id: string
  kind: LedgerKind
  category: LedgerCategory
  name: string
  amountKrw: number
  day: string
  createdAt: string
}
// saveTargets: 달('YYYY-MM')별 '이번 달 모을 금액'(F84). 없던 옛 기록·백업도 그대로 읽는다
export type LedgerStore = { schemaVersion: 1; entries: LedgerEntry[]; saveTargets?: Record<string, number> }

export const LEDGER_KEY = 'buyornot.ledger.v1'
export const EMPTY_LEDGER: LedgerStore = { schemaVersion: 1, entries: [] }
export const LEDGER_MAX = 3000
export const LEDGER_CATEGORY_LABEL: Record<LedgerCategory, string> = {
  salary: '급여·용돈', food: '식비', daily: '생활', transport: '교통',
  housing: '주거·공과금', health: '건강', other: '기타',
}

const categories = Object.keys(LEDGER_CATEGORY_LABEL)

export function isLedgerStore(value: unknown): value is LedgerStore {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > LEDGER_MAX) return false
  const ids = new Set<string>()
  for (const entry of value.entries) {
    if (!isRecord(entry) || !isString(entry.id) || !entry.id || entry.id.length > 100 || ids.has(entry.id)) return false
    if (entry.kind !== 'income' && entry.kind !== 'expense') return false
    if (!isString(entry.category) || !categories.includes(entry.category)) return false
    if (!isString(entry.name) || !entry.name.trim() || entry.name.length > 60) return false
    if (!isIntBetween(entry.amountKrw, 1, 1_000_000_000) || !isDay(entry.day) || !isTimestamp(entry.createdAt)) return false
    ids.add(entry.id)
  }
  if (value.saveTargets !== undefined) {
    if (!isRecord(value.saveTargets) || Array.isArray(value.saveTargets)) return false
    const months = Object.entries(value.saveTargets)
    if (months.length > SAVE_TARGET_MAX) return false
    for (const [month, amount] of months) if (!MONTH.test(month) || !isIntBetween(amount, 0, 1_000_000_000)) return false
  }
  return true
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const SAVE_TARGET_MAX = 1200

export function parseLedger(raw: string | null): { ok: true; store: LedgerStore } | { ok: false; reason: 'corrupt' } {
  if (raw === null) return { ok: true, store: EMPTY_LEDGER }
  try {
    const value: unknown = JSON.parse(raw)
    return isLedgerStore(value) ? { ok: true, store: value } : { ok: false, reason: 'corrupt' }
  } catch { return { ok: false, reason: 'corrupt' } }
}

export function ledgerMonth(entries: readonly LedgerEntry[], month: string) {
  const inMonth = entries.filter((entry) => entry.day.slice(0, 7) === month)
  return {
    income: inMonth.filter((entry) => entry.kind === 'income').reduce((sum, entry) => sum + entry.amountKrw, 0),
    expense: inMonth.filter((entry) => entry.kind === 'expense').reduce((sum, entry) => sum + entry.amountKrw, 0),
    entries: [...inMonth].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt)),
  }
}


// ── F84 가계부 보기: 이미 적은 기록에서만 계산한다(저장 형식은 달별 모을 금액 하나만 더함) ──

/** 'YYYY-MM'을 delta달만큼 옮긴다 (AC203) */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** 그 달 지출을 분류별로 모아 큰 순서로. 비율은 그 달 지출 대비 반올림 정수 % (AC204) */
export function ledgerByCategory(entries: readonly LedgerEntry[], month: string): { category: LedgerCategory; amountKrw: number; percent: number }[] {
  const order = Object.keys(LEDGER_CATEGORY_LABEL) as LedgerCategory[]
  const sums = new Map<LedgerCategory, number>()
  for (const entry of entries) {
    if (entry.kind !== 'expense' || entry.day.slice(0, 7) !== month) continue
    sums.set(entry.category, (sums.get(entry.category) ?? 0) + entry.amountKrw)
  }
  const total = [...sums.values()].reduce((sum, value) => sum + value, 0)
  if (total === 0) return []
  return [...sums.entries()]
    .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([category, amountKrw]) => ({ category, amountKrw, percent: Math.round((amountKrw / total) * 100) }))
}

/** 날짜순으로 정렬된 내역을 날짜별로 묶고 그날 수입·지출 합계를 낸다 (AC205) */
export function ledgerDayGroups(sorted: readonly LedgerEntry[]): { day: string; income: number; expense: number; entries: LedgerEntry[] }[] {
  const groups: { day: string; income: number; expense: number; entries: LedgerEntry[] }[] = []
  for (const entry of sorted) {
    let group = groups.at(-1)
    if (!group || group.day !== entry.day) {
      group = { day: entry.day, income: 0, expense: 0, entries: [] }
      groups.push(group)
    }
    group[entry.kind] += entry.amountKrw
    group.entries.push(entry)
  }
  return groups
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** '2026-11-02' → '11월 2일 (월)' */
export function ledgerDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`
}

export type LedgerDashboard =
  | { kind: 'no-income' }
  | { kind: 'ok'; income: number; expense: number; target: number; left: number; over: number; percent: { expense: number; target: number; left: number } }

/** 이달 현황판: 수입을 막대 전체로 보고 지출·모을 금액·남는 돈을 나눈다 (AC206) */
export function ledgerDashboard(income: number, expense: number, target: number | null): LedgerDashboard {
  if (income <= 0) return { kind: 'no-income' }
  const goal = target ?? 0
  const left = Math.max(0, income - expense - goal)
  const over = Math.max(0, expense + goal - income)
  const pct = (value: number) => Math.round((value / income) * 100)
  return { kind: 'ok', income, expense, target: goal, left, over, percent: { expense: pct(expense), target: pct(goal), left: pct(left) } }
}

/** '이번 달 모을 금액' 칸: 0원~10억 원 정수, 빈 칸은 그 달 목표 지우기 (AC207) */
export function parseSaveTarget(raw: string): { ok: true; value: number | null } | { ok: false } {
  const text = raw.trim()
  if (text === '') return { ok: true, value: null }
  if (!/^\d+$/.test(text)) return { ok: false }
  const value = Number(text)
  return value <= 1_000_000_000 ? { ok: true, value } : { ok: false }
}

/** 지난달 지출과 비교한 한 줄. 지난달 기록이 없으면 null (AC208) */
export function ledgerMonthChange(entries: readonly LedgerEntry[], month: string): string | null {
  const previous = shiftMonth(month, -1)
  if (!entries.some((entry) => entry.day.slice(0, 7) === previous)) return null
  const diff = ledgerMonth(entries, month).expense - ledgerMonth(entries, previous).expense
  if (diff === 0) return '지난달과 같아요'
  return `지난달보다 ${formatWon(Math.abs(diff))} ${diff < 0 ? '덜' : '더'} 썼어요`
}
