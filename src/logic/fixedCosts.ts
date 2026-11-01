import { calendarDaysBetween } from './dates'
import { formatWon, josa } from './number'
import { daysUntil, inTrial, kindOf, monthlyEquivalent, monthlyOf, nextBillingDate, parseDay, tracksContract, USE_AREAS, type FixedCostKind, type PriceReason, type Subscription, type SubscriptionSummary, type UseArea } from './subscriptions'

// PRD F45 고정비 정리함: 종류 이름, 요약의 종류별 줄, 화면 문장

/** 종류 이름. 카드와 고르기에 쓴다 */
export const KIND_LABEL: Record<FixedCostKind, string> = {
  subscription: '구독',
  membership: '멤버십',
  delivery: '정기배송',
  phone: '통신',
  housing: '월세·관리비',
  insurance: '보험',
  other: '기타',
}

// 요약의 종류별 줄 묶음 (F45): 구독과 멤버십은 한 묶음이다. 이 순서로 보인다
const TOTAL_GROUPS: readonly { label: string; kinds: readonly FixedCostKind[] }[] = [
  { label: '구독·멤버십', kinds: ['subscription', 'membership'] },
  { label: '정기배송', kinds: ['delivery'] },
  { label: '통신', kinds: ['phone'] },
  { label: '월세·관리비', kinds: ['housing'] },
  { label: '보험', kinds: ['insurance'] },
  { label: '기타', kinds: ['other'] },
]

/**
 * 요약의 종류별 줄: "구독·멤버십 23,500원 · 통신 55,000원 · 월세·관리비 450,000원".
 * 금액은 카드에 보이는 월평균(monthlyEquivalent)의 합이다. 묶음이 둘 이상일 때만 만든다(하나면 첫 줄과 같은 금액).
 * 무료 체험 중인 것은 뺀다(F46). 해지한 것을 빼는 것은 부르는 쪽이 정한다(F47)
 */
export function kindTotalsLine(subs: readonly Subscription[], today: Date): string | null {
  const parts = TOTAL_GROUPS.flatMap(({ label, kinds }) => {
    const group = subs.filter((s) => kinds.includes(kindOf(s)) && !inTrial(s, today))
    if (group.length === 0) return []
    return [`${label} ${formatWon(group.reduce((sum, s) => sum + monthlyEquivalent(s), 0))}`]
  })
  return parts.length >= 2 ? parts.join(' · ') : null
}

// 화면 문장 (PRD F45 이름 바꿈 표 '후')
export const FIXED_TITLE = '고정비'
export const ADD_FORM = '고정비 담기'
export const ADD_BUTTON = '고정비 추가'
export const EDIT_FORM = '고정비 수정'
export const NAME_LABEL = '이름'
export const NAME_PLACEHOLDER = '예: 넷플릭스, 배민클럽, 휴대폰 요금'
export const EMPTY_TITLE = '아직 등록한 고정비가 없어요.'
export const EMPTY_NOTE = '구독·멤버십·통신·월세처럼 매월·매년 나가는 돈을 적어 두면 다음 결제일과 합계를 확인할 수 있어요.'
export const STALE_NOTICE = '다른 탭에서 이 고정비가 바뀌었어요. 취소한 뒤 다시 열어 고쳐 주세요.'
export const FIXED_STORAGE_LABEL = '고정비 저장 상태'
export const FIXED_UNAVAILABLE = '이 브라우저에서는 고정비를 저장할 수 없어요. 새로고침하면 사라져요.'
export const FIXED_SAVE_FAILED = '고정비를 저장하지 못했어요. 브라우저 저장 공간이나 설정을 확인한 뒤 다시 저장해 주세요.'
export const FIXED_REPLACED = '다른 탭에서 저장한 고정비를 불러왔어요. 이 탭에서 저장하지 않은 변경은 반영되지 않았어요.'
export const FIXED_CORRUPT = '저장된 고정비를 읽을 수 없어요. 초기화하기 전까지는 새로 넣은 고정비가 저장되지 않아요.'
export const FIXED_RESET_LABEL = '고정비 기록 초기화'
export const FIXED_RESET_NOTE = '초기화하면 읽을 수 없는 고정비는 사라지고, 지금 화면의 고정비만 저장돼요.'

