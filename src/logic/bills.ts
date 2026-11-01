import { isIntBetween, isRecord, isString, isTimestamp } from './guards'
import { formatWon, parseInteger } from './number'

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

export type BillRawInput = { kind: BillKind; year: string; month: string; amount: string; twoMonths: boolean }
export type BillFieldErrors = Partial<Record<'amount' | 'month', string>>

export const BILLS_TITLE = '수도·가스·전기 요금'
export const BILLS_INTRO = '고지서나 앱에서 본 금액과 청구 월만 적으면 돼요.'
export const BILLS_SEASON_NOTE = '전기·가스는 계절마다 크게 달라서, 작년 같은 달 기록이 있으면 그 달과 비교해요.'
export const BILLS_FULL = '기록이 너무 많아 더 적을 수 없어요. 백업한 뒤 오래된 기록을 지워 주세요.'
export const BILL_DELETE_CONFIRM = '이 기록을 지울까요? 비교에서도 빠져요.'
export const BILL_AMOUNT_NOT_NUMBER = '금액을 숫자로 입력해 주세요'
export const BILL_AMOUNT_RANGE = '금액은 1원~1,000만 원 사이여야 해요'
export const BILL_MONTH_FUTURE = '청구 월은 이번 달이거나 그 전이어야 해요'
export const BILLS_STORAGE_LABEL = '공과금 저장 상태'
export const BILLS_UNAVAILABLE = '이 브라우저에서는 공과금 기록을 저장할 수 없어요. 새로고침하면 사라져요.'
export const BILLS_SAVE_FAILED = '공과금 기록을 저장하지 못했어요. 브라우저 저장 공간이나 설정을 확인한 뒤 다시 저장해 주세요.'
export const BILLS_REPLACED = '다른 탭에서 저장한 공과금 기록을 불러왔어요. 이 탭에서 저장하지 않은 변경은 반영되지 않았어요.'
export const BILLS_CORRUPT = '저장된 공과금 기록을 읽을 수 없어요. 초기화하기 전까지는 새로 적은 기록이 저장되지 않아요.'
export const BILLS_RESET_LABEL = '공과금 기록 초기화'
export const BILLS_RESET_NOTE = '초기화하면 읽을 수 없는 공과금 기록은 사라지고, 지금 화면의 기록만 저장돼요.'

export function billYearOptions(today: Date): number[] {
  return Array.from({ length: 6 }, (_, i) => today.getFullYear() - i)
}

export function validateBillInput(raw: BillRawInput, today: Date): { value?: BillValue; errors: BillFieldErrors } {
  const errors: BillFieldErrors = {}
  const amount = parseInteger(raw.amount)
  if (amount === null) errors.amount = BILL_AMOUNT_NOT_NUMBER
  else if (!isIntBetween(amount, 1, BILL_AMOUNT_MAX)) errors.amount = BILL_AMOUNT_RANGE
  const month = `${raw.year}-${raw.month.padStart(2, '0')}`
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  if (!isBillMonth(month) || !billYearOptions(today).includes(Number(raw.year)) || month > current) errors.month = BILL_MONTH_FUTURE
  if (Object.keys(errors).length || amount === null) return { errors }
  return { value: { kind: raw.kind, month, amountKrw: amount, ...(raw.twoMonths ? { months: 2 } : {}) }, errors }
}

export function monthValue(b: Pick<Bill, 'amountKrw' | 'months'>): number {
  return b.months === 2 ? Math.round(b.amountKrw / 2) : b.amountKrw
}

const monthNumber = (month: string) => Number(month.slice(5, 7))
const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + monthNumber(month)

export function billCompareLine(items: readonly Bill[], kind: BillKind): string | null {
  const ofKind = items.filter((item) => item.kind === kind).sort((a, b) => b.month.localeCompare(a.month))
  const latest = ofKind[0]
  if (!latest) return null
  const two = latest.months === 2
  const prefix = `${monthNumber(latest.month)}월 ${BILL_KIND_LABEL[kind]}${two ? '(두 달 치)' : ''} ${formatWon(latest.amountKrw)}${two ? ` · 한 달에 약 ${formatWon(monthValue(latest))}` : ''}`
  const priorYear = ofKind.find((item) => monthIndex(latest.month) - monthIndex(item.month) === 12)
  const recent = ofKind.filter((item) => { const gap = monthIndex(latest.month) - monthIndex(item.month); return gap >= 1 && gap <= 6 }).slice(0, 3)
  const reference = priorYear ? [priorYear] : recent
  if (reference.length === 0) return prefix
  const baseline = Math.round(reference.reduce((sum, item) => sum + monthValue(item), 0) / reference.length)
  const delta = monthValue(latest) - baseline
  const frame = priorYear
    ? `작년 ${monthNumber(latest.month)}월`
    : reference.length === 1
      ? `지난번(${monthNumber(reference[0].month)}월${two ? '' : `, ${formatWon(baseline)}`})`
      : `최근 ${reference.length}번 평균(${two ? `한 달에 약 ${formatWon(baseline)}` : formatWon(baseline)})`
  if (delta === 0) return `${prefix} · ${frame}${two ? '과 한 달 값이 같아요' : '과 같아요'}`
  return `${prefix} · ${frame}보다 ${two ? '한 달에 약 ' : ''}${formatWon(Math.abs(delta))} ${delta > 0 ? '많아요' : '적어요'}`
}

export function billCompareLines(items: readonly Bill[]): string[] {
  return BILL_KINDS.flatMap((kind) => billCompareLine(items, kind) ?? [])
}

export function billLogLine(b: Bill): string {
  return `${b.month} · ${BILL_KIND_LABEL[b.kind]} · ${formatWon(b.amountKrw)}${b.months === 2 ? ' · 두 달 치' : ''}`
}

export function billDeleteName(b: Bill): string {
  return `${b.month} ${BILL_KIND_LABEL[b.kind]} ${formatWon(b.amountKrw)} 기록 지우기`
}

export function sortBillsForLog(items: readonly Bill[]): Bill[] {
  return [...items].sort((a, b) => BILL_KINDS.indexOf(a.kind) - BILL_KINDS.indexOf(b.kind) || b.month.localeCompare(a.month))
}

export function sameMonthConfirm(existing: Bill): string {
  return `${Number(existing.month.slice(0, 4))}년 ${monthNumber(existing.month)}월 ${BILL_KIND_LABEL[existing.kind]} 요금이 이미 있어요(${formatWon(existing.amountKrw)}). 새 금액으로 바꿀까요?`
}

export function billSavedMessage(value: BillValue): string {
  return `${Number(value.month.slice(0, 4))}년 ${monthNumber(value.month)}월 ${BILL_KIND_LABEL[value.kind]} 요금 ${formatWon(value.amountKrw)}을 적었어요.` // copy-check: ignore josa formatWon은 늘 원으로 끝난다
}

export function billReplacedMessage(value: BillValue): string {
  return `${Number(value.month.slice(0, 4))}년 ${monthNumber(value.month)}월 ${BILL_KIND_LABEL[value.kind]} 요금을 ${formatWon(value.amountKrw)}으로 바꿨어요.` // copy-check: ignore josa formatWon은 늘 원으로 끝난다
}
