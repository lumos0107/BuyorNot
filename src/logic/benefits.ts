import { calendarDaysBetween, parseDay } from './dates'
import { isDay, isIntBetween, isRecord, isString } from './guards'
import { formatWon, parseInteger } from './number'
import { toDayIso } from './subscriptions'

export type ProgramId = 'rent' | 'energy' | 'transport'
export type ProgramStatus = 'checked' | 'applied' | 'receiving' | 'not-applicable'
export type ProgramCheck = { id: ProgramId; checkedOn: string; status: ProgramStatus; receivedKrw?: number }
export type CardProgress = { id: string; name: string; month: string; targetKrw: number; spentKrw: number; benefitKrw?: number }
export type Expiry = { id: string; name: string; expiresOn: string; amountKrw?: number }
export type Settlement = { id: string; nickname: string; amountKrw: number; day: string; direction: 'receive' | 'pay'; settledOn?: string }
export type BenefitsStore = { schemaVersion: 1; programs: ProgramCheck[]; cards: CardProgress[]; expiries: Expiry[]; settlements: Settlement[] }
export type BenefitsLoadResult = { ok: true; store: BenefitsStore } | { ok: false; reason: 'corrupt' | 'unavailable' }

export const BENEFITS_KEY = 'buyornot.benefits.v1'
export const EMPTY_BENEFITS: BenefitsStore = { schemaVersion: 1, programs: [], cards: [], expiries: [], settlements: [] }
export const PROGRAM_IDS: readonly ProgramId[] = ['rent', 'energy', 'transport']
export const PROGRAM_STATUSES: readonly ProgramStatus[] = ['checked', 'applied', 'receiving', 'not-applicable']
export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = { checked: '확인함', applied: '신청함', receiving: '받는 중', 'not-applicable': '해당 없음' }
export const PROGRAMS: readonly { id: ProgramId; name: string; description: string; url: string }[] = [
  { id: 'rent', name: '청년 월세 지원', description: '주거비 지원 안내', url: 'https://www.bokjiro.go.kr/' },
  { id: 'energy', name: '에너지바우처', description: '냉난방비 지원 안내', url: 'https://www.energyv.or.kr/info/support_info.do' },
  { id: 'transport', name: '교통비 환급', description: '모두의카드·K-패스 대중교통 환급 안내', url: 'https://korea-pass.kr/' },
]
export const PROGRAM_LIST_CHECKED_ON = '2026-11-02'
export const CARD_MAX = 20
export const EXPIRY_MAX = 50
export const SETTLEMENT_MAX = 50
const MAX_KRW = 1_000_000_000

const name = (v: unknown, max: number) => isString(v) && v.trim().length >= 1 && v.length <= max
const id = (v: unknown) => isString(v) && v.length > 0 && v.length <= 100
const month = (v: unknown) => isString(v) && /^20\d{2}-(0[1-9]|1[0-2])$/.test(v)
const uniqueIds = <T extends { id: string }>(rows: readonly T[]) => new Set(rows.map((row) => row.id)).size === rows.length
const keysOnly = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).every((key) => keys.includes(key))

function isProgram(v: unknown): v is ProgramCheck {
  if (!isRecord(v) || !keysOnly(v, ['id', 'checkedOn', 'status', 'receivedKrw'])) return false
  if (!PROGRAM_IDS.includes(v.id as ProgramId) || !isDay(v.checkedOn) || !PROGRAM_STATUSES.includes(v.status as ProgramStatus)) return false
  if (v.receivedKrw !== undefined && (v.status !== 'receiving' || !isIntBetween(v.receivedKrw, 1, MAX_KRW))) return false
  return true
}

function isCard(v: unknown): v is CardProgress {
  return isRecord(v) && keysOnly(v, ['id', 'name', 'month', 'targetKrw', 'spentKrw', 'benefitKrw']) &&
    id(v.id) && name(v.name, 40) && month(v.month) && isIntBetween(v.targetKrw, 0, MAX_KRW) &&
    isIntBetween(v.spentKrw, 0, MAX_KRW) && (v.benefitKrw === undefined || isIntBetween(v.benefitKrw, 0, MAX_KRW))
}

function isExpiry(v: unknown): v is Expiry {
  return isRecord(v) && keysOnly(v, ['id', 'name', 'expiresOn', 'amountKrw']) && id(v.id) && name(v.name, 40) &&
    isDay(v.expiresOn) && (v.amountKrw === undefined || isIntBetween(v.amountKrw, 0, MAX_KRW))
}

function isSettlement(v: unknown): v is Settlement {
  return isRecord(v) && keysOnly(v, ['id', 'nickname', 'amountKrw', 'day', 'direction', 'settledOn']) &&
    id(v.id) && name(v.nickname, 20) && isIntBetween(v.amountKrw, 1, MAX_KRW) && isDay(v.day) &&
    (v.direction === 'receive' || v.direction === 'pay') &&
    (v.settledOn === undefined || (isDay(v.settledOn) && v.settledOn >= v.day))
}

