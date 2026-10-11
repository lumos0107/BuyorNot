import { useEffect, useRef, useState } from 'react'
import { STORAGE_KEY, getLocalStorage, readStore, saveStore, type LoadResult, type WishStore } from '../logic/storage'
import { nextRetroDelay, review } from '../logic/summary'
import {
  createItem,
  decideItem,
  demoItems,
  isExample,
  extendItem,
  newId,
  nextReviewDelay,
  updateItem,
  type NewWishInput,
  type Satisfaction,
  type WishItem,
  type WishPatch,
} from '../logic/wishlist'

// PRD F06: 물건 기록은 현재 브라우저의 localStorage에 저장하고, 다시 열면 복원한다.
// 저장 실패는 성공으로 보이지 않게 하고, 손상된 데이터는 사용자가 확인한 뒤에만 초기화한다. (AC13)
export type StorageStatus =
  | { kind: 'ok' }
  /** localStorage를 쓸 수 없는 환경: 이번 방문 동안만 유지된다 */
  | { kind: 'unavailable' }
  /** 저장된 데이터를 읽을 수 없음: 초기화 전까지 덮어쓰지 않는다 */
  | { kind: 'corrupt' }
  | { kind: 'save-failed'; reason: 'quota' | 'unavailable' }
  /** 다른 탭이 먼저 저장해 그 내용을 불러왔다. 이 탭에서 저장하지 않은 변경은 반영되지 않았다고 알린다 */
  | { kind: 'replaced' }

const REFRESH_MS = 30 * 1000

function initialStatus(loaded: LoadResult): StorageStatus {
  return loaded.ok ? { kind: 'ok' } : { kind: loaded.reason }
}

export function useWishlist(storage: Storage | null = getLocalStorage()) {
  const [initial] = useState(() => readStore(storage))
  // 이 탭이 마지막으로 읽거나 쓴 저장 원문. 저장 직전의 원문이 이것과 다르면 다른 탭이 먼저 저장한 것이다
  const lastRaw = useRef<string | null>(initial.raw)
  // 화면에만 있고 저장하지 못한 변경이 있는지. 다른 탭 내용을 불러올 때 이것이 사라진다고 알린다
  const unsaved = useRef(false)
  const [items, setItems] = useState<WishItem[]>(() => (initial.loaded.ok ? initial.loaded.store.items : []))
  const [status, setStatus] = useState<StorageStatus>(() => initialStatus(initial.loaded))
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
      const read = readStore(storage)
      if (!read.loaded.ok && read.loaded.reason === 'unavailable') return
      lastRaw.current = read.raw
      if (!read.loaded.ok) {
        // 읽을 수 없는 값(예: 다른 버전의 앱이 쓴 값)은 덮어쓰지 않도록 손상으로 표시한다
        setStatus({ kind: 'corrupt' })
        return
      }
      setItems(read.loaded.store.items)
      // 이 탭에서 저장하지 못한 변경(저장 실패, 손상 상태에서 화면에만 반영)이 있었다면 반영되지 않았다고 알린다
      const lost = unsaved.current
      unsaved.current = false
      setStatus((prev) => (lost || prev.kind === 'replaced' ? { kind: 'replaced' } : { kind: 'ok' }))
      setNow(new Date())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storage])

  // 가장 가까운 고민 기간 종료·회고 시점에 맞춰 한 번 더 갱신한다. 30초 주기만으로는 정각 뒤 최대 30초까지 늦기 때문이다
  useEffect(() => {
    const now = new Date()
    const delays = [nextReviewDelay(items, now), nextRetroDelay(items, now)].filter((d): d is number => d !== null)
    if (delays.length === 0) return
    const delay = Math.min(...delays)
    const timer = window.setTimeout(() => setNow(new Date()), Math.min(delay + 50, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [items, now])

  const write = (next: WishItem[]): StorageStatus => {
    const store: WishStore = { schemaVersion: 1, items: next }
    const result = saveStore(storage, store)
    if (!result.ok) {
      unsaved.current = true
      return { kind: 'save-failed', reason: result.reason }
    }
    lastRaw.current = JSON.stringify(store)
    unsaved.current = false
    return { kind: 'ok' }
  }

  // 손상된 데이터 위에는 쓰지 않고, 저장소가 없으면 시도하지 않는다(화면에만 반영).
  // 이 탭이 마지막으로 읽거나 쓴 뒤 다른 탭이 먼저 저장했다면 덮어쓰지 않고 그 내용을 불러와 알린다
  const commit = (next: WishItem[]) => {
    setNow(new Date())
    if (status.kind === 'corrupt' || status.kind === 'unavailable') {
      setItems(next)
      unsaved.current = true
      return
    }
    const read = readStore(storage)
    if ((read.loaded.ok || read.loaded.reason === 'corrupt') && read.raw !== lastRaw.current) {
      lastRaw.current = read.raw
      if (read.loaded.ok) {
        setItems(read.loaded.store.items)
        setStatus({ kind: 'replaced' })
        unsaved.current = false
      } else {
        setItems(next)
        setStatus({ kind: 'corrupt' })
        unsaved.current = true
      }
      return
    }
    setItems(next)
    setStatus(write(next))
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
    /** 예시 물건만 지운다 (결정 기록의 예시 포함) */
    removeExamples: () => commit(items.filter((item) => !isExample(item.name))),
    addDemo: () => commit([...demoItems(new Date(), newId), ...items]),
    /** 저장 실패 뒤 다시 시도 */
    retrySave: () => commit(items),
    /** 손상된 데이터를 사용자가 확인한 뒤 현재 목록으로 덮어쓴다.
     *  직전에 다른 탭이 읽을 수 있는 기록을 저장했다면 덮어쓰지 않고 그 기록을 불러온다 */
    resetStorage: () => {
      const read = readStore(storage)
      if (read.loaded.ok && read.raw !== lastRaw.current) {
        lastRaw.current = read.raw
        const lost = unsaved.current
        unsaved.current = false
        setItems(read.loaded.store.items)
        setStatus(lost ? { kind: 'replaced' } : { kind: 'ok' })
        return
      }
      setStatus(write(items))
    },
    /** 다른 탭 내용을 불러왔다는 알림을 닫는다 */
    dismissNotice: () => setStatus({ kind: 'ok' }),
  }
}

export type WishlistApi = ReturnType<typeof useWishlist>
