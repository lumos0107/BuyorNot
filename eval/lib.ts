// 평가 스크립트 공통: 인자, 정답 파일 읽기·검사, 요청, 결과 파일. Node 24가 .ts를 그대로 실행한다
// (상대 import에 .ts, 타입은 import type, enum 금지). 결과와 원시 응답은 _개인기록/평가/결과/에만 쓴다.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { seconds } from '../src/ai/evalSummary.ts'
import type { DanawaRow, LowestPriceRequest, TagUnit, VoiceFillResponse } from '../src/ai/types.ts'
import type { GeminiFailure } from '../worker/src/gemini.ts'
import { pickRows } from '../worker/src/lowestPrice.ts'
import { tally } from './score.ts'
import type {
  DanawaExpected,
  EvalCase,
  EvalResultFile,
  FieldOutcome,
  SizeExpected,
  SizeReadItem,
  Tally,
  TagExpected,
  TagReadItem,
  VoiceExpected,
} from './score.ts'

export type EvalSet = '조정용' | '평가용'
export const SETS: readonly EvalSet[] = ['조정용', '평가용']
export const DATA_ROOT = '_개인기록/평가'
export const RESULT_DIR = `${DATA_ROOT}/결과`
export const ORIGIN = 'http://localhost:5173'
// 호출 사이 7초(IP당 60초 10번 제한 아래), 한 요청은 앱의 대기 상한과 같은 60초
export const GAP_MS = 7000
export const REQUEST_TIMEOUT_MS = 60_000

export type EvalCaseFile<E> = {
  id: string
  file: string
  source: string
  license: string
  edits: string
  set: EvalSet
  group: string
  uncertain?: true
  uncertainReason?: string
  synthetic?: true
  expected: E
}

// ---- 정답 파일 검사 ----

type Rec = Record<string, unknown>

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function fail(id: string, why: string): never {
  throw new Error(`${id}: ${why}`)
}

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function intOrNull(v: unknown, min: number, max: number): v is number | null {
  return v === null || (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max)
}

function strOrNull(v: unknown): v is string | null {
  return v === null || nonEmpty(v)
}

const UNITS: readonly unknown[] = ['g', 'kg', 'mL', 'L', 'ea'] satisfies TagUnit[]

export function checkTagExpected(e: unknown, id: string): TagExpected[] {
  if (!Array.isArray(e)) fail(id, 'expected는 상품 배열이어야 한다')
  return e.map((p: unknown, i): TagExpected => {
    const at = `${id} 상품${i + 1}`
    if (!isRec(p)) fail(at, '상품은 객체여야 한다')
    if (!nonEmpty(p.nameKeywords)) fail(at, 'nameKeywords가 비었다')
    if (!intOrNull(p.price, 1, 1_000_000_000)) fail(at, 'price는 1~1,000,000,000 정수나 null')
    if (!strOrNull(p.priceCondition)) fail(at, 'priceCondition은 글자나 null')
    if (!(p.size === null || (typeof p.size === 'number' && p.size > 0 && p.size <= 10_000_000))) {
      fail(at, 'size는 0 초과 10,000,000 이하 수나 null')
    }
    if (!(p.unit === null || UNITS.includes(p.unit))) fail(at, 'unit은 g·kg·mL·L·ea나 null')
    if (!intOrNull(p.count, 1, 9999)) fail(at, 'count는 1~9999 정수나 null')
    return {
      nameKeywords: p.nameKeywords,
      price: p.price,
      priceCondition: p.priceCondition,
      size: p.size as number | null,
      unit: p.unit as string | null,
      count: p.count,
    }
  })
}

// 서버 /api/read-size의 kind·unit과 같은 값(src/ai/client.ts의 모양 검사와 같다)
const SIZE_KINDS: readonly unknown[] = ['product', 'package', 'unknown']
const SIZE_UNITS: readonly unknown[] = ['mm', 'cm', 'm', 'mixed']
const MAX_AXIS = 1_000_000 // 서버가 받는 축 길이의 상한(worker/src/readSize.ts)

function axisOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_AXIS)
}

