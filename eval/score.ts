// AI 평가 채점(PRD F43). 실제 Gemini를 부르지 않는 순수 함수만 둔다. 평가 스크립트(*.eval.ts)와 테스트가 함께 쓴다.
import type { LowestPriceRequest, SizeCandidate, TagItem, VoiceFillResponse } from '../src/ai/types.ts'

// correct·wrong·missed: 정답에 값이 있는 칸 / blank-ok·filled: 정답이 '표기 없음'인 칸
// unscored: 실패한 요청의 표기 없는 칸(분모에서 뺌)
export type FieldOutcome = 'correct' | 'wrong' | 'missed' | 'blank-ok' | 'filled' | 'unscored'

// httpStatus는 채점용 분류다. 200 = 쓸 수 있는 응답, 429·503 = 제한·꺼짐(fields는 빈 배열): 429는 우리 서버의 같은 IP 제한(rate_limited)과
// Gemini의 제한(upstream_limited, 서버를 거치지 않는 다나와 직접 호출의 Gemini 429 포함), 503은 서버가 꺼져 있거나 키가 없음(disabled)(PRD v0.38 10장).
// null = 시간 초과·네트워크 오류, 그 밖 = 실패(다나와 직접 호출의 그 밖의 Gemini 실패, 모양이 다른 응답은 502로 적는다).
export type EvalCase = {
  id: string
  httpStatus: number | null
  ms: number | null
  fields: { field: string; expected: string | null; got: string | null; outcome: FieldOutcome }[]
  extra: string[]
}

export type EvalResultFile = {
  date: string
  model: string
  feature: 'read-tag' | 'lowest-price' | 'voice-fill' | 'read-size'
  set: '조정용' | '평가용'
  promptVersion: string
  cases: EvalCase[]
}

// 정답 파일(eval/cases/*.json)의 expected. 단위는 서버가 정규화한 값(g·kg·mL·L·ea)으로 적는다.
export type TagExpected = {
  nameKeywords: string
  price: number | null
  priceCondition: string | null
  size: number | null
  unit: string | null
  count: number | null
}
export type TagReadItem = Pick<TagItem, 'name' | 'price' | 'priceCondition' | 'size' | 'unit' | 'count'>
export type VoiceExpected = {
  nameKeywords: string | null
  price: number | null
  reasonKeywords: string | null
  desire: number | null
  periodDays: number | null
}
export type DanawaExpected = { wanted: LowestPriceRequest; accepted: number[] }
// 치수 정답: 표기마다 하나. textKeywords는 AI가 적힌 그대로 옮긴 text에서 짝을 찾는 키워드, kind·unit은 서버 값 그대로
export type SizeExpected = {
  textKeywords: string
  kind: SizeCandidate['kind']
  w: number | null
  d: number | null
  h: number | null
  unit: SizeCandidate['unit']
}
export type SizeReadItem = Pick<SizeCandidate, 'text' | 'kind' | 'w' | 'd' | 'h' | 'unit'>

type Field = EvalCase['fields'][number]
type Reply = { httpStatus: number | null; ms: number | null }

const same = (expected: string, got: string) => expected === got

export function scoreField(
  expected: string | null,
  got: string | null,
  match: (expected: string, got: string) => boolean = same,
): FieldOutcome {
  if (expected === null) return got === null ? 'blank-ok' : 'filled'
  if (got === null) return 'missed'
  return match(expected, got) ? 'correct' : 'wrong'
}

