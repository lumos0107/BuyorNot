// AI 성적표 요약(PRD F43). 평가용 결과 파일을 모아 앱이 읽는 요약 파일을 만든다.
//   node eval/summarize.ts --out src/ai/evalSummary.json <평가용 결과 파일들>
// 요약에는 집계와 틀린 예(사례 id·칸·정답·AI 값)만 넣고, 결과 파일의 원시 응답(raw)·실행 기록(meta)·파일 이름은 넣지 않는다.
// 분모는 score.ts의 tally와 같은 방식으로 센다(docs/ai-eval.md의 표와 같은 숫자).
import { readFileSync, writeFileSync } from 'node:fs'
import {
  FEATURE_IDS,
  FEATURE_INFO,
  MAX_FAILURES,
  isEvalSummary,
  reportLines,
  type EvalSummary,
  type FeatureId,
  type FeatureSummary,
} from '../src/ai/evalSummary.ts'
import { main } from './lib.ts'
import { tally, type EvalCase, type EvalResultFile } from './score.ts'

// 틀림·못 읽음·표기 없는 칸 채움을 사례 순서로(사례 안에서는 칸 순서), 사례마다 뒤에 정답에 없는 것을 더 읽음
function failureList(cases: EvalCase[]): FeatureSummary['failures'] {
  const list: FeatureSummary['failures'] = []
  for (const c of cases) {
    for (const f of c.fields) {
      if (f.outcome === 'wrong' || f.outcome === 'missed' || f.outcome === 'filled') {
        list.push({ caseId: c.id, field: f.field, expected: f.expected, got: f.got })
      }
    }
    for (const name of c.extra) list.push({ caseId: c.id, field: null, expected: null, got: name })
  }
  return list
}

export function summarize(file: EvalResultFile): FeatureSummary {
  const t = tally(file.cases)
  const countsExtra = FEATURE_INFO[file.feature].extraWord !== null
  if (!countsExtra && t.extra > 0) {
    throw new Error(`${file.feature}: 더 읽음을 세지 않는 기능인데 사례에 더 읽음이 ${t.extra}개 있다`)
  }
  return {
    id: file.feature,
    evaluatedAt: file.date,
    promptVersion: file.promptVersion,
    samples: t.cases,
    excluded: t.limited,
    requests: { total: t.requests, failed: t.failed },
    valued: { correct: t.correct, wrong: t.wrong, missed: t.missed },
    blank: { total: t.blank, filled: t.filled },
    extra: countsExtra ? t.extra : null,
    // 응답 시간은 쓸 수 있는 응답(200)만 잰다. 중앙값은 tally가 정수 ms로 한 번 반올림한 값 그대로(lib.ts 출력과 같은 값)
    latencyMs: { median: t.medianMs ?? 0, max: Math.round(t.maxMs ?? 0), n: t.answered },
    failures: failureList(file.cases).slice(0, MAX_FAILURES),
    failureTotal: t.wrong + t.missed + t.filled + t.extra,
  }
}

// 평가용 결과만 받는다. 조정용이 섞이거나, 모델이 다르거나, 같은 기능이 두 번이면 던진다.
export function mergeSummaries(files: EvalResultFile[]): EvalSummary {
  const model = files[0]?.model ?? ''
  const byFeature = new Map<FeatureId, FeatureSummary>()
  for (const file of files) {
    if (file.set !== '평가용') throw new Error(`${file.feature}: 조정용 결과는 성적표에 넣지 않는다(평가용만)`)
    if (file.model !== model) throw new Error(`모델이 다르다: ${model}, ${file.model}(${file.feature})`)
    if (byFeature.has(file.feature)) throw new Error(`${file.feature} 결과가 두 번 들어왔다`)
    byFeature.set(file.feature, summarize(file))
  }
  return { model, features: FEATURE_IDS.flatMap((id) => byFeature.get(id) ?? []) }
}

// ---- 명령 ----

export function parseSummarizeArgs(argv: string[]): { out: string; files: string[] } {
  let out: string | null = null
  const files: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out') {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) throw new Error('--out 뒤에 요약 파일 경로가 필요하다')
      out = value
    } else if (arg.startsWith('--')) {
      throw new Error(`모르는 인자 ${arg}`)
    } else {
      files.push(arg)
    }
  }
  if (out === null) throw new Error('--out <요약 파일 경로>가 필요하다')
  if (files.length === 0) throw new Error('평가용 결과 파일이 하나도 없다. 결과 파일 경로를 하나 이상 준다')
  return { out, files }
}

function isCase(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  return typeof c.id === 'string' && Array.isArray(c.fields) && Array.isArray(c.extra)
}

function isResultFile(v: unknown): v is EvalResultFile {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.date === 'string' &&
    typeof r.model === 'string' &&
    typeof r.promptVersion === 'string' &&
    (FEATURE_IDS as readonly unknown[]).includes(r.feature) &&
    (r.set === '조정용' || r.set === '평가용') &&
    Array.isArray(r.cases) &&
    r.cases.every(isCase)
  )
}

function readResultFile(path: string): EvalResultFile {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`${path}: 결과 파일을 읽지 못했다(${err instanceof Error ? err.message : String(err)})`)
  }
  if (!isResultFile(value)) throw new Error(`${path}: 평가 결과 파일 모양이 아니다`)
  return value
}

// 결과 파일을 읽어 요약을 만들고 모양을 검사한 뒤에만 쓴다. 어느 단계든 실패하면 요약 파일은 건드리지 않는다.
export function runSummarize(argv: string[]): EvalSummary {
  const { out, files } = parseSummarizeArgs(argv)
  const summary = mergeSummaries(files.map(readResultFile))
  if (!isEvalSummary(summary)) throw new Error('만든 요약이 성적표 모양 검사를 통과하지 못했다(요약 코드 오류)')
  writeFileSync(out, JSON.stringify(summary, null, 2) + '\n')
  return summary
}

if (import.meta.main) {
  main(async () => {
    const summary = runSummarize(process.argv.slice(2))
    console.log(`요약 파일을 썼다 · 모델 ${summary.model} · 기능 ${summary.features.length}개`)
    for (const feature of summary.features) {
      const r = reportLines(feature)
      console.log(`\n${r.title}`)
      for (const line of [...r.lines, r.failureHead]) console.log(`  ${line}`)
    }
  })
}
