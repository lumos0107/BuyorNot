import { formatDate } from './dates'
import type { DesireCheck, DesireLevel, WishItem } from './wishlist'

// PRD F22 고민 노트: 갖고 싶은 정도(1~5)를 담을 때와 고민하는 동안 날마다 기록하고, 고민하면서 어떻게 바뀌었는지 보여준다.
// "줄었어요" 같은 판정은 처음 값보다 뒤 날짜의 기록이 있을 때만 한다. 같은 날 안에서 바꾼 것은 값만 보인다.
// 카드·사기 전 점검·결정 기록이 모두 이 판정(desireChange)을 쓴다.

export const DESIRE_LEVELS = [1, 2, 3, 4, 5] as const satisfies readonly DesireLevel[]
export const DESIRE_TEXT: Record<DesireLevel, string> = { 1: '별로', 2: '조금', 3: '보통', 4: '많이', 5: '아주 많이' }
/** 새 날짜를 기록할 때 남기는 개수: 첫 기록 + 최근 99개 ("처음" 값이 바뀌지 않게) */
export const DESIRE_KEEP = 100
/** 복원할 때 받는 최대 개수. 복원한 기록은 새 날짜를 기록할 때까지 줄이지 않는다 */
export const DESIRE_RESTORE_MAX = 400

const byDay = (a: DesireCheck, b: DesireCheck) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)

/** 날짜순 기록. 복원한 기록은 순서가 섞여 있을 수 있다 */
function sortedChecks(item: Pick<WishItem, 'desireChecks'>): DesireCheck[] {
  return [...(item.desireChecks ?? [])].sort(byDay)
}

/** 오늘(기기 현지 날짜)의 정도를 기록한다. 같은 날이면 그날 값을 바꾼다.
 *  새 날짜로 100개를 넘으면 첫 기록과 방금 고른 오늘 기록을 남기고, 나머지는 최근 것부터 채운다 */
export function checkDesire(item: WishItem, level: DesireLevel, now: Date): WishItem {
  const day = formatDate(now.toISOString())
  const current = sortedChecks(item)
  let next: DesireCheck[]
  if (current.some((check) => check.day === day)) {
    next = current.map((check) => (check.day === day ? { day, level } : check))
  } else {
    next = [...current, { day, level }].sort(byDay)
    if (next.length > DESIRE_KEEP) {
      // 기기 날짜를 되돌려 빈 날에 기록해도 방금 고른 오늘 기록이 잘리지 않게 한다
      const keep = new Set([next[0].day, day])
      const rest = next.filter((check) => !keep.has(check.day))
      for (const check of rest.slice(rest.length - (DESIRE_KEEP - keep.size))) keep.add(check.day)
      next = next.filter((check) => keep.has(check.day))
    }
  }
  return { ...item, desireChecks: next, updatedAt: now.toISOString() }
}

type Series = { label: '담을 때' | '처음'; points: DesireCheck[] }

// 처음 값(담을 때 정도)을 맨 앞에 두고 기록을 날짜순으로 잇는다. 담을 때 정도가 없으면 가장 이른 기록이 처음 값이다.
// 담을 때 날짜는 저장해 둔 날을 쓰고, 없는 이전 기록만 등록 시각의 현지 날짜로 본다
function series(item: WishItem): Series | null {
  const checks = sortedChecks(item)
  if (item.desireStart !== undefined) {
    const day = item.desireStartDay ?? formatDate(item.createdAt)
    return { label: '담을 때', points: [{ day, level: item.desireStart }, ...checks] }
  }
  return checks.length > 0 ? { label: '처음', points: checks } : null
}

/** 처음 값과 기록을 합친 값의 개수 (결정 기록 카드는 둘 이상일 때 변화 문장을 보인다) */
export function desirePointCount(item: WishItem): number {
  return series(item)?.points.length ?? 0
}

export type DesireChange = { label: '담을 때' | '처음'; from: DesireLevel; to: DesireLevel }

/** 처음 값보다 뒤 날짜의 기록이 있을 때만 처음 값과 가장 늦은 날의 값을 비교한다 */
export function desireChange(item: WishItem): DesireChange | null {
  const s = series(item)
  if (!s || s.points.length < 2) return null
  const first = s.points[0]
  const last = s.points[s.points.length - 1]
  return last.day > first.day ? { label: s.label, from: first.level, to: last.level } : null
}

function deltaText({ from, to }: DesireChange): string {
  if (to < from) return `${from - to} 줄었어요`
  if (to > from) return `${to - from} 늘었어요`
  return '그대로예요'
}

/** "담을 때 4 → 3 → 2 (2 줄었어요)". 값이 6개 이상이면 첫 값·"…"·마지막 3개만 쓴다 */
export function desireTrend(item: WishItem): string | null {
  const s = series(item)
  if (!s) return null
  const levels = s.points.map((point) => String(point.level))
  const shown = levels.length >= 6 ? [levels[0], '…', ...levels.slice(-3)] : levels
  const change = desireChange(item)
  return `${s.label} ${shown.join(' → ')}${change ? ` (${deltaText(change)})` : ''}`
}

/** 결정한 기록 중 고민하는 동안 정도가 줄어든 것과 그중 구매 포기 (결정 기록 요약) */
export function desireEffect(items: readonly WishItem[]): { dropped: number; droppedSkipped: number } {
  let dropped = 0
  let droppedSkipped = 0
  for (const item of items) {
    if (item.status === 'considering') continue
    const change = desireChange(item)
    if (!change || change.to >= change.from) continue
    dropped += 1
    if (item.status === 'skipped') droppedSkipped += 1
  }
  return { dropped, droppedSkipped }
}