// PRD F46 무료 체험 끝나는 날
export const TRIAL_LABEL = '무료 체험 끝나는 날 (선택)'
export const TRIAL_HINT = '그날까지는 합계에 넣지 않고, 그날을 첫 결제일로 보여 드려요. 그 뒤에는 위 결제일로 계산해요.'

/** 카드의 체험 줄(다음 결제 줄 바로 위). 체험 중이 아니면 null */
export function trialLine(sub: Subscription, today: Date): string | null {
  if (!inTrial(sub, today)) return null
  const left = daysUntil(sub.trialEndDate!, today)
  if (left === 0) return '무료 체험이 오늘 끝나요. 해지하지 않으면 유료로 바뀌어요.'
  const price = sub.cycle === 'monthly' ? `월 ${formatWon(sub.priceKrw)}` : `연 ${formatWon(sub.priceKrw)}`
  return `무료 체험 중 · ${sub.trialEndDate}에 끝나요 (D-${left}). 그 뒤 ${price}`
}

/** 요약의 체험 줄: "무료 체험 중 1개 · 끝나면 월 13,500원이 더 나가요". 체험 중이 없으면 null */
export function trialSummaryLine(s: SubscriptionSummary): string | null {
  return s.trialCount > 0 ? `무료 체험 중 ${s.trialCount}개 · 끝나면 월 ${formatWon(s.trialMonthly)}이 더 나가요` : null // copy-check: ignore josa formatWon은 늘 '원'으로 끝난다
}

// PRD F47 해지했어요

/** 카드의 요금 표시 (F14): 매월이면 "월 13,500원", 매년이면 "연 120,000원 · 월평균 10,000원" */
export function priceText(sub: Subscription): string {
  if (sub.cycle === 'weekly') return `${sub.intervalWeeks}주마다 ${formatWon(sub.priceKrw)} · 월평균 약 ${formatWon(monthlyEquivalent(sub))}`
  return sub.cycle === 'monthly' ? `월 ${formatWon(sub.priceKrw)}` : `연 ${formatWon(sub.priceKrw)} · 월평균 ${formatWon(monthlyEquivalent(sub))}`
}

export function nextLabel(sub: Subscription): '다음 배송' | '다음 결제' {
  return kindOf(sub) === 'delivery' ? '다음 배송' : '다음 결제'
}

export function skipLine(sub: Subscription, today: Date): string | null {
  if (kindOf(sub) !== 'delivery' || sub.cycle !== 'weekly') return null
  const left = daysUntil(nextBillingDate(sub, today), today)
  return left >= 0 && left <= 3 ? '건너뛰기·해지는 그 서비스에서 해요.' : null
}

export const CONTRACT_LABEL = '약정·계약 끝나는 날 (선택)'
export const PHONE_COMPARE_NOTE = '통신 요금 비교 사이트예요. 추천 아님. 새 창으로 열려요.'
export const PHONE_COMPARE_LINKS: readonly { name: string; href: string }[] = [
  { name: '알뜰폰허브', href: 'https://www.mvnohub.kr/' },
]

