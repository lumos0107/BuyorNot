import { useEffect, useRef, useState } from 'react'
import { BENEFITS_KEY, EMPTY_BENEFITS, isBenefitsStore, parseBenefits, type BenefitsLoadResult, type BenefitsStore } from '../logic/benefits'
import { getLocalStorage } from '../logic/storage'
import type { StorageStatus } from './useWishlist'

function read(storage: Storage | null): { raw: string | null; loaded: BenefitsLoadResult } {
  if (!storage) return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  try {
    const raw = storage.getItem(BENEFITS_KEY)
    return { raw, loaded: parseBenefits(raw) }
  } catch {
    return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  }
}

export function useBenefits(storage: Storage | null = getLocalStorage()) {
  const [initial] = useState(() => read(storage))
  const lastRaw = useRef<string | null>(initial.raw)
  const unsaved = useRef(false)
  const [store, setStore] = useState<BenefitsStore>(() => initial.loaded.ok ? initial.loaded.store : EMPTY_BENEFITS)
  const [status, setStatus] = useState<StorageStatus>(() => initial.loaded.ok ? { kind: 'ok' } : { kind: initial.loaded.reason })

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== BENEFITS_KEY) return
      const next = read(storage)
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
  }, [storage])

  const write = (next: BenefitsStore): StorageStatus => {
    if (!storage) return { kind: 'unavailable' }
    const raw = JSON.stringify(next)
    try {
      storage.setItem(BENEFITS_KEY, raw)
      lastRaw.current = raw
      unsaved.current = false
      return { kind: 'ok' }
    } catch (error) {
      unsaved.current = true
      const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
      return { kind: 'save-failed', reason: quota ? 'quota' : 'unavailable' }
    }
  }

  const commit = (next: BenefitsStore): boolean => {
    if (!isBenefitsStore(next)) return false
    if (status.kind === 'corrupt' || status.kind === 'unavailable') {
      setStore(next)
      unsaved.current = true
      return true
    }
    const now = read(storage)
    if ((now.loaded.ok || now.loaded.reason === 'corrupt') && now.raw !== lastRaw.current) {
      lastRaw.current = now.raw
      if (now.loaded.ok) {
        setStore(now.loaded.store)
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
    store,
    status,
    change: (change: (current: BenefitsStore) => BenefitsStore): boolean => commit(change(store)),
    retrySave: () => { commit(store) },
    resetStorage: () => {
      const now = read(storage)
      if (now.loaded.ok && now.raw !== lastRaw.current) {
        lastRaw.current = now.raw
        const lost = unsaved.current
        unsaved.current = false
        setStore(now.loaded.store)
        setStatus(lost ? { kind: 'replaced' } : { kind: 'ok' })
        return
      }
      setStatus(write(store))
    },
    dismissNotice: () => setStatus({ kind: 'ok' }),
    replaceAll: (next: BenefitsStore): StorageStatus => {
      const result = write(next)
      setStore(next)
      setStatus(result)
      return result
    },
  }
}
