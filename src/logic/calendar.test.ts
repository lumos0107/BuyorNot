import { describe, expect, it } from 'vitest'
import { buildIcs, escapeIcsText, foldIcsLine, googleCalendarUrl, icsFileName } from './calendar'
import { formatDate } from './dates'
import type { WishItem } from './wishlist'

// PRD F35 고민 끝나는 날 캘린더 (AC59). 화면은 src/App.calendar.test.tsx가 본다.
// 계획 Task 15의 영어 테스트 이름은 해당 it 위 `// plan:` 주석에 있다.

// AC59 입력: 지금 2026-10-11 09:00(한국 시간 = 00:00Z), 고민 중 '무선 헤드폰'(id h1, reviewAt 2026-10-14T00:00:00Z, 이유 '선이 끊겨서')
const NOW = new Date('2026-10-11T00:00:00Z')
const TITLE = '살까말까: ‘무선 헤드폰’ 고민 기간 끝'
const OPEN_LINE = '살까말까를 열어 갖고 싶은 정도를 다시 적고 살지 정해 보세요.'
const APP_URL = 'https://lumos0107.github.io/BuyorNot/'

function headphones(over: Partial<WishItem> = {}): WishItem {
  return {
    id: 'h1',
    name: '무선 헤드폰',
    priceKrw: 129000,
    reason: '선이 끊겨서',
    url: null,
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    reviewAt: '2026-10-14T00:00:00.000Z',
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}

const bytes = (text: string) => new TextEncoder().encode(text).length
/** 접힌 줄을 푼다: 줄바꿈 바로 뒤의 공백 한 칸까지 지운다(RFC 5545 3.1) */
const unfold = (ics: string) => ics.replace(/\r\n /g, '')
/** 줄 끝 CRLF로 나눈 줄(마지막 빈 조각은 뺀다). 접힌 줄은 그대로 둔다 */
const physicalLines = (ics: string) => ics.split('\r\n').slice(0, -1)
const logicalLines = (ics: string) => physicalLines(unfold(ics))
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

describe('escapeIcsText', () => {
  it('역슬래시·세미콜론·쉼표 앞에 역슬래시를 붙인다', () => {
    expect(escapeIcsText('a\\b')).toBe('a\\\\b')
    expect(escapeIcsText('a;b')).toBe('a\\;b')
    expect(escapeIcsText('a,b')).toBe('a\\,b')
  })

  it('줄바꿈(LF·CRLF·CR)은 글자 \\n 하나로 바꾼다', () => {
    expect(escapeIcsText('한 줄\n두 줄')).toBe('한 줄\\n두 줄')
    expect(escapeIcsText('한 줄\r\n두 줄')).toBe('한 줄\\n두 줄')
    expect(escapeIcsText('한 줄\r두 줄')).toBe('한 줄\\n두 줄')
  })

  it('역슬래시를 먼저 처리해서 새로 붙인 역슬래시가 다시 겹치지 않는다', () => {
    expect(escapeIcsText('\\;,')).toBe('\\\\\\;\\,')
    expect(escapeIcsText('가나다')).toBe('가나다')
  })
})

describe('foldIcsLine', () => {
  it('75바이트 이하인 줄은 그대로 둔다', () => {
    const exactly75 = 'a'.repeat(75)
    expect(foldIcsLine(exactly75)).toBe(exactly75)
    expect(foldIcsLine('가'.repeat(25))).toBe('가'.repeat(25)) // 25 × 3 = 75
    expect(foldIcsLine('')).toBe('')
  })

  it('76바이트부터 접고, 이어지는 줄은 공백 한 칸으로 시작하며 그 공백도 75바이트에 센다', () => {
    const folded = foldIcsLine('a'.repeat(76))
    expect(folded).toBe(`${'a'.repeat(75)}\r\n a`)
    const long = foldIcsLine('a'.repeat(225)).split('\r\n') // 75 + 74 + 74 + 2
    expect(long.map(bytes)).toEqual([75, 75, 75, 3])
    expect(long[1]).toBe(` ${'a'.repeat(74)}`)
    expect(long[2]).toBe(` ${'a'.repeat(74)}`)
    expect(long[3]).toBe(` ${'a'.repeat(2)}`)
  })

  it('한글(3바이트)은 글자 사이에서만 접는다', () => {
    const folded = foldIcsLine('가'.repeat(26)).split('\r\n')
    expect(folded).toEqual(['가'.repeat(25), ' 가'])
    const many = foldIcsLine('가'.repeat(100)).split('\r\n')
    expect(many.every((line) => bytes(line) <= 75)).toBe(true)
    expect(many.join('\r\n').replace(/\r\n /g, '')).toBe('가'.repeat(100))
  })

  it('서로게이트 쌍(이모지, 4바이트)을 가르지 않고 다음 줄로 넘긴다', () => {
    const folded = foldIcsLine(`${'a'.repeat(73)}😀`).split('\r\n')
    expect(folded).toEqual(['a'.repeat(73), ' 😀'])
    expect(folded.some((line) => LONE_SURROGATE.test(line))).toBe(false)
  })

  it('앞에 붙는 글자 수가 얼마든 어느 줄도 75바이트를 넘지 않고 글자가 갈리지 않으며 풀면 원래대로다', () => {
    for (let lead = 0; lead <= 160; lead += 1) {
      const line = `${'a'.repeat(lead)}😀가😀나😀${'b'.repeat(lead % 7)}다😀`
      const physical = foldIcsLine(line).split('\r\n')
      expect(Math.max(...physical.map(bytes)), `앞 ${lead}글자`).toBeLessThanOrEqual(75)
      expect(
        physical.some((part) => LONE_SURROGATE.test(part)),
        `앞 ${lead}글자`,
      ).toBe(false)
      expect(physical.join('\r\n').replace(/\r\n /g, ''), `앞 ${lead}글자`).toBe(line)
      expect(physical.slice(1).every((part) => part.startsWith(' ')), `앞 ${lead}글자`).toBe(true)
    }
  })
})

describe('buildIcs', () => {
  it('AC59: 줄 끝은 CRLF이고 BEGIN·END 구성이 순서대로 갖춰진다', () => {
    const ics = buildIcs(headphones(), NOW)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    // CRLF가 아닌 줄바꿈이 없다
    expect(ics).not.toMatch(/(?<!\r)\n/)
    expect(ics).not.toMatch(/\r(?!\n)/)
    const names = logicalLines(ics).map((line) => line.split(':')[0])
    expect(names).toEqual([
      'BEGIN', // VCALENDAR
      'VERSION',
      'PRODID',
      'BEGIN', // VEVENT
      'UID',
      'DTSTAMP',
      'DTSTART',
      'DTEND',
      'SUMMARY',
      'DESCRIPTION',
      'BEGIN', // VALARM
      'ACTION',
      'DESCRIPTION',
      'TRIGGER',
      'END', // VALARM
      'END', // VEVENT
      'END', // VCALENDAR
    ])
    const lines = logicalLines(ics)
    expect(lines.filter((line) => line.startsWith('BEGIN:') || line.startsWith('END:'))).toEqual([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'BEGIN:VALARM',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ])
    expect(lines).toContain('VERSION:2.0')
    expect(lines).toContain('PRODID:-//BuyorNot//KO')
    expect(lines).toContain('ACTION:DISPLAY')
    expect(lines).toContain('TRIGGER:PT0M')
  })

  it('AC59: DTSTAMP는 내려받은 시각, DTSTART는 고민이 끝나는 시각, DTEND는 15분 뒤이고 모두 UTC다', () => {
    const lines = logicalLines(buildIcs(headphones(), new Date('2026-10-11T00:12:34.567Z')))
    expect(lines).toContain('DTSTAMP:20261011T001234Z') // 밀리초는 뗀다
    expect(lines).toContain('DTSTART:20261014T000000Z')
    expect(lines).toContain('DTEND:20261014T001500Z')
  })

  it('AC59: 끝나는 시각이 0시가 아니고 밀리초가 있어도 UTC로 쓰고, 15분 뒤가 시각을 넘겨도 맞다', () => {
    const lines = logicalLines(buildIcs(headphones({ reviewAt: '2026-12-31T23:50:30.250Z' }), NOW))
    expect(lines).toContain('DTSTART:20261231T235030Z')
    expect(lines).toContain('DTEND:20270101T000530Z')
  })

  it('AC59: 제목·UID·알림 문구는 PRD와 같고 설명은 세 줄(처음 적은 이유 포함)이다', () => {
    const lines = logicalLines(buildIcs(headphones(), NOW))
    expect(lines).toContain(`SUMMARY:${TITLE}`)
    expect(lines).toContain('UID:h1@buyornot')
    expect(lines).toContain(`DESCRIPTION:처음 적은 이유: 선이 끊겨서\\n${OPEN_LINE}\\n${APP_URL}`)
    // 알림(VALARM)의 제목도 같은 제목이다
    const alarm = lines.slice(lines.indexOf('BEGIN:VALARM'), lines.indexOf('END:VALARM') + 1)
    expect(alarm).toEqual(['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${TITLE}`, 'TRIGGER:PT0M', 'END:VALARM'])
  })

  it('AC59: 이름과 이유의 쉼표·세미콜론은 \\,·\\;로 쓴다', () => {
    const lines = logicalLines(buildIcs(headphones({ name: '헤드폰, 케이스; 세트', reason: '선이 끊겨서, 자꾸; 불편해서' }), NOW))
    expect(lines).toContain('SUMMARY:살까말까: ‘헤드폰\\, 케이스\\; 세트’ 고민 기간 끝')
    expect(lines).toContain(`DESCRIPTION:처음 적은 이유: 선이 끊겨서\\, 자꾸\\; 불편해서\\n${OPEN_LINE}\\n${APP_URL}`)
    expect(lines).toContain('DESCRIPTION:살까말까: ‘헤드폰\\, 케이스\\; 세트’ 고민 기간 끝')
  })

  it('이유에 줄바꿈이나 역슬래시가 있어도 줄이 갈라지지 않는다', () => {
    const lines = logicalLines(buildIcs(headphones({ reason: '첫째\n둘째\\셋째' }), NOW))
    expect(lines).toContain(`DESCRIPTION:처음 적은 이유: 첫째\\n둘째\\\\셋째\\n${OPEN_LINE}\\n${APP_URL}`)
    expect(lines).toHaveLength(17)
  })

  it('AC59: 이름이 80자(한글·이모지 섞음)여도 모든 줄이 75바이트 이하이고 글자가 갈리지 않는다', () => {
    const name = '가😀나'.repeat(20) // 글자 수 80(이모지는 둘로 센다), UTF-8로는 200바이트
    expect(name).toHaveLength(80)
    const reason = '이모지😀와 한글을 섞은 아주 긴 이유입니다. '.repeat(5)
    const ics = buildIcs(headphones({ name, reason }), NOW)
    const physical = physicalLines(ics)
    expect(Math.max(...physical.map(bytes))).toBeLessThanOrEqual(75)
    // 접힌 줄이 실제로 생겼다
    expect(physical.some((line) => line.startsWith(' '))).toBe(true)
    // 줄을 푼 결과가 접기 전과 같다: 글자가 사라지거나 바뀌지 않았다
    const lines = logicalLines(ics)
    expect(lines).toContain(`SUMMARY:살까말까: ‘${name}’ 고민 기간 끝`)
    expect(lines).toContain(`DESCRIPTION:처음 적은 이유: ${reason}\\n${OPEN_LINE}\\n${APP_URL}`)
    // 서로게이트 쌍이 갈린 줄이 없다
    expect(physical.some((line) => LONE_SURROGATE.test(line))).toBe(false)
    // 줄 하나를 UTF-8로 바꿨다가 되돌려도 같다(글자 중간에서 자르면 깨진 글자가 생긴다)
    const decoder = new TextDecoder('utf-8', { fatal: true })
    for (const line of physical) expect(decoder.decode(new TextEncoder().encode(line))).toBe(line)
  })

  it('AC59: 3일 연장해 끝나는 시각이 바뀌면 DTSTART·DTEND가 따라 바뀐다', () => {
    const lines = logicalLines(buildIcs(headphones({ reviewAt: '2026-10-17T00:00:00.000Z', extensions: 1 }), NOW))
    expect(lines).toContain('DTSTART:20261017T000000Z')
    expect(lines).toContain('DTEND:20261017T001500Z')
  })
})

describe('icsFileName', () => {
  it('AC59: buyornot-{끝나는 날}.ics', () => {
    // 한국 시간 09:00이다: 어느 시간대에서든 현지 날짜는 같다
    expect(icsFileName(headphones({ reviewAt: new Date(2026, 9, 14, 9).toISOString() }))).toBe('buyornot-2026-10-14.ics')
    expect(icsFileName(headphones({ reviewAt: new Date(2026, 9, 17, 9).toISOString() }))).toBe('buyornot-2026-10-17.ics')
  })

  // plan: icsFileName uses the local date of reviewAt
  it('끝나는 시각이 현지 자정 직후여도 파일 이름은 현지 날짜다(UTC 날짜가 아니다)', () => {
    const justAfterMidnight = new Date(2026, 9, 14, 0, 5).toISOString()
    expect(icsFileName(headphones({ reviewAt: justAfterMidnight }))).toBe(`buyornot-${formatDate(justAfterMidnight)}.ics`)
    expect(icsFileName(headphones({ reviewAt: justAfterMidnight }))).toBe('buyornot-2026-10-14.ics')
    const justBeforeMidnight = new Date(2026, 9, 14, 23, 55).toISOString()
    expect(icsFileName(headphones({ reviewAt: justBeforeMidnight }))).toBe('buyornot-2026-10-14.ics')
  })
})

describe('googleCalendarUrl', () => {
  const params = (item: WishItem) => new URL(googleCalendarUrl(item)).searchParams

  it('AC59: 구글 캘린더 주소의 제목과 dates는 PRD와 같다', () => {
    const url = googleCalendarUrl(headphones())
    expect(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&text=')).toBe(true)
    expect(url).toContain('&dates=20261014T000000Z/20261014T001500Z&details=')
    const search = params(headphones())
    expect([...search.keys()]).toEqual(['action', 'text', 'dates', 'details'])
    expect(search.get('action')).toBe('TEMPLATE')
    expect(search.get('text')).toBe(TITLE)
    expect(search.get('dates')).toBe('20261014T000000Z/20261014T001500Z')
  })

  it('AC59: 구글 캘린더의 details에는 처음 적은 이유가 없고 뒤의 두 줄만 있다', () => {
    const url = googleCalendarUrl(headphones())
    expect(params(headphones()).get('details')).toBe(`${OPEN_LINE}\n${APP_URL}`)
    expect(decodeURIComponent(url)).not.toContain('선이 끊겨서')
    expect(decodeURIComponent(url)).not.toContain('처음 적은 이유')
  })

  it('이름에 &, #, +, 공백, 쉼표가 있어도 제목이 그대로 전달된다', () => {
    const name = 'A&B #1 +2 세트, 흰색;검정'
    const search = params(headphones({ name }))
    expect(search.get('text')).toBe(`살까말까: ‘${name}’ 고민 기간 끝`)
    // 이름 속 & 때문에 매개변수가 늘어나지 않는다
    expect([...search.keys()]).toEqual(['action', 'text', 'dates', 'details'])
    expect(googleCalendarUrl(headphones({ name }))).not.toMatch(/#/)
  })

  it('AC59: 3일 연장 뒤에는 dates가 새 시각을 따른다', () => {
    expect(params(headphones({ reviewAt: '2026-10-17T00:00:00.000Z' })).get('dates')).toBe('20261017T000000Z/20261017T001500Z')
  })
})
