import { formatDate, parseDay } from './dates'
import { toDayIso, type Subscription } from './subscriptions'
import type { WishItem } from './wishlist'

// PRD F35 고민 끝나는 날 캘린더에 넣기: 구글 캘린더 주소와 .ics 파일 내용을 만든다.
// 서버도 알림 약속도 없다. 알림은 캘린더 앱의 설정과 지원에 따른다.

const APP_URL = 'https://lumos0107.github.io/BuyorNot/'
const OPEN_LINE = '살까말까를 열어 갖고 싶은 정도를 다시 적고 살지 정해 보세요.'
const EVENT_MS = 15 * 60 * 1000
/** RFC 5545 3.1: 접은 줄을 포함해 한 줄은 줄바꿈을 뺀 UTF-8 75바이트까지 */
const LINE_BYTES = 75

/** 일정 제목: 살까말까: ‘{상품명}’ 고민 기간 끝 */
function eventTitle(item: WishItem): string {
  return `살까말까: ‘${item.name}’ 고민 기간 끝`
}

/** 2026-10-14T00:00:00.000Z → 20261014T000000Z (UTC, 밀리초 없음) */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** 일정의 시작·끝: 시작은 고민 기간이 끝나는 시각(reviewAt), 끝은 15분 뒤 */
function eventTimes(item: WishItem): { start: string; end: string } {
  const start = new Date(item.reviewAt)
  return { start: utcStamp(start), end: utcStamp(new Date(start.getTime() + EVENT_MS)) }
}

/** 글 값의 \ ; , 와 줄바꿈을 .ics 쓰는 법으로 바꾼다 (역슬래시를 먼저 바꿔야 새로 붙인 것이 겹치지 않는다) */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** UTF-8로 쓴 바이트 수 (코드 포인트 하나) */
function utf8Bytes(codePoint: number): number {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}

/**
 * 한 줄을 UTF-8 75바이트를 넘지 않게 접는다. 접는 곳은 `\r\n `이고 이어지는 줄의 맨 앞 공백도 75바이트에 센다.
 * 코드 포인트 단위로 세므로 한글·이모지(서로게이트 쌍)를 가르지 않는다.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = []
  let current = ''
  let size = 0
  // 첫 줄은 75바이트, 이어지는 줄은 맨 앞 공백 한 칸을 빼고 74바이트
  let limit = LINE_BYTES
  for (const char of line) {
    const width = utf8Bytes(char.codePointAt(0) ?? 0)
    if (size + width > limit) {
      parts.push(current)
      current = ''
      size = 0
      limit = LINE_BYTES - 1
    }
    current += char
    size += width
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** 이유를 넣은 .ics 설명: 세 줄 */
function icsDescription(item: WishItem): string {
  return [`처음 적은 이유: ${item.reason}`, OPEN_LINE, APP_URL].map(escapeIcsText).join('\\n')
}

/** 고민 기간이 끝나는 시각에 알림 요청이 있는 일정 하나짜리 .ics. `now`는 내려받은 시각(DTSTAMP) */
export function buildIcs(item: WishItem, now: Date): string {
  const { start, end } = eventTimes(item)
  const title = escapeIcsText(eventTitle(item))
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BuyorNot//KO',
    'BEGIN:VEVENT',
    `UID:${item.id}@buyornot`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${icsDescription(item)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${title}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map((line) => `${foldIcsLine(line)}\r\n`).join('')
}

/** buyornot-{고민 기간이 끝나는 날의 현지 날짜}.ics */
export function icsFileName(item: WishItem): string {
  return `buyornot-${formatDate(item.reviewAt)}.ics`
}

/** 구글 캘린더에 일정을 채워 여는 주소. 설명에는 처음 적은 이유를 넣지 않고 뒤의 두 줄만 넣는다 */
export function googleCalendarUrl(item: WishItem): string {
  const { start, end } = eventTimes(item)
  const text = encodeURIComponent(eventTitle(item))
  const details = encodeURIComponent(`${OPEN_LINE}\n${APP_URL}`)
  // dates의 값은 숫자·T·Z·/ 뿐이라 따로 부호화하지 않는다
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`
}

const TRIAL_DESCRIPTION = '체험이 끝나는 내일부터 요금이 나갈 수 있어요. 해지는 그 서비스에서 직접 해야 해요.'

export function trialCalendarDay(sub: Pick<Subscription, 'trialEndDate'>): string | null {
  const end = parseDay(sub.trialEndDate ?? '')
  return end ? toDayIso(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1, 12)) : null
}

const trialTitle = (sub: Subscription) => `살까말까: ‘${sub.name}’ 무료 체험 내일 끝`
const compactDay = (day: string) => day.replace(/-/g, '')

export function buildTrialIcs(sub: Subscription, now: Date): string {
  const day = trialCalendarDay(sub)
  if (!day || !sub.trialEndDate) return ''
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BuyorNot//KO', 'BEGIN:VEVENT',
    `UID:${sub.id}-trial-${sub.trialEndDate}@buyornot`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;VALUE=DATE:${compactDay(day)}`,
    `DTEND;VALUE=DATE:${compactDay(sub.trialEndDate)}`,
    `SUMMARY:${escapeIcsText(trialTitle(sub))}`,
    `DESCRIPTION:${escapeIcsText(TRIAL_DESCRIPTION)}\\n${escapeIcsText(APP_URL)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ]
  return lines.map((line) => `${foldIcsLine(line)}\r\n`).join('')
}

export function trialIcsFileName(sub: Subscription): string {
  return `buyornot-trial-${trialCalendarDay(sub)}.ics`
}

export function trialGoogleCalendarUrl(sub: Subscription): string {
  const day = trialCalendarDay(sub)
  if (!day || !sub.trialEndDate) return ''
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(trialTitle(sub))}&dates=${compactDay(day)}/${compactDay(sub.trialEndDate)}&details=${encodeURIComponent(`${TRIAL_DESCRIPTION}\n${APP_URL}`)}`
}
