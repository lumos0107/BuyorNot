// 저장은 ISO(UTC) 문자열, 표시는 기기의 현지 날짜 (PRD #6)
const pad = (n: number) => String(n).padStart(2, '0')
const DAY_MS = 24 * 60 * 60 * 1000

/** "2026-10-11T00:00:00.000Z" → 현지 기준 "2026-10-11" */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 현지 달력 기준 날짜 차이(to − from). 시각은 무시한다. 일광절약시간이 있어도 반올림으로 맞춘다 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / DAY_MS)
}
