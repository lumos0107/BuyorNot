import { MAX_WON, parseInteger } from './number'

// PRD F01 상품 등록·관리, F02 숙려와 결정, F03 결정 기록, #6 데이터 초안
// 시각은 ISO 문자열(UTC)로 저장하고 화면에서 현지 시각으로 보여준다.

export type ItemStatus = 'considering' | 'purchased' | 'skipped'

export type WishItem = {
  id: string
  name: string
  priceKrw: number
  reason: string
  url: string | null
  createdAt: string
  updatedAt: string
  /** 재검토 가능해지는 시각 = 등록 시각 + 숙려 일수 × 24시간 */
  reviewAt: string
  status: ItemStatus
  decidedAt: string | null
}

export type NewWishInput = { name: string; priceKrw: number; reason: string; days: number; url: string | null }
export type WishRawInput = { name: string; price: string; reason: string; days: string; url: string }
export type WishFieldErrors = Partial<Record<keyof WishRawInput, string>>

export const COOLING_PRESETS = [1, 3, 7] as const
export const MAX_DAYS = 30
export const NAME_MAX = 80
export const REASON_MAX = 500

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

export function reviewAtFrom(createdAt: string | Date, days: number): string {
  const base = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  return new Date(base.getTime() + days * DAY_MS).toISOString()
}

export type ReviewState = { phase: 'cooling'; remainingMs: number } | { phase: 'ready' }

// 현재 시각을 인자로 받아 종료 직전·정각·직후를 테스트할 수 있게 한다. 정각부터 재검토 가능이다. (AC02)
export function reviewState(reviewAt: string, now: Date): ReviewState {
  const remainingMs = new Date(reviewAt).getTime() - now.getTime()
  return remainingMs > 0 ? { phase: 'cooling', remainingMs } : { phase: 'ready' }
}

export function formatRemaining(ms: number): string {
  // 1초 안쪽의 차이는 올려 준다. 등록 직후 화면 갱신까지의 몇 ms 때문에 "3일"이 "2일 23시간"으로 보이지 않게
  const totalMinutes = Math.floor((ms + 1000) / MINUTE_MS)
  if (totalMinutes < 1) return '1분 미만 남음'
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간 남음` : `${days}일 남음`
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분 남음` : `${hours}시간 남음`
  return `${minutes}분 남음`
}

function parseUrl(raw: string): string | null | 'invalid' {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : 'invalid'
  } catch {
    return 'invalid'
  }
}

export type WishPatchRaw = Pick<WishRawInput, 'name' | 'price' | 'reason' | 'url'>

// F01: 상품명 1~80자, 이유 1~500자(앞뒤 공백 제거), 가격 0~10억 원 정수, 링크는 선택(http·https)
function checkPatch(raw: WishPatchRaw, errors: WishFieldErrors): WishPatch | null {
  const name = raw.name.trim()
  if (name.length === 0) errors.name = '상품명을 입력해 주세요'
  else if (name.length > NAME_MAX) errors.name = `상품명은 ${NAME_MAX}자 이하로 적어 주세요`

  const priceKrw = parseInteger(raw.price)
  if (priceKrw === null) errors.price = '가격을 숫자로 입력해 주세요'
  else if (priceKrw < 0) errors.price = '가격은 0원 이상이어야 해요'
  else if (priceKrw > MAX_WON) errors.price = '가격은 10억 원 이하여야 해요'

  const reason = raw.reason.trim()
  if (reason.length === 0) errors.reason = '사고 싶은 이유를 적어 주세요'
  else if (reason.length > REASON_MAX) errors.reason = `이유는 ${REASON_MAX}자 이하로 적어 주세요`

  const url = parseUrl(raw.url)
  if (url === 'invalid') errors.url = 'http:// 또는 https://로 시작하는 주소를 넣어 주세요'

  if (Object.keys(errors).length > 0) return null
  return { name, priceKrw: priceKrw!, reason, url: url as string | null }
}