// 치수 정답: 사진에 보이는 치수 표기를 모두 적은 배열(없으면 []). 적힌 숫자 그대로이고 단위로 환산하지 않는다.
export function checkSizeExpected(e: unknown, id: string): SizeExpected[] {
  if (!Array.isArray(e)) fail(id, 'expected는 표기 배열이어야 한다')
  return e.map((p: unknown, i): SizeExpected => {
    const at = `${id} 표기${i + 1}`
    if (!isRec(p)) fail(at, '표기는 객체여야 한다')
    if (!nonEmpty(p.textKeywords)) fail(at, 'textKeywords가 비었다')
    if (!SIZE_KINDS.includes(p.kind)) fail(at, 'kind는 product·package·unknown')
    for (const key of ['w', 'd', 'h'] as const) {
      if (!axisOrNull(p[key])) fail(at, `${key}는 0 초과 수나 null(모르는 축)`)
    }
    if (!(p.unit === null || SIZE_UNITS.includes(p.unit))) fail(at, 'unit은 mm·cm·m·mixed나 null')
    return {
      textKeywords: p.textKeywords,
      kind: p.kind as SizeExpected['kind'],
      w: p.w as number | null,
      d: p.d as number | null,
      h: p.h as number | null,
      unit: p.unit as SizeExpected['unit'],
    }
  })
}

export function checkVoiceExpected(e: unknown, id: string): VoiceExpected {
  if (!isRec(e)) fail(id, 'expected는 객체여야 한다')
  if (!strOrNull(e.nameKeywords)) fail(id, 'nameKeywords는 글자나 null')
  if (!intOrNull(e.price, 1, 1_000_000_000)) fail(id, 'price는 1~1,000,000,000 정수나 null')
  if (!strOrNull(e.reasonKeywords)) fail(id, 'reasonKeywords는 글자나 null')
  if (!intOrNull(e.desire, 1, 5)) fail(id, 'desire는 1~5 정수나 null')
  if (!intOrNull(e.periodDays, 1, 30)) fail(id, 'periodDays는 1~30 정수나 null')
  return {
    nameKeywords: e.nameKeywords,
    price: e.price,
    reasonKeywords: e.reasonKeywords,
    desire: e.desire,
    periodDays: e.periodDays,
  }
}

export function checkDanawaExpected(e: unknown, id: string): DanawaExpected {
  if (!isRec(e)) fail(id, 'expected는 객체여야 한다')
  if (!isRec(e.wanted) || !nonEmpty(e.wanted.name)) fail(id, 'wanted.name이 비었다')
  const accepted = e.accepted
  if (
    !Array.isArray(accepted) ||
    !accepted.every((n) => Number.isInteger(n) && (n as number) >= 1) ||
    new Set(accepted).size !== accepted.length
  ) {
    fail(id, 'accepted는 1부터의 겹치지 않는 정수 배열')
  }
  return { wanted: e.wanted as LowestPriceRequest, accepted: accepted as number[] }
}

