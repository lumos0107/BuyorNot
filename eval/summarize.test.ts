// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isEvalSummary } from '../src/ai/evalSummary.ts'
import {
  failedFields,
  scoreTagCase,
  type EvalCase,
  type EvalResultFile,
  type FieldOutcome,
  type TagExpected,
  type TagReadItem,
} from './score.ts'
import { mergeSummaries, parseSummarizeArgs, runSummarize, summarize } from './summarize.ts'

// PRD F43 성적표 요약. 채점기(score.ts)가 만든 사례를 그대로 집계하고, 분모는 score.ts의 tally와 같은 방식으로 센다.
// 집계 규칙(계획 Task 1): excluded = 429·503, failed = 나머지 중 200이 아닌 사례(상태 없음 포함), unscored는 어디에도 세지 않음.

function item(name: string, over: Partial<TagReadItem> = {}): TagReadItem {
  return { name, price: null, priceCondition: null, size: null, unit: null, count: null, ...over }
}

function tagExpected(nameKeywords: string, over: Partial<TagExpected> = {}): TagExpected {
  return { nameKeywords, price: null, priceCondition: null, size: null, unit: null, count: null, ...over }
}

function field(name: string, expected: string | null, got: string | null, outcome: FieldOutcome) {
  return { field: name, expected, got, outcome }
}

function kase(id: string, over: Partial<EvalCase> = {}): EvalCase {
  return { id, httpStatus: 200, ms: 1000, fields: [], extra: [], ...over }
}

function resultFile(cases: EvalCase[], over: Partial<EvalResultFile> = {}): EvalResultFile {
  return {
    date: '2026-11-02',
    model: 'gemini-3.5-flash-lite',
    feature: 'read-tag',
    set: '평가용',
    promptVersion: '1a2b3c4d',
    cases,
    ...over,
  }
}

// 채점기 테스트(score.test.ts)의 가격표 정답: 상품1 보리차(값이 있는 칸 5·표기 없는 칸 1), 상품2 옥수수(값이 있는 칸 2·표기 없는 칸 4)
const EXPECTED = [
  tagExpected('보리차', { price: 4550, size: 1.5, unit: 'g', count: 50 }),
  tagExpected('옥수수', { price: 4950 }),
]

