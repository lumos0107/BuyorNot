import { formatDate } from './dates'
import { MAX_WON, parseInteger } from './number'

// PRD F01 상품 등록·관리, F02 고민 기간과 결정, F03 결정 기록, #6 데이터 초안
// 시각은 ISO 문자열(UTC)로 저장하고 화면에서 현지 시각으로 보여준다.

export type ItemStatus = 'considering' | 'purchased' | 'skipped'

/** 담을 때 답하는 질문 3개 (F09). 모두 선택 */
export type Answers = {
  haveOne?: 'yes' | 'no'
  problem?: string
  useInMonth?: 'yes' | 'no' | 'unsure'
  /** 할인·한정 때문인가요? (F09 확장) */
  saleDriven?: 'yes' | 'no'
  /** 놓을 곳과 쓸 시간이 있나요? */
  spaceTime?: 'yes' | 'no'
  /** 빌리거나 중고로 대신할 수 있나요? */
  alternative?: 'yes' | 'no'
}

/** 구매 후 회고 (F12) */
export type Satisfaction = 'good' | 'meh' | 'regret'

/** 갖고 싶은 정도 1~5 (F22 고민 노트) */
export type DesireLevel = 1 | 2 | 3 | 4 | 5
/** 고민하는 동안 날마다 기록한 정도. day는 고른 순간의 기기 현지 날짜(YYYY-MM-DD) */
export type DesireCheck = { day: string; level: DesireLevel }

export type WishItem = {
  id: string
  name: string
  priceKrw: number
  reason: string
  url: string | null
  createdAt: string
  updatedAt: string
  /** 재검토 가능해지는 시각 = 등록 시각 + 고민 일수 × 24시간 */
  reviewAt: string
  status: ItemStatus
  decidedAt: string | null
  // 2차 선택 필드. 1차 기록에는 없으므로 모두 optional (PRD #10)
  /** 더 고민하기 횟수 (F07) */
  extensions?: number
  /** 결정할 때 적은 메모 (F08) */
  decisionNote?: string
  answers?: Answers
  satisfaction?: Satisfaction
  reviewNote?: string
  // 4차 선택 필드 (F22)
  /** 담을 때 고른 갖고 싶은 정도 */
  desireStart?: DesireLevel
  /** 담을 때 정도를 고른 날(그때의 기기 현지 날짜). 나중에 시간대가 바뀌어도 같은 판정을 하려고 저장한다 */
  desireStartDay?: string
  /** 고민하는 동안 날마다 기록한 정도 (같은 날은 하나) */
  desireChecks?: DesireCheck[]
}

export const NOTE_MAX = 200
export const EXTEND_DAYS = [1, 3, 7] as const

/** 메모(결정·회고)는 앞뒤 공백을 지우고 200자까지. 비어 있으면 값 없음 */
export function validateNote(raw: string): { value?: string; error?: string } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return {}
  if (trimmed.length > NOTE_MAX) return { error: `메모는 ${NOTE_MAX}자 이하로 적어 주세요` }
  return { value: trimmed }
}

export type NewWishInput = {
  name: string
  priceKrw: number
  reason: string
  days: number
  url: string | null
  answers?: Answers
  /** 담을 때 고른 갖고 싶은 정도 (F22) */
  desire?: DesireLevel
}
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

/** 고민 중인 상품을 고칠 때: 고민 기간은 바꾸지 않는다 */
export function validateWishPatch(raw: WishPatchRaw): { value?: WishPatch; errors: WishFieldErrors } {
  const errors: WishFieldErrors = {}
  const value = checkPatch(raw, errors)
  return value ? { value, errors } : { errors }
}

// 등록할 때: 위 규칙 + 고민 기간 1~30일 정수
export function validateWishInput(raw: WishRawInput): { value?: NewWishInput; errors: WishFieldErrors } {
  const errors: WishFieldErrors = {}
  const patch = checkPatch(raw, errors)

  const days = parseInteger(raw.days)
  if (days === null || days < 1 || days > MAX_DAYS) errors.days = `고민 기간은 1~${MAX_DAYS}일 사이 정수여야 해요`

  if (!patch || Object.keys(errors).length > 0) return { errors }
  return { value: { ...patch, days: days! }, errors }
}

/** 등록 시각과 종료 시각으로 고민 일수를 되돌려 계산한다 */
export function coolingDays(item: Pick<WishItem, 'createdAt' | 'reviewAt'>): number {
  return Math.round((Date.parse(item.reviewAt) - Date.parse(item.createdAt)) / DAY_MS)
}