// 정답 파일에서 고른 묶음(set)의 사례만 꺼낸다. 형식이 틀리거나, 조정용·평가용에 같은 묶음 id(group)가 있거나,
// 고른 묶음의 사례가 0개면 던진다(0개를 '성공'으로 보고하지 않는다).
export function selectCases<E>(
  raw: unknown,
  set: EvalSet,
  check: (expected: unknown, id: string) => E,
  label: string,
): EvalCaseFile<E>[] {
  if (!Array.isArray(raw)) throw new Error(`${label}: 정답 파일은 배열이어야 한다`)
  const ids = new Set<string>()
  const groupSet = new Map<string, EvalSet>()
  const all = raw.map((c: unknown, i): EvalCaseFile<E> => {
    if (!isRec(c) || !nonEmpty(c.id)) throw new Error(`${label}: ${i + 1}번째 사례에 id가 없다`)
    const id = c.id
    if (ids.has(id)) fail(id, 'id가 겹친다')
    ids.add(id)
    for (const key of ['source', 'license', 'edits', 'group'] as const) {
      if (!nonEmpty(c[key])) fail(id, `${key}가 비었다`)
    }
    if (!SETS.includes(c.set as EvalSet)) fail(id, 'set은 조정용이나 평가용')
    const caseSet = c.set as EvalSet
    const file = typeof c.file === 'string' ? c.file : ''
    const m = /^[^/\\.][^/\\]*\/(조정용|평가용)\/[^/\\]+$/.exec(file)
    if (m === null || file.includes('..') || m[1] !== caseSet) {
      fail(id, `file은 _개인기록/평가/ 아래 '종류/${caseSet}/파일' 꼴이어야 한다`)
    }
    if (c.uncertain !== undefined && c.uncertain !== true) fail(id, 'uncertain은 true만 적는다')
    if (c.uncertain === true && !nonEmpty(c.uncertainReason)) fail(id, 'uncertain이면 uncertainReason을 적는다')
    if (c.synthetic !== undefined && c.synthetic !== true) fail(id, 'synthetic은 true만 적는다')
    const group = c.group as string
    const seen = groupSet.get(group)
    if (seen !== undefined && seen !== caseSet) {
      throw new Error(`${label}: 묶음 ${group}이 조정용과 평가용에 함께 있다(누출). 한쪽에만 둔다`)
    }
    groupSet.set(group, caseSet)
    return {
      id,
      file,
      source: c.source as string,
      license: c.license as string,
      edits: c.edits as string,
      set: caseSet,
      group,
      ...(c.uncertain === true ? { uncertain: true as const, uncertainReason: c.uncertainReason as string } : {}),
      ...(c.synthetic === true ? { synthetic: true as const } : {}),
      expected: check(c.expected, id),
    }
  })
  const picked = all.filter((c) => c.set === set)
  if (picked.length === 0) {
    throw new Error(`${label}: '${set}' 사례가 0개라 실행하지 않는다. 정답 파일에 그 묶음 사례를 먼저 적는다`)
  }
  return picked
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

// 정답 파일을 읽어 고른 묶음의 사례와 파일 해시(실행 전후 같은지 보는 데 씀)를 돌려준다
export function loadCases<E>(
  path: string,
  set: EvalSet,
  check: (expected: unknown, id: string) => E,
  label: string,
): { cases: EvalCaseFile<E>[]; sha256: string } {
  const bytes = readFileSync(path)
  return { cases: selectCases(JSON.parse(bytes.toString('utf8')) as unknown, set, check, label), sha256: sha256(bytes) }
}

export function dataPath(file: string): string {
  return resolve(DATA_ROOT, file)
}

// ---- 인자 ----

export function parseArgs(
  argv: string[],
  opts: { server: boolean },
): { set: EvalSet; server: string | null; check: boolean; again: boolean } {
  let set: EvalSet | null = null
  let server: string | null = null
  let check = false
  let again = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--set') {
      const v = argv[++i]
      if (!SETS.includes(v as EvalSet)) throw new Error('--set은 조정용이나 평가용')
      set = v as EvalSet
    } else if (a === '--server' && opts.server) {
      server = (argv[++i] ?? '').replace(/\/+$/, '')
      if (!/^https?:\/\/\S+$/.test(server)) throw new Error('--server는 http(s) 주소')
    } else if (a === '--check') {
      check = true
    } else if (a === '--again') {
      again = true
    } else {
      throw new Error(`모르는 인자 ${a}`)
    }
  }
  if (set === null) throw new Error('--set 조정용|평가용 이 필요하다')
  if (opts.server && !check && server === null) throw new Error('--server <AI 서버 주소>가 필요하다(--check는 빼도 됨)')
  return { set, server, check, again }
}

// ---- 자료 파일 머리 ----

// JPEG의 SOF 머리에서 가로·세로를 읽는다. JPEG가 아니거나 찾지 못하면 null.
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i + 9 <= bytes.length) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1]
    if (marker === 0xff) {
      i++
      continue
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] }
    }
    i += 2 + length
  }
  return null
}

