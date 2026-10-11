import { parseInteger } from './number'

// PRD F12 시급 설정: 별도 키에 저장한다. 손상되면 그 키만 무시하고 비운 것으로 본다(숙려 기록에는 영향 없음).
export type Settings = { schemaVersion: 1; hourlyWage: number | null }

export const SETTINGS_KEY = 'buyornot.settings.v1'
export const WAGE_MIN = 1_000
export const WAGE_MAX = 1_000_000
const EMPTY: Settings = { schemaVersion: 1, hourlyWage: null }

const isWage = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= WAGE_MIN && (v as number) <= WAGE_MAX

export function validateWage(raw: string): { value?: number | null; error?: string } {
  if (raw.trim() === '') return { value: null }
  const parsed = parseInteger(raw)
  if (parsed === null) return { error: '시급을 정수로 입력해 주세요' }
  if (!isWage(parsed)) return { error: '시급은 1,000원~1,000,000원 사이여야 해요' }
  return { value: parsed }
}

export function parseSettings(raw: string | null): Settings {
  if (raw === null) return { ...EMPTY }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (o?.schemaVersion === 1 && (o.hourlyWage === null || isWage(o.hourlyWage))) {
      return { schemaVersion: 1, hourlyWage: o.hourlyWage as number | null }
    }
  } catch {
    // 손상된 설정은 무시한다
  }
  return { ...EMPTY }
}

export function loadSettings(storage: Storage | null): Settings {
  try {
    return parseSettings(storage?.getItem(SETTINGS_KEY) ?? null)
  } catch {
    return { ...EMPTY }
  }
}

/** 설정 저장은 실패해도 화면에는 그대로 쓴다(새로고침하면 사라질 뿐). 결과만 돌려준다 */
export function saveSettings(storage: Storage | null, settings: Settings): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return Boolean(storage)
  } catch {
    return false
  }
}
