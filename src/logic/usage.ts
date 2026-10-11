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

/** "최근 30일 18시간 · 1시간에 약 750원" / "최근 30일 6번 사용 · 1번에 약 670원". 사용량 정보가 없으면 null */
export function usageText(sub: Subscription): string | null {
  const monthly = monthlyEquivalent(sub)
  if (sub.exampleUsageMinutes !== undefined) {
    if (sub.exampleUsageMinutes === 0) return '최근 30일 사용 없음'
    const perHour = round10(monthly / (sub.exampleUsageMinutes / 60))
    return `최근 30일 ${formatMinutes(sub.exampleUsageMinutes)} · 1시간에 약 ${formatWon(perHour)}`
  }
  if (sub.exampleUseCount !== undefined) {
    if (sub.exampleUseCount === 0) return '최근 30일 사용 없음'
    return `최근 30일 ${sub.exampleUseCount}번 사용 · 1번에 약 ${formatWon(round10(monthly / sub.exampleUseCount))}`
  }
  return null
}

export type UsageInfo = { source: 'manual' | 'example'; text: string }

/** 카드에 보여줄 사용량 (F16·F19). "오늘 썼어요" 기록이 있으면 그것을, 없으면 예시를 쓴다 */
export function usageInfo(sub: Subscription, today: Date): UsageInfo | null {
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