export function contractLines(sub: Subscription, today: Date): string[] {
  if (!tracksContract(sub) || !sub.contractEndDate || sub.cancelledOn) return []
  const phone = kindOf(sub) === 'phone'
  const noun = phone ? '약정' : '계약'
  const left = daysUntil(sub.contractEndDate, today)
  if (left < 0) return [`${noun}이 끝났어요 (${sub.contractEndDate})`] // copy-check: ignore josa noun은 약정 또는 계약으로 둘 다 받침이 있다
  const lines = [`${noun} 끝나는 날 ${sub.contractEndDate} (D-${left})`]
  if (left <= 60) lines.push(phone ? '약정이 끝나면 요금이나 할인이 바뀔 수 있어요. 통신사 앱에서 확인해 보세요.' : '계약이 끝나면 요금이나 조건이 바뀔 수 있어요. 계약한 곳에 확인해 보세요.')
  return lines
}

export const AREA_LABEL: Record<UseArea, string> = { delivery: '배달', shopping: '쇼핑', video: '영상', music: '음악', storage: '저장공간', other: '기타' }
export const AREAS_LEGEND = '쓰는 곳 (선택)'
export const AREAS_HINT = '같은 곳에 쓰는 구독·멤버십이 둘 이상이면 요약에 보여 드려요. 혜택은 바뀔 수 있으니 내 혜택에 맞게 골라 주세요.'
export const OVERLAP_NOTE = '모두 쓰는지는 각 카드의 사용 기록에서 볼 수 있어요.'

const overlapping = (subs: readonly Subscription[], area: UseArea) => subs.filter((sub) => !sub.cancelledOn && sub.areas?.includes(area))
const sortedNames = (subs: readonly Subscription[]) => subs.map((sub) => sub.name).sort((a, b) => a.localeCompare(b, 'ko'))

export function overlapSummaryLines(subs: readonly Subscription[]): string[] {
  return USE_AREAS.filter((area) => area !== 'other').flatMap((area) => {
    const group = overlapping(subs, area)
    if (group.length < 2) return []
    const total = group.reduce((sum, sub) => sum + monthlyEquivalent(sub), 0)
    return [`같은 곳에 쓰는 구독·멤버십: ${AREA_LABEL[area]} ${group.length}개(${sortedNames(group).join(', ')}) · 월 ${formatWon(total)}`]
  })
}

export function overlapCardLines(sub: Subscription, active: readonly Subscription[]): string[] {
  if (sub.cancelledOn) return []
  return USE_AREAS.filter((area) => area !== 'other' && sub.areas?.includes(area)).flatMap((area) => {
    const others = overlapping(active, area).filter((item) => item.id !== sub.id)
    if (others.length === 0) return []
    return [`${AREA_LABEL[area]}에 쓰는 것이 ${others.length === 1 ? '하나' : `${others.length}개`} 더 있어요: ${sortedNames(others).join(', ')}`]
  })
}

export const PRICE_REASON_LEGEND = '요금이 바뀐 이유'
export const PRICE_REASON_LABEL: Record<PriceReason, string> = {
  service: '서비스가 요금을 바꿨어요',
  me: '내가 요금제를 바꿨어요',
  fix: '잘못 적어서 고쳐요',
}
export const PRICE_DAY_LABEL = '바뀐 날'

export function cycleChangeNote(count: number): string {
  return `결제 주기를 바꾸면 요금 바뀜 기록 ${count}개가 지워져요.`
}

export function priceChangeLine(sub: Subscription, today: Date): string | null {
  const change = sub.priceChanges?.at(-1)
  if (!change) return null
  const day = parseDay(change.day)
  if (!day) return null
  const ago = calendarDaysBetween(day, today)
  if (ago < 0 || ago > 89) return null
  if (change.by === 'me') return `${change.day}에 요금제를 바꿨어요: ${formatWon(change.from)} → ${formatWon(change.to)}`
  const difference = change.to - change.from
  return `${change.day}부터 ${formatWon(change.from)} → ${formatWon(change.to)} (${formatWon(Math.abs(difference))} ${difference > 0 ? '올랐어요' : '내렸어요'})`
}

