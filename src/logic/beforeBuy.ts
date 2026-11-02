import { formatWon, josa, MAX_WON, parseDecimal, parseInteger } from './number'
import type { BulkUse, Installment, WishItem } from './wishlist'
import type { PriceNote } from './wishlist'
import { parseDay } from './dates'
import { PANTRY_LEVEL_LABEL, normalizePantryName, type PantryItem } from './pantry'

// PRD F61: 카드사가 안내한 월 납입금을 곱한다. 이자율·수수료는 추측하지 않는다.
export type InstallmentRaw = { months: string; monthly: string }
export type InstallmentErrors = Partial<Record<keyof InstallmentRaw, string>>

export function validateInstallment(raw: InstallmentRaw): { value?: Installment | null; errors: InstallmentErrors } {
  const errors: InstallmentErrors = {}
  const monthsText = raw.months.trim()
  const monthlyText = raw.monthly.trim()
  if (!monthsText && !monthlyText) return { value: null, errors }
  const months = parseInteger(monthsText)
  const monthly = parseInteger(monthlyText)
  if (!monthsText) errors.months = '할부 개월을 적어 주세요.'
  else if (months === null || months < 2 || months > 36) errors.months = '할부 개월은 2~36개월이어야 해요.'
  if (!monthlyText) errors.monthly = '월 납입금을 적어 주세요.'
  else if (monthly === null || monthly < 1 || monthly > MAX_WON) errors.monthly = '월 납입금은 1원~10억 원 사이여야 해요.'
  return Object.keys(errors).length ? { errors } : { value: { months: months!, monthlyKrw: monthly! }, errors }
}

export function installmentLine(item: Pick<WishItem, 'priceKrw' | 'installment'>): string | null {
  if (!item.installment) return null
  const total = item.installment.months * item.installment.monthlyKrw
  const diff = total - item.priceKrw
  return `할부로 내면 총 ${formatWon(total)} · ${diff > 0 ? `일시불보다 ${formatWon(diff)} 더` : '일시불과 같아요'}`
}

export const ALTERNATIVE_NOTE = '빌리기·중고로 살펴볼 수도 있어요.'
export const ALTERNATIVE_LINKS: readonly { name: string; href: string }[] = [
  { name: '당근', href: 'https://www.daangn.com/' },
  { name: '번개장터', href: 'https://m.bunjang.co.kr/' },
]

export function validateUsesPerYear(raw: string): { value?: number | null; error?: string } {
  if (!raw.trim()) return { value: null }
  const value = parseInteger(raw)
  return value !== null && value >= 1 && value <= 365 ? { value } : { error: '1년에 쓰는 횟수는 1~365 사이여야 해요.' }
}

export function usageCostLine(item: Pick<WishItem, 'priceKrw' | 'usesPerYear'>): string | null {
  return item.usesPerYear !== undefined && item.usesPerYear <= 2 ? `한 번 쓸 때 약 ${formatWon(Math.round(item.priceKrw / item.usesPerYear))}` : null
}

export function pantryDuplicateLine(name: string, pantry: readonly PantryItem[]): string | null {
  const normalized = normalizePantryName(name)
  if (!normalized) return null
  const matching = pantry.find((item) => normalizePantryName(item.name) === normalized)
  return matching ? `집에 있는 것에 ‘${matching.name}’${josa(matching.name, '이/가')} 있어요 (${PANTRY_LEVEL_LABEL[matching.level]})` : null
}

export type BulkUseRaw = { total: string; monthlyUse: string; expiresMonths?: string }
export type BulkUseErrors = Partial<Record<keyof BulkUseRaw, string>>
export function validateBulkUse(raw: BulkUseRaw): { value?: BulkUse | null; errors: BulkUseErrors } {
  const errors: BulkUseErrors = {}
  const expiresRaw = raw.expiresMonths ?? ''
  if (!raw.total.trim() && !raw.monthlyUse.trim() && !expiresRaw.trim()) return { value: null, errors }
  const total = parseDecimal(raw.total)
  const monthlyUse = parseDecimal(raw.monthlyUse)
  const expiresMonths = expiresRaw.trim() ? parseInteger(expiresRaw) : null
  const validAmount = (v: number | null) => v !== null && v > 0 && v <= 10_000_000 && Math.round(v * 1000) === v * 1000
  if (!raw.total.trim()) errors.total = '총량을 적어 주세요.'
  else if (!validAmount(total)) errors.total = '총량은 0보다 크고 소수 셋째 자리까지 적어 주세요.'
  if (!raw.monthlyUse.trim()) errors.monthlyUse = '한 달 사용량을 적어 주세요.'
  else if (!validAmount(monthlyUse)) errors.monthlyUse = '한 달 사용량은 0보다 크고 소수 셋째 자리까지 적어 주세요.'
  if (expiresRaw.trim() && (expiresMonths === null || expiresMonths < 1 || expiresMonths > 120)) errors.expiresMonths = '유통기한은 1~120개월 사이여야 해요.'
  if (Object.keys(errors).length) return { errors }
  return { value: { total: total!, monthlyUse: monthlyUse!, ...(expiresMonths !== null ? { expiresMonths } : {}) }, errors }
}