describe('summarize', () => {
  // plan: summarize turns the AC62 scored cases into the F43 aggregates
  it('AC62: 채점한 사례들이 요청·칸·더 읽음·응답 시간과 틀린 예 집계로 이어져요', () => {
    const cases = [
      // 짝 2개만 채점, 더 읽음 1: 맞음 7·표기 없는 칸 맞음 5
      scoreTagCase('rt01', EXPECTED, {
        httpStatus: 200,
        ms: 3100,
        items: [
          item('동서 한잔용 보리차', { price: 4550, size: 1.5, unit: 'g', count: 50 }),
          item('동서 루이보스 보리차', { price: 4500 }),
          item('동서 한잔용 옥수수차', { price: 4950 }),
        ],
      }),
      // 시간 초과: 값이 있는 칸 7 못 읽음, 표기 없는 칸 5는 채점하지 않음
      scoreTagCase('rt02', EXPECTED, { httpStatus: null, ms: null, items: null }),
      // 429: 칸 없음
      scoreTagCase('rt03', EXPECTED, { httpStatus: 429, ms: 40, items: null }),
      // 가격 틀림 1·표기 없는 칸 개수 채움 1: 맞음 1·표기 없는 칸 맞음 3
      scoreTagCase('rt04', [EXPECTED[1]], {
        httpStatus: 200,
        ms: 2000,
        items: [item('한잔용 옥수수차', { price: 4550, count: 50 })],
      }),
      // 키워드가 든 AI 상품이 없음: 값이 있는 칸 5 못 읽음, 표기 없는 칸 맞음 1, 더 읽음 1
      scoreTagCase('rt05', [EXPECTED[0]], { httpStatus: 200, ms: 4000, items: [item('현미녹차', { price: 4550 })] }),
    ]
    const s = summarize(resultFile(cases))

    expect(s.id).toBe('read-tag')
    expect(s.evaluatedAt).toBe('2026-11-02')
    expect(s.promptVersion).toBe('1a2b3c4d')
    expect(s.samples).toBe(5)
    expect(s.excluded).toBe(1)
    expect(s.requests).toEqual({ total: 4, failed: 1 })
    // 맞음 7+1, 틀림 1, 못 읽음 7+5
    expect(s.valued).toEqual({ correct: 8, wrong: 1, missed: 12 })
    // 표기 없는 칸: 맞음 5+3+1 + 채움 1 = 10칸 중 채움 1. 시간 초과 사례의 5칸은 어디에도 세지 않는다
    expect(s.blank).toEqual({ total: 10, filled: 1 })
    expect(s.extra).toBe(2)
    // 응답을 받은 요청은 200인 rt01·rt04·rt05
    expect(s.latencyMs).toEqual({ median: 3100, max: 4000, n: 3 })
    // 틀린 예 = 틀림 1 + 못 읽음 12 + 채움 1 + 더 읽음 2
    expect(s.failureTotal).toBe(16)
    // 사례 순서: rt01의 더 읽음, rt02의 칸 순서대로 못 읽음 앞 4개(상품1 이름·가격·개당 용량·단위)
    expect(s.failures).toEqual([
      { caseId: 'rt01', field: null, expected: null, got: '동서 루이보스 보리차' },
      { caseId: 'rt02', field: '상품1 이름', expected: '보리차', got: null },
      { caseId: 'rt02', field: '상품1 가격', expected: '4550', got: null },
      { caseId: 'rt02', field: '상품1 개당 용량', expected: '1.5', got: null },
      { caseId: 'rt02', field: '상품1 단위', expected: 'g', got: null },
    ])
    expect(isEvalSummary({ model: 'gemini-3.5-flash-lite', features: [s] })).toBe(true)
  })

  // plan: counts 429 and 503 as excluded and leaves them out of requests and latency
  it('AC62: 429와 503은 제한·꺼짐으로 세고 요청과 응답 시간에서 빼요', () => {
    const s = summarize(
      resultFile([
        kase('rt01', { ms: 1000 }),
        kase('rt02', { httpStatus: 429, ms: 50 }),
        kase('rt03', { httpStatus: 503, ms: 30 }),
      ]),
    )
    expect(s.samples).toBe(3)
    expect(s.excluded).toBe(2)
    expect(s.requests).toEqual({ total: 1, failed: 0 })
    expect(s.latencyMs).toEqual({ median: 1000, max: 1000, n: 1 })
  })

  // plan: failed requests count valued fields missed and do not count unscored blank fields
  it('AC62: 실패한 요청은 값이 있는 칸을 못 읽음으로 세고 채점하지 않은 표기 없는 칸은 어디에도 세지 않아요', () => {
    const failed = (id: string, httpStatus: number | null, ms: number | null) =>
      kase(id, {
        httpStatus,
        ms,
        fields: failedFields([
          { field: 'v1', expected: '1' },
          { field: 'v2', expected: '2' },
          { field: 'b1', expected: null },
        ]),
      })
    // 시간 초과(상태·시간 없음), 서버 오류 500, 모양이 다른 200 응답을 502로 적은 사례
    const s = summarize(resultFile([failed('a', null, null), failed('b', 500, 900), failed('c', 502, 1200)]))
    expect(s.requests).toEqual({ total: 3, failed: 3 })
    expect(s.valued).toEqual({ correct: 0, wrong: 0, missed: 6 })
    expect(s.blank).toEqual({ total: 0, filled: 0 })
    expect(s.failureTotal).toBe(6)
    // 응답 시간은 쓸 수 있는 응답(200)만 잰다: 500·502 사례에 시간이 있어도 넣지 않는다(score.ts tally와 같음)
    expect(s.latencyMs).toEqual({ median: 0, max: 0, n: 0 })
  })

  // plan: median of an even count is the rounded mean of the middle two
  it('응답 시간 중앙값은 홀수면 가운데 값, 짝수면 가운데 둘의 평균을 반올림해요', () => {
    const at = (...times: number[]) => summarize(resultFile(times.map((ms, i) => kase(`c${i}`, { ms }))))
    // 정렬 전 순서가 섞여 있어도 정렬해서 본다
    expect(at(9000, 1000, 2001, 2000).latencyMs).toEqual({ median: 2001, max: 9000, n: 4 })
    expect(at(3000, 1000, 2000).latencyMs).toEqual({ median: 2000, max: 3000, n: 3 })
    expect(at(1000, 2000).latencyMs).toEqual({ median: 1500, max: 2000, n: 2 })
    expect(at(2500).latencyMs).toEqual({ median: 2500, max: 2500, n: 1 })
  })

  it('시간이 없는 200 응답은 응답 시간에 넣지 않아요', () => {
    const s = summarize(resultFile([kase('a', { ms: null }), kase('b', { ms: 800 })]))
    expect(s.requests).toEqual({ total: 2, failed: 0 })
    expect(s.latencyMs).toEqual({ median: 800, max: 800, n: 1 })
  })

  // plan: failures keep case order and stop at five with the total
  it('틀린 예는 사례 순서로 칸 순서 뒤 더 읽음을 이어 앞 5개만 담고 전체 수를 따로 적어요', () => {
    const s = summarize(
      resultFile([
        kase('c1', {
          fields: [
            field('a1', '1', '1', 'correct'),
            field('a2', '2', '9', 'wrong'),
            field('a3', '3', null, 'missed'),
            field('a4', null, null, 'blank-ok'),
          ],
          extra: ['x'],
        }),
        kase('c2', { fields: [field('b1', null, '7', 'filled')], extra: ['y', 'z'] }),
        kase('c3', { fields: [field('c1', '4', '5', 'wrong')] }),
      ]),
    )
    expect(s.failureTotal).toBe(7)
    expect(s.failures).toEqual([
      { caseId: 'c1', field: 'a2', expected: '2', got: '9' },
      { caseId: 'c1', field: 'a3', expected: '3', got: null },
      { caseId: 'c1', field: null, expected: null, got: 'x' },
      { caseId: 'c2', field: 'b1', expected: null, got: '7' },
      { caseId: 'c2', field: null, expected: null, got: 'y' },
    ])
  })

  // plan: extra detections are counted and listed among failures
  it('정답에 없는 것을 더 읽음은 세고 틀린 예에 칸 없이 넣어요', () => {
    const tag = summarize(resultFile([kase('rt01', { extra: ['프리미엄 두유'] }), kase('rt02')]))
    expect(tag.extra).toBe(1)
    expect(tag.failureTotal).toBe(1)
    expect(tag.failures).toEqual([{ caseId: 'rt01', field: null, expected: null, got: '프리미엄 두유' }])

    // AC62: 치수 정답이 없는 사진에서 표기 1개를 읽으면 더 읽음 1개다
    const size = summarize(
      resultFile([kase('sz01', { extra: ['제품 크기: 가로 32 x 깊이 25 x 높이 47cm'] })], { feature: 'read-size' }),
    )
    expect(size.extra).toBe(1)
    expect(size.failureTotal).toBe(1)
    expect(size.failures).toEqual([{ caseId: 'sz01', field: null, expected: null, got: '제품 크기: 가로 32 x 깊이 25 x 높이 47cm' }])

    // 더 읽음이 없어도 가격표·치수는 숫자 0이다
    expect(summarize(resultFile([kase('rt01')])).extra).toBe(0)
    expect(summarize(resultFile([kase('sz01')], { feature: 'read-size' })).extra).toBe(0)
    // 말로 담기·다나와는 더 읽음을 세지 않아 null이다
    expect(summarize(resultFile([kase('vf01')], { feature: 'voice-fill' })).extra).toBeNull()
    expect(summarize(resultFile([kase('dn01')], { feature: 'lowest-price' })).extra).toBeNull()
  })

  it('더 읽음을 세지 않는 기능의 사례에 더 읽음이 있으면 조용히 버리지 않고 던져요', () => {
    expect(() => summarize(resultFile([kase('vf01', { extra: ['x'] })], { feature: 'voice-fill' }))).toThrow(/더 읽음/)
  })
})

