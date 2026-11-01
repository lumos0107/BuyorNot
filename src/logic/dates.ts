// 저장은 ISO(UTC) 문자열, 표시는 기기의 현지 날짜 (PRD #6)
const pad = (n: number) => String(n).padStart(2, '0')
const DAY_MS = 24 * 60 * 60 * 1000
export const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()

/** 'YYYY-MM-DD'가 실제로 있는 날짜면 현지 Date(정오), 아니면 null */
export function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null
  return new Date(y, mo - 1, d, 12)
}

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
