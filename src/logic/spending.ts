import { isDay, isIntBetween, isRecord, isString, isTimestamp } from './guards'
import { calendarDaysBetween, daysInMonth, parseDay } from './dates'
import { josa } from './number'

// PRD F59: 자주 쓰는 버튼과 쓴/참은 기록. 은행에서 옮긴 돈과 별도다.
export type SpendingKind = 'convenience' | 'cafe' | 'delivery'
export type SpendingTemplate = { id: string; name: string; kind: SpendingKind; amountKrw: number; limitPerMonth?: number; createdAt: string; updatedAt: string }
export type SpendingEntry = { id: string; templateId: string; name: string; kind: SpendingKind; amountKrw: number; day: string; action: 'spent' | 'skipped'; createdAt: string }
export type SpendingStore = { schemaVersion: 1; templates: SpendingTemplate[]; entries: SpendingEntry[] }
export type SpendingLoadResult = { ok: true; store: SpendingStore } | { ok: false; reason: 'corrupt' | 'unavailable' }
export const SPENDING_KEY = 'buyornot.spending.v1'
export const EMPTY_SPENDING: SpendingStore = { schemaVersion: 1, templates: [], entries: [] }
export const SPENDING_TEMPLATE_MAX = 30
export const SPENDING_ENTRY_MAX = 3000
export const SPENDING_AMOUNT_MAX = 100000
export const SPENDING_KIND_LABEL: Record<SpendingKind, string> = { convenience: '편의점', cafe: '카페', delivery: '배달' }
export const SPENDING_KINDS: readonly SpendingKind[] = ['convenience', 'cafe', 'delivery']
export const SPENDING_STORAGE_LABEL = '자잘한 지출 저장 상태'
export const SPENDING_UNAVAILABLE = '이 브라우저에서는 자잘한 지출 기록을 저장할 수 없어요. 새로고침하면 사라져요.'
export const SPENDING_SAVE_FAILED = '자잘한 지출 기록을 저장하지 못했어요. 브라우저 저장 공간이나 설정을 확인한 뒤 다시 저장해 주세요.'
export const SPENDING_REPLACED = '다른 탭에서 저장한 자잘한 지출 기록을 불러왔어요. 이 탭에서 저장하지 않은 변경은 반영되지 않았어요.'
export const SPENDING_CORRUPT = '저장된 자잘한 지출 기록을 읽을 수 없어요. 초기화하기 전까지는 새로 적은 기록이 저장되지 않아요.'
export const spendingSavedMessage = (name: string, action: SpendingEntry['action']) => `‘${name}’${josa(name, '을/를')} ${action === 'spent' ? '썼다고' : '참았다고'} 적었어요.`

const nameOkay = (v: unknown) => isString(v) && v.trim().length >= 1 && v.trim().length <= 30
const idOkay = (v: unknown) => isString(v) && v.length >= 1 && v.length <= 100
const kindOkay = (v: unknown): v is SpendingKind => v === 'convenience' || v === 'cafe' || v === 'delivery'
const uniqueIds = (items: readonly { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length

function isTemplate(v: unknown): v is SpendingTemplate {
  if (!isRecord(v) || !idOkay(v.id) || !nameOkay(v.name) || !kindOkay(v.kind) || !isIntBetween(v.amountKrw, 1, SPENDING_AMOUNT_MAX)) return false
  if (v.limitPerMonth !== undefined && !isIntBetween(v.limitPerMonth, 1, 100)) return false
  return isTimestamp(v.createdAt) && isTimestamp(v.updatedAt)
}
function isEntry(v: unknown): v is SpendingEntry {
  if (!isRecord(v) || !idOkay(v.id) || !idOkay(v.templateId) || !nameOkay(v.name) || !kindOkay(v.kind)) return false
  if (!isIntBetween(v.amountKrw, 1, SPENDING_AMOUNT_MAX) || !isDay(v.day) || (v.action !== 'spent' && v.action !== 'skipped')) return false
  return isTimestamp(v.createdAt)
}
export function isSpendingStore(v: unknown): v is SpendingStore {
  if (!isRecord(v) || Object.keys(v).some((key) => !['schemaVersion', 'templates', 'entries'].includes(key))) return false
  if (v.schemaVersion !== 1 || !Array.isArray(v.templates) || !Array.isArray(v.entries)) return false
  if (v.templates.length > SPENDING_TEMPLATE_MAX || v.entries.length > SPENDING_ENTRY_MAX) return false
  return v.templates.every(isTemplate) && v.entries.every(isEntry) && uniqueIds(v.templates) && uniqueIds(v.entries)
}
export function parseSpending(raw: string | null): SpendingLoadResult {
  if (raw === null) return { ok: true, store: EMPTY_SPENDING }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isSpendingStore(parsed) ? { ok: true, store: parsed } : { ok: false, reason: 'corrupt' }
  } catch { return { ok: false, reason: 'corrupt' } }
}
export function addSpendingTemplate(store: SpendingStore, template: SpendingTemplate): SpendingStore | 'full' {
  return store.templates.length >= SPENDING_TEMPLATE_MAX ? 'full' : { ...store, templates: [...store.templates, template] }
}
export function addSpendingEntry(store: SpendingStore, entry: SpendingEntry): SpendingStore | 'full' {
  return store.entries.length >= SPENDING_ENTRY_MAX ? 'full' : { ...store, entries: [...store.entries, entry] }
}

type CountAmount = { count: number; amountKrw: number }
type MonthPair = { current: CountAmount; previous: CountAmount }
export function spendingMonthSummary(entries: readonly SpendingEntry[], today: Date): Record<SpendingKind, MonthPair> {
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
  const previousDay = Math.min(today.getDate(), daysInMonth(previous.getFullYear(), previous.getMonth() + 1))
  const blank = (): MonthPair => ({ current: { count: 0, amountKrw: 0 }, previous: { count: 0, amountKrw: 0 } })
  const result: Record<SpendingKind, MonthPair> = { convenience: blank(), cafe: blank(), delivery: blank() }
  for (const entry of entries) {
    if (entry.action !== 'spent') continue
    const month = entry.day.slice(0, 7)
    const bucket = month === currentMonth && Number(entry.day.slice(8)) <= today.getDate() ? result[entry.kind].current
      : month === previousMonth && Number(entry.day.slice(8)) <= previousDay ? result[entry.kind].previous : null
    if (bucket) { bucket.count++; bucket.amountKrw += entry.amountKrw }
  }
  return result
}

export function skippedSpendingTotal(entries: readonly SpendingEntry[]): CountAmount {
  const skipped = entries.filter((entry) => entry.action === 'skipped')
  return { count: skipped.length, amountKrw: skipped.reduce((sum, entry) => sum + entry.amountKrw, 0) }
}

export function weeklySpendingExperiment(entries: readonly SpendingEntry[], templateId: string, today: Date): { previous: number; current: number; target: number } | null {
  let previous = 0
  let current = 0
  for (const entry of entries) {
    if (entry.templateId !== templateId || entry.action !== 'spent') continue
    const day = parseDay(entry.day)
    if (!day) continue
    const age = calendarDaysBetween(day, today)
    if (age >= 0 && age <= 6) current++
    else if (age >= 7 && age <= 13) previous++
  }
  return previous ? { previous, current, target: previous - 1 } : null
}

export function weeklySpendingLine(experiment: NonNullable<ReturnType<typeof weeklySpendingExperiment>>): string {
  return `지난 7일 ${experiment.previous}번 · 이번 7일 ${experiment.current}번 · 이번에는 ${experiment.target}번까지 시도해 보세요.`
}