function squash(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

// 공백으로 나눈 키워드가 AI 값에 모두 들어 있으면 맞음. AI 값의 띄어쓰기·대소문자는 무시한다.
export function keywordMatch(keywords: string, got: string): boolean {
  const words = keywords.split(/\s+/).filter((w) => w !== '')
  if (words.length === 0) return false
  const hay = squash(got)
  return words.every((w) => hay.includes(w.toLowerCase()))
}

// 정답 순서대로, 키워드가 모두 들어 있고 아직 짝이 없는 첫 AI 결과와 짝짓는다. 짝이 없는 AI 결과는 extra.
export function pairByKeywords(expected: string[], got: string[]): { pairs: [number, number][]; extra: number[] } {
  const used = new Set<number>()
  const pairs: [number, number][] = []
  expected.forEach((keywords, i) => {
    const j = got.findIndex((name, k) => !used.has(k) && keywordMatch(keywords, name))
    if (j < 0) return
    used.add(j)
    pairs.push([i, j])
  })
  const extra = got.map((_, k) => k).filter((k) => !used.has(k))
  return { pairs, extra }
}

// accepted·picked는 줄 번호(1부터), prices[i-1]은 줄 i의 가격.
export function scoreDanawa(accepted: number[], picked: number[], prices: number[]): FieldOutcome {
  if (accepted.length === 0) return picked.length === 0 ? 'blank-ok' : 'filled'
  if (picked.length === 0) return 'missed'
  if (picked.some((n) => !accepted.includes(n))) return 'wrong'
  const lowest = Math.min(...accepted.map((n) => prices[n - 1]))
  // 판정 R15: 가장 낮은 가격의 허용 줄이 여럿이면 그중 하나만 골라도 된다(앱에 보이는 가장 낮은 가격이 같다)
  return picked.some((n) => prices[n - 1] === lowest) ? 'correct' : 'wrong'
}

// 시간 초과·서버 오류·모양이 다른 응답: 값이 있는 칸은 못 읽음, 표기 없는 칸은 채점하지 않음
export function failedFields(fields: { field: string; expected: string | null }[]): EvalCase['fields'] {
  return fields.map((f) => ({
    field: f.field,
    expected: f.expected,
    got: null,
    outcome: f.expected === null ? 'unscored' : 'missed',
  }))
}

export function isLimited(httpStatus: number | null): boolean {
  return httpStatus === 429 || httpStatus === 503
}

function text(v: string | number | null | undefined): string | null {
  return v === null || v === undefined ? null : String(v)
}

const TAG_FIELDS = [
  ['가격', 'price'],
  ['가격 조건', 'priceCondition'],
  ['개당 용량', 'size'],
  ['단위', 'unit'],
  ['개수', 'count'],
] as const

function tagFields(n: number, exp: TagExpected, got: TagReadItem | null): Field[] {
  const label = `상품${n}`
  const name: Field = {
    field: `${label} 이름`,
    expected: exp.nameKeywords,
    got: got?.name ?? null,
    outcome: scoreField(exp.nameKeywords, got?.name ?? null, keywordMatch),
  }
  const rest = TAG_FIELDS.map(([title, key]): Field => {
    const e = text(exp[key])
    const g = got === null ? null : text(got[key])
    return { field: `${label} ${title}`, expected: e, got: g, outcome: scoreField(e, g) }
  })
  return [name, ...rest]
}

export function scoreTagCase(
  id: string,
  expected: TagExpected[],
  reply: Reply & { items: TagReadItem[] | null },
): EvalCase {
  const base = { id, httpStatus: reply.httpStatus, ms: reply.ms }
  if (isLimited(reply.httpStatus)) return { ...base, fields: [], extra: [] }
  if (reply.items === null) {
    const fields = expected.flatMap((exp, i) => tagFields(i + 1, exp, null))
    return { ...base, fields: failedFields(fields), extra: [] }
  }
  const items = reply.items
  const { pairs, extra } = pairByKeywords(
    expected.map((e) => e.nameKeywords),
    items.map((it) => it.name),
  )
  const partner = new Map(pairs)
  const fields = expected.flatMap((exp, i) => {
    const j = partner.get(i)
    return tagFields(i + 1, exp, j === undefined ? null : items[j])
  })
  return { ...base, fields, extra: extra.map((k) => items[k].name) }
}

export function scoreVoiceCase(
  id: string,
  expected: VoiceExpected,
  reply: Reply & { value: VoiceFillResponse | null },
): EvalCase {
  const base = { id, httpStatus: reply.httpStatus, ms: reply.ms }
  if (isLimited(reply.httpStatus)) return { ...base, fields: [], extra: [] }
  const v = reply.value
  const rows: [string, string | null, string | null, ((e: string, g: string) => boolean)?][] = [
    ['상품명', expected.nameKeywords, v?.name ?? null, keywordMatch],
    ['가격', text(expected.price), text(v?.price)],
    ['이유 키워드', expected.reasonKeywords, v?.reason ?? null, keywordMatch],
    ['정도', text(expected.desire), text(v?.desire)],
    ['기간', text(expected.periodDays), text(v?.periodDays)],
  ]
  if (v === null) return { ...base, fields: failedFields(rows.map(([field, e]) => ({ field, expected: e }))), extra: [] }
  const fields = rows.map(([field, e, g, match]): Field => ({ field, expected: e, got: g, outcome: scoreField(e, g, match) }))
  return { ...base, fields, extra: [] }
}

export function scoreDanawaCase(
  id: string,
  expected: DanawaExpected,
  reply: Reply & { picked: number[] | null; prices: number[] },
): EvalCase {
  const base = { id, httpStatus: reply.httpStatus, ms: reply.ms }
  if (isLimited(reply.httpStatus)) return { ...base, fields: [], extra: [] }
  const e = expected.accepted.length === 0 ? null : expected.accepted.join(',')
  if (reply.picked === null) return { ...base, fields: failedFields([{ field: '고른 줄', expected: e }]), extra: [] }
  const g = reply.picked.length === 0 ? null : reply.picked.join(',')
  const outcome = scoreDanawa(expected.accepted, reply.picked, reply.prices)
  return { ...base, fields: [{ field: '고른 줄', expected: e, got: g, outcome }], extra: [] }
}

// 칸: 가로·깊이·높이·단위·제품/포장(PRD F43). 제품/포장은 서버의 product·package를 '제품'·'포장'으로 적고
// unknown(제품인지 포장인지 적혀 있지 않음)은 '표기 없음'이라 빈칸으로 본다. 단위 mixed는 값이다.
// 표기 키워드는 짝짓기에만 쓰고 칸으로 채점하지 않는다.
const SIZE_KIND_TEXT = { product: '제품', package: '포장', unknown: null } as const

function sizeFields(n: number, exp: SizeExpected, got: SizeReadItem | null): Field[] {
  const label = `표기${n}`
  const rows: [string, string | null, string | null][] = [
    ['가로', text(exp.w), got === null ? null : text(got.w)],
    ['깊이', text(exp.d), got === null ? null : text(got.d)],
    ['높이', text(exp.h), got === null ? null : text(got.h)],
    ['단위', text(exp.unit), got === null ? null : text(got.unit)],
    ['제품·포장', SIZE_KIND_TEXT[exp.kind], got === null ? null : SIZE_KIND_TEXT[got.kind]],
  ]
  return rows.map(([title, e, g]): Field => ({ field: `${label} ${title}`, expected: e, got: g, outcome: scoreField(e, g) }))
}

export function scoreSizeCase(
  id: string,
  expected: SizeExpected[],
  reply: Reply & { candidates: SizeReadItem[] | null },
): EvalCase {
  const base = { id, httpStatus: reply.httpStatus, ms: reply.ms }
  if (isLimited(reply.httpStatus)) return { ...base, fields: [], extra: [] }
  if (reply.candidates === null) {
    const fields = expected.flatMap((exp, i) => sizeFields(i + 1, exp, null))
    return { ...base, fields: failedFields(fields), extra: [] }
  }
  const items = reply.candidates
  const { pairs, extra } = pairByKeywords(
    expected.map((e) => e.textKeywords),
    items.map((it) => it.text),
  )
  const partner = new Map(pairs)
  const fields = expected.flatMap((exp, i) => {
    const j = partner.get(i)
    return sizeFields(i + 1, exp, j === undefined ? null : items[j])
  })
  return { ...base, fields, extra: extra.map((k) => items[k].text) }
}

// F43 성적표의 분모를 모두 센다. requests = 제한·꺼짐을 뺀 요청, answered = 응답 시간을 잰 요청(200).
export type Tally = {
  cases: number
  requests: number
  limited: number
  failed: number
  valued: number
  correct: number
  wrong: number
  missed: number
  blank: number
  blankOk: number
  filled: number
  unscored: number
  extra: number
  answered: number
  medianMs: number | null
  maxMs: number | null
}

// 짝수 개면 가운데 둘의 평균. 정수 ms로 여기서 한 번만 반올림해, 평가 출력(lib.ts)과 카드(summarize.ts)가 같은 값에서 초를 만든다
// (따로 반올림하면 4149.5ms가 한쪽은 4.1초, 한쪽은 4.2초로 갈린다).
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function tally(cases: EvalCase[]): Tally {
  const count = (o: FieldOutcome) => cases.reduce((n, c) => n + c.fields.filter((f) => f.outcome === o).length, 0)
  const limited = cases.filter((c) => isLimited(c.httpStatus)).length
  const failed = cases.filter((c) => !isLimited(c.httpStatus) && c.httpStatus !== 200).length
  const times = cases
    .filter((c) => c.httpStatus === 200 && c.ms !== null)
    .map((c) => c.ms as number)
    .sort((a, b) => a - b)
  const [correct, wrong, missed, blankOk, filled, unscored] = (
    ['correct', 'wrong', 'missed', 'blank-ok', 'filled', 'unscored'] as const
  ).map(count)
  return {
    cases: cases.length,
    requests: cases.length - limited,
    limited,
    failed,
    valued: correct + wrong + missed,
    correct,
    wrong,
    missed,
    blank: blankOk + filled,
    blankOk,
    filled,
    unscored,
    extra: cases.reduce((n, c) => n + c.extra.length, 0),
    answered: times.length,
    medianMs: median(times),
    maxMs: times.length === 0 ? null : times[times.length - 1],
  }
}
