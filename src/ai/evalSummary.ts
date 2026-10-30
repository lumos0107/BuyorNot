// AI 성적표(PRD F43)의 요약 파일 모양, 모양 검사, 화면 문장.
// 요약 파일 src/ai/evalSummary.json은 eval/summarize.ts가 평가용 결과로만 만들고, 앱은 그것만 읽는다.
// eval/summarize.ts도 이 파일을 가져오므로 다른 앱 모듈이나 import.meta.env에 기대지 않는다.

export type FeatureId = 'read-tag' | 'lowest-price' | 'voice-fill' | 'read-size'

// 성적표에 싣는 순서이기도 하다
export const FEATURE_IDS: readonly FeatureId[] = ['read-tag', 'lowest-price', 'voice-fill', 'read-size']

// 한 기능의 집계. 원시 응답·사진·녹음·자료 파일 이름은 넣지 않고, 틀린 예는 사례 id·칸·정답·AI 값만 담는다.
// extra(정답에 없는 것을 더 읽음)는 가격표·치수만 숫자이고 나머지는 null이다.
// failures의 field가 null이면 '정답에 없는 것을 더 읽음' 줄이고, 이때 got이 읽은 이름이나 표기다.
export type FeatureSummary = {
  id: FeatureId
  evaluatedAt: string
  promptVersion: string
  samples: number
  excluded: number
  requests: { total: number; failed: number }
  valued: { correct: number; wrong: number; missed: number }
  blank: { total: number; filled: number }
  extra: number | null
  latencyMs: { median: number; max: number; n: number }
  failures: { caseId: string; field: string | null; expected: string | null; got: string | null }[]
  failureTotal: number
}

export type EvalSummary = { model: string; features: FeatureSummary[] }

export const FEATURE_INFO: Record<FeatureId, { title: string; unit: '장' | '개' | '문장'; extraWord: '상품' | '표기' | null }> = {
  'read-tag': { title: '가격표 사진 읽기', unit: '장', extraWord: '상품' },
  'lowest-price': { title: '다나와 같은 상품 고르기', unit: '개', extraWord: null },
  'voice-fill': { title: '말로 담기', unit: '문장', extraWord: null },
  'read-size': { title: '치수 읽기', unit: '장', extraWord: '표기' },
}

// 틀린 예로 보이는 줄 수의 상한(PRD F43)
export const MAX_FAILURES = 5

// ---- 모양 검사 ----

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

function isTextOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

function isFailure(v: unknown): boolean {
  return isRec(v) && typeof v.caseId === 'string' && isTextOrNull(v.field) && isTextOrNull(v.expected) && isTextOrNull(v.got)
}

function isFeatureId(v: unknown): v is FeatureId {
  return (FEATURE_IDS as readonly unknown[]).includes(v)
}

// 칸마다 모양을 보고, 그다음 수끼리의 관계를 본다
function isFeature(v: unknown): v is FeatureSummary {
  if (!isRec(v) || !isFeatureId(v.id)) return false
  const { requests, valued, blank, latencyMs, failures } = v
  if (typeof v.evaluatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.evaluatedAt)) return false
  if (typeof v.promptVersion !== 'string') return false
  if (!isCount(v.samples) || !isCount(v.excluded) || !isCount(v.failureTotal)) return false
  if (!(v.extra === null || isCount(v.extra))) return false
  if (!isRec(requests) || !isCount(requests.total) || !isCount(requests.failed)) return false
  if (!isRec(valued) || !isCount(valued.correct) || !isCount(valued.wrong) || !isCount(valued.missed)) return false
  if (!isRec(blank) || !isCount(blank.total) || !isCount(blank.filled)) return false
  if (!isRec(latencyMs) || !isCount(latencyMs.median) || !isCount(latencyMs.max) || !isCount(latencyMs.n)) return false
  if (!Array.isArray(failures) || !failures.every(isFailure)) return false

  // 관계: 요청 = 표본 − 제한·꺼짐, 실패 ≤ 요청, 채움 ≤ 표기 없는 칸, 틀린 예 전체 = 틀림+못 읽음+채움+더 읽음
  return (
    requests.total === v.samples - v.excluded &&
    requests.failed <= requests.total &&
    blank.filled <= blank.total &&
    v.failureTotal === valued.wrong + valued.missed + blank.filled + (v.extra ?? 0) &&
    failures.length <= Math.min(MAX_FAILURES, v.failureTotal) &&
    latencyMs.n <= requests.total &&
    // 더 읽음은 가격표·치수만 센다
    (v.extra === null) === (FEATURE_INFO[v.id].extraWord === null)
  )
}

