import { useState } from 'react'
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
function load(storage: Storage | null): SubsLoadResult {
  if (!storage) return { ok: false, reason: 'unavailable' }
  try {
    return parseSubscriptions(storage.getItem(SUBS_KEY))
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

function save(storage: Storage | null, items: Subscription[]): StorageStatus {
  if (!storage) return { kind: 'unavailable' }
  try {
    storage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items }))
    return { kind: 'ok' }
  } catch (error) {
    const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
    return { kind: 'save-failed', reason: quota ? 'quota' : 'unavailable' }
  }
}

export function useSubscriptions(storage: Storage | null = getLocalStorage()) {
  const [loaded] = useState(() => load(storage))
  const [items, setItems] = useState<Subscription[]>(() => (loaded.ok ? loaded.store.items : []))
  const [status, setStatus] = useState<StorageStatus>(() => (loaded.ok ? { kind: 'ok' } : { kind: loaded.reason }))

  const persist = (next: Subscription[], current: StorageStatus): StorageStatus =>
    current.kind === 'corrupt' || current.kind === 'unavailable' ? current : save(storage, next)

  const commit = (next: Subscription[]) => {
    setItems(next)
    setStatus(persist(next, status))
  }

  return {
    items,
    status,
    add: (input: SubscriptionInput) => commit([...items, createSubscription(input, new Date(), newId())]),
    edit: (id: string, input: SubscriptionInput) =>
      commit(items.map((sub) => (sub.id === id ? updateSubscription(sub, input, new Date()) : sub))),
    remove: (id: string) => commit(items.filter((sub) => sub.id !== id)),
    addDemo: () => commit([...demoSubscriptions(new Date(), newId), ...items]),
    retrySave: () => setStatus(persist(items, { kind: 'ok' })),
    resetStorage: () => setStatus(persist(items, { kind: 'ok' })),
  }
}
