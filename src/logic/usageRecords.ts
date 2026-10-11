import { calendarDaysBetween } from './dates'

// PRD F26 구독 이용 분석: 출처 기록(수집)과 분석을 나눈다.
// 출처마다 해석기가 공통 기록(날짜별 기록 수, 시간이 있는 출처만 시간)을 만들고, 분석은 이 기록만 본다.
// 이용 일수·기록 수·실제 이용 시간은 서로 다른 지표라 따로 세고, 수집 기간 밖은 일부임을 밝힌다.

/** 지금은 넷플릭스 시청 기록 파일만. 나중에 Spotify 데이터 파일, 앱의 기기 사용 시간을 다른 출처로 더한다 */
export type UsageSource = 'netflix-csv'
export const SOURCE_LABEL: Record<UsageSource, string> = { 'netflix-csv': '넷플릭스 시청 기록' }

/** 하루의 기록: 기록 수(재생·시청 기록 수)와, 실제 이용 시간이 있는 출처만 분 */
export type UsageDay = { day: string; plays: number; minutes?: number }

export type UsageRecord = {
  source: UsageSource
  /** 수집 기간: 파일에 들어 있는 기록의 첫 날·마지막 날 (YYYY-MM-DD) */
  from: string
  to: string
  /** 가져온 시각 (ISO) */
  updatedAt: string
  /** 날짜순, 같은 날은 하나 */
  entries: UsageDay[]
}

export type Period = { from: string; to: string }

export type UsageSummary = {
  /** 기간 안의 기록이 있는 날짜 수 */
  days: number
  /** 기간 안의 기록 수 */
  plays: number
  /** 기간 안의 실제 이용 시간(분). 시간이 없는 출처면 null */
  minutes: number | null
  /** 분석 기간이 수집 기간과 겹치는 정도 */
  coverage: 'full' | 'partial' | 'none'
  coveredDays: number
  periodDays: number
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function toDate(day: string): Date | null {
  const m = DAY_RE.exec(day)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d, 12)
  return y >= 1900 && date.getMonth() === mo - 1 && date.getDate() === d ? date : null
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** 오늘을 포함한 최근 n일 */
export function recentPeriod(today: Date, days = 30): Period {
  return { from: dayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1))), to: dayOf(today) }
}

function spanDays(from: string, to: string): number {
  const a = toDate(from)
  const b = toDate(to)
  return a && b && from <= to ? calendarDaysBetween(a, b) + 1 : 0
}

export function analyzeRecord(record: UsageRecord, period: Period): UsageSummary {
  const inPeriod = record.entries.filter((entry) => entry.day >= period.from && entry.day <= period.to)
  const timed = record.entries.some((entry) => entry.minutes !== undefined)
  const periodDays = spanDays(period.from, period.to)
  const overlapFrom = period.from > record.from ? period.from : record.from
  const overlapTo = period.to < record.to ? period.to : record.to
  const coveredDays = spanDays(overlapFrom, overlapTo)
  return {
    days: inPeriod.length,
    plays: inPeriod.reduce((sum, entry) => sum + entry.plays, 0),
    minutes: timed ? inPeriod.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0) : null,
    coverage: coveredDays === 0 ? 'none' : coveredDays === periodDays ? 'full' : 'partial',
    coveredDays,
    periodDays,
  }
}

/** 같은 출처는 합치지 않고 바꾼다(같은 파일을 다시 가져와도 두 번 세지 않게). 다른 출처는 남긴다 */
export function replaceRecord(records: readonly UsageRecord[] | undefined, next: UsageRecord): UsageRecord[] {
  return [...(records ?? []).filter((record) => record.source !== next.source), next]
}

/** 기록이 있는 가장 늦은 날 (쓴 증거). 기록이 없으면 null */
export function latestUseDay(records: readonly UsageRecord[] | undefined): string | null {
  const days = (records ?? []).flatMap((record) => record.entries.map((entry) => entry.day))
  return days.length > 0 ? days.reduce((a, b) => (b > a ? b : a)) : null
}

const SOURCES = new Set<string>(['netflix-csv'])
const isDay = (v: unknown) => typeof v === 'string' && toDate(v) !== null
const isCount = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min

/** 복원 검증: 출처 중복 없음, 실제 날짜, 기록 수 1 이상 정수, 시간 0 이상 정수, 같은 날 중복 없음 */
export function isUsageRecords(v: unknown): boolean {
  if (!Array.isArray(v) || v.length > SOURCES.size) return false
  const seen = new Set<string>()
  for (const item of v) {
    if (typeof item !== 'object' || item === null) return false
    const o = item as Record<string, unknown>
    if (typeof o.source !== 'string' || !SOURCES.has(o.source) || seen.has(o.source)) return false
    seen.add(o.source)
    if (!isDay(o.from) || !isDay(o.to) || typeof o.updatedAt !== 'string' || !Number.isFinite(Date.parse(o.updatedAt))) return false
    if (!Array.isArray(o.entries) || o.entries.length > 20000) return false
    const days = new Set<string>()
    for (const entry of o.entries) {
      if (typeof entry !== 'object' || entry === null) return false
      const e = entry as Record<string, unknown>
      if (!isDay(e.day) || days.has(e.day as string) || !isCount(e.plays, 1)) return false
      if (e.minutes !== undefined && !isCount(e.minutes, 0)) return false
      days.add(e.day as string)
    }
  }
  return true
}
