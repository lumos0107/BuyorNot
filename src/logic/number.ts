// 입력 문자열을 숫자로 바꾸고, 숫자를 화면용 문자열로 만든다. 쉼표와 공백은 무시한다. (PRD F04, F05)

const INTEGER = /^-?\d+$/
const DECIMAL = /^-?\d+(\.\d+)?$/

function clean(raw: string): string {
  return raw.replace(/[,\s]/g, '')
}

/** 정수만 받는다. "6,000" → 6000, "12.5"·""·"abc" → null */
export function parseInteger(raw: string): number | null {
  const s = clean(raw)
  return INTEGER.test(s) ? Number(s) : null
}

/** 소수를 받는다. "1.5" → 1.5, ""·"abc" → null */
export function parseDecimal(raw: string): number | null {
  const s = clean(raw)
  return DECIMAL.test(s) ? Number(s) : null
}

/** 6000 → "6,000원" */
export function formatWon(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`
}

/** 333.333 → "333.33" (항상 소수 digits 자리) */
export function formatFixed(value: number, digits: number): string {
  return value.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export const MAX_WON = 1_000_000_000
