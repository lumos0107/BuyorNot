import { desireEffect } from './desire'
import { formatFixed } from './number'
import { isExample, validateNote, type Satisfaction, type WishItem } from './wishlist'

// PRD F12 결정 기록 요약·구매 후 회고
// 요약은 필터와 상관없이 전체 기록 기준이다. 구매 포기 금액은 등록 가격의 합이며 절약액이 아니다.

const DAY_MS = 24 * 60 * 60 * 1000
export const RETRO_AFTER_MS = 7 * DAY_MS
/** 구매함으로 옮긴 직후 결정 알림 아래에 보이는 회고 안내 (F18). 일수는 회고가 열리는 때(RETRO_AFTER_MS)에서 만들어 어긋나지 않게 한다 */
export const RETRO_NOTICE = `${RETRO_AFTER_MS / DAY_MS}일 뒤부터 결정 기록에서 잘 샀는지 적을 수 있어요.`

export type HistorySummary = {
  skippedCount: number
  skippedTotal: number
  /** 시급으로 환산한 시간(소수 첫째 자리). 시급이 없으면 null */
  hoursLabel: string | null
  /** 결정 기록에 "(예시)" 기록이 섞여 있는지 */
  includesExample: boolean
  reviewedCount: number
  regretCount: number
  /** 결정한 기록 중 고민하는 동안 갖고 싶은 정도가 줄어든 것과 그중 구매 포기 (F22) */
  desireDropped: number
  desireDroppedSkipped: number
}

export function historySummary(items: readonly WishItem[], hourlyWage: number | null): HistorySummary {
  const decided = items.filter((item) => item.status !== 'considering')
  const skipped = decided.filter((item) => item.status === 'skipped')
  const skippedTotal = skipped.reduce((sum, item) => sum + item.priceKrw, 0)
  const reviewed = decided.filter((item) => item.status === 'purchased' && item.satisfaction)
  const effect = desireEffect(decided)
  return {
    skippedCount: skipped.length,
    skippedTotal,
    hoursLabel: hourlyWage ? formatFixed(skippedTotal / hourlyWage, 1) : null,
    includesExample: decided.some((item) => isExample(item.name)),
    reviewedCount: reviewed.length,
    regretCount: reviewed.filter((item) => item.satisfaction === 'regret').length,
    desireDropped: effect.dropped,
    desireDroppedSkipped: effect.droppedSkipped,
  }
}

/** 구매함 기록은 결정 시각 + 7일 정각부터 회고를 묻는다 */
export function reviewDue(item: WishItem, now: Date): boolean {
  if (item.status !== 'purchased' || !item.decidedAt) return false
  return now.getTime() - Date.parse(item.decidedAt) >= RETRO_AFTER_MS
}

/** 회고를 저장하거나 고친다. 메모가 비면 지운다 */
export function review(item: WishItem, satisfaction: Satisfaction, note: string | undefined, now: Date): WishItem {
  const checked = validateNote(note ?? '')
  const next: WishItem = { ...item, satisfaction, updatedAt: now.toISOString() }
  if (checked.value) next.reviewNote = checked.value
  else delete next.reviewNote
  return next
}

/** 아직 회고를 물을 때가 안 된 구매 기록 중 가장 가까운 시점까지 남은 ms (열린 화면 갱신용) */
export function nextRetroDelay(items: readonly WishItem[], now: Date): number | null {
  const upcoming = items
    .filter((item) => item.status === 'purchased' && item.decidedAt && !item.satisfaction)
    .map((item) => Date.parse(item.decidedAt!) + RETRO_AFTER_MS - now.getTime())
    .filter((ms) => ms > 0)
  return upcoming.length > 0 ? Math.min(...upcoming) : null
}
