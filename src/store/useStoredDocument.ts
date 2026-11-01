import { useEffect, useRef, useState } from 'react'
import { getLocalStorage } from '../logic/storage'
import type { StorageStatus } from './useWishlist'

type Load<T> = { ok: true; store: T } | { ok: false; reason: 'corrupt' | 'unavailable' }

function read<T>(storage: Storage | null, key: string, parse: (raw: string | null) => Load<T>): { raw: string | null; loaded: Load<T> } {
  if (!storage) return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  try {
    const raw = storage.getItem(key)
    return { raw, loaded: parse(raw) }
  } catch { return { raw: null, loaded: { ok: false, reason: 'unavailable' } } }
}

/** 새 저장 키의 손상·저장 실패·여러 탭 충돌 규칙. 기존 저장 훅은 건드리지 않는다. */
export function useStoredDocument<T>(key: string, empty: T, parse: (raw: string | null) => Load<T>, storage: Storage | null = getLocalStorage()) {
  const [initial] = useState(() => read(storage, key, parse))
  const lastRaw = useRef<string | null>(initial.raw)
  const unsaved = useRef(false)
  const [store, setStore] = useState<T>(() => initial.loaded.ok ? initial.loaded.store : empty)
  const [status, setStatus] = useState<StorageStatus>(() => initial.loaded.ok ? { kind: 'ok' } : { kind: initial.loaded.reason })

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return
      const next = read(storage, key, parse)
      if (!next.loaded.ok && next.loaded.reason === 'unavailable') return
      lastRaw.current = next.raw
      if (!next.loaded.ok) { setStatus({ kind: 'corrupt' }); return }
      setStore(next.loaded.store)
      const lost = unsaved.current
      unsaved.current = false
      setStatus((prev) => lost || prev.kind === 'replaced' ? { kind: 'replaced' } : { kind: 'ok' })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, parse, storage])

  const write = (next: T): StorageStatus => {
    if (!storage) return { kind: 'unavailable' }
    const raw = JSON.stringify(next)
    try {
      storage.setItem(key, raw)
      lastRaw.current = raw
      unsaved.current = false
      return { kind: 'ok' }
    } catch (error) {
      unsaved.current = true
      const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
      return { kind: 'save-failed', reason: quota ? 'quota' : 'unavailable' }
    }
  }

  const commit = (next: T): boolean => {
    if (status.kind === 'corrupt' || status.kind === 'unavailable') {
      setStore(next)
      unsaved.current = true
      return true
    }
    const current = read(storage, key, parse)
    if ((current.loaded.ok || current.loaded.reason === 'corrupt') && current.raw !== lastRaw.current) {
      lastRaw.current = current.raw
      if (current.loaded.ok) {
        setStore(current.loaded.store)
        setStatus({ kind: 'replaced' })
        unsaved.current = false
        return false
      }
      setStore(next)
      setStatus({ kind: 'corrupt' })
      unsaved.current = true
      return true
    }
    setStore(next)
    setStatus(write(next))
    return true
  }

  return {
    store, status, commit,
    retrySave: () => { commit(store) },
    resetStorage: () => {
      const current = read(storage, key, parse)
      if (current.loaded.ok && current.raw !== lastRaw.current) {
        lastRaw.current = current.raw
        const lost = unsaved.current
        unsaved.current = false
        setStore(current.loaded.store)
        setStatus(lost ? { kind: 'replaced' } : { kind: 'ok' })
        return
      }
      setStatus(write(store))
    },
    dismissNotice: () => setStatus({ kind: 'ok' }),
    replaceAll: (next: T): StorageStatus => {
      const result = write(next)
      setStore(next)
      setStatus(result)
      return result
    },
  }
}
