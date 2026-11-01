import { useEffect, useRef, useState } from 'react'
import { getLocalStorage } from '../logic/storage'
import {
  EMPTY_SAVINGS,
  SAVINGS_KEY,
  addTransfer as addTransferTo,
  clearGoal as clearGoalOf,
  parseSavings,
  removeTransfer as removeTransferFrom,
  setGoal as setGoalOf,
  type Goal,
  type SavingsLoadResult,
  type SavingsStore,
  type Transfer,
} from '../logic/savings'
import type { StorageStatus } from './useWishlist'

// PRD F48 모으기 저장: 고정비 저장 훅(useSubscriptions)과 같은 규칙(손상 시 덮어쓰지 않음, 저장 실패는 알림,
// 다른 탭이 먼저 저장했으면 불러옴)을 별도 키에 적용한다. 기존 훅을 열지 않으려고 공통 훅으로 뽑지 않았다.
// 저장된 원문과 복원 결과. 원문은 다른 탭이 먼저 저장했는지 비교하는 데 쓴다
function read(storage: Storage | null): { raw: string | null; loaded: SavingsLoadResult } {
  if (!storage) return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  try {
    const raw = storage.getItem(SAVINGS_KEY)
    return { raw, loaded: parseSavings(raw) }
  } catch {
    return { raw: null, loaded: { ok: false, reason: 'unavailable' } }
  }
}

export function useSavings(storage: Storage | null = getLocalStorage()) {
  const [initial] = useState(() => read(storage))
  // 이 탭이 마지막으로 읽거나 쓴 저장 원문. 저장 직전의 원문이 이것과 다르면 다른 탭이 먼저 저장한 것이다
  const lastRaw = useRef<string | null>(initial.raw)
  // 화면에만 있고 저장하지 못한 변경이 있는지. 다른 탭 내용을 불러올 때 이것이 사라진다고 알린다
  const unsaved = useRef(false)
  const [store, setStore] = useState<SavingsStore>(() => (initial.loaded.ok ? initial.loaded.store : EMPTY_SAVINGS))
  const [status, setStatus] = useState<StorageStatus>(() => (initial.loaded.ok ? { kind: 'ok' } : { kind: initial.loaded.reason }))

  // 다른 탭이 저장하면 이 탭도 그 내용으로 맞춘다. 서로의 기록을 덮어쓰지 않기 위해서다
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SAVINGS_KEY) return
      const next = read(storage)
      if (!next.loaded.ok && next.loaded.reason === 'unavailable') return
      lastRaw.current = next.raw
      if (!next.loaded.ok) {
        // 읽을 수 없는 값(예: 다른 버전의 앱이 쓴 값)은 덮어쓰지 않도록 손상으로 표시한다
        setStatus({ kind: 'corrupt' })
        return
      }
      setStore(next.loaded.store)
      // 이 탭에서 저장하지 못한 변경(저장 실패, 손상 상태에서 화면에만 반영)이 있었다면 반영되지 않았다고 알린다
      const lost = unsaved.current
      unsaved.current = false
      setStatus((prev) => (lost || prev.kind === 'replaced' ? { kind: 'replaced' } : { kind: 'ok' }))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storage])

  const write = (next: SavingsStore): StorageStatus => {
    if (!storage) return { kind: 'unavailable' }
    const raw = JSON.stringify(next)
    try {
      storage.setItem(SAVINGS_KEY, raw)
      lastRaw.current = raw
      unsaved.current = false
      return { kind: 'ok' }
    } catch (error) {
      unsaved.current = true
      const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
      return { kind: 'save-failed', reason: quota ? 'quota' : 'unavailable' }
    }
  }

  // 손상·저장소 없음이면 화면에만 반영하고, 다른 탭이 먼저 저장했다면 덮어쓰지 않고 그 내용을 불러와 알린다.
  // 이번 변경이 화면에 반영됐는지 돌려준다(저장 실패·손상으로 화면에만 반영된 경우도 true, 다른 탭 기록을 불러와 반영하지 않았으면 false)
  const commit = (next: SavingsStore): boolean => {
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
    /** 옮긴 돈을 적는다. 이미 2,000건이면 저장하지 않고 'full', 다른 탭 기록을 불러와 반영하지 않았으면 'replaced' */
    addTransfer: (transfer: Transfer): 'ok' | 'full' | 'replaced' => {
      const next = addTransferTo(store, transfer)
      if (next === 'full') return 'full'
      return commit(next) ? 'ok' : 'replaced'
    },
    /** 아래 셋은 화면에 반영됐는지 돌려준다(다른 탭 기록을 불러와 반영하지 않았으면 false) */
    removeTransfer: (id: string): boolean => commit(removeTransferFrom(store, id)),
    setGoal: (goal: Goal): boolean => commit(setGoalOf(store, goal)),
    clearGoal: (): boolean => commit(clearGoalOf(store)),
    retrySave: () => {
      commit(store)
    },
    // 직전에 다른 탭이 읽을 수 있는 기록을 저장했다면 덮어쓰지 않고 그 내용을 불러온다
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
    /** 백업 불러오기 (F20): 사용자가 확인했으므로 지금 모으기 기록을 파일의 것으로 바꾼다 */
    replaceAll: (next: SavingsStore): StorageStatus => {
      const result = write(next)
      setStore(next)
      setStatus(result)
      return result
    },
  }
}