export function createItem(input: NewWishInput, now: Date, id: string): WishItem {
  const createdAt = now.toISOString()
  const item: WishItem = {
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
  const answers = cleanAnswers(input.answers)
  if (answers) item.answers = answers
  if (input.desire !== undefined) {
    item.desireStart = input.desire
    item.desireStartDay = formatDate(createdAt)
  }
  return item
}

/** 답한 항목만 남긴다. 하나도 없으면 undefined (F09) */
export function cleanAnswers(answers: Answers | undefined): Answers | undefined {
  if (!answers) return undefined
  const out: Answers = {}
  if (answers.haveOne) out.haveOne = answers.haveOne
  const problem = answers.problem?.trim()
  if (problem) out.problem = problem
  if (answers.useInMonth) out.useInMonth = answers.useInMonth
  if (answers.saleDriven) out.saleDriven = answers.saleDriven
  if (answers.spaceTime) out.spaceTime = answers.spaceTime
  if (answers.alternative) out.alternative = answers.alternative
  return Object.keys(out).length > 0 ? out : undefined
}

const HAVE_ONE_TEXT = { yes: '지금 쓰는 게 있어요', no: '지금 쓰는 게 없어요' } as const
const USE_IN_MONTH_TEXT = { yes: '쓸 것 같아요', no: '아닐 것 같아요', unsure: '모르겠어요' } as const
const SALE_DRIVEN_TEXT = { yes: '할인·한정 때문에 담았어요', no: '할인 때문은 아니에요' } as const
const SPACE_TIME_TEXT = { yes: '놓을 곳과 쓸 시간이 있어요', no: '놓을 곳이나 쓸 시간이 없어요' } as const
const ALTERNATIVE_TEXT = { yes: '빌리거나 중고로 대신할 수 있어요', no: '대신하기 어려워요' } as const

/** 답 목록에 보여줄 문장과 그 질문 (F09, F22 다시 답하기) */
export function answerLines(answers: Answers | undefined): { key: keyof Answers; text: string }[] {
  if (!answers) return []
  const lines: { key: keyof Answers; text: string }[] = []
  if (answers.haveOne) lines.push({ key: 'haveOne', text: HAVE_ONE_TEXT[answers.haveOne] })
  // 공백뿐인 문제 설명(이전 기록)은 답하지 않은 것으로 본다 (F22)
  const problem = answers.problem?.trim()
  if (problem) lines.push({ key: 'problem', text: `없으면 생기는 문제: ${problem}` })
  if (answers.useInMonth) lines.push({ key: 'useInMonth', text: `한 달 뒤에도 쓸지: ${USE_IN_MONTH_TEXT[answers.useInMonth]}` })
  if (answers.saleDriven) lines.push({ key: 'saleDriven', text: SALE_DRIVEN_TEXT[answers.saleDriven] })
  if (answers.spaceTime) lines.push({ key: 'spaceTime', text: SPACE_TIME_TEXT[answers.spaceTime] })
  if (answers.alternative) lines.push({ key: 'alternative', text: ALTERNATIVE_TEXT[answers.alternative] })
  return lines
}

/** 재검토 카드에 보여줄 답 문장 (F09) */
export function describeAnswers(answers: Answers | undefined): string[] {
  return answerLines(answers).map((line) => line.text)
}

export type WishPatch = Pick<WishItem, 'name' | 'priceKrw' | 'reason' | 'url'>

// 고민 중인 상품의 내용만 고친다. 고민 기간 종료 시각은 바뀌지 않는다. (F01)
export function updateItem(item: WishItem, patch: WishPatch, now: Date): WishItem {
  return { ...item, ...patch, updatedAt: now.toISOString() }
}

// 고민 중에도 결정할 수 있다. 결정 시각을 저장하고 상태를 바꾼다. 메모는 비어 있으면 저장하지 않는다. (F02, F08)
export function decideItem(item: WishItem, status: 'purchased' | 'skipped', now: Date, note?: string): WishItem {
  const at = now.toISOString()
  const decisionNote = note?.trim() || undefined
  const next: WishItem = { ...item, status, decidedAt: at, updatedAt: at }
  if (decisionNote) next.decisionNote = decisionNote
  return next
}

// 더 고민하기: 새 종료 시각 = max(지금, 기존 종료) + 일수. 등록 시각과 이유는 그대로, 횟수만 +1 (F07)
export function extendItem(item: WishItem, days: number, now: Date): WishItem {
  const base = Math.max(now.getTime(), Date.parse(item.reviewAt))
  return {
    ...item,
    reviewAt: new Date(base + days * DAY_MS).toISOString(),
    extensions: (item.extensions ?? 0) + 1,
    updatedAt: now.toISOString(),
  }
}

const ts = (iso: string | null) => (iso ? Date.parse(iso) : 0)

// 재검토 가능한 것(종료 시각이 지난 것)이 먼저, 그다음 종료가 가까운 순. 표기가 달라도 실제 시각으로 정렬한다
export function sortConsidering(items: readonly WishItem[], _now: Date): WishItem[] {
  return items.filter((item) => item.status === 'considering').sort((a, b) => ts(a.reviewAt) - ts(b.reviewAt))
}

// 결정 기록은 최신 결정 순 (F03)
export function sortHistory(items: readonly WishItem[]): WishItem[] {
  return items.filter((item) => item.status !== 'considering').sort((a, b) => ts(b.decidedAt) - ts(a.decidedAt))
}

/** 가장 가까운 고민 기간 종료까지 남은 ms. 앞으로 끝날 것이 없으면 null (화면 갱신 타이머용) */
export function nextReviewDelay(items: readonly WishItem[], now: Date): number | null {
  const upcoming = items
    .filter((item) => item.status === 'considering')
    .map((item) => ts(item.reviewAt) - now.getTime())
    .filter((ms) => ms > 0)
  return upcoming.length > 0 ? Math.min(...upcoming) : null
}

/** 결정을 되돌려 다시 고민 중으로 (F18). 결정 시각·결정 메모·회고는 지우고, 고민 기간·연장·답은 그대로 둔다.
 *  고민 기간이 이미 지났으면 바로 재검토 가능이다 */
export function reconsiderItem(item: WishItem, now: Date): WishItem {
  const next: WishItem = { ...item, status: 'considering', decidedAt: null, updatedAt: now.toISOString() }
  delete next.decisionNote
  delete next.satisfaction
  delete next.reviewNote
  return next
}

/** 시연용 예시 기록인지: 이름이 "(예시)"로 시작한다 (예시 물건·예시 구독 공통) */
export const isExample = (name: string) => name.startsWith('(예시)')

// 발표·시연용 가상 데이터. 재검토 가능한 것, 고민 중인 것, 이미 결정한 것을 하나씩 만든다. 보통 기록처럼 저장된다.
export function demoItems(now: Date, nextId: () => string): WishItem[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS)
  const make = (
    name: string,
    priceKrw: number,
    reason: string,
    createdDaysAgo: number,
    days: number,
    decided?: { status: 'purchased' | 'skipped'; daysAgo: number },
    answers?: Answers,
    desire?: { start: DesireLevel; checks: [daysAgo: number, level: DesireLevel][] },
  ): WishItem => {
    const created = ago(createdDaysAgo).toISOString()
    const decidedAt = decided ? ago(decided.daysAgo).toISOString() : null
    return {
      id: nextId(),
      name: `(예시) ${name}`,
      priceKrw,
      reason,
      url: null,
      createdAt: created,
      updatedAt: decidedAt ?? created,
      reviewAt: reviewAtFrom(created, days),
      status: decided?.status ?? 'considering',
      decidedAt,
      ...(answers ? { answers } : {}),
      ...(desire ? { desireStart: desire.start, desireStartDay: formatDate(created) } : {}),
      ...(desire && desire.checks.length > 0
        ? { desireChecks: desire.checks.map(([daysAgo, level]) => ({ day: formatDate(ago(daysAgo).toISOString()), level })) }
        : {}),
    }
  }
  return [
    // 담을 때 답한 것과 고민하는 동안 줄어든 정도가 있어 재검토 카드·사기 전 점검·오늘의 고민(F09, F15, F22)을 시연할 수 있다
    make('무선 헤드폰', 129000, '유선 이어폰 선이 자꾸 끊겨서', 4, 3, undefined, { haveOne: 'yes', useInMonth: 'unsure', alternative: 'no' }, { start: 4, checks: [[3, 3], [2, 2]] }),
    // 아직 답하지 않은 질문이 있어 카드의 생각해 볼 질문을 시연할 수 있다
    make('접이식 건조대', 38000, '빨래를 널 곳이 없어서', 1, 7, undefined, undefined, { start: 3, checks: [] }),
    // 고민하는 동안 정도가 줄어 포기한 기록과, 줄지 않아 산 기록 (결정 기록의 고민 효과)
    make('게이밍 키보드', 149000, '세일이라 담았는데 지금 키보드도 멀쩡해서', 7, 3, { status: 'skipped', daysAgo: 3 }, undefined, { start: 5, checks: [[6, 4], [4, 2]] }),
    // 구매 후 7일이 지나 회고를 물을 수 있는 기록 (F12)
    make('무선 청소기', 189000, '바닥 청소할 시간이 없어서', 14, 3, { status: 'purchased', daysAgo: 9 }, undefined, { start: 3, checks: [[12, 4], [10, 4]] }),
  ]
}

export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
