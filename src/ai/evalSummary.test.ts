import { describe, expect, it } from 'vitest'
import committedSummary from './evalSummary.json'
import {
  FEATURE_IDS,
  FEATURE_INFO,
  isEvalSummary,
  reportHeader,
  reportLines,
  type EvalSummary,
  type FeatureSummary,
} from './evalSummary.ts'

// PRD F43 AI 성적표, AC63 화면 문장. 기대 문장은 PRD 따옴표 안을 글자 그대로 옮겼다.
// 요약 파일은 evalSummary.json이 처음엔 비어 있어 테스트는 모두 가짜 요약(fixture)을 쓴다.

// AC63 입력: 모델 gemini-3.5-flash-lite, 가격표 사진 읽기 40장·평가일 2026-11-02·판 1a2b3c4d,
// 값이 있는 칸 255칸 중 맞음 236·틀림 12·못 읽음 7, 표기 없는 칸 44칸 중 채움 3, 더 읽음 2,
// 제한·꺼짐 2번, 요청 38번 중 실패 1번, 응답 시간 37번 중앙값 4,100ms·최대 9,800ms, 틀린 예 24개.
// 가정: 틀린 예 24개 중 앞 5개의 사례 id·칸·값은 AC63에 없어 PRD가 정한 줄 꼴 네 가지(값 다름·AI 빈칸·표기 없는 칸 채움·더 읽음)를 고르게 넣었다.
// 틀린 예 24 = 틀림 12 + 못 읽음 7 + 채움 3 + 더 읽음 2.
const READ_TAG: FeatureSummary = {
  id: 'read-tag',
  evaluatedAt: '2026-11-02',
  promptVersion: '1a2b3c4d',
  samples: 40,
  excluded: 2,
  requests: { total: 38, failed: 1 },
  valued: { correct: 236, wrong: 12, missed: 7 },
  blank: { total: 44, filled: 3 },
  extra: 2,
  latencyMs: { median: 4100, max: 9800, n: 37 },
  failures: [
    { caseId: 'rt03', field: '상품1 가격', expected: '4550', got: '4500' },
    { caseId: 'rt05', field: '상품2 개수', expected: '6', got: null },
    { caseId: 'rt06', field: '상품1 가격 조건', expected: null, got: '회원가' },
    { caseId: 'rt08', field: null, expected: null, got: '프리미엄 두유' },
    { caseId: 'rt09', field: '상품3 단위', expected: 'g', got: 'mL' },
  ],
  failureTotal: 24,
}

const LOWEST_PRICE: FeatureSummary = {
  id: 'lowest-price',
  evaluatedAt: '2026-11-03',
  promptVersion: '0f9e8d7c',
  samples: 6,
  excluded: 0,
  requests: { total: 6, failed: 0 },
  valued: { correct: 3, wrong: 1, missed: 0 },
  blank: { total: 2, filled: 0 },
  extra: null,
  latencyMs: { median: 5200, max: 7000, n: 6 },
  failures: [{ caseId: 'dn14', field: '고른 줄', expected: '1', got: '4' }],
  failureTotal: 1,
}

const VOICE_FILL: FeatureSummary = {
  id: 'voice-fill',
  evaluatedAt: '2026-11-03',
  promptVersion: 'aa00bb11',
  samples: 5,
  excluded: 0,
  requests: { total: 5, failed: 0 },
  valued: { correct: 12, wrong: 0, missed: 1 },
  blank: { total: 12, filled: 0 },
  extra: null,
  latencyMs: { median: 11000, max: 14000, n: 5 },
  failures: [{ caseId: 'vf13', field: '상품명', expected: '요가 매트', got: null }],
  failureTotal: 1,
}

const READ_SIZE: FeatureSummary = {
  id: 'read-size',
  evaluatedAt: '2026-11-04',
  promptVersion: '12345678',
  samples: 8,
  excluded: 1,
  requests: { total: 7, failed: 0 },
  valued: { correct: 20, wrong: 2, missed: 0 },
  blank: { total: 0, filled: 0 },
  extra: 1,
  latencyMs: { median: 3000, max: 4000, n: 7 },
  failures: [],
  failureTotal: 3,
}

