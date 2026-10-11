// 저장은 ISO(UTC) 문자열, 표시는 기기의 현지 날짜 (PRD #6)
const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-11T00:00:00.000Z" → 현지 기준 "2026-10-11" */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
