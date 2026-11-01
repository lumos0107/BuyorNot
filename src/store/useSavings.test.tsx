import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SAVINGS_KEY, TRANSFER_MAX, type Transfer } from '../logic/savings'
import { useSavings } from './useSavings'

// PRD F48 저장·여러 탭 (AC96): 고정비 저장 훅(useSubscriptions)과 같은 규칙을 모으기 키에 적용한다
// plan: 계획의 테스트 이름 끝 (AC96)을 앞으로 옮김(R2)
const T = (over: Partial<Transfer> = {}): Transfer => ({
  id: 't1',
  day: '2026-11-01',
  amountKrw: 100000,
  direction: 'in',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
})
const rawOf = (transfers: Transfer[]) => JSON.stringify({ schemaVersion: 1, transfers, goal: null })
const saved = () => localStorage.getItem(SAVINGS_KEY)

beforeEach(() => {
  localStorage.clear()
})

describe('모으기 저장 훅 (F48)', () => {
  it('AC96: 옮긴 돈을 더하면 저장되고 다시 읽으면 같다', () => {
    const { result } = renderHook(() => useSavings())
    let outcome: string | undefined
    act(() => {
      outcome = result.current.addTransfer(T())
    })
    expect(outcome).toBe('ok')
    expect(result.current.store.transfers).toEqual([T()])
    expect(result.current.status).toEqual({ kind: 'ok' })
    expect(saved()).toBe(rawOf([T()]))

    const again = renderHook(() => useSavings())
    expect(again.result.current.store).toEqual({ schemaVersion: 1, transfers: [T()], goal: null })
  })

  it('AC96: 목표를 정하고 고치고 지워도 저장에 반영된다', () => {
    const { result } = renderHook(() => useSavings())
    const goal = {
      name: '비상금',
      targetKrw: 500000,
      startedOn: '2026-11-01',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    }
    act(() => result.current.setGoal(goal))
    expect(JSON.parse(saved() ?? '{}').goal).toEqual(goal)
    act(() => result.current.removeTransfer('없는 id'))
    act(() => result.current.clearGoal())
    expect(JSON.parse(saved() ?? '{}').goal).toBeNull()
  })

  it('AC96: 다른 탭이 먼저 저장했으면 덮어쓰지 않고 불러와 replaced다', () => {
    const { result } = renderHook(() => useSavings())
    const other = rawOf([T({ id: 'other', amountKrw: 5000 })])
    localStorage.setItem(SAVINGS_KEY, other)
    act(() => {
      result.current.addTransfer(T())
    })
    expect(saved()).toBe(other)
    expect(result.current.store.transfers.map((t) => t.id)).toEqual(['other'])
    expect(result.current.status).toEqual({ kind: 'replaced' })
  })

  it('AC96: 손상된 저장값은 덮어쓰지 않는다', () => {
    const broken = JSON.stringify({ schemaVersion: 1, transfers: [], goal: null, kept: [] })
    localStorage.setItem(SAVINGS_KEY, broken)
    const { result } = renderHook(() => useSavings())
    expect(result.current.status).toEqual({ kind: 'corrupt' })
    act(() => {
      result.current.addTransfer(T())
    })
    expect(saved()).toBe(broken)
    expect(result.current.status).toEqual({ kind: 'corrupt' })
    // 화면에는 반영된다
    expect(result.current.store.transfers).toEqual([T()])
  })

  it('AC96: 다른 탭이 읽을 수 없는 값을 쓰면 손상으로 표시한다', () => {
    const { result } = renderHook(() => useSavings())
    localStorage.setItem(SAVINGS_KEY, '{ 읽을 수 없음')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SAVINGS_KEY }))
    })
    expect(result.current.status).toEqual({ kind: 'corrupt' })
    act(() => {
      result.current.addTransfer(T())
    })
    expect(saved()).toBe('{ 읽을 수 없음')
  })

  it('AC96: 다른 탭이 읽을 수 있는 값을 쓰면 그대로 불러온다', () => {
    const { result } = renderHook(() => useSavings())
    localStorage.setItem(SAVINGS_KEY, rawOf([T({ id: 'o' })]))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SAVINGS_KEY }))
    })
    expect(result.current.store.transfers.map((t) => t.id)).toEqual(['o'])
    expect(result.current.status).toEqual({ kind: 'ok' })
  })

  it('AC96: 2,000건이면 full을 돌려주고 저장하지 않는다', () => {
    const full = Array.from({ length: TRANSFER_MAX }, (_, i) => T({ id: `t${i}` }))
    localStorage.setItem(SAVINGS_KEY, rawOf(full))
    const { result } = renderHook(() => useSavings())
    let outcome: string | undefined
    act(() => {
      outcome = result.current.addTransfer(T({ id: 'extra' }))
    })
    expect(outcome).toBe('full')
    expect(saved()).toBe(rawOf(full))
    expect(result.current.store.transfers).toHaveLength(TRANSFER_MAX)
  })

  it('AC96: 저장에 실패하면 save-failed로 표시하고 다시 저장할 수 있다', () => {
    const { result } = renderHook(() => useSavings())
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    try {
      act(() => {
        result.current.addTransfer(T())
      })
      expect(result.current.status).toEqual({ kind: 'save-failed', reason: 'quota' })
    } finally {
      Storage.prototype.setItem = original
    }
    act(() => result.current.retrySave())
    expect(result.current.status).toEqual({ kind: 'ok' })
    expect(saved()).toBe(rawOf([T()]))
  })

  it('AC96: 초기화하면 지금 화면의 기록을 저장하고, replaceAll은 통째로 바꾼다', () => {
    localStorage.setItem(SAVINGS_KEY, '{ 읽을 수 없음')
    const { result } = renderHook(() => useSavings())
    expect(result.current.status).toEqual({ kind: 'corrupt' })
    act(() => result.current.resetStorage())
    expect(result.current.status).toEqual({ kind: 'ok' })
    expect(saved()).toBe(JSON.stringify({ schemaVersion: 1, transfers: [], goal: null }))

    let status: { kind: string } | undefined
    act(() => {
      status = result.current.replaceAll({ schemaVersion: 1, transfers: [T()], goal: null })
    })
    expect(status).toEqual({ kind: 'ok' })
    expect(result.current.store.transfers).toEqual([T()])
    expect(saved()).toBe(rawOf([T()]))
  })
})

