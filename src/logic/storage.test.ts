import { describe, expect, it } from 'vitest'
import { STORAGE_KEY, loadStore, parseStore, saveStore, type WishStore } from './storage'

// PRD F06 로컬 저장, #6 데이터 초안 / AC01, AC13
const store: WishStore = {
  schemaVersion: 1,
  items: [
    {
      id: 'a',
      name: '무선 헤드폰',
      priceKrw: 129000,
      reason: '이유',
      url: null,
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
      reviewAt: '2026-10-14T00:00:00.000Z',
      status: 'considering',
      decidedAt: null,
    },
  ],
}

function fakeStorage(initial: Record<string, string> = {}, opts: { failWrite?: boolean } = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.failWrite) throw new DOMException('quota', 'QuotaExceededError')
      data.set(k, v)
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  }
}

describe('저장과 복원', () => {
  it('AC01: 저장한 뒤 다시 읽으면 상품과 종료 시각이 그대로다', () => {
    const storage = fakeStorage()
    expect(saveStore(storage, store)).toEqual({ ok: true })
    const loaded = loadStore(storage)
    expect(loaded).toEqual({ ok: true, store })
    expect(storage.getItem(STORAGE_KEY)).toContain('schemaVersion')
  })

  it('저장된 것이 없으면 빈 목록으로 시작한다', () => {
    expect(loadStore(fakeStorage())).toEqual({ ok: true, store: { schemaVersion: 1, items: [] } })
  })

  it('AC13: 손상된 데이터는 조용히 덮어쓰지 않고 손상으로 알린다', () => {
    expect(parseStore('{not json')).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(JSON.stringify({ schemaVersion: 99, items: [] }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(JSON.stringify({ schemaVersion: 1, items: [{ id: 1 }] }))).toMatchObject({ ok: false, reason: 'corrupt' })
    const corrupt = loadStore(fakeStorage({ [STORAGE_KEY]: '{not json' }))
    expect(corrupt).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('AC13: 저장에 실패하면 성공으로 알리지 않는다', () => {
    expect(saveStore(fakeStorage({}, { failWrite: true }), store)).toEqual({ ok: false, reason: 'quota' })
    expect(saveStore(null, store)).toEqual({ ok: false, reason: 'unavailable' })
    expect(loadStore(null)).toMatchObject({ ok: false, reason: 'unavailable' })
  })
})

// GPT 4단계 검토 반영: 타입만이 아니라 값의 의미도 검증한다 (AC13)
describe('복원 데이터의 의미 검증', () => {
  const base = store.items[0]!
  const withItem = (over: Partial<typeof base>) => JSON.stringify({ schemaVersion: 1, items: [{ ...base, ...over }] })

  it('음수·소수·상한 초과 가격은 손상이다', () => {
    expect(parseStore(withItem({ priceKrw: -1 }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(withItem({ priceKrw: 12.5 }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(withItem({ priceKrw: 1_000_000_001 }))).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('읽을 수 없는 날짜나 등록보다 이른 종료 시각은 손상이다', () => {
    expect(parseStore(withItem({ reviewAt: 'not a date' }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(withItem({ reviewAt: '2026-10-10T00:00:00.000Z' }))).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('상태와 결정 시각이 어긋나면 손상이다', () => {
    expect(parseStore(withItem({ status: 'considering', decidedAt: '2026-10-12T00:00:00.000Z' }))).toMatchObject({ ok: false })
    expect(parseStore(withItem({ status: 'purchased', decidedAt: null }))).toMatchObject({ ok: false })
    expect(parseStore(withItem({ status: 'purchased', decidedAt: '2026-10-12T00:00:00.000Z' }))).toMatchObject({ ok: true })
  })

  it('허용되지 않은 링크나 중복 id는 손상이다', () => {
    expect(parseStore(withItem({ url: 'ftp://x' }))).toMatchObject({ ok: false })
    expect(parseStore(withItem({ url: 'https://shop.example.com/1' }))).toMatchObject({ ok: true })
    const dup = JSON.stringify({ schemaVersion: 1, items: [base, { ...base }] })
    expect(parseStore(dup)).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('수정 시각이 등록보다 앞서는 것은 기기 시각 변경일 수 있으므로 손상으로 보지 않는다', () => {
    expect(parseStore(withItem({ updatedAt: '2026-10-01T00:00:00.000Z' }))).toMatchObject({ ok: true })
  })
})