const PHOTO_MAX_SIDE = 1600 // 앱이 보내는 사진의 긴 변(JPEG 품질 0.85). 자료를 넣을 때 이렇게 줄여 둔다
const PHOTO_MAX_CHARS = 4_100_000 // 서버의 사진 본문 상한(글자)

// 사진 자료(_개인기록/평가/ 기준 경로)를 읽어 앱이 보내는 모양인지 검사하고 base64로 돌려준다
// (가격표 사진·치수 캡처 공통). 줄이거나 바꾸지 않고, 맞지 않으면 던진다.
export function loadPhoto(id: string, file: string): { image: string; width: number; height: number } {
  const bytes = readFileSync(dataPath(file))
  const size = jpegSize(bytes)
  if (size === null) throw new Error(`${id}: JPEG가 아니다. 앱처럼 JPEG로 바꿔 넣는다`)
  if (Math.max(size.width, size.height) > PHOTO_MAX_SIDE) {
    throw new Error(`${id}: 긴 변 ${Math.max(size.width, size.height)}px. 앱처럼 ${PHOTO_MAX_SIDE}px 이하로 줄여 넣는다`)
  }
  const image = bytes.toString('base64')
  if (image.length + 100 > PHOTO_MAX_CHARS) throw new Error(`${id}: 서버 상한(${PHOTO_MAX_CHARS}자)을 넘는다`)
  return { image, ...size }
}

// WAV(RIFF)의 길이(초). WAV가 아니면 null.
export function wavSeconds(bytes: Uint8Array): number | null {
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let byteRate = 0
  let i = 12
  while (i + 8 <= bytes.length) {
    const id = tag(i)
    const size = dv.getUint32(i + 4, true)
    if (id === 'fmt ' && i + 20 <= bytes.length) byteRate = dv.getUint32(i + 16, true)
    if (id === 'data') return byteRate > 0 ? size / byteRate : null
    i += 8 + size + (size % 2)
  }
  return null
}

// ---- 판·모델·실행 기록 ----

export function promptVersion(...parts: string[]): string {
  return sha256(parts.join('\n')).slice(0, 8)
}

// 서버와 같은 모델 이름(worker/src/gemini.ts의 주소에서 읽는다)
export function modelName(): string {
  const source = readFileSync('worker/src/gemini.ts', 'utf8')
  const m = /models\/([\w.-]+):generateContent/.exec(source)
  if (m === null) throw new Error('worker/src/gemini.ts에서 모델 이름을 찾지 못했다')
  return m[1]
}

export function gitState(): { head: string; dirty: string[] } {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'eval', 'worker/src', 'src/ai'], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.trim() !== '')
  return { head, dirty }
}

export function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---- 실행 ----

export function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

// 사례를 하나씩 차례로 돌리고 사이에 GAP_MS를 둔다(동시에 보내지 않는다)
export async function runSequential<T, R>(items: T[], run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i++) {
    if (i > 0) await sleep(GAP_MS)
    out.push(await run(items[i], i))
  }
  return out
}

// 평가 스크립트 여러 개가 동시에 돌지 않게 결과 폴더에 잠금 파일을 둔다
export async function withRunLock<R>(feature: string, run: () => Promise<R>): Promise<R> {
  mkdirSync(RESULT_DIR, { recursive: true })
  const lock = `${RESULT_DIR}/.running`
  let fd: number
  try {
    fd = openSync(lock, 'wx')
  } catch {
    throw new Error(`다른 평가가 실행 중이다(${lock}). 끝난 뒤 다시 한다. 멈춘 실행이 남긴 파일이면 그 파일을 치운다`)
  }
  writeFileSync(fd, `${feature} ${new Date().toISOString()}\n`)
  closeSync(fd)
  try {
    return await run()
  } finally {
    rmSync(lock, { force: true })
  }
}

// 평가용은 마지막 판에서 한 번만 돈다(F43). 이미 결과가 있으면 --again 없이는 멈춘다.
export function guardSecondRun(feature: string, set: EvalSet, again: boolean): void {
  if (set !== '평가용' || again || !existsSync(RESULT_DIR)) return
  const prev = readdirSync(RESULT_DIR).filter((f) => f.startsWith(`${feature}_평가용_`))
  if (prev.length > 0) {
    throw new Error(`평가용 결과가 이미 있다(${prev.join(', ')}). 평가용은 한 번만 돈다. 정말 다시 돌릴 때만 --again`)
  }
}

