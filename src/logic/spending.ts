import { isDay, isIntBetween, isRecord, isString, isTimestamp } from './guards'

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

const nameOkay = (v: unknown) => isString(v) && v.trim().length >= 1 && v.trim().length <= 30
const kindOkay = (v: unknown): v is SpendingKind => v === 'convenience' || v === 'cafe' || v === 'delivery'
const uniqueIds = (items: readonly { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length

function isTemplate(v: unknown): v is SpendingTemplate {
  if (!isRecord(v) || !nameOkay(v.id) || !nameOkay(v.name) || !kindOkay(v.kind) || !isIntBetween(v.amountKrw, 1, SPENDING_AMOUNT_MAX)) return false
  if (v.limitPerMonth !== undefined && !isIntBetween(v.limitPerMonth, 1, 100)) return false
  return isTimestamp(v.createdAt) && isTimestamp(v.updatedAt)
}
function isEntry(v: unknown): v is SpendingEntry {
  if (!isRecord(v) || !nameOkay(v.id) || !nameOkay(v.templateId) || !nameOkay(v.name) || !kindOkay(v.kind)) return false
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
