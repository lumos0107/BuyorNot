import { describe, expect, it } from 'vitest'
import { compareFreeShipping } from './shipping'
import { compareLinks, findSimilar } from './similar'
import { parseStore } from './storage'
import { reviewAtFrom, type WishItem } from './wishlist'

// GPT 7~9단계 검토 반영 (로직)
const NOW = new Date('2026-10-11T09:00:00+09:00')
let seq = 0
function item(name: string, over: Partial<WishItem> = {}): WishItem {
  return {
    id: `r-${++seq}`,
    name,
    priceKrw: 1000,
    reason: '이유',
    url: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    reviewAt: reviewAtFrom(NOW, 3),
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}

describe('복원 검증 보강', () => {
  const base = item('무선 헤드폰')
  const json = (over: Record<string, unknown>) => JSON.stringify({ schemaVersion: 1, items: [{ ...base, ...over }] })

  it('answers가 배열이면 손상이다', () => {
    expect(parseStore(json({ answers: [] }))).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('구매함 기록에 회고 메모만 있고 답이 없으면 손상이다', () => {
    const bought = { status: 'purchased', decidedAt: '2026-10-12T00:00:00.000Z' }
    expect(parseStore(json({ ...bought, reviewNote: '메모만' }))).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(parseStore(json({ ...bought, satisfaction: 'meh', reviewNote: '보통' }))).toMatchObject({ ok: true })
  })
})

describe('비교 링크 검색어', () => {
  const query = (name: string) => new URL(compareLinks(name)[0]!.href).searchParams.get('query')

  it('상품명의 괄호 정보(모델·세대)는 남기고 "(예시)"만 뺀다', () => {
    expect(query('갤럭시 버즈 (2세대)')).toBe('갤럭시 버즈 (2세대)')
    expect(query('(아이폰 16)')).toBe('(아이폰 16)')
    expect(query('(예시) 무선 헤드폰')).toBe('무선 헤드폰')
  })
})

describe('비슷한 이름: 본체와 액세서리 구분', () => {
  it('액세서리는 본체와 같은 물건으로 보지 않는다', () => {
    expect(findSimilar('헤드폰 거치대', [item('무선 헤드폰')], NOW)).toEqual([])
    expect(findSimilar('헤드폰', [item('헤드폰 거치대')], NOW)).toEqual([])
    expect(findSimilar('아이폰 케이스', [item('아이폰')], NOW)).toEqual([])
  })

  it('띄어쓰기만 다르거나 끝부분이 같으면 같은 물건으로 본다', () => {
    expect(findSimilar('키보드', [item('게이밍키보드')], NOW)).toHaveLength(1)
    expect(findSimilar('게이밍 키보드', [item('게이밍키보드')], NOW)).toHaveLength(1)
    expect(findSimilar('무선 키보드', [item('게이밍 키보드')], NOW)).toHaveLength(1)
  })
})

describe('무료배송 판정 우선순위', () => {
  it('이미 기준 이상이면 배송비가 0원이어도 "이미 무료배송"이 먼저다', () => {
    const r = compareFreeShipping({ price: 31000, shipping: 0, threshold: 30000, add: 5000 })
    expect(r.outcome).toBe('already-free')
    expect(r.after).toBe(31000)
  })
})