export function bulkUseLine(item: Pick<WishItem, 'bulkUse'>): { line: string; warning: boolean } | null {
  if (!item.bulkUse) return null
  const months = Math.ceil(item.bulkUse.total / item.bulkUse.monthlyUse)
  const warning = item.bulkUse.expiresMonths !== undefined && months > item.bulkUse.expiresMonths
  return { line: `다 쓰는 데 약 ${months}개월${warning ? ` · 유통기한 ${item.bulkUse.expiresMonths}개월` : ''}`, warning }
}

export function validateTargetPrice(raw: string): { value?: number | null; error?: string } {
  if (!raw.trim()) return { value: null }
  const value = parseInteger(raw)
  return value !== null && value >= 1 && value <= MAX_WON ? { value } : { error: '목표가는 1원~10억 원 사이여야 해요.' }
}

export function validateSeenPrice(raw: { day: string; price: string }, today: Date): { value?: PriceNote; errors: Partial<Record<'day' | 'price', string>> } {
  const errors: Partial<Record<'day' | 'price', string>> = {}
  if (!parseDay(raw.day) || raw.day > `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`) errors.day = '본 날은 오늘이거나 그 전이어야 해요.'
  const price = parseInteger(raw.price)
  if (price === null || price < 1 || price > MAX_WON) errors.price = '본 가격은 1원~10억 원 사이여야 해요.'
  return Object.keys(errors).length ? { errors } : { value: { day: raw.day, priceKrw: price! }, errors }
}

export function addPriceNote(existing: readonly PriceNote[] | undefined, next: PriceNote): PriceNote[] | 'full' {
  const notes = [...(existing ?? [])]
  const index = notes.findIndex((note) => note.day === next.day)
  if (index >= 0) notes[index] = next
  else if (notes.length >= 30) return 'full'
  else notes.push(next)
  return notes.sort((a, b) => a.day.localeCompare(b.day))
}

const shortDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`
export function priceHistoryLine(item: Pick<WishItem, 'targetPriceKrw' | 'priceNotes'>): string | null {
  const parts: string[] = []
  if (item.targetPriceKrw !== undefined) parts.push(`목표가 ${formatWon(item.targetPriceKrw)}`)
  const notes = item.priceNotes ?? []
  if (notes.length) {
    const latest = notes[notes.length - 1]
    const lowest = notes.reduce((best, note) => note.priceKrw < best.priceKrw ? note : best)
    parts.push(`마지막으로 본 값 ${formatWon(latest.priceKrw)}(${shortDay(latest.day)})`)
    parts.push(`본 값 가운데 가장 낮은 값 ${formatWon(lowest.priceKrw)}(${shortDay(lowest.day)})`)
  }
  return parts.length ? parts.join(' · ') : null
}

export function priceTargetMetLine(item: Pick<WishItem, 'targetPriceKrw' | 'priceNotes'>): string | null {
  return item.targetPriceKrw !== undefined && item.priceNotes?.some((note) => note.priceKrw <= item.targetPriceKrw!) ? '적어 둔 값 가운데 목표가 이하가 있어요.' : null
}

export function beforeBuySummaryLines(item: WishItem, pantry: readonly PantryItem[]): string[] {
  const lines = [`일시불 ${formatWon(item.priceKrw)}`]
  const duplicate = pantryDuplicateLine(item.name, pantry)
  const installment = installmentLine(item)
  const history = priceHistoryLine(item)
  if (duplicate) lines.push(duplicate)
  if (installment) lines.push(installment)
  if (item.usesPerYear !== undefined) lines.push(`1년에 ${item.usesPerYear}번`)
  if (history) lines.push(history)
  return lines
}