export function priceRiseLine(active: readonly Subscription[], today: Date): string | null {
  let count = 0
  let total = 0
  for (const sub of active) {
    if (sub.cancelledOn) continue
    const net = (sub.priceChanges ?? []).filter((change) => {
      const day = parseDay(change.day)
      if (!day || change.by !== 'service') return false
      const ago = calendarDaysBetween(day, today)
      return ago >= 0 && ago <= 89
    }).reduce((sum, change) => sum + monthlyOf(sub, change.to) - monthlyOf(sub, change.from), 0)
    if (net > 0) { count++; total += net }
  }
  return count > 0 ? `최근 90일에 요금이 오른 고정비 ${count}개 · 월 ${formatWon(total)} 늘었어요` : null
}

/** 해지 확인 문장(카드 안): 첫 줄, 둘째 줄, 통신·보험은 셋째 줄 */
export function cancelConfirmLines(sub: Subscription): string[] {
  const kind = kindOf(sub)
  const lines = [`‘${sub.name}’${josa(sub.name, '을/를')} 해지한 것으로 옮길까요? 실제 해지는 그곳에서 직접 해야 해요.`]
  lines.push(
    kind === 'housing'
      ? '옮기면 합계에서 빠져요. 월세·관리비는 줄어든 고정비로 세지 않아요.'
      : `옮기면 합계에서 빠지고, 모으기의 ‘줄어든 고정비’에 월 ${formatWon(monthlyEquivalent(sub))}이 더해져요.`, // copy-check: ignore josa formatWon은 늘 '원'으로 끝난다
  )
  if (kind === 'phone' || kind === 'insurance') {
    lines.push('다른 곳으로 갈아탄 거라면 해지 대신 ‘수정’에서 요금을 바꿔 주세요. 해지로 옮기면 이 요금 전체를 줄어든 고정비로 세요.')
  }
  return lines
}

export const CANCEL_DAY_EMPTY = '해지한 날을 골라 주세요'
export const CANCEL_DAY_RANGE = '해지한 날은 90일 전부터 오늘 사이여야 해요'
/** 해지한 날은 90일 전부터 오늘까지(현지 달력, 양 끝 포함) */
export const CANCEL_BACK_DAYS = 90

/** 해지한 날 검사 (F47) */
export function validateCancelDay(raw: string, today: Date, lastChangeDay?: string): { value?: string; error?: string } {
  const text = raw.trim()
  const day = parseDay(text)
  if (!day) return { error: CANCEL_DAY_EMPTY }
  const ago = calendarDaysBetween(day, today)
  if (ago < 0 || ago > CANCEL_BACK_DAYS) return { error: CANCEL_DAY_RANGE }
  if (lastChangeDay && text < lastChangeDay) return { error: `해지한 날은 마지막으로 요금이 바뀐 날(${lastChangeDay})과 같거나 그 뒤여야 해요` }
  return { value: text }
}

export function cancelledNotice(sub: Pick<Subscription, 'name'>): string {
  return `‘${sub.name}’${josa(sub.name, '을/를')} 해지한 것으로 옮겼어요.`
}

/** 해지한 카드 줄: "2026-11-01 해지 · 월 13,500원" */
export function cancelledLine(sub: Subscription): string {
  return `${sub.cancelledOn} 해지 · ${priceText(sub)}`
}

/** 다시 쓰기 확인 문장. 월세·관리비는 앞 문장만 */
export function resumeConfirmText(sub: Subscription): string {
  const first = `‘${sub.name}’${josa(sub.name, '을/를')} 다시 쓰는 것으로 옮길까요?`
  return kindOf(sub) === 'housing' ? first : `${first} 모으기의 ‘줄어든 고정비’에서도 빠져요.`
}

/** 해지한 날 최신순, 같으면 이름 순 */
export function sortCancelled(subs: readonly Subscription[]): Subscription[] {
  return [...subs].sort((a, b) => (b.cancelledOn ?? '').localeCompare(a.cancelledOn ?? '') || a.name.localeCompare(b.name, 'ko'))
}
