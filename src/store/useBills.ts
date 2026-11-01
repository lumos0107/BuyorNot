import { useEffect, useRef, useState } from 'react'
import { getLocalStorage } from '../logic/storage'
import { BILLS_KEY, EMPTY_BILLS, addBill as addBillTo, parseBills, removeBill as removeBillFrom, updateBill as updateBillIn, type Bill, type BillsLoadResult, type BillsStore, type BillValue } from '../logic/bills'
import type { StorageStatus } from './useWishlist'

// 다른 저장 훅과 같은 손상·여러 탭 규칙. 이 키의 원문만 비교해 덮어쓰기를 막는다.
function read(storage: Storage | null): { raw: string | null; loaded: BillsLoadResult } {
  if (!storage) return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  try {
    const raw = storage.getItem(BILLS_KEY)
    return { raw, loaded: parseBills(raw) }
  } catch {
    return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  }
}

export function useBills(storage: Storage | null = getLocalStorage()) {
  const [initial] = useState(() => read(storage))
  const lastRaw = useRef<string | null>(initial.raw)
  const unsaved = useRef(false)
  const [store, setStore] = useState<BillsStore>(() => initial.loaded.ok ? initial.loaded.store : EMPTY_BILLS)
  const [status, setStatus] = useState<StorageStatus>(() => initial.loaded.ok ? { kind: 'ok' } : { kind: initial.loaded.reason })

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== BILLS_KEY) return
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

  const write = (next: BillsStore): StorageStatus => {
    if (!storage) return { kind: 'unavailable' }
    const raw = JSON.stringify(next)
    try {
      storage.setItem(BILLS_KEY, raw)
      lastRaw.current = raw
      unsaved.current = false
      return { kind: 'ok' }
    } catch (error) {
      unsaved.current = true
      const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
      return { kind: 'save-failed', reason: quota ? 'quota' : 'unavailable' }
    }
  }

  const commit = (next: BillsStore): boolean => {
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
    add: (bill: Bill): 'ok' | 'full' | 'replaced' => {
      const next = addBillTo(store, bill)
      return next === 'full' ? 'full' : commit(next) ? 'ok' : 'replaced'
    },
    update: (id: string, value: BillValue): boolean => commit(updateBillIn(store, id, value, new Date())),
    remove: (id: string): boolean => commit(removeBillFrom(store, id)),
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
    replaceAll: (next: BillsStore): StorageStatus => {
      const result = write(next)
      setStore(next)
      setStatus(result)
      return result
    },
  }
}
