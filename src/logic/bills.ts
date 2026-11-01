import { isIntBetween, isRecord, isString, isTimestamp } from './guards'

// PRD F53: 청구 월별 공과금. 고정비 합계와 분리해 저장한다.
export type BillKind = 'electric' | 'gas' | 'water'
export const BILL_KINDS: readonly BillKind[] = ['electric', 'gas', 'water']
export const BILL_KIND_LABEL: Record<BillKind, string> = { electric: '전기', gas: '가스', water: '수도' }
export type Bill = { id: string; kind: BillKind; month: string; amountKrw: number; months?: 2; createdAt: string; updatedAt: string }
export type BillValue = Pick<Bill, 'kind' | 'month' | 'amountKrw' | 'months'>
export type BillsStore = { schemaVersion: 1; items: Bill[] }
export type BillsLoadResult = { ok: true; store: BillsStore } | { ok: false; reason: 'corrupt' | 'unavailable' }
export const BILLS_KEY = 'buyornot.bills.v1'
export const EMPTY_BILLS: BillsStore = { schemaVersion: 1, items: [] }
export const BILL_MAX = 600
export const BILL_AMOUNT_MAX = 10_000_000

function isBillMonth(v: unknown): v is string {
  if (!isString(v) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return false
  return v >= '2000-01'
}

function isBill(v: unknown): v is Bill {
  if (!isRecord(v)) return false
  if (!isString(v.id) || !v.id || !BILL_KINDS.includes(v.kind as BillKind)) return false
  if (!isBillMonth(v.month) || !isIntBetween(v.amountKrw, 1, BILL_AMOUNT_MAX)) return false
  if (v.months !== undefined && v.months !== 2) return false
  return isTimestamp(v.createdAt) && isTimestamp(v.updatedAt)
}

export function isBillsStore(v: unknown): v is BillsStore {
  if (!isRecord(v) || Object.keys(v).some((key) => key !== 'schemaVersion' && key !== 'items')) return false
  if (v.schemaVersion !== 1 || !Array.isArray(v.items) || v.items.length > BILL_MAX || !v.items.every(isBill)) return false
  if (new Set(v.items.map((item) => item.id)).size !== v.items.length) return false
  return new Set(v.items.map((item) => `${item.kind}:${item.month}`)).size === v.items.length
}

export function parseBills(raw: string | null): BillsLoadResult {
  if (raw === null) return { ok: true, store: EMPTY_BILLS }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isBillsStore(parsed) ? { ok: true, store: parsed } : { ok: false, reason: 'corrupt' }
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
}

export function findSameMonth(items: readonly Bill[], kind: BillKind, month: string): Bill | undefined {
  return items.find((item) => item.kind === kind && item.month === month)
}

export function createBill(value: BillValue, now: Date, id: string): Bill {
  return { id, kind: value.kind, month: value.month, amountKrw: value.amountKrw, ...(value.months === 2 ? { months: 2 as const } : {}), createdAt: now.toISOString(), updatedAt: now.toISOString() }
}

export function addBill(store: BillsStore, bill: Bill): BillsStore | 'full' {
  return store.items.length >= BILL_MAX ? 'full' : { schemaVersion: 1, items: [...store.items, bill] }
}

export function updateBill(store: BillsStore, id: string, value: BillValue, now: Date): BillsStore {
  return { schemaVersion: 1, items: store.items.map((item) => {
    if (item.id !== id) return item
    const next: Bill = { ...item, amountKrw: value.amountKrw, updatedAt: now.toISOString() }
    if (value.months === 2) next.months = 2
    else delete next.months
    return next
  }) }
}

export function removeBill(store: BillsStore, id: string): BillsStore {
  return { schemaVersion: 1, items: store.items.filter((item) => item.id !== id) }
}
