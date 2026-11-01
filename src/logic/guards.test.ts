import { describe, expect, it } from 'vitest'
import { isDay, isIntBetween, isRecord, isString, isTimestamp } from './guards'

describe('저장 검사 도우미', () => {
  it('AC84: 실제 날짜만 날짜로 본다', () => {
    for (const value of ['2026-02-30', '1899-12-31', '2026-1-1', 20261101]) expect(isDay(value)).toBe(false)
    expect(isDay('2024-02-29')).toBe(true)
  })
  it('AC84: 시각은 Date.parse가 읽는 문자열이다', () => {
    expect(isTimestamp('2026-11-01T00:00:00.000Z')).toBe(true)
    expect(isTimestamp('not a date')).toBe(false)
    expect(isString(1)).toBe(false)
  })
  it('AC96: 정수 범위는 양 끝을 포함한다', () => {
    for (const value of [0, 10]) expect(isIntBetween(value, 0, 10)).toBe(true)
    for (const value of [-1, 11, 1.5, '1']) expect(isIntBetween(value, 0, 10)).toBe(false)
  })
  it('AC96: 배열과 null은 레코드가 아니다', () => {
    expect(isRecord({ value: 1 })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
  })
})