const SUMMARY: EvalSummary = { model: 'gemini-3.5-flash-lite', features: [READ_TAG] }

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

// FeatureSummary 하나를 고쳐 만든 요약
function withFeature(change: (f: FeatureSummary) => void, base: FeatureSummary = READ_TAG): unknown {
  const f = clone(base)
  change(f)
  return { model: 'gemini-3.5-flash-lite', features: [f] }
}

describe('reportHeader', () => {
  it('AC63: 맨 위에 모델 이름과 일반 정확도가 아니라는 안내를 보여요', () => {
    expect(reportHeader(SUMMARY)).toEqual([
      '모델 gemini-3.5-flash-lite',
      '직접 모은 작은 자료로 잰 결과라 일반적인 정확도를 뜻하지 않아요.',
    ])
  })
})

describe('reportLines', () => {
  it('AC63: 가격표 사진 읽기 묶음의 제목과 줄이 PRD 문장 그대로예요', () => {
    const r = reportLines(READ_TAG)
    expect(r.title).toBe('가격표 사진 읽기 · 40장 · 평가일 2026-11-02 · 프롬프트 판 1a2b3c4d')
    expect(r.lines).toEqual([
      '값이 있는 칸 맞힘 236 / 255칸 (틀림 12 · 못 읽음 7)',
      '표기 없는 칸을 채움 3 / 44칸',
      '정답에 없는 상품을 더 읽음 2개',
      '요청 38번 중 실패 1번(시간 초과·서버 오류). 실패한 요청의 값이 있는 칸은 못 읽음으로 셌어요.',
      '제한·꺼짐으로 받지 못한 요청 2번(정확도에서 뺐어요)',
      '응답 시간 중앙값 4.1초 · 최대 9.8초 (37번)',
    ])
  })

  it('AC63: 틀린 예 24개 중 앞 5개는 자료 순서로 줄마다 정답과 AI 값을 보여요', () => {
    const r = reportLines(READ_TAG)
    expect(r.failureHead).toBe('틀린 예 24개 중 앞 5개(자료 순서)')
    expect(r.failureLines).toEqual([
      "rt03 상품1 가격: 정답 '4550' → AI '4500'",
      "rt05 상품2 개수: 정답 '6' → AI 빈칸",
      "rt06 상품1 가격 조건: 정답 표기 없음 → AI '회원가'",
      "rt08: 정답에 없음 → AI '프리미엄 두유'",
      "rt09 상품3 단위: 정답 'g' → AI 'mL'",
    ])
  })

  it('AC63: 표기 없는 칸이 0칸이면 재지 않았다고 말해요', () => {
    const r = reportLines({ ...READ_TAG, blank: { total: 0, filled: 0 } })
    expect(r.lines[1]).toBe('표기 없는 칸이 없는 자료라 재지 않았어요.')
    expect(r.lines.join('\n')).not.toContain('표기 없는 칸을 채움')
  })

  it('AC63: 틀린 예가 0개면 목록 없이 틀린 예가 없다고 말해요', () => {
    const none: FeatureSummary = {
      ...READ_TAG,
      valued: { correct: 255, wrong: 0, missed: 0 },
      blank: { total: 44, filled: 0 },
      extra: 0,
      failures: [],
      failureTotal: 0,
    }
    const r = reportLines(none)
    expect(r.failureHead).toBe('틀린 예가 없어요.')
    expect(r.failureLines).toEqual([])
  })

  it('AC63: 실패가 0번이면 요청 모두 응답을 받았다고 말해요', () => {
    const r = reportLines({ ...READ_TAG, requests: { total: 38, failed: 0 } })
    expect(r.lines).toContain('요청 38번 모두 응답을 받았어요.')
    expect(r.lines.join('\n')).not.toContain('실패한 요청의 값이 있는 칸은 못 읽음으로 셌어요.')
  })

  it('AC63: 응답 시간을 잰 요청이 0번이면 재지 못했다고 말해요', () => {
    const r = reportLines({ ...READ_TAG, latencyMs: { median: 0, max: 0, n: 0 } })
    expect(r.lines.at(-1)).toBe('응답 시간을 재지 못했어요.')
    expect(r.lines.join('\n')).not.toContain('응답 시간 중앙값')
  })

  it('제한·꺼짐이 없었으면 그 줄을 보이지 않아요', () => {
    const r = reportLines({ ...READ_TAG, excluded: 0, requests: { total: 40, failed: 1 } })
    expect(r.lines.join('\n')).not.toContain('제한·꺼짐')
    expect(r.lines).toHaveLength(5)
  })

  it('다나와 같은 상품 고르기와 말로 담기는 더 읽음 줄 없이 개와 문장 단위로 보여요', () => {
    const lowest = reportLines(LOWEST_PRICE)
    expect(lowest.title).toBe('다나와 같은 상품 고르기 · 6개 · 평가일 2026-11-03 · 프롬프트 판 0f9e8d7c')
    expect(lowest.lines.join('\n')).not.toContain('더 읽음')
    expect(lowest.lines[0]).toBe('값이 있는 칸 맞힘 3 / 4칸 (틀림 1 · 못 읽음 0)')
    expect(lowest.failureHead).toBe('틀린 예 1개 중 앞 1개(자료 순서)')
    expect(lowest.failureLines).toEqual(["dn14 고른 줄: 정답 '1' → AI '4'"])

    const voice = reportLines(VOICE_FILL)
    expect(voice.title).toBe('말로 담기 · 5문장 · 평가일 2026-11-03 · 프롬프트 판 aa00bb11')
    expect(voice.lines.join('\n')).not.toContain('더 읽음')
  })

  it('치수 읽기는 표기를 더 읽음으로 세요', () => {
    const r = reportLines(READ_SIZE)
    expect(r.title).toBe('치수 읽기 · 8장 · 평가일 2026-11-04 · 프롬프트 판 12345678')
    expect(r.lines).toContain('정답에 없는 표기를 더 읽음 1개')
  })

  it('응답 시간은 소수 첫째 자리까지 반올림해서 초로 보여요', () => {
    // 2,050ms는 부동소수 나눗셈(2.05.toFixed)이면 2.0으로 내려가므로 정수로 반올림하는지 본다
    const r = reportLines({ ...READ_TAG, latencyMs: { median: 2050, max: 12349, n: 37 } })
    expect(r.lines.at(-1)).toBe('응답 시간 중앙값 2.1초 · 최대 12.3초 (37번)')
  })

  it('FEATURE_INFO는 기능 이름·단위·더 읽음 낱말을 PRD대로 정해요', () => {
    expect(FEATURE_IDS).toEqual(['read-tag', 'lowest-price', 'voice-fill', 'read-size'])
    expect(FEATURE_INFO).toEqual({
      'read-tag': { title: '가격표 사진 읽기', unit: '장', extraWord: '상품' },
      'lowest-price': { title: '다나와 같은 상품 고르기', unit: '개', extraWord: null },
      'voice-fill': { title: '말로 담기', unit: '문장', extraWord: null },
      'read-size': { title: '치수 읽기', unit: '장', extraWord: '표기' },
    })
  })
})

