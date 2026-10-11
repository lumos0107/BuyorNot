import { MAX_WON } from './number'
import { NAME_MAX, NOTE_MAX, REASON_MAX, type WishItem } from './wishlist'

// PRD F06 로컬 저장: 현재 브라우저의 localStorage에만 저장한다.
// 손상된 데이터는 조용히 덮어쓰지 않고, 저장 실패는 성공으로 알리지 않는다. (AC13)
// 복원할 때는 타입뿐 아니라 값의 의미(가격 범위, 날짜, 상태와 결정 시각, 링크, id 중복)도 검사한다.

export type WishStore = { schemaVersion: 1; items: WishItem[] }

export const STORAGE_KEY = 'buyornot.wishlist.v1'
export const EMPTY_STORE: WishStore = { schemaVersion: 1, items: [] }

export type LoadResult = { ok: true; store: WishStore } | { ok: false; reason: 'corrupt' | 'unavailable' }
export type SaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota' }

const STATUSES = new Set(['considering', 'purchased', 'skipped'])

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isTimestamp(v: unknown): v is string {
  return isString(v) && Number.isFinite(Date.parse(v))
}

function isHttpUrl(v: string): boolean {
  try {
    const url = new URL(v)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isWishItem(v: unknown): v is WishItem {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (!isString(o.id) || o.id.length === 0) return false
  if (!isString(o.name) || o.name.length === 0 || o.name.length > NAME_MAX) return false
  if (!Number.isInteger(o.priceKrw) || (o.priceKrw as number) < 0 || (o.priceKrw as number) > MAX_WON) return false
  if (!isString(o.reason) || o.reason.length === 0 || o.reason.length > REASON_MAX) return false
  if (o.url !== null && !(isString(o.url) && isHttpUrl(o.url))) return false
  if (!isTimestamp(o.createdAt) || !isTimestamp(o.updatedAt) || !isTimestamp(o.reviewAt)) return false
  // 종료 시각은 등록 시각 뒤여야 한다. 수정·결정 시각은 기기 시각 변경으로 앞설 수 있어 검사하지 않는다
  if (Date.parse(o.reviewAt) < Date.parse(o.createdAt)) return false
  if (!isString(o.status) || !STATUSES.has(o.status)) return false
  if (o.status === 'considering' ? o.decidedAt !== null : !isTimestamp(o.decidedAt)) return false
  return hasValidOptionalFields(o)
}

const SATISFACTIONS = new Set(['good', 'meh', 'regret'])
const YES_NO = new Set(['yes', 'no'])
const YES_NO_UNSURE = new Set(['yes', 'no', 'unsure'])

function isNote(v: unknown): boolean {
  return v === undefined || (isString(v) && v.length <= NOTE_MAX)
}

// 2차 선택 필드(PRD #10). 없으면 1차 기록이고, 있으면 규칙에 맞아야 한다
function hasValidOptionalFields(o: Record<string, unknown>): boolean {
  if (o.extensions !== undefined && !(Number.isInteger(o.extensions) && (o.extensions as number) >= 0)) return false
  if (!isNote(o.decisionNote) || !isNote(o.reviewNote)) return false
  if (o.satisfaction !== undefined && !(isString(o.satisfaction) && SATISFACTIONS.has(o.satisfaction))) return false
  // 회고는 구매함 기록에만 있다 (F12)
  if (o.status !== 'purchased' && (o.satisfaction !== undefined || o.reviewNote !== undefined)) return false
  // 회고 메모는 회고 답과 함께만 있다
  if (o.reviewNote !== undefined && o.satisfaction === undefined) return false
  if (o.answers !== undefined) {
    if (typeof o.answers !== 'object' || o.answers === null || Array.isArray(o.answers)) return false
    const a = o.answers as Record<string, unknown>
    if (a.haveOne !== undefined && !(isString(a.haveOne) && YES_NO.has(a.haveOne))) return false
    if (!isNote(a.problem)) return false
    if (a.useInMonth !== undefined && !(isString(a.useInMonth) && YES_NO_UNSURE.has(a.useInMonth))) return false
  }
  return true
}

export function parseStore(raw: string | null): LoadResult {
  if (raw === null) return { ok: true, store: { schemaVersion: 1, items: [] } }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'corrupt' }
  const o = parsed as Record<string, unknown>
  if (o.schemaVersion !== 1 || !Array.isArray(o.items) || !o.items.every(isWishItem)) {
    return { ok: false, reason: 'corrupt' }
  }
  const items = o.items as WishItem[]
  if (new Set(items.map((item) => item.id)).size !== items.length) return { ok: false, reason: 'corrupt' }
  return { ok: true, store: { schemaVersion: 1, items } }
}

export function loadStore(storage: Storage | null): LoadResult {
  return readStore(storage).loaded
}

/** 저장된 원문과 복원 결과를 함께 돌려준다. 원문은 다른 탭이 먼저 저장했는지 비교하는 데 쓴다 */
export function readStore(storage: Storage | null): { raw: string | null; loaded: LoadResult } {
  if (!storage) return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  }
  return { raw, loaded: parseStore(raw) }
}

export function saveStore(storage: Storage | null, store: WishStore): SaveResult {
  if (!storage) return { ok: false, reason: 'unavailable' }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store))
    return { ok: true }
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    return { ok: false, reason: name === 'QuotaExceededError' ? 'quota' : 'unavailable' }
  }
}

// 사생활 보호 모드 등에서는 localStorage에 접근만 해도 예외가 날 수 있다
export function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