describe('mergeSummaries', () => {
  const ok = (feature: EvalResultFile['feature'], over: Partial<EvalResultFile> = {}) =>
    resultFile([kase('c1', { fields: [field('f', '1', '1', 'correct')] })], { feature, ...over })

  // plan: mergeSummaries throws on a 조정용 file, a different model or a duplicate feature
  it('조정용 파일이 섞이면 던져요', () => {
    expect(() => mergeSummaries([ok('read-tag'), ok('voice-fill', { set: '조정용' })])).toThrow(/조정용/)
  })

  it('모델이 다른 파일이 섞이면 던져요', () => {
    expect(() => mergeSummaries([ok('read-tag'), ok('voice-fill', { model: 'gemini-3.5-pro' })])).toThrow(/모델/)
  })

  it('같은 기능이 두 번 들어오면 던져요', () => {
    expect(() => mergeSummaries([ok('read-tag'), ok('read-tag', { date: '2026-11-03' })])).toThrow(/read-tag/)
  })

  it('모델을 하나로 모으고 기능은 입력 순서와 상관없이 가격표·다나와·말로 담기·치수 순서예요', () => {
    const merged = mergeSummaries([ok('read-size'), ok('voice-fill'), ok('read-tag'), ok('lowest-price')])
    expect(merged.model).toBe('gemini-3.5-flash-lite')
    expect(merged.features.map((f) => f.id)).toEqual(['read-tag', 'lowest-price', 'voice-fill', 'read-size'])
    expect(isEvalSummary(merged)).toBe(true)
  })

  it('파일이 없으면 처음 값(기능 없음)을 돌려줘요', () => {
    expect(mergeSummaries([])).toEqual({ model: '', features: [] })
  })
})

