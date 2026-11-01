import { isDay, isIntBetween, isRecord, isString } from './guards'

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
