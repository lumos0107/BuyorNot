import { describe, expect, it } from 'vitest'
import {
  createItem,
  decideItem,
  formatRemaining,
  reviewAtFrom,
  reviewState,
  sortConsidering,
  sortHistory,
  updateItem,
  validateWishInput,
  type WishItem,
} from './wishlist'

// PRD F01 상품 등록·관리, F02 숙려와 결정, F03 결정 기록 / AC02, AC03, AC04
const T0 = new Date('2026-10-11T09:00:00+09:00')
const hours = (n: number) => n * 60 * 60 * 1000
const at = (base: Date, ms: number) => new Date(base.getTime() + ms)

const validRaw = { name: '무선 헤드폰', price: '129,000', reason: '유선 이어폰 선이 자꾸 끊겨서', days: '3', url: '' }

function item(over: Partial<WishItem> = {}): WishItem {
  return {
    id: 'a',
    name: '무선 헤드폰',
    priceKrw: 129000,
    reason: '이유',
    url: null,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    reviewAt: reviewAtFrom(T0, 3),
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}

describe('숙려 종료 시각과 상태 (F02)', () => {
  it('종료 시각은 등록 시각 + 일수 × 24시간이다', () => {
    expect(reviewAtFrom(T0, 3)).toBe(at(T0, hours(72)).toISOString())
    expect(reviewAtFrom(T0, 1)).toBe(at(T0, hours(24)).toISOString())
  })

  it('종료 직전은 숙려 중, AC02: 정각은 재검토 가능, 직후도 재검토 가능이다', () => {
    const reviewAt = reviewAtFrom(T0, 3)
    expect(reviewState(reviewAt, at(T0, hours(72) - 1))).toEqual({ phase: 'cooling', remainingMs: 1 })
    expect(reviewState(reviewAt, at(T0, hours(72)))).toEqual({ phase: 'ready' })
    expect(reviewState(reviewAt, at(T0, hours(100)))).toEqual({ phase: 'ready' })
  })

  it('남은 시간은 일·시간·분 단위로 읽기 쉽게 보여준다', () => {
    expect(formatRemaining(hours(49))).toBe('2일 1시간 남음')
    expect(formatRemaining(hours(5) + 30 * 60 * 1000)).toBe('5시간 30분 남음')
    expect(formatRemaining(10 * 60 * 1000)).toBe('10분 남음')
    expect(formatRemaining(30 * 1000)).toBe('1분 미만 남음')
  })

  it('등록 직후 몇 ms 지난 값도 "2일 23시간"이 아니라 "3일 남음"으로 보여준다', () => {
    expect(formatRemaining(hours(72) - 5)).toBe('3일 남음')
    expect(formatRemaining(hours(24 * 6) - 20)).toBe('6일 남음')
  })

  it('AC03: 숙려가 끝나도 결정하지 않으면 상태는 고민 중으로 남는다', () => {
    const it0 = item()
    expect(reviewState(it0.reviewAt, at(T0, hours(200)))).toEqual({ phase: 'ready' })
    expect(it0.status).toBe('considering')
  })
})

describe('상품 등록·수정·결정 (F01, F02, F03)', () => {
  it('등록하면 숙려 기간에 맞는 종료 시각과 고민 중 상태로 만들어진다', () => {
    const { value, errors } = validateWishInput(validRaw)
    expect(errors).toEqual({})
    const created = createItem(value!, T0, 'id-1')
    expect(created).toMatchObject({
      id: 'id-1',
      name: '무선 헤드폰',
      priceKrw: 129000,
      reason: '유선 이어폰 선이 자꾸 끊겨서',
      url: null,
      status: 'considering',
      decidedAt: null,
      createdAt: T0.toISOString(),
      reviewAt: reviewAtFrom(T0, 3),
    })
  })

  it('고민 중인 상품의 이름·가격·이유·링크를 고치면 수정 시각만 바뀌고 종료 시각은 그대로다', () => {
    const later = at(T0, hours(5))
    const edited = updateItem(item(), { name: '헤드폰', priceKrw: 99000, reason: '세일 중', url: 'https://example.com' }, later)
    expect(edited.name).toBe('헤드폰')
    expect(edited.priceKrw).toBe(99000)
    expect(edited.url).toBe('https://example.com')
    expect(edited.updatedAt).toBe(later.toISOString())
    expect(edited.reviewAt).toBe(item().reviewAt)
    expect(edited.createdAt).toBe(item().createdAt)
  })

  it('구매·포기를 고르면 결정 시각이 저장되고 상태가 바뀐다 (숙려 중에도 가능)', () => {
    const now = at(T0, hours(10))
    const bought = decideItem(item(), 'purchased', now)
    expect(bought.status).toBe('purchased')
    expect(bought.decidedAt).toBe(now.toISOString())
    const skipped = decideItem(item(), 'skipped', now)
    expect(skipped.status).toBe('skipped')
  })

  it('AC04: 포기한 상품은 결정 기록에 보이고, 지우면 사라진다', () => {
    const now = at(T0, hours(80))
    const items = [item({ id: 'x' }), decideItem(item({ id: 'y', priceKrw: 129000 }), 'skipped', now)]
    const history = sortHistory(items)
    expect(history.map((i) => i.id)).toEqual(['y'])
    expect(history[0]?.priceKrw).toBe(129000)
    const afterDelete = sortHistory(items.filter((i) => i.id !== 'y'))
    expect(afterDelete).toEqual([])
  })

  it('고민 중 목록은 재검토 가능한 것이 먼저, 그다음 종료가 가까운 순이다', () => {
    const now = at(T0, hours(50))
    const ready = item({ id: 'ready', reviewAt: reviewAtFrom(T0, 1) })
    const soon = item({ id: 'soon', reviewAt: reviewAtFrom(T0, 3) })
    const late = item({ id: 'late', reviewAt: reviewAtFrom(T0, 7) })
    const done = decideItem(item({ id: 'done' }), 'purchased', now)
    expect(sortConsidering([late, done, soon, ready], now).map((i) => i.id)).toEqual(['ready', 'soon', 'late'])
  })

  it('결정 기록은 최신 결정 순이다', () => {
    const older = decideItem(item({ id: 'older' }), 'skipped', at(T0, hours(10)))
    const newer = decideItem(item({ id: 'newer' }), 'purchased', at(T0, hours(20)))
    expect(sortHistory([older, newer]).map((i) => i.id)).toEqual(['newer', 'older'])
  })
})

describe('등록 입력 검증 (F01)', () => {
  it('앞뒤 공백을 지우고, 쉼표 있는 가격을 정수로 바꾼다', () => {
    const { value } = validateWishInput({ ...validRaw, name: '  헤드폰  ', reason: ' 이유 ' })
    expect(value?.name).toBe('헤드폰')
    expect(value?.reason).toBe('이유')
    expect(value?.priceKrw).toBe(129000)
    expect(value?.days).toBe(3)
  })

  it('상품명은 1~80자, 이유는 1~500자다', () => {
    expect(validateWishInput({ ...validRaw, name: '   ' }).errors.name).toBeTruthy()
    expect(validateWishInput({ ...validRaw, name: '가'.repeat(81) }).errors.name).toBeTruthy()
    expect(validateWishInput({ ...validRaw, name: '가'.repeat(80) }).errors.name).toBeUndefined()
    expect(validateWishInput({ ...validRaw, reason: '' }).errors.reason).toBeTruthy()
    expect(validateWishInput({ ...validRaw, reason: '가'.repeat(501) }).errors.reason).toBeTruthy()
  })

  it('가격은 0원 이상 10억 원 이하 정수다', () => {
    expect(validateWishInput({ ...validRaw, price: '0' }).errors.price).toBeUndefined()
    expect(validateWishInput({ ...validRaw, price: '-1' }).errors.price).toBeTruthy()
    expect(validateWishInput({ ...validRaw, price: '1000000001' }).errors.price).toBeTruthy()
    expect(validateWishInput({ ...validRaw, price: '12.5' }).errors.price).toBeTruthy()
    expect(validateWishInput({ ...validRaw, price: '' }).errors.price).toBeTruthy()
  })

  it('숙려 기간은 1~30일 정수다 (1·3·7일 또는 직접 입력)', () => {
    expect(validateWishInput({ ...validRaw, days: '30' }).value?.days).toBe(30)
    expect(validateWishInput({ ...validRaw, days: '0' }).errors.days).toBeTruthy()
    expect(validateWishInput({ ...validRaw, days: '31' }).errors.days).toBeTruthy()
    expect(validateWishInput({ ...validRaw, days: '2.5' }).errors.days).toBeTruthy()
    expect(validateWishInput({ ...validRaw, days: '' }).errors.days).toBeTruthy()
  })

  it('링크는 비워도 되고, 넣으면 http·https 주소여야 한다', () => {
    expect(validateWishInput({ ...validRaw, url: '' }).value?.url).toBeNull()
    expect(validateWishInput({ ...validRaw, url: 'https://shop.example.com/item/1' }).value?.url).toBe(
      'https://shop.example.com/item/1',
    )
    expect(validateWishInput({ ...validRaw, url: 'ftp://x' }).errors.url).toBeTruthy()
    expect(validateWishInput({ ...validRaw, url: 'example.com' }).errors.url).toBeTruthy()
  })
})
