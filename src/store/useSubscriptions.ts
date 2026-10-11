import { useEffect, useRef, useState } from 'react'
import { getLocalStorage } from '../logic/storage'
import {
  SUBS_KEY,
  createSubscription,
  demoSubscriptions,
  parseSubscriptions,
  updateSubscription,
  type Subscription,
  type SubscriptionInput,
  type SubsLoadResult,
} from '../logic/subscriptions'
import { newId } from '../logic/wishlist'
import type { StorageStatus } from './useWishlist'

// PRD F14 구독 정리함 저장: 숙려 기록과 같은 규칙(손상 시 덮어쓰지 않음, 저장 실패는 알림)을 별도 키에 적용한다
// 저장된 원문과 복원 결과. 원문은 다른 탭이 먼저 저장했는지 비교하는 데 쓴다
function read(storage: Storage | null): { raw: string | null; loaded: SubsLoadResult } {
  if (!storage) return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  try {
    const raw = storage.getItem(SUBS_KEY)
    return { raw, loaded: parseSubscriptions(raw) }
  } catch {
    return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  }
}

export function useSubscriptions(storage: Storage | null = getLocalStorage()) {
  const [initial] = useState(() => read(storage))
  // 이 탭이 마지막으로 읽거나 쓴 저장 원문. 저장 직전의 원문이 이것과 다르면 다른 탭이 먼저 저장한 것이다
  const lastRaw = useRef<string | null>(initial.raw)
  // 화면에만 있고 저장하지 못한 변경이 있는지. 다른 탭 내용을 불러올 때 이것이 사라진다고 알린다
  const unsaved = useRef(false)
  const [items, setItems] = useState<Subscription[]>(() => (initial.loaded.ok ? initial.loaded.store.items : []))
  const [status, setStatus] = useState<StorageStatus>(() => (initial.loaded.ok ? { kind: 'ok' } : { kind: initial.loaded.reason }))

  // 다른 탭이 저장하면 이 탭도 그 내용으로 맞춘다 (숙려 기록과 같은 방식). 서로의 구독을 덮어쓰지 않기 위해서다
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SUBS_KEY) return
      const next = read(storage)
      if (!next.loaded.ok && next.loaded.reason === 'unavailable') return
      lastRaw.current = next.raw
      if (!next.loaded.ok) {
        // 읽을 수 없는 값(예: 다른 버전의 앱이 쓴 값)은 덮어쓰지 않도록 손상으로 표시한다
        setStatus({ kind: 'corrupt' })
        return
      }
      setItems(next.loaded.store.items)
      // 이 탭에서 저장하지 못한 변경(저장 실패, 손상 상태에서 화면에만 반영)이 있었다면 반영되지 않았다고 알린다
      const lost = unsaved.current
      unsaved.current = false
      setStatus((prev) => (lost || prev.kind === 'replaced' ? { kind: 'replaced' } : { kind: 'ok' }))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storage])

  const write = (next: Subscription[]): StorageStatus => {
    if (!storage) return { kind: 'unavailable' }
    const raw = JSON.stringify({ schemaVersion: 1, items: next })
    try {
      storage.setItem(SUBS_KEY, raw)
      lastRaw.current = raw
      unsaved.current = false
      return { kind: 'ok' }
    } catch (error) {
      unsaved.current = true
      const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
      return { kind: 'save-failed', reason: quota ? 'quota' : 'unavailable' }
    }
  }

  // 숙려 기록과 같은 규칙: 손상·저장소 없음이면 화면에만 반영하고,
  // 다른 탭이 먼저 저장했다면 덮어쓰지 않고 그 내용을 불러와 알린다
  const commit = (next: Subscription[]) => {
    if (status.kind === 'corrupt' || status.kind === 'unavailable') {
      setItems(next)
      unsaved.current = true
      return
    }
    const now = read(storage)
    if ((now.loaded.ok || now.loaded.reason === 'corrupt') && now.raw !== lastRaw.current) {
      lastRaw.current = now.raw
      if (now.loaded.ok) {
        setItems(now.loaded.store.items)
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
    status,
    add: (input: SubscriptionInput) => commit([...items, createSubscription(input, new Date(), newId())]),
    edit: (id: string, input: SubscriptionInput) =>
      commit(items.map((sub) => (sub.id === id ? updateSubscription(sub, input, new Date()) : sub))),
    remove: (id: string) => commit(items.filter((sub) => sub.id !== id)),
    addDemo: () => commit([...demoSubscriptions(new Date(), newId), ...items]),
    retrySave: () => commit(items),
    // 직전에 다른 탭이 읽을 수 있는 구독을 저장했다면 덮어쓰지 않고 그 내용을 불러온다
    resetStorage: () => {
      const now = read(storage)
      if (now.loaded.ok && now.raw !== lastRaw.current) {
        lastRaw.current = now.raw
        const lost = unsaved.current
        unsaved.current = false
        setItems(now.loaded.store.items)
        setStatus(lost ? { kind: 'replaced' } : { kind: 'ok' })
        return
      }
      setStatus(write(items))
    },
    dismissNotice: () => setStatus({ kind: 'ok' }),
  }
}
