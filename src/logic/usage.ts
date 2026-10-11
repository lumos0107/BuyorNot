import { calendarDaysBetween } from './dates'
import { formatWon } from './number'
import { monthlyEquivalent, parseDay, type Subscription } from './subscriptions'

// PRD F16 구독 사용량과 F19 "오늘 썼어요". OTT·음악은 사용 시간, 배달·쇼핑 멤버십은 사용 횟수로 보고
// 한 번(1시간·1번)에 드는 돈을 보여준다. 직접 기록(F19)이 있으면 그것을, 없으면 예시 구독의 예시 숫자를 쓴다.
// 자동 연동 계획은 docs/구독_사용시간_연동_계획.md에 있다.
const round10 = (won: number) => Math.round(won / 10) * 10

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes}분`
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`
}

function minutesText(sub: Subscription, minutes: number): string {
  if (minutes === 0) return '최근 30일 사용 없음'
  return `최근 30일 ${formatMinutes(minutes)} · 1시간에 약 ${formatWon(round10(monthlyEquivalent(sub) / (minutes / 60)))}`
}

function countText(sub: Subscription, count: number): string {
  if (count === 0) return '최근 30일 사용 없음'
  return `최근 30일 ${count}번 사용 · 1번에 약 ${formatWon(round10(monthlyEquivalent(sub) / count))}`
}

/** "최근 30일 18시간 · 1시간에 약 750원" / "최근 30일 6번 사용 · 1번에 약 670원". 사용량 정보가 없으면 null */
export function usageText(sub: Subscription): string | null {
  if (sub.exampleUsageMinutes !== undefined) return minutesText(sub, sub.exampleUsageMinutes)
  if (sub.exampleUseCount !== undefined) return countText(sub, sub.exampleUseCount)
  return null
}

/** 직접 적는 사용량 검사 (F25): 사용 시간은 0~720시간(소수 첫째 자리까지, 분으로), 횟수는 0~999 정수 */
export function validateUsageInput(kind: 'minutes' | 'count', raw: string): { value?: number; error?: string } {
  const text = raw.trim()
  if (text === '') return { error: '숫자를 적어 주세요' }
  if (kind === 'minutes') {
    const hours = /^\d+(\.\d)?$/.test(text) ? Number(text) : NaN
    if (!(hours >= 0 && hours <= 720)) return { error: '사용 시간은 0~720시간, 소수 첫째 자리까지 적어 주세요' }
    return { value: Math.round(hours * 60) }
  }
  const count = /^\d+$/.test(text) ? Number(text) : NaN
  if (!(count >= 0 && count <= 999)) return { error: '사용 횟수는 0~999 사이 정수로 적어 주세요' }
  return { value: count }
}

export type UsageInfo =
  | { source: 'manual' | 'example'; text: string }
  /** 직접 적은 사용량 (F25): 적은 날과, 30일이 넘어 다시 적어야 하는지 */
  | { source: 'entered'; text: string; day: string; stale: boolean }

/** 카드에 보여줄 사용량. 직접 적은 사용량(F25) → "오늘 썼어요" 기록(F19) → 예시(F16) 순서로 쓴다 */
export function usageInfo(sub: Subscription, today: Date): UsageInfo | null {
  if (sub.usageEntry) {
    const { kind, value, day } = sub.usageEntry
    const entered = parseDay(day)
    return {
      source: 'entered',
      text: kind === 'minutes' ? minutesText(sub, value) : countText(sub, value),
      day,
      stale: entered ? calendarDaysBetween(entered, today) > 30 : true,
    }
  }
  if (sub.useDates && sub.useDates.length > 0) {
    // 최근 30일 = 오늘 포함 30일
    const count = sub.useDates.filter((d) => {
      const day = parseDay(d)
      if (!day) return false
      const ago = calendarDaysBetween(day, today)
      return ago >= 0 && ago < 30
    }).length
    if (count === 0) return { source: 'manual', text: '최근 30일 사용 없음' }
    // 오늘 썼어요는 하루에 한 번 기록하므로 횟수가 아니라 쓴 날 수로 말한다
    return { source: 'manual', text: `최근 30일 중 ${count}일 사용 · 쓴 날 하루에 약 ${formatWon(round10(monthlyEquivalent(sub) / count))}` }
  }
  const text = usageText(sub)
  return text ? { source: 'example', text } : null
}