describe('summarize 명령', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'summarize-'))
    dirs.push(dir)
    return dir
  }

  it('--out 뒤의 경로와 결과 파일들을 읽어요', () => {
    expect(parseSummarizeArgs(['--out', 'src/ai/evalSummary.json', 'a.json', 'b.json'])).toEqual({
      out: 'src/ai/evalSummary.json',
      files: ['a.json', 'b.json'],
    })
    expect(parseSummarizeArgs(['a.json', '--out', 'o.json'])).toEqual({ out: 'o.json', files: ['a.json'] })
  })

  it('결과 파일이 하나도 없거나 --out이 없거나 모르는 인자면 던져요', () => {
    expect(() => parseSummarizeArgs(['--out', 'o.json'])).toThrow(/결과 파일/)
    expect(() => parseSummarizeArgs(['a.json'])).toThrow(/--out/)
    expect(() => parseSummarizeArgs(['--out'])).toThrow(/--out/)
    expect(() => parseSummarizeArgs(['--out', 'o.json', '--force', 'a.json'])).toThrow(/--force/)
  })

  it('결과 파일의 원시 응답·실행 기록·파일 이름은 요약 파일에 들어가지 않아요', () => {
    const dir = tempDir()
    const input = join(dir, 'secret-photo-name_평가용_결과.json')
    const out = join(dir, 'evalSummary.json')
    const file = resultFile([kase('rt01', { fields: [field('상품1 이름', '보리차', '보리차', 'correct')] })])
    writeFileSync(
      input,
      JSON.stringify({
        ...file,
        meta: { casesFile: 'eval/cases/read-tag.json', server: 'http://localhost:8787', git: { head: 'abc123' } },
        raw: [{ id: 'rt01', body: { items: [{ name: 'RAW-RESPONSE-TEXT' }] } }],
      }),
    )

    const written = runSummarize(['--out', out, input])

    const text = readFileSync(out, 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(text).not.toContain('RAW-RESPONSE-TEXT')
    expect(text).not.toContain('secret-photo-name')
    expect(text).not.toContain('localhost')
    expect(text).not.toContain('abc123')
    expect(text).not.toContain('casesFile')
    const parsed: unknown = JSON.parse(text)
    expect(parsed).toEqual(written)
    expect(isEvalSummary(parsed)).toBe(true)
    expect(written.features.map((f) => f.id)).toEqual(['read-tag'])
  })

  it('조정용 파일이 섞이면 요약 파일을 쓰지 않고 던져요', () => {
    const dir = tempDir()
    const input = join(dir, 'tune.json')
    const out = join(dir, 'evalSummary.json')
    writeFileSync(input, JSON.stringify(resultFile([kase('rt01')], { set: '조정용' })))
    expect(() => runSummarize(['--out', out, input])).toThrow(/조정용/)
    expect(existsSync(out)).toBe(false)
  })

  it('날짜 모양이 틀린 결과 파일이면 요약 파일을 쓰지 않고 던져요', () => {
    const dir = tempDir()
    const input = join(dir, 'result.json')
    const out = join(dir, 'evalSummary.json')
    writeFileSync(input, JSON.stringify(resultFile([kase('rt01')], { date: '2026-11-2' })))
    expect(() => runSummarize(['--out', out, input])).toThrow(/모양 검사/)
    expect(existsSync(out)).toBe(false)
  })

  it('결과 파일이 아닌 JSON이나 없는 파일이면 파일 이름을 넣어 던지고 쓰지 않아요', () => {
    const dir = tempDir()
    const notResult = join(dir, 'cases.json')
    const out = join(dir, 'evalSummary.json')
    writeFileSync(notResult, JSON.stringify([{ id: 'rt01' }]))
    expect(() => runSummarize(['--out', out, notResult])).toThrow(/cases\.json/)
    expect(() => runSummarize(['--out', out, join(dir, 'missing.json')])).toThrow(/missing\.json/)
    expect(existsSync(out)).toBe(false)
  })
})