export type Reply = { httpStatus: number | null; ms: number | null; body: unknown }

// 우리 AI 서버에 앱과 같은 출처로 보낸다. 시간 초과·네트워크 오류는 httpStatus·ms null.
export async function postJson(server: string, path: string, body: unknown): Promise<Reply> {
  const started = performance.now()
  try {
    const res = await fetch(server + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text) as unknown
    } catch {
      json = null
    }
    return { httpStatus: res.status, ms: Math.round(performance.now() - started), body: json }
  } catch {
    return { httpStatus: null, ms: null, body: null }
  }
}

// ---- 응답 모양 검사(앱의 src/ai/client.ts와 같은 기준, 채점에 쓰는 칸만) ----

const numOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v))
const textOrNull = (v: unknown) => v === null || typeof v === 'string'

export function asTagItems(body: unknown): TagReadItem[] | null {
  if (!isRec(body) || !Array.isArray(body.items)) return null
  const ok = body.items.every(
    (it: unknown) =>
      isRec(it) &&
      typeof it.name === 'string' &&
      numOrNull(it.price) &&
      textOrNull(it.priceCondition) &&
      numOrNull(it.size) &&
      (it.unit === null || UNITS.includes(it.unit)) &&
      numOrNull(it.count),
  )
  return ok ? (body.items as TagReadItem[]) : null
}

// 치수 표기 목록(빈 목록도 쓸 수 있는 응답). 채점에 쓰는 칸(text·kind·w·d·h·unit)만 본다.
export function asSizeCandidates(body: unknown): SizeReadItem[] | null {
  if (!isRec(body) || !Array.isArray(body.candidates)) return null
  const items: SizeReadItem[] = []
  for (const c of body.candidates as unknown[]) {
    if (
      !isRec(c) ||
      typeof c.text !== 'string' ||
      !SIZE_KINDS.includes(c.kind) ||
      !numOrNull(c.w) ||
      !numOrNull(c.d) ||
      !numOrNull(c.h) ||
      !(c.unit === null || SIZE_UNITS.includes(c.unit))
    ) {
      return null
    }
    items.push({
      text: c.text,
      kind: c.kind as SizeReadItem['kind'],
      w: c.w as number | null,
      d: c.d as number | null,
      h: c.h as number | null,
      unit: c.unit as SizeReadItem['unit'],
    })
  }
  return items
}

export function asVoice(body: unknown): VoiceFillResponse | null {
  if (
    isRec(body) &&
    typeof body.transcript === 'string' &&
    textOrNull(body.name) &&
    numOrNull(body.price) &&
    textOrNull(body.reason) &&
    numOrNull(body.desire) &&
    numOrNull(body.periodDays)
  ) {
    return body as VoiceFillResponse
  }
  return null
}

// ---- 결과 ----

export type ResultMeta = {
  casesFile: string
  casesSha256: string
  git: { head: string; dirty: string[] }
  server: string | null
  gapMs: number
  retry: string
  uncertainIds: string[]
}

