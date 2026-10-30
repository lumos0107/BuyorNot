import { describe, expect, it } from 'vitest'
import type { VoiceFillResponse } from '../ai/types'
import { applyVoiceFill, voiceStatusLines, type VoiceTarget } from './voiceFill'

// PRD F33 말로 담기: 응답을 담기 폼에 넣을 때는 빈 칸만 채운다 (AC57). 고민 기간은 늘 값이 있는 칸이라 말했으면 바꾼다.
const TRANSCRIPT = '요가 매트 삼만 오천 원짜리 사고 싶어. 집에서 홈트 하려고. 고민은 삼 일 할게.'

// 담기 폼의 처음 상태(고민 기간 3일)
const EMPTY_FORM: VoiceTarget = { name: '', price: '', reason: '', desire: undefined, preset: 3, customDays: '' }

const NOTHING: VoiceFillResponse = { transcript: TRANSCRIPT, name: null, price: null, reason: null, desire: null, periodDays: null }
// AC57 첫 사례의 응답: 정도는 말하지 않았다
const YOGA: VoiceFillResponse = { ...NOTHING, name: '요가 매트', price: 35000, reason: '집에서 홈트 하려고', periodDays: 3 }

describe('말로 담기: 응답을 담기 폼에 합치기 (F33)', () => {
  it('AC57: 빈 폼에는 상품명·가격·이유를 채우고 정도는 그대로 두며 기간은 3일', () => {
    const result = applyVoiceFill(EMPTY_FORM, YOGA)
    expect(result.next).toEqual({ name: '요가 매트', price: '35000', reason: '집에서 홈트 하려고', desire: undefined, preset: 3, customDays: '' })
    expect(result.filled).toEqual(['상품명', '가격', '이유', '고민 기간'])
    expect(result.kept).toEqual([])
  })

  it("AC57: 상품명 '매트'를 적어 둔 상태에서는 상품명을 그대로 두고 둔 칸에 상품명을 올린다", () => {
    const result = applyVoiceFill({ ...EMPTY_FORM, name: '매트' }, YOGA)
    expect(result.next).toEqual({ name: '매트', price: '35000', reason: '집에서 홈트 하려고', desire: undefined, preset: 3, customDays: '' })
    expect(result.filled).toEqual(['가격', '이유', '고민 기간'])
    expect(result.kept).toEqual(['상품명'])
  })

  it('AC57: 기간 7은 7일 버튼을 고른다', () => {
    const result = applyVoiceFill(EMPTY_FORM, { ...NOTHING, periodDays: 7 })
    expect(result.next).toEqual({ ...EMPTY_FORM, preset: 7 })
    expect(result.filled).toEqual(['고민 기간'])
    expect(result.kept).toEqual([])
  })

  it('AC57: 기간 5는 직접 입력에 5를 넣는다', () => {
    const result = applyVoiceFill(EMPTY_FORM, { ...NOTHING, periodDays: 5 })
    expect(result.next).toEqual({ ...EMPTY_FORM, preset: 'custom', customDays: '5' })
    expect(result.filled).toEqual(['고민 기간'])
    expect(result.kept).toEqual([])
  })

  it('AC57: 기간만 3일에서 7일로 바뀌고 다른 칸은 건드리지 않으며 안내는 "고민 기간을 채웠어요."뿐', () => {
    const result = applyVoiceFill(EMPTY_FORM, { ...NOTHING, periodDays: 7 })
    expect(result.next).toEqual({ ...EMPTY_FORM, preset: 7 })
    expect(result.filled).toEqual(['고민 기간'])
    expect(result.kept).toEqual([])
    expect(voiceStatusLines(TRANSCRIPT, result.filled, result.kept)[1]).toBe('고민 기간을 채웠어요.')
    expect(voiceStatusLines(TRANSCRIPT, result.filled, result.kept)).toHaveLength(2)
  })

  it('AC57: 정도 4는 비어 있는 정도를 4로 채운다', () => {
    const result = applyVoiceFill(EMPTY_FORM, { ...NOTHING, desire: 4 })
    expect(result.next).toEqual({ ...EMPTY_FORM, desire: 4 })
    expect(result.filled).toEqual(['갖고 싶은 정도'])
    expect(result.kept).toEqual([])
  })

  it('AC57: 정도를 이미 2로 고른 상태에서 정도 4가 와도 2 그대로이고 둔 칸에 갖고 싶은 정도를 올린다', () => {
    const result = applyVoiceFill({ ...EMPTY_FORM, desire: 2 }, { ...NOTHING, desire: 4 })
    expect(result.next).toEqual({ ...EMPTY_FORM, desire: 2 })
    expect(result.filled).toEqual([])
    expect(result.kept).toEqual(['갖고 싶은 정도'])
  })

  it('AC57: 받아쓰는 동안 적은 이유는 지우지 않는다(current는 응답을 받은 순간의 폼 값)', () => {
    const typedDuringTranscribing: VoiceTarget = { ...EMPTY_FORM, reason: '친구가 추천해서' }
    const result = applyVoiceFill(typedDuringTranscribing, YOGA)
    expect(result.next.reason).toBe('친구가 추천해서')
    expect(result.next.name).toBe('요가 매트')
    expect(result.filled).toEqual(['상품명', '가격', '고민 기간'])
    expect(result.kept).toEqual(['이유'])
  })

  it('AC58: 응답의 정도가 null이면 비어 있는 정도도 고른 정도도 그대로이고 어느 목록에도 올리지 않는다', () => {
    const emptyDesire = applyVoiceFill(EMPTY_FORM, { ...NOTHING, transcript: '두 개 사고 싶어' })
    expect(emptyDesire.next.desire).toBeUndefined()
    const pickedDesire = applyVoiceFill({ ...EMPTY_FORM, desire: 2 }, { ...NOTHING, transcript: '두 개 사고 싶어' })
    expect(pickedDesire.next.desire).toBe(2)
    for (const result of [emptyDesire, pickedDesire]) {
      expect(result.filled).toEqual([])
      expect(result.kept).toEqual([])
    }
  })

  it('AC58: 응답의 모든 값이 비어 있으면 폼은 그대로이고 채운 칸도 둔 칸도 없다', () => {
    const typed: VoiceTarget = { name: '무선 헤드폰', price: '', reason: '고장 나서', desire: 3, preset: 'custom', customDays: '12' }
    for (const current of [EMPTY_FORM, typed]) {
      const result = applyVoiceFill(current, NOTHING)
      expect(result.next).toEqual(current)
      expect(result.filled).toEqual([])
      expect(result.kept).toEqual([])
    }
  })

  it('적어 둔 칸의 응답 값이 null이면 그 칸은 채운 칸에도 둔 칸에도 올리지 않는다', () => {
    const current: VoiceTarget = { name: '매트', price: '35000', reason: '홈트', desire: 2, preset: 7, customDays: '' }
    const result = applyVoiceFill(current, { ...NOTHING, name: null, price: 40000 })
    expect(result.next).toEqual(current)
    expect(result.filled).toEqual([])
    expect(result.kept).toEqual(['가격'])
  })

  it('공백만 있는 상품명·가격·이유는 빈 칸으로 보고 채운다', () => {
    const blank: VoiceTarget = { ...EMPTY_FORM, name: '   ', price: ' ', reason: '\n ' }
    const result = applyVoiceFill(blank, YOGA)
    expect(result.next.name).toBe('요가 매트')
    expect(result.next.price).toBe('35000')
    expect(result.next.reason).toBe('집에서 홈트 하려고')
    expect(result.filled).toEqual(['상품명', '가격', '이유', '고민 기간'])
    expect(result.kept).toEqual([])
  })

  it('응답의 글자 칸이 공백뿐이면 값이 없는 것으로 보고 채우지 않는다', () => {
    const result = applyVoiceFill(EMPTY_FORM, { ...NOTHING, name: '  ', reason: '' })
    expect(result.next).toEqual(EMPTY_FORM)
    expect(result.filled).toEqual([])
    expect(result.kept).toEqual([])
  })

  it('고민 기간은 지금 값과 같아도 말했으면 채운 칸으로 센다', () => {
    const sameAsNow = applyVoiceFill({ ...EMPTY_FORM, preset: 7 }, { ...NOTHING, periodDays: 7 })
    expect(sameAsNow.next.preset).toBe(7)
    expect(sameAsNow.filled).toEqual(['고민 기간'])
    expect(sameAsNow.kept).toEqual([])
    const sameCustom = applyVoiceFill({ ...EMPTY_FORM, preset: 'custom', customDays: '5' }, { ...NOTHING, periodDays: 5 })
    expect(sameCustom.next).toEqual({ ...EMPTY_FORM, preset: 'custom', customDays: '5' })
    expect(sameCustom.filled).toEqual(['고민 기간'])
  })

  it('기간을 말하지 않았으면 선택한 버튼과 직접 입력한 일수를 그대로 두고 어느 목록에도 올리지 않는다', () => {
    const current: VoiceTarget = { ...EMPTY_FORM, preset: 'custom', customDays: '12' }
    const result = applyVoiceFill(current, { ...NOTHING, name: '매트' })
    expect(result.next.preset).toBe('custom')
    expect(result.next.customDays).toBe('12')
    expect(result.filled).toEqual(['상품명'])
    expect(result.kept).toEqual([])
  })

  it('직접 입력 상태에서 1·3·7일을 말하면 그 버튼을 고르고 적어 둔 일수는 건드리지 않는다', () => {
    const current: VoiceTarget = { ...EMPTY_FORM, preset: 'custom', customDays: '12' }
    for (const days of [1, 3, 7] as const) {
      const result = applyVoiceFill(current, { ...NOTHING, periodDays: days })
      expect(result.next.preset).toBe(days)
      expect(result.next.customDays).toBe('12')
      expect(result.filled).toEqual(['고민 기간'])
    }
  })

  it('버튼에 없는 2~30일은 직접 입력과 그 일수로 넣는다', () => {
    for (const days of [2, 4, 10, 29, 30]) {
      const result = applyVoiceFill({ ...EMPTY_FORM, preset: 7 }, { ...NOTHING, periodDays: days })
      expect(result.next.preset).toBe('custom')
      expect(result.next.customDays).toBe(String(days))
    }
  })

  it('범위 밖 기간(0·31·소수)은 말하지 않은 것처럼 그대로 둔다 (PRD: 범위 밖이면 그대로)', () => {
    const current: VoiceTarget = { ...EMPTY_FORM, preset: 7 }
    for (const days of [0, -1, 31, 2.5]) {
      const result = applyVoiceFill(current, { ...NOTHING, periodDays: days })
      expect(result.next, `기간 ${days}`).toEqual(current)
      expect(result.filled, `기간 ${days}`).toEqual([])
    }
  })

  it('가격은 폼이 쓰는 숫자 문자열(쉼표 없는 정수)로 채운다', () => {
    expect(applyVoiceFill(EMPTY_FORM, { ...NOTHING, price: 1200 }).next.price).toBe('1200')
    expect(applyVoiceFill(EMPTY_FORM, { ...NOTHING, price: 1_000_000 }).next.price).toBe('1000000')
  })

  it('받은 폼 값을 바꾸지 않고 새 객체를 돌려준다', () => {
    const current: VoiceTarget = { ...EMPTY_FORM }
    const snapshot = { ...current }
    const result = applyVoiceFill(current, { ...YOGA, desire: 5 })
    expect(current).toEqual(snapshot)
    expect(result.next).not.toBe(current)
    expect(result.next.desire).toBe(5)
  })

  it('채운 칸과 둔 칸은 상품명·가격·이유·갖고 싶은 정도·고민 기간 순서로 나열한다', () => {
    const current: VoiceTarget = { name: '매트', price: '', reason: '홈트', desire: 2, preset: 3, customDays: '' }
    const result = applyVoiceFill(current, { transcript: TRANSCRIPT, name: '요가 매트', price: 35000, reason: '집에서', desire: 4, periodDays: 5 })
    expect(result.filled).toEqual(['가격', '고민 기간'])
    expect(result.kept).toEqual(['상품명', '이유', '갖고 싶은 정도'])
  })
})