export function isBenefitsStore(v: unknown): v is BenefitsStore {
  if (!isRecord(v) || !keysOnly(v, ['schemaVersion', 'programs', 'cards', 'expiries', 'settlements']) || v.schemaVersion !== 1) return false
  if (!Array.isArray(v.programs) || v.programs.length > PROGRAM_IDS.length || !v.programs.every(isProgram) || !uniqueIds(v.programs)) return false
  if (!Array.isArray(v.cards) || v.cards.length > CARD_MAX || !v.cards.every(isCard) || !uniqueIds(v.cards)) return false
  if (!Array.isArray(v.expiries) || v.expiries.length > EXPIRY_MAX || !v.expiries.every(isExpiry) || !uniqueIds(v.expiries)) return false
  return Array.isArray(v.settlements) && v.settlements.length <= SETTLEMENT_MAX && v.settlements.every(isSettlement) && uniqueIds(v.settlements)
}

export function parseBenefits(raw: string | null): BenefitsLoadResult {
  if (raw === null) return { ok: true, store: EMPTY_BENEFITS }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isBenefitsStore(parsed) ? { ok: true, store: parsed } : { ok: false, reason: 'corrupt' }
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
}

export function validateProgramInput(programId: ProgramId, checkedOn: string, status: ProgramStatus, amount: string, today: Date): ProgramCheck | null {
  if (!PROGRAM_IDS.includes(programId) || !isDay(checkedOn) || checkedOn > toDayIso(today) || !PROGRAM_STATUSES.includes(status)) return null
  if (status !== 'receiving') return amount.trim() === '' ? { id: programId, checkedOn, status } : null
  if (amount.trim() === '') return { id: programId, checkedOn, status }
  const receivedKrw = parseInteger(amount)
  return isIntBetween(receivedKrw, 1, MAX_KRW) ? { id: programId, checkedOn, status, receivedKrw } : null
}

export function programIncome(rows: readonly ProgramCheck[]): number {
  return rows.reduce((total, row) => total + (row.status === 'receiving' ? row.receivedKrw ?? 0 : 0), 0)
}

export function programListStale(today: Date): boolean {
  const checked = parseDay(PROGRAM_LIST_CHECKED_ON)
  return checked !== null && calendarDaysBetween(checked, today) > 180
}

export type CardRawInput = { name: string; month: string; target: string; spent: string; benefit: string }

export function validateCardInput(raw: CardRawInput, today: Date): Omit<CardProgress, 'id'> | null {
  const targetKrw = parseInteger(raw.target)
  const spentKrw = parseInteger(raw.spent)
  const benefitKrw = raw.benefit.trim() === '' ? undefined : parseInteger(raw.benefit)
  if (!name(raw.name, 40) || !month(raw.month) || raw.month > toDayIso(today).slice(0, 7)) return null
  if (!isIntBetween(targetKrw, 0, MAX_KRW) || !isIntBetween(spentKrw, 0, MAX_KRW)) return null
  if (benefitKrw !== undefined && !isIntBetween(benefitKrw, 0, MAX_KRW)) return null
  return { name: raw.name.trim(), month: raw.month, targetKrw, spentKrw, ...(benefitKrw === undefined ? {} : { benefitKrw }) }
}

export function cardGapLine(card: CardProgress): string {
  const gap = card.targetKrw - card.spentKrw
  return gap > 0 ? `실적까지 ${formatWon(gap)}` : '적은 기준을 채웠어요'
}

export function cardMonthLine(card: CardProgress, today: Date): string {
  return card.month === toDayIso(today).slice(0, 7) ? '' : `${card.month} 기록`
}

export function validateExpiryInput(rawName: string, rawAmount: string, expiresOn: string): Omit<Expiry, 'id'> | null {
  const amountKrw = rawAmount.trim() === '' ? undefined : parseInteger(rawAmount)
  if (!name(rawName, 40) || !isDay(expiresOn) || (amountKrw !== undefined && !isIntBetween(amountKrw, 0, MAX_KRW))) return null
  return { name: rawName.trim(), expiresOn, ...(amountKrw === undefined ? {} : { amountKrw }) }
}

export function sortExpiries(rows: readonly Expiry[]): Expiry[] {
  return [...rows].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.name.localeCompare(b.name, 'ko'))
}

export function expiryLine(row: Expiry, today: Date): string {
  const expiry = parseDay(row.expiresOn)
  if (!expiry) return ''
  const days = calendarDaysBetween(today, expiry)
  return days < 0 ? `${row.name} · 만료일이 지났어요 (${row.expiresOn})` : `${row.name} · 만료일 ${row.expiresOn} · D-${days}`
}

export function validateSettlementInput(nickname: string, rawAmount: string, day: string, direction: Settlement['direction'], today: Date): Omit<Settlement, 'id' | 'settledOn'> | null {
  const amountKrw = parseInteger(rawAmount)
  if (!name(nickname, 20) || !isIntBetween(amountKrw, 1, MAX_KRW) || !isDay(day) || day > toDayIso(today)) return null
  if (direction !== 'receive' && direction !== 'pay') return null
  return { nickname: nickname.trim(), amountKrw, day, direction }
}

export function settlementTotals(rows: readonly Settlement[]): { receiveKrw: number; payKrw: number } {
  return rows.reduce((total, row) => {
    if (row.settledOn === undefined) {
      if (row.direction === 'receive') total.receiveKrw += row.amountKrw
      else total.payKrw += row.amountKrw
    }
    return total
  }, { receiveKrw: 0, payKrw: 0 })
}
