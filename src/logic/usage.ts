import { formatWon } from './number'
import { monthlyEquivalent, type Subscription } from './subscriptions'

// PRD F16 구독 사용량 (예시). OTT·음악은 사용 시간, 배달·쇼핑 멤버십은 사용 횟수로 보고
// 한 번(1시간·1번)에 드는 돈을 보여준다. 지금은 예시 구독의 예시 숫자만 있고, 실제 연동 계획은
// docs/구독_사용시간_연동_계획.md에 있다.
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
