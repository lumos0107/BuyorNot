import { isDay, isIntBetween, isRecord, isString, isTimestamp } from './guards'

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
export type LedgerStore = { schemaVersion: 1; entries: LedgerEntry[] }

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
  return true
}

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
