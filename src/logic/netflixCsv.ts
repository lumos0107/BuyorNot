import type { UsageRecord } from './usageRecords'

// PRD F26 13-2: 넷플릭스 시청 기록 CSV("모두 다운로드")를 브라우저 안에서 읽는다. 파일에는 제목과 날짜만 있어
// 시청 시간은 알 수 없다(실제 이용 시간을 만들지 않는다). 제목은 같은 날 중복을 가리는 데만 쓰고 저장하지 않는다.

export type DayOrder = 'md' | 'dm'
export type NetflixRow = { title: string; day: string }
export type NetflixParse =
  | {
      ok: true
      rows: NetflixRow[]
      /** 같은 날 같은 제목이라 하나로 친 줄 수 */
      merged: number
      /** 날짜를 읽지 못한 줄 수 */
      skipped: number
      /** 슬래시 날짜를 읽은 순서와, 파일만으로 정해지지 않았는지 */
      order: DayOrder
      ambiguous: boolean
    }
  | { ok: false; reason: 'format' | 'empty' | 'no-dates' }

/** 따옴표 안의 쉼표·줄바꿈과 겹따옴표("")를 처리하는 작은 CSV 해석기 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const pad = (n: number) => String(n).padStart(2, '0')

function realDay(y: number, m: number, d: number): string | null {
  const date = new Date(y, m - 1, d, 12)
  if (y < 1900 || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const DOTS = /^(\d{2}|\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$/
const SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/

function readDay(raw: string, order: DayOrder): string | null {
  const text = raw.trim()
  let m = ISO.exec(text)
  if (m) return realDay(Number(m[1]), Number(m[2]), Number(m[3]))
  m = DOTS.exec(text)
  if (m) return realDay(fullYear(m[1]), Number(m[2]), Number(m[3]))
  m = SLASH.exec(text)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    return order === 'md' ? realDay(fullYear(m[3]), a, b) : realDay(fullYear(m[3]), b, a)
  }
  return null
}

const looksLikeDate = (raw: string) => [ISO, DOTS, SLASH].some((re) => re.test(raw.trim()))

export function parseNetflixCsv(text: string, preferred?: DayOrder): NetflixParse {
  const rows = parseCsv(text.replace(/^﻿/, ''))
  if (rows.length === 0) return { ok: false, reason: 'empty' }
  const first = rows[0]
  const hasHeader = !looksLikeDate(first[first.length - 1] ?? '')
  if (hasHeader) {
    const header = first.map((cell) => cell.trim().toLowerCase())
    const okHeader = header.length >= 2 && /title|제목/.test(header[0]) && /date|날짜/.test(header[header.length - 1])
    if (!okHeader) return { ok: false, reason: 'format' }
  }
  const data = hasHeader ? rows.slice(1) : rows
  if (data.length === 0) return { ok: false, reason: 'empty' }

  // 슬래시 날짜의 순서: 앞 숫자가 12보다 크면 일/월, 뒤 숫자가 12보다 크면 월/일. 정해지지 않으면 월/일(또는 고른 순서)
  let sawDayFirst = false
  let sawMonthFirst = false
  for (const row of data) {
    const m = SLASH.exec((row[row.length - 1] ?? '').trim())
    if (!m) continue
    if (Number(m[1]) > 12) sawDayFirst = true
    if (Number(m[2]) > 12) sawMonthFirst = true
  }
  const ambiguous = !sawDayFirst && !sawMonthFirst
  const order: DayOrder = ambiguous ? (preferred ?? 'md') : sawDayFirst && !sawMonthFirst ? 'dm' : 'md'

  const out: NetflixRow[] = []
  const seen = new Set<string>()
  let merged = 0
  let skipped = 0
  for (const row of data) {
    const day = row.length >= 2 ? readDay(row[row.length - 1], order) : null
    if (!day) {
      skipped += 1
      continue
    }
    const title = row.slice(0, -1).join(',').trim()
    const key = `${day}\u0000${title}`
    if (seen.has(key)) {
      merged += 1
      continue
    }
    seen.add(key)
    out.push({ title, day })
  }
  if (out.length === 0) return { ok: false, reason: 'no-dates' }
  return { ok: true, rows: out, merged, skipped, order, ambiguous }
}

/** 날짜별 기록 수로 바꾼 출처 기록. 제목은 남기지 않는다 */
export function netflixRecord(rows: readonly NetflixRow[], now: Date): UsageRecord {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.day, (counts.get(row.day) ?? 0) + 1)
  const days = [...counts.keys()].sort()
  return {
    source: 'netflix-csv',
    from: days[0],
    to: days[days.length - 1],
    updatedAt: now.toISOString(),
    entries: days.map((day) => ({ day, plays: counts.get(day)! })),
  }
}
