import { describe, expect, it } from 'vitest'
import { netflixRecord, parseNetflixCsv } from './netflixCsv'

// PRD F26 13-2: 넷플릭스 시청 기록 CSV 해석기 (가짜 예시 데이터만 쓴다)
const NOW = new Date(2026, 9, 11, 9)

describe('넷플릭스 시청 기록 CSV 읽기 (F26, AC45)', () => {
  it('머리글 Title,Date와 따옴표 안의 쉼표·따옴표를 처리하고, 같은 날 같은 제목은 하나로 친다', () => {
    const csv = [
      'Title,Date',
      '"예시 드라마: 시즌 1: 1화",10/9/26',
      '"예시 드라마: 시즌 1: 1화",10/9/26',
      '"예시 영화, 감독판",10/9/26',
      '"따옴표 ""예시""",10/1/26',
      '"날짜가 이상한 줄",어제',
    ].join('\n')
    const parsed = parseNetflixCsv(csv)
    expect(parsed).toMatchObject({ ok: true, merged: 1, skipped: 1, ambiguous: true, order: 'md' })
    if (!parsed.ok) return
    expect(parsed.rows).toEqual([
      { title: '예시 드라마: 시즌 1: 1화', day: '2026-10-09' },
      { title: '예시 영화, 감독판', day: '2026-10-09' },
      { title: '따옴표 "예시"', day: '2026-10-01' },
    ])
  })

  it('한국어 머리글·날짜 형식(YY. M. D.)과 ISO 날짜, 머리글 없는 파일, 줄 끝 CRLF와 BOM을 읽는다', () => {
    expect(parseNetflixCsv('﻿제목,날짜\r\n"예시 1",26. 10. 9.\r\n"예시 2",2026. 9. 30.\r\n')).toMatchObject({
      ok: true,
      rows: [
        { title: '예시 1', day: '2026-10-09' },
        { title: '예시 2', day: '2026-09-30' },
      ],
    })
    expect(parseNetflixCsv('"예시 3",2026-10-02')).toMatchObject({ ok: true, rows: [{ title: '예시 3', day: '2026-10-02' }] })
  })

  it('슬래시 날짜는 파일 안에서 월/일·일/월이 정해지면 그대로, 정해지지 않으면 월/일로 읽고 일/월로 다시 읽을 수 있다', () => {
    expect(parseNetflixCsv('Title,Date\n"a",25/9/26\n"b",3/10/26')).toMatchObject({ ok: true, order: 'dm', ambiguous: false, rows: [{ day: '2026-09-25' }, { day: '2026-10-03' }] })
    expect(parseNetflixCsv('Title,Date\n"a",9/25/26\n"b",10/3/26')).toMatchObject({ ok: true, order: 'md', ambiguous: false, rows: [{ day: '2026-09-25' }, { day: '2026-10-03' }] })
    expect(parseNetflixCsv('Title,Date\n"a",3/10/26', 'dm')).toMatchObject({ ok: true, order: 'dm', ambiguous: true, rows: [{ day: '2026-10-03' }] })
  })

  it('넷플릭스 시청 기록 형식이 아니거나, 기록이 없거나, 날짜를 하나도 못 읽으면 알린다', () => {
    expect(parseNetflixCsv('Name,Amount,Memo\n"a",3,"b"')).toEqual({ ok: false, reason: 'format' })
    expect(parseNetflixCsv('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseNetflixCsv('Title,Date\n')).toEqual({ ok: false, reason: 'empty' })
    expect(parseNetflixCsv('Title,Date\n"a",언젠가\n"b",2026-02-30')).toEqual({ ok: false, reason: 'no-dates' })
  })
})

describe('출처 기록 만들기 (F26)', () => {
  it('날짜별 기록 수와 수집 기간, 가져온 시각을 남기고 제목은 저장하지 않는다', () => {
    const parsed = parseNetflixCsv('Title,Date\n"a",10/9/26\n"b",10/9/26\n"c",10/1/26')
    if (!parsed.ok) throw new Error('parse failed')
    expect(netflixRecord(parsed.rows, NOW)).toEqual({
      source: 'netflix-csv',
      from: '2026-10-01',
      to: '2026-10-09',
      updatedAt: NOW.toISOString(),
      entries: [
        { day: '2026-10-01', plays: 1 },
        { day: '2026-10-09', plays: 2 },
      ],
    })
  })
})