export function writeResult(
  result: EvalResultFile,
  meta: ResultMeta & { casesSha256After: string },
  raw: unknown[],
): string {
  mkdirSync(RESULT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `${RESULT_DIR}/${result.feature}_${result.set}_${stamp}.json`
  writeFileSync(path, JSON.stringify({ ...result, meta, raw }, null, 2) + '\n', { flag: 'wx' })
  return path
}

// F43 성적표와 같은 말로 분모를 모두 보인다
export function formatTally(t: Tally): string[] {
  const lines = [
    `사례 ${t.cases}개 · 요청 ${t.requests}번 중 실패 ${t.failed}번 · 제한·꺼짐으로 받지 못한 요청 ${t.limited}번`,
    `값이 있는 칸 맞힘 ${t.correct} / ${t.valued}칸 (틀림 ${t.wrong} · 못 읽음 ${t.missed})`,
    t.blank === 0
      ? '표기 없는 칸: 채점한 칸이 없음'
      : `표기 없는 칸을 채움 ${t.filled} / ${t.blank}칸 (비워서 맞음 ${t.blankOk})`,
    `실패한 요청이라 채점하지 않은 표기 없는 칸 ${t.unscored}칸 · 정답에 없는 것을 더 읽음 ${t.extra}개`,
    t.answered === 0 || t.medianMs === null || t.maxMs === null
      ? '응답 시간을 재지 못했어요.'
      : `응답 시간 중앙값 ${seconds(t.medianMs)}초 · 최대 ${seconds(t.maxMs)}초 (${t.answered}번)`,
  ]
  return lines
}

// 사례 한 줄: 값(읽은 글)은 찍지 않고 상태·시간·칸 수만
export function caseLine(c: EvalCase): string {
  const n = (o: FieldOutcome) => c.fields.filter((f) => f.outcome === o).length
  const status = c.httpStatus === null ? '응답 없음' : String(c.httpStatus)
  const ms = c.ms === null ? '-' : `${c.ms}ms`
  return `${c.id} · ${status} · ${ms} · 맞음 ${n('correct')} 틀림 ${n('wrong')} 못 읽음 ${n('missed')} · 표기 없는 칸 맞음 ${n('blank-ok')} 채움 ${n('filled')} · 채점 안 함 ${n('unscored')} · 더 읽음 ${c.extra.length}`
}

// 결과 파일을 쓰고 분모를 모두 찍는다. 실행 중 정답 파일이 바뀌었으면 실패로 끝낸다.
export function finish(result: EvalResultFile, meta: ResultMeta, raw: unknown[]): void {
  const after = sha256(readFileSync(meta.casesFile))
  const path = writeResult(result, { ...meta, casesSha256After: after }, raw)
  console.log(`\n${result.feature} · ${result.set} · 모델 ${result.model} · 프롬프트 판 ${result.promptVersion} · ${result.date}`)
  for (const line of formatTally(tally(result.cases))) console.log(line)
  if (meta.uncertainIds.length > 0) {
    const sure = result.cases.filter((c) => !meta.uncertainIds.includes(c.id))
    console.log(`(정답이 애매한 사례 ${meta.uncertainIds.join(', ')}를 뺀 ${sure.length}개)`)
    for (const line of formatTally(tally(sure))) console.log(`  ${line}`)
  }
  console.log(`결과(원시 응답 포함, 커밋하지 않음): ${path}`)
  if (after !== meta.casesSha256) {
    console.error('정답 파일이 실행 중에 바뀌었다. 이 결과는 쓰지 않는다')
    process.exitCode = 1
  }
}

// 스크립트 끝: 던진 오류는 메시지만 찍고 종료 코드 1(성공으로 보이지 않게)
export function main(run: () => Promise<void>): void {
  run().catch((err: unknown) => {
    console.error(`실패: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
}

// 다나와 직접 호출의 Gemini 결과를 고른 줄 번호(1부터)로 바꾼다. 서버(lowestPrice.ts)처럼 pickRows로 1~n 정수만 남기고
// 중복을 뺀다. Gemini가 429를 주면 제한(429, picked null)이라 채점하지 않고 제한·꺼짐으로 센다(판정 R38-P6).
// 그 밖의 Gemini 실패와 모양이 다른 응답(객체가 아님·rows가 배열이 아님)은 실패(502, picked null)로 센다(F43).
export function asDanawaPicks(
  rows: DanawaRow[],
  result: { ok: true; value: unknown } | GeminiFailure,
): { httpStatus: 200 | 429 | 502; picked: number[] | null } {
  if (!result.ok && result.reason === 'limited') return { httpStatus: 429, picked: null }
  if (!result.ok || !isRec(result.value) || !Array.isArray(result.value.rows)) return { httpStatus: 502, picked: null }
  return { httpStatus: 200, picked: pickRows(rows, result.value.rows).map((row) => rows.indexOf(row) + 1) }
}