describe('isEvalSummary', () => {
  it('AC63: 예시 요약과 네 기능을 모두 담은 요약, 처음 값(기능 없음)을 받아들여요', () => {
    expect(isEvalSummary(SUMMARY)).toBe(true)
    expect(isEvalSummary({ model: 'gemini-3.5-flash-lite', features: [READ_TAG, LOWEST_PRICE, VOICE_FILL, READ_SIZE] })).toBe(true)
    expect(isEvalSummary({ model: '', features: [] })).toBe(true)
  })

  it('커밋한 src/ai/evalSummary.json은 모양이 맞아요', () => {
    expect(isEvalSummary(committedSummary)).toBe(true)
  })

  // plan: isEvalSummary rejects broken relations
  it('관계가 어긋난 요약은 받아들이지 않아요', () => {
    const broken: [string, unknown][] = [
      ['요청 수 ≠ 표본 − 제한·꺼짐', withFeature((f) => (f.requests.total = 39))],
      ['실패 > 요청', withFeature((f) => (f.requests.failed = 39))],
      // 틀린 예 전체(12+7+45+2)도 맞춰 두어 채움 > 표기 없는 칸 한 가지만 어긋나게 한다
      ['채움 > 표기 없는 칸', withFeature((f) => ((f.blank.filled = 45), (f.failureTotal = 66)))],
      ['틀린 예 전체 ≠ 틀림+못 읽음+채움+더 읽음', withFeature((f) => (f.failureTotal = 23))],
      ['더 읽음을 세지 않는 기능의 틀린 예 전체 ≠ 틀림+못 읽음+채움', withFeature((f) => (f.failureTotal = 2), LOWEST_PRICE)],
      ['틀린 예 줄이 5개를 넘음', withFeature((f) => (f.failures = [...f.failures, f.failures[0]]))],
      ['틀린 예 줄이 전체보다 많음', withFeature((f) => (f.failures = [f.failures[0], f.failures[0]]), LOWEST_PRICE)],
      ['응답 시간 횟수 > 요청', withFeature((f) => (f.latencyMs.n = 39))],
      ['날짜 자리 부족', withFeature((f) => (f.evaluatedAt = '2026-11-2'))],
      ['날짜 구분자 다름', withFeature((f) => (f.evaluatedAt = '2026/11/02'))],
      ['날짜 구분자 없음', withFeature((f) => (f.evaluatedAt = '20261102'))],
      ['날짜 뒤에 글자', withFeature((f) => (f.evaluatedAt = '2026-11-02T00:00'))],
      // 다른 칸과 관계가 없는 칸으로 음수·소수만 따로 본다
      ['음수', withFeature((f) => (f.valued.correct = -1))],
      ['정수가 아님', withFeature((f) => (f.valued.correct = 235.5))],
      ['더 읽음이 정수가 아님', withFeature((f) => (f.extra = 1.5))],
      ['제한·꺼짐이 표본보다 많음', withFeature((f) => (f.excluded = 41))],
      ['모르는 기능 id', withFeature((f) => ((f as { id: string }).id = 'read-menu'))],
      ['더 읽음을 세지 않는 기능에 숫자', withFeature((f) => (f.extra = 0), LOWEST_PRICE)],
      ['더 읽음을 세는 기능에 null', withFeature((f) => (f.extra = null))],
    ]
    for (const [why, value] of broken) expect(isEvalSummary(value), why).toBe(false)
  })

  // plan: isEvalSummary rejects a missing field and a string count
  it('빠진 칸과 글자로 적힌 수는 받아들이지 않아요', () => {
    const keys = Object.keys(READ_TAG)
    for (const key of keys) {
      const f = clone(READ_TAG) as unknown as Record<string, unknown>
      delete f[key]
      expect(isEvalSummary({ model: 'm', features: [f] }), `${key} 빠짐`).toBe(false)
    }
    for (const [why, value] of [
      ['표본 수가 글자', withFeature((f) => ((f as { samples: unknown }).samples = '40'))],
      ['맞음이 글자', withFeature((f) => ((f.valued as { correct: unknown }).correct = '236'))],
      ['응답 시간 중앙값이 글자', withFeature((f) => ((f.latencyMs as { median: unknown }).median = '4100'))],
      ['요청 묶음이 빠짐', withFeature((f) => delete (f as { requests?: unknown }).requests)],
      ['틀린 예 한 줄에 사례 id가 빠짐', withFeature((f) => delete (f.failures[0] as { caseId?: unknown }).caseId)],
      ['틀린 예 한 줄의 정답이 숫자', withFeature((f) => ((f.failures[0] as { expected: unknown }).expected = 4550))],
      ['모델이 빠짐', { features: [READ_TAG] }],
      ['기능 목록이 빠짐', { model: 'm' }],
      ['기능 목록이 배열이 아님', { model: 'm', features: {} }],
      ['null', null],
      ['글자', 'summary'],
      ['배열', []],
    ] as [string, unknown][]) {
      expect(isEvalSummary(value), why).toBe(false)
    }
  })
})
