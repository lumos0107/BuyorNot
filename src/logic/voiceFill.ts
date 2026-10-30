import type { VoiceFillResponse } from '../ai/types'
import { josa } from './number'
import { COOLING_PRESETS, MAX_DAYS, type DesireLevel } from './wishlist'

// PRD F33 말로 담기: 받아쓰기 응답을 담기 폼에 넣을 때는 빈 칸만 채우고, 어느 칸을 채웠고 어느 칸을 뒀는지 알린다.

/** 응답을 합칠 담기 폼의 값. 가격은 폼이 쓰는 숫자 문자열, 고민 기간은 고른 버튼(preset)과 직접 입력한 일수 */
export type VoiceTarget = {
  name: string
  price: string
  reason: string
  desire: DesireLevel | undefined
  preset: (typeof COOLING_PRESETS)[number] | 'custom'
  customDays: string
}

export type VoiceField = '상품명' | '가격' | '이유' | '갖고 싶은 정도' | '고민 기간'

/** 응답에 채울 글이 있는가. null과 공백뿐인 글은 말하지 않은 것이다 */
function hasText(value: string | null): value is string {
  return value !== null && value.trim() !== ''
}

/**
 * 응답을 폼에 합친다 (AC57). current는 응답을 받은 순간의 폼 값이어야 받아쓰는 동안 적은 칸을 지우지 않는다.
 * - 상품명·가격·이유는 공백만 있어도 빈 칸으로 보고 채운다. 정도는 아직 안 골랐을 때(undefined)만 채운다.
 * - 이미 적은 칸은 응답에 값이 있을 때만 kept에 올린다. 응답이 null이면 어느 목록에도 올리지 않는다.
 * - 고민 기간은 늘 값이 있는 칸이라 말했으면(1~30일) 바꾸고 지금 값과 같아도 filled로 센다. 1·3·7은 그 버튼, 나머지는 직접 입력.
 * 목록은 상품명·가격·이유·갖고 싶은 정도·고민 기간 순서다.
 */
export function applyVoiceFill(current: VoiceTarget, fill: VoiceFillResponse): { next: VoiceTarget; filled: VoiceField[]; kept: VoiceField[] } {
  const next: VoiceTarget = { ...current }
  const filled: VoiceField[] = []
  const kept: VoiceField[] = []

  const fillText = (field: VoiceField, key: 'name' | 'price' | 'reason', value: string | null) => {
    if (!hasText(value)) return
    if (current[key].trim() === '') {
      next[key] = value
      filled.push(field)
    } else {
      kept.push(field)
    }
  }
  fillText('상품명', 'name', fill.name)
  fillText('가격', 'price', fill.price === null ? null : String(fill.price))
  fillText('이유', 'reason', fill.reason)

  if (fill.desire !== null) {
    if (current.desire === undefined) {
      next.desire = fill.desire
      filled.push('갖고 싶은 정도')
    } else {
      kept.push('갖고 싶은 정도')
    }
  }

  // 범위 밖이면 말하지 않은 것과 같다: 고른 버튼과 직접 입력한 일수를 그대로 둔다
  const days = fill.periodDays
  if (days !== null && Number.isInteger(days) && days >= 1 && days <= MAX_DAYS) {
    const preset = COOLING_PRESETS.find((p) => p === days)
    if (preset !== undefined) {
      next.preset = preset
    } else {
      next.preset = 'custom'
      next.customDays = String(days)
    }
    filled.push('고민 기간')
  }

  return { next, filled, kept }
}

/**
 * 결과 안내 줄 (role=status). 늘 받아쓴 내용으로 시작하고, 채운 칸 줄 → 둔 칸 줄이 이어지며,
 * 둘 다 없으면 찾지 못했다는 줄이 온다.
 */
export function voiceStatusLines(transcript: string, filled: VoiceField[], kept: VoiceField[]): string[] {
  const lines = [`AI가 받아쓴 내용: ‘${transcript}’ · 확인해 주세요`]
  if (filled.length > 0) {
    // 조사는 마지막 칸 이름의 받침에 맞춘다(붙인 문자열의 끝 글자가 마지막 칸 이름의 끝 글자다)
    const names = filled.join('·')
    lines.push(`${names}${josa(names, '을/를')} 채웠어요.`)
  }
  if (kept.length > 0) lines.push(`이미 적은 칸은 그대로 뒀어요: ${kept.join('·')}`)
  if (filled.length === 0 && kept.length === 0) lines.push('채울 내용을 찾지 못했어요. 직접 입력해 주세요.')
  return lines
}