export function isEvalSummary(v: unknown): v is EvalSummary {
  return isRec(v) && typeof v.model === 'string' && Array.isArray(v.features) && v.features.every(isFeature)
}

// ---- 화면 문장 (PRD F43, AC63) ----

export function reportHeader(s: EvalSummary): [string, string] {
  return [`모델 ${s.model}`, '직접 모은 작은 자료로 잰 결과라 일반적인 정확도를 뜻하지 않아요.']
}

// AC63 예시가 "정답에 없는 상품을 더 읽음"이라 상품은 '을', 표기는 '를'이다
const EXTRA_OBJECT = { 상품: '상품을', 표기: '표기를' } as const

// 소수 첫째 자리 초. 부동소수 나눗셈(2.05.toFixed(1)이 2.0)을 피하려고 100ms 단위 정수로 반올림한다.
export function seconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1)
}

function failureLine(f: FeatureSummary['failures'][number]): string {
  const got = f.got === null ? 'AI 빈칸' : `AI '${f.got}'`
  if (f.field === null) return `${f.caseId}: 정답에 없음 → ${got}`
  const expected = f.expected === null ? '정답 표기 없음' : `정답 '${f.expected}'`
  return `${f.caseId} ${f.field}: ${expected} → ${got}`
}

export function reportLines(f: FeatureSummary): { title: string; lines: string[]; failureHead: string; failureLines: string[] } {
  const info = FEATURE_INFO[f.id]
  const valuedTotal = f.valued.correct + f.valued.wrong + f.valued.missed
  const lines = [
    `값이 있는 칸 맞힘 ${f.valued.correct} / ${valuedTotal}칸 (틀림 ${f.valued.wrong} · 못 읽음 ${f.valued.missed})`,
    f.blank.total === 0 ? '표기 없는 칸이 없는 자료라 재지 않았어요.' : `표기 없는 칸을 채움 ${f.blank.filled} / ${f.blank.total}칸`,
  ]
  if (f.extra !== null && info.extraWord !== null) {
    lines.push(`정답에 없는 ${EXTRA_OBJECT[info.extraWord]} 더 읽음 ${f.extra}개`)
  }
  lines.push(
    f.requests.failed === 0
      ? `요청 ${f.requests.total}번 모두 응답을 받았어요.`
      : `요청 ${f.requests.total}번 중 실패 ${f.requests.failed}번(시간 초과·서버 오류). 실패한 요청의 값이 있는 칸은 못 읽음으로 셌어요.`,
  )
  if (f.excluded > 0) lines.push(`제한·꺼짐으로 받지 못한 요청 ${f.excluded}번(정확도에서 뺐어요)`)
  lines.push(
    f.latencyMs.n === 0
      ? '응답 시간을 재지 못했어요.'
      : `응답 시간 중앙값 ${seconds(f.latencyMs.median)}초 · 최대 ${seconds(f.latencyMs.max)}초 (${f.latencyMs.n}번)`,
  )
  return {
    title: `${info.title} · ${f.samples}${info.unit} · 평가일 ${f.evaluatedAt} · 프롬프트 판 ${f.promptVersion}`,
    lines,
    failureHead: f.failureTotal === 0 ? '틀린 예가 없어요.' : `틀린 예 ${f.failureTotal}개 중 앞 ${f.failures.length}개(자료 순서)`,
    failureLines: f.failures.map(failureLine),
  }
}