describe('말로 담기: 결과 안내 문장 (F33)', () => {
  const FIRST_LINE = `AI가 받아쓴 내용: ‘${TRANSCRIPT}’ · 확인해 주세요`

  it('AC57: 빈 폼 결과는 받아쓴 내용 다음에 "상품명·가격·이유·고민 기간을 채웠어요."', () => {
    const lines = voiceStatusLines(TRANSCRIPT, ['상품명', '가격', '이유', '고민 기간'], [])
    expect(lines).toEqual([FIRST_LINE, '상품명·가격·이유·고민 기간을 채웠어요.'])
  })

  it('AC57: 상품명을 둔 결과는 채운 칸 줄 다음에 "이미 적은 칸은 그대로 뒀어요: 상품명"', () => {
    const lines = voiceStatusLines(TRANSCRIPT, ['가격', '이유', '고민 기간'], ['상품명'])
    expect(lines).toEqual([FIRST_LINE, '가격·이유·고민 기간을 채웠어요.', '이미 적은 칸은 그대로 뒀어요: 상품명'])
  })

  it('AC57: 채운 칸이 없고 둔 칸만 있으면 채운 칸 줄 없이 둔 칸 줄만 이어진다', () => {
    expect(voiceStatusLines(TRANSCRIPT, [], ['갖고 싶은 정도'])).toEqual([FIRST_LINE, '이미 적은 칸은 그대로 뒀어요: 갖고 싶은 정도'])
    expect(voiceStatusLines(TRANSCRIPT, [], ['상품명', '이유'])).toEqual([FIRST_LINE, '이미 적은 칸은 그대로 뒀어요: 상품명·이유'])
  })

  it('AC58: 채운 칸도 둔 칸도 없으면 "채울 내용을 찾지 못했어요. 직접 입력해 주세요."', () => {
    const lines = voiceStatusLines('두 개 사고 싶어', [], [])
    expect(lines).toEqual(['AI가 받아쓴 내용: ‘두 개 사고 싶어’ · 확인해 주세요', '채울 내용을 찾지 못했어요. 직접 입력해 주세요.'])
  })

  it('"찾지 못했어요" 줄은 채운 칸이나 둔 칸이 있으면 나오지 않는다', () => {
    for (const lines of [voiceStatusLines(TRANSCRIPT, ['가격'], []), voiceStatusLines(TRANSCRIPT, [], ['가격'])]) {
      expect(lines.join('\n')).not.toContain('찾지 못했어요')
    }
  })

  it('"…을/를 채웠어요."의 조사는 마지막 칸 이름의 받침에 맞춘다', () => {
    expect(voiceStatusLines(TRANSCRIPT, ['상품명'], [])[1]).toBe('상품명을 채웠어요.')
    expect(voiceStatusLines(TRANSCRIPT, ['가격'], [])[1]).toBe('가격을 채웠어요.')
    expect(voiceStatusLines(TRANSCRIPT, ['이유'], [])[1]).toBe('이유를 채웠어요.')
    expect(voiceStatusLines(TRANSCRIPT, ['갖고 싶은 정도'], [])[1]).toBe('갖고 싶은 정도를 채웠어요.')
    expect(voiceStatusLines(TRANSCRIPT, ['고민 기간'], [])[1]).toBe('고민 기간을 채웠어요.')
    expect(voiceStatusLines(TRANSCRIPT, ['상품명', '이유'], [])[1]).toBe('상품명·이유를 채웠어요.')
  })

  it('받아쓴 말이 비어 있어도 첫 줄은 PRD 문장 그대로 만든다', () => {
    expect(voiceStatusLines('', [], [])[0]).toBe('AI가 받아쓴 내용: ‘’ · 확인해 주세요')
  })
})
