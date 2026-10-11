import { useEffect, useState } from 'react'
import { STORAGE_KEY, getLocalStorage, loadStore, saveStore, type LoadResult } from '../logic/storage'
import { nextRetroDelay, review } from '../logic/summary'
import {
  createItem,
  decideItem,
  demoItems,
  extendItem,
  newId,
  nextReviewDelay,
  updateItem,
  type NewWishInput,
  type Satisfaction,
  type WishItem,
  type WishPatch,
} from '../logic/wishlist'

// PRD F06: 숙려 기록은 현재 브라우저의 localStorage에 저장하고, 다시 열면 복원한다.
// 저장 실패는 성공으로 보이지 않게 하고, 손상된 데이터는 사용자가 확인한 뒤에만 초기화한다. (AC13)
export type StorageStatus =
  | { kind: 'ok' }
  /** localStorage를 쓸 수 없는 환경: 이번 방문 동안만 유지된다 */
  | { kind: 'unavailable' }
  /** 저장된 데이터를 읽을 수 없음: 초기화 전까지 덮어쓰지 않는다 */
  | { kind: 'corrupt' }
  | { kind: 'save-failed'; reason: 'quota' | 'unavailable' }

const REFRESH_MS = 30 * 1000

function initialStatus(loaded: LoadResult): StorageStatus {
  return loaded.ok ? { kind: 'ok' } : { kind: loaded.reason }
}

export function useWishlist(storage: Storage | null = getLocalStorage()) {
  const [loaded] = useState<LoadResult>(() => loadStore(storage))
  const [items, setItems] = useState<WishItem[]>(() => (loaded.ok ? loaded.store.items : []))
  const [status, setStatus] = useState<StorageStatus>(() => initialStatus(loaded))
  const [now, setNow] = useState(() => new Date())

  // 화면을 보고 있는 동안 주기적으로, 그리고 다시 돌아왔을 때 남은 시간을 다시 계산한다. (F02)
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // 다른 탭이 저장하면 이 탭도 그 내용으로 맞춘다. 서로의 기록을 덮어쓰지 않게 하기 위해서다
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return
      const loaded = loadStore(storage)
      if (!loaded.ok) return
      setItems(loaded.store.items)
      setStatus({ kind: 'ok' })
      setNow(new Date())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storage])

  // 가장 가까운 숙려 종료·회고 시점에 맞춰 한 번 더 갱신한다. 30초 주기만으로는 정각 뒤 최대 30초까지 늦기 때문이다
  useEffect(() => {
    const now = new Date()
    const delays = [nextReviewDelay(items, now), nextRetroDelay(items, now)].filter((d): d is number => d !== null)
    if (delays.length === 0) return
    const delay = Math.min(...delays)
    const timer = window.setTimeout(() => setNow(new Date()), Math.min(delay + 50, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [items])

  const persist = (next: WishItem[], current: StorageStatus): StorageStatus => {
    // 손상된 데이터 위에는 쓰지 않고, 저장소가 없으면 시도하지 않는다
    if (current.kind === 'corrupt' || current.kind === 'unavailable') return current
    const result = saveStore(storage, { schemaVersion: 1, items: next })
    return result.ok ? { kind: 'ok' } : { kind: 'save-failed', reason: result.reason }
  }

  const commit = (next: WishItem[]) => {
    setItems(next)
    setStatus(persist(next, status))
    setNow(new Date())
  }

  return {
    items,
    now,
    status,
    add: (input: NewWishInput) => commit([createItem(input, new Date(), newId()), ...items]),
    edit: (id: string, patch: WishPatch) =>
      commit(items.map((item) => (item.id === id ? updateItem(item, patch, new Date()) : item))),
    decide: (id: string, decision: 'purchased' | 'skipped', note?: string) =>
      commit(items.map((item) => (item.id === id ? decideItem(item, decision, new Date(), note) : item))),
    review: (id: string, satisfaction: Satisfaction, note?: string) =>
      commit(items.map((item) => (item.id === id ? review(item, satisfaction, note, new Date()) : item))),
    extend: (id: string, days: number) =>
      commit(items.map((item) => (item.id === id ? extendItem(item, days, new Date()) : item))),
    remove: (id: string) => commit(items.filter((item) => item.id !== id)),
    addDemo: () => commit([...demoItems(new Date(), newId), ...items]),
    /** 저장 실패 뒤 다시 시도 */
    retrySave: () => setStatus(persist(items, { kind: 'ok' })),
    /** 손상된 데이터를 사용자가 확인한 뒤 현재 목록으로 덮어쓴다 */
    resetStorage: () => setStatus(persist(items, { kind: 'ok' })),
  }
}

export type WishlistApi = ReturnType<typeof useWishlist>