/** 고민 중인 상품을 고칠 때: 숙려 기간은 바꾸지 않는다 */
export function validateWishPatch(raw: WishPatchRaw): { value?: WishPatch; errors: WishFieldErrors } {
  const errors: WishFieldErrors = {}
  const value = checkPatch(raw, errors)
  return value ? { value, errors } : { errors }
}

// 등록할 때: 위 규칙 + 숙려 1~30일 정수
export function validateWishInput(raw: WishRawInput): { value?: NewWishInput; errors: WishFieldErrors } {
  const errors: WishFieldErrors = {}
  const patch = checkPatch(raw, errors)

  const days = parseInteger(raw.days)
  if (days === null || days < 1 || days > MAX_DAYS) errors.days = `숙려 기간은 1~${MAX_DAYS}일 사이 정수여야 해요`

  if (!patch || Object.keys(errors).length > 0) return { errors }
  return { value: { ...patch, days: days! }, errors }
}

/** 등록 시각과 종료 시각으로 숙려 일수를 되돌려 계산한다 */
export function coolingDays(item: Pick<WishItem, 'createdAt' | 'reviewAt'>): number {
  return Math.round((Date.parse(item.reviewAt) - Date.parse(item.createdAt)) / DAY_MS)
}

export function createItem(input: NewWishInput, now: Date, id: string): WishItem {
  const createdAt = now.toISOString()
  return {
    id,
    name: input.name,
    priceKrw: input.priceKrw,
    reason: input.reason,
    url: input.url,
    createdAt,
    updatedAt: createdAt,
    reviewAt: reviewAtFrom(now, input.days),
    status: 'considering',
    decidedAt: null,
  }
}

export type WishPatch = Pick<WishItem, 'name' | 'priceKrw' | 'reason' | 'url'>

// 고민 중인 상품의 내용만 고친다. 숙려 종료 시각은 바뀌지 않는다. (F01)
export function updateItem(item: WishItem, patch: WishPatch, now: Date): WishItem {
  return { ...item, ...patch, updatedAt: now.toISOString() }
}

// 숙려 중에도 결정할 수 있다. 결정 시각을 저장하고 상태를 바꾼다. (F02)
export function decideItem(item: WishItem, status: 'purchased' | 'skipped', now: Date): WishItem {
  const at = now.toISOString()
  return { ...item, status, decidedAt: at, updatedAt: at }
}

// 재검토 가능한 것(종료 시각이 지난 것)이 먼저, 그다음 종료가 가까운 순
export function sortConsidering(items: readonly WishItem[], _now: Date): WishItem[] {
  return items.filter((item) => item.status === 'considering').sort((a, b) => a.reviewAt.localeCompare(b.reviewAt))
}

// 결정 기록은 최신 결정 순 (F03)
export function sortHistory(items: readonly WishItem[]): WishItem[] {
  return items
    .filter((item) => item.status !== 'considering')
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
}

// 발표·시연용 가상 데이터. 재검토 가능한 것, 숙려 중인 것, 이미 결정한 것을 하나씩 만든다. 보통 기록처럼 저장된다.
export function demoItems(now: Date, nextId: () => string): WishItem[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS)
  const make = (
    name: string,
    priceKrw: number,
    reason: string,
    createdDaysAgo: number,
    days: number,
    decided?: { status: 'purchased' | 'skipped'; daysAgo: number },
  ): WishItem => {
    const created = ago(createdDaysAgo).toISOString()
    return {
      id: nextId(),
      name: `(예시) ${name}`,
      priceKrw,
      reason,
      url: null,
      createdAt: created,
      updatedAt: created,
      reviewAt: reviewAtFrom(created, days),
      status: decided?.status ?? 'considering',
      decidedAt: decided ? ago(decided.daysAgo).toISOString() : null,
    }
  }
  return [
    make('무선 헤드폰', 129000, '유선 이어폰 선이 자꾸 끊겨서', 4, 3),
    make('접이식 건조대', 38000, '빨래를 널 곳이 없어서', 1, 7),
    make('게이밍 키보드', 149000, '세일이라 담았는데 지금 키보드도 멀쩡해서', 7, 3, { status: 'skipped', daysAgo: 3 }),
  ]
}

export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