// R45 구현 규칙: 반영 여부를 돌려줘야 화면이 성공 안내를 반영됐을 때만 띄운다
describe('모으기 저장 훅이 돌려주는 반영 여부 (F48)', () => {
  const goal = {
    name: '비상금',
    targetKrw: 500000,
    startedOn: '2026-11-01',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  }

  it('AC96: 다른 탭이 먼저 저장했으면 적기는 replaced, 지우기·목표 정하기·지우기는 false를 돌려준다', () => {
    const { result } = renderHook(() => useSavings())
    const results: unknown[] = []
    const other = (id: string) => localStorage.setItem(SAVINGS_KEY, rawOf([T({ id })]))

    other('o1')
    act(() => void results.push(result.current.addTransfer(T())))
    other('o2')
    act(() => void results.push(result.current.removeTransfer('o2')))
    other('o3')
    act(() => void results.push(result.current.setGoal(goal)))
    other('o4')
    act(() => void results.push(result.current.clearGoal()))
    expect(results).toEqual(['replaced', false, false, false])
    // 어느 것도 다른 탭의 기록을 덮어쓰지 않았다
    expect(saved()).toBe(rawOf([T({ id: 'o4' })]))
  })

  it('AC96: 저장되거나 저장에 실패해 화면에만 반영돼도 반영됐다고 돌려준다', () => {
    const { result } = renderHook(() => useSavings())
    let added: string | undefined
    let goalSet: boolean | undefined
    act(() => {
      added = result.current.addTransfer(T())
    })
    expect(added).toBe('ok')

    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    try {
      act(() => {
        goalSet = result.current.setGoal(goal)
      })
    } finally {
      Storage.prototype.setItem = original
    }
    expect(goalSet).toBe(true)
    expect(result.current.store.goal).toEqual(goal)
    expect(result.current.status).toEqual({ kind: 'save-failed', reason: 'quota' })
  })
})
