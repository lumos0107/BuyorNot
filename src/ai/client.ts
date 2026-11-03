// AI 서버(worker/)에 JSON을 보내고 받는 함수와, 받은 값이 약속한 모양인지 보는 검사.
// 화면은 이 파일의 결과(AiResult)만 보고, 던져진 오류를 따로 잡지 않는다.
// 이 파일은 요청만 보낸다. 사진·녹음을 보내는 화면은 messages.ts의 PHOTO_NOTICE·VOICE_NOTICE를 버튼 바로 아래(누르기 전)에 보여 줘야 한다.
import { aiServerUrl } from './config'
import type { DanawaRow, LowestPriceResponse, ReadSizeResponse, ReadTagResponse, SizeCandidate, TagItem, VoiceFillResponse } from './types'

// rate_limited: 서버 제한(429) · upstream_limited: Gemini 자체 제한(서버 429, 본문 error가 upstream_limited)
// disabled: 서버가 꺼 둠(503) · cancelled: 호출한 쪽이 끊음
// failed: 그 밖의 모든 실패(네트워크·시간 초과·서버 오류·모양이 다른 응답·서버 주소 없음)
export type AiFailure = 'rate_limited' | 'upstream_limited' | 'disabled' | 'failed' | 'cancelled'
export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiFailure }

type AiPath = '/api/read-tag' | '/api/lowest-price' | '/api/voice-fill' | '/api/read-size'

function fail(error: AiFailure): { ok: false; error: AiFailure } {
  return { ok: false, error }
}

// 한 번만 보낸다(자동으로 다시 보내지 않는다). 던지지 않고 늘 AiResult를 돌려준다.
// timeoutMs가 지나면 요청을 끊고 failed, signal이 끊기면(응답 본문을 받는 도중이어도) cancelled.
export async function postJson<T>(
  path: AiPath,
  body: unknown,
  opts: { timeoutMs: number; signal?: AbortSignal; guard: (value: unknown) => value is T },
): Promise<AiResult<T>> {
  const { timeoutMs, signal, guard } = opts
  if (signal?.aborted) return fail('cancelled')
  const base = aiServerUrl()
  if (base === null) return fail('failed')

  // 시간 상한과 호출한 쪽의 취소를 한 신호로 묶어 fetch에 넘긴다
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    const result = await send(base + path, body, controller.signal, guard)
    return signal?.aborted ? fail('cancelled') : result
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

async function send<T>(
  url: string,
  body: unknown,
  signal: AbortSignal,
  guard: (value: unknown) => value is T,
): Promise<AiResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (response.status === 429) return fail(await limitKind(response))
    if (response.status === 503) return fail('disabled')
    if (!response.ok) return fail('failed')
    const data: unknown = await response.json()
    return guard(data) ? { ok: true, data } : fail('failed')
  } catch {
    return fail('failed')
  }
}

// 429의 본문 error가 upstream_limited일 때만 Gemini 제한이다. 본문이 다르거나 JSON이 아니면 서버 제한(rate_limited)으로 본다.
// 본문을 읽는 도중 요청이 끊기면 읽기가 실패해 rate_limited로 돌아가지만, 부른 쪽(postJson)이 신호를 보고 cancelled로 바꾼다.
async function limitKind(response: Response): Promise<'rate_limited' | 'upstream_limited'> {
  try {
    const body: unknown = await response.json()
    return isRecord(body) && body.error === 'upstream_limited' ? 'upstream_limited' : 'rate_limited'
  } catch {
    return 'rate_limited'
  }
}

// ---- 응답 모양 검사: AI 서버가 예상과 다른 JSON을 돌려줘도 화면에 들어가기 전에 막는다 ----
// 서버는 모든 칸을 늘 채워 보내므로(없는 값은 null) 칸이 빠졌거나 형이 다르면 거절한다.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

function isNullableNumber(v: unknown): v is number | null {
  return v === null || isNumber(v)
}

function isArrayOf<T>(v: unknown, check: (item: unknown) => item is T): v is T[] {
  return Array.isArray(v) && v.every(check)
}

const TAG_UNITS: readonly unknown[] = ['g', 'kg', 'mL', 'L', 'ea']

function isTagItem(v: unknown): v is TagItem {
  return (
    isRecord(v) &&
    isString(v.name) &&
    isNullableString(v.brand) &&
    isNullableNumber(v.price) &&
    isNullableString(v.priceCondition) &&
    isNullableNumber(v.regularPrice) &&
    isNullableString(v.priceBasis) &&
    isNullableString(v.sizeText) &&
    isNullableNumber(v.size) &&
    (v.unit === null || TAG_UNITS.includes(v.unit)) &&
    isNullableNumber(v.count) &&
    typeof v.tagReadable === 'boolean'
  )
}

export function isReadTagResponse(v: unknown): v is ReadTagResponse {
  return isRecord(v) && isArrayOf(v.items, isTagItem) && isNullableString(v.note)
}

function isDanawaRow(v: unknown): v is DanawaRow {
  return (
    isRecord(v) &&
    isString(v.name) &&
    isNullableNumber(v.packCount) &&
    isNumber(v.price) &&
    isNullableString(v.unitPriceText) &&
    isString(v.malls)
  )
}

const LOWEST_PRICE_STATUSES: readonly unknown[] = ['found', 'not_confirmed', 'no_results', 'unavailable', 'off']

export function isLowestPriceResponse(v: unknown): v is LowestPriceResponse {
  return (
    isRecord(v) &&
    LOWEST_PRICE_STATUSES.includes(v.status) &&
    isString(v.searchUrl) &&
    isArrayOf(v.matches, isDanawaRow) &&
    isArrayOf(v.candidates, isDanawaRow)
  )
}

export function isVoiceFillResponse(v: unknown): v is VoiceFillResponse {
  return (
    isRecord(v) &&
    isString(v.transcript) &&
    isNullableString(v.name) &&
    isNullableNumber(v.price) &&
    isNullableString(v.reason) &&
    (v.desire === null || (typeof v.desire === 'number' && Number.isInteger(v.desire) && v.desire >= 1 && v.desire <= 5)) &&
    isNullableNumber(v.periodDays)
  )
}

const SIZE_KINDS: readonly unknown[] = ['product', 'package', 'unknown']
const SIZE_AXES: readonly unknown[] = ['labeled', 'order']
const SIZE_UNITS: readonly unknown[] = ['mm', 'cm', 'm', 'mixed']

function isSizeCandidate(v: unknown): v is SizeCandidate {
  return (
    isRecord(v) &&
    isString(v.text) &&
    isNullableString(v.label) &&
    SIZE_KINDS.includes(v.kind) &&
    SIZE_AXES.includes(v.axes) &&
    isNullableNumber(v.w) &&
    isNullableNumber(v.d) &&
    isNullableNumber(v.h) &&
    (v.unit === null || SIZE_UNITS.includes(v.unit))
  )
}

export function isReadSizeResponse(v: unknown): v is ReadSizeResponse {
  return isRecord(v) && isArrayOf(v.candidates, isSizeCandidate) && isNullableString(v.note)
}
