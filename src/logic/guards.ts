import { parseDay } from './dates'

export const isString = (v: unknown): v is string => typeof v === 'string'
export const isDay = (v: unknown): v is string => isString(v) && parseDay(v) !== null
export const isTimestamp = (v: unknown): v is string => isString(v) && Number.isFinite(Date.parse(v))
export const isIntBetween = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
