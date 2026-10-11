import type { WishItem } from './wishlist'

// PRD F06 로컬 저장: 현재 브라우저의 localStorage에만 저장한다.
// 손상된 데이터는 조용히 덮어쓰지 않고, 저장 실패는 성공으로 알리지 않는다. (AC13)

export type WishStore = { schemaVersion: 1; items: WishItem[] }

export const STORAGE_KEY = 'buyornot.wishlist.v1'
export const EMPTY_STORE: WishStore = { schemaVersion: 1, items: [] }

export type LoadResult = { ok: true; store: WishStore } | { ok: false; reason: 'corrupt' | 'unavailable' }
export type SaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota' }

const STATUSES = new Set(['considering', 'purchased', 'skipped'])

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isWishItem(v: unknown): v is WishItem {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    isString(o.id) &&
    isString(o.name) &&
    typeof o.priceKrw === 'number' &&
    isString(o.reason) &&
    (o.url === null || isString(o.url)) &&
    isString(o.createdAt) &&
    isString(o.updatedAt) &&
    isString(o.reviewAt) &&
    isString(o.status) &&
    STATUSES.has(o.status) &&
    (o.decidedAt === null || isString(o.decidedAt))
  )
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
  return { ok: true, store: { schemaVersion: 1, items: o.items } }
}

export function loadStore(storage: Storage | null): LoadResult {
  if (!storage) return { ok: false, reason: 'unavailable' }
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
  return parseStore(raw)
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
