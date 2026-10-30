// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  failedFields,
  keywordMatch,
  pairByKeywords,
  scoreDanawa,
  scoreDanawaCase,
  scoreField,
  scoreTagCase,
  scoreVoiceCase,
  tally,
  type EvalCase,
  type TagExpected,
  type TagReadItem,
} from './score.ts'

// AC62 다나와 사례의 줄 가격. 줄 2·3이 허용 줄(4,900원·4,700원), 줄 5는 줄 2와 가격이 같은 다른 상품.
// 가정: 줄 1·4의 가격은 AC62에 없어 결과를 바꾸지 않는 값(허용 줄보다 비싼 값)을 골랐다.
const PRICES = [5200, 4900, 4700, 5500, 4900]

function item(name: string, over: Partial<TagReadItem> = {}): TagReadItem {
  return { name, price: null, priceCondition: null, size: null, unit: null, count: null, ...over }
}

function tagExpected(nameKeywords: string, over: Partial<TagExpected> = {}): TagExpected {
  return { nameKeywords, price: null, priceCondition: null, size: null, unit: null, count: null, ...over }
}

describe('scoreField', () => {
  // plan: scoreField marks a matching value correct, a different value wrong and null missed
  it('정답과 같은 값은 맞음, 다른 값은 틀림, 빈칸은 못 읽음이에요', () => {
    expect(scoreField('3980', '3980')).toBe('correct')
    expect(scoreField('3980', '4980')).toBe('wrong')
    expect(scoreField('3980', null)).toBe('missed')
  })

  it('비교 함수를 주면 그 함수로 맞음과 틀림을 가려요', () => {
    expect(scoreField('요가 매트', '두꺼운 요가 매트', keywordMatch)).toBe('correct')
    expect(scoreField('요가 매트', '요가 블록', keywordMatch)).toBe('wrong')
  })

  // plan: scoreField marks null-for-null as blank-ok and a value-for-null as filled
  it('표기 없는 칸을 AI도 비우면 맞음(blank-ok), 값을 내면 채움이에요', () => {
    expect(scoreField(null, null)).toBe('blank-ok')
    expect(scoreField(null, '4980')).toBe('filled')
  })
})

describe('keywordMatch', () => {
  // plan: keywords match only when every keyword is present
  it('공백으로 나눈 키워드가 모두 들어 있을 때만 맞아요', () => {
    expect(keywordMatch('오징어짬뽕 소컵', '농심 오징어짬뽕 소컵 6입')).toBe(true)
    expect(keywordMatch('오징어짬뽕 소컵', '농심 오징어짬뽕 큰사발')).toBe(false)
    expect(keywordMatch('오징어짬뽕', '농심 짜파게티')).toBe(false)
  })

  // 가정: PRD는 띄어쓰기·대소문자를 정하지 않았다. 다나와 검색어처럼(lowestPrice.ts squash) 무시한다.
  it('AI 이름의 띄어쓰기와 대소문자는 무시해요', () => {
    expect(keywordMatch('오징어짬뽕', '농심 오징어 짬뽕 소컵')).toBe(true)
    expect(keywordMatch('light', '바나나맛우유 Light')).toBe(true)
  })

  it('키워드가 비어 있으면 아무것과도 맞지 않아요', () => {
    expect(keywordMatch('', '아무 상품')).toBe(false)
    expect(keywordMatch('   ', '아무 상품')).toBe(false)
  })
})

describe('pairByKeywords', () => {
  // plan: pairByKeywords pairs in expected order and reports extras
  it('AC62: 정답 순서대로 아직 짝 없는 첫 AI 상품과 짝짓고, 정답 2개에 AI 3개면 짝 2개와 더 읽음 1개예요', () => {
    const result = pairByKeywords(['보리차', '옥수수'], ['동서 보리차', '현미녹차', '한잔용 옥수수차'])
    expect(result.pairs).toEqual([
      [0, 0],
      [1, 2],
    ])
    expect(result.extra).toEqual([1])
  })

  it('이미 짝지은 AI 상품은 다음 정답과 다시 짝짓지 않아요', () => {
    const result = pairByKeywords(['현미녹차', '현미녹차'], ['동서 현미녹차 25T', '동서 현미녹차 100T'])
    expect(result.pairs).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(result.extra).toEqual([])
  })

  it('AC62: 정답 상품의 키워드가 든 AI 상품이 없으면 그 정답은 짝이 없어요', () => {
    const result = pairByKeywords(['메밀차'], ['동서 보리차'])
    expect(result.pairs).toEqual([])
    expect(result.extra).toEqual([0])
  })

  it('AC62: 정답이 없는 사진에서 표기 1개를 읽으면 더 읽음 1개예요', () => {
    const result = pairByKeywords([], ['제품 크기: 가로 32 x 깊이 25 x 높이 47cm'])
    expect(result.pairs).toEqual([])
    expect(result.extra).toEqual([0])
  })
})

describe('scoreDanawa', () => {
  // plan: scoreDanawa: all accepted with the cheapest is correct
  it('AC62: 허용 줄 2·3을 모두 고르면 맞음이에요', () => {
    expect(scoreDanawa([2, 3], [2, 3], PRICES)).toBe('correct')
  })

  it('AC62: 가장 낮은 허용 줄 3만 골라도 맞음이에요', () => {
    expect(scoreDanawa([2, 3], [3], PRICES)).toBe('correct')
  })

  // plan: scoreDanawa: a same-price row that is not accepted is wrong
  it('AC62: 줄 2와 가격이 같은 다른 상품 줄 5를 고르면 틀림이에요', () => {
    expect(scoreDanawa([2, 3], [5], PRICES)).toBe('wrong')
  })

  it('허용 줄을 모두 골라도 허용 줄 밖의 줄을 하나라도 더 고르면 틀림이에요', () => {
    expect(scoreDanawa([2, 3], [2, 3, 5], PRICES)).toBe('wrong')
  })

  // plan: scoreDanawa: missing the cheapest accepted row is wrong
  it('AC62: 허용 줄 2만 고르면 가장 낮은 허용 줄 3을 빠뜨려 틀림이에요', () => {
    expect(scoreDanawa([2, 3], [2], PRICES)).toBe('wrong')
  })

  // 판정 R15(가정에서 확정): 가장 낮은 가격의 허용 줄이 여럿이면 허용 줄만 고르고 그중 하나를 포함하면 맞음. 앱에 보이는 가장 낮은 가격이 같다.
  it('R15: 가장 낮은 가격이 같은 허용 줄이 여럿이면 그중 하나만 골라도 맞음이에요', () => {
    expect(scoreDanawa([2, 5], [5], PRICES)).toBe('correct')
  })

  // plan: scoreDanawa: none picked is missed, picked with nothing accepted is filled
  it('AC62: 허용 줄이 있는데 하나도 못 고르면 못 읽음이에요', () => {
    expect(scoreDanawa([2, 3], [], PRICES)).toBe('missed')
  })

  it('AC62: 허용 줄이 없는 상품에 줄 1을 고르면 채움이에요', () => {
    expect(scoreDanawa([], [1], PRICES)).toBe('filled')
  })

  // F43: 허용 줄이 없는 상품에 줄을 안 고르면 맞음. 표기 없는 칸의 맞음이라 blank-ok로 센다(값이 있는 칸 정확도에 넣지 않음).
  it('AC62: 허용 줄이 없는 상품에 못 고르면 맞음(blank-ok)이에요', () => {
    expect(scoreDanawa([], [], PRICES)).toBe('blank-ok')
  })
})

describe('failedFields', () => {
  // plan: failedFields counts valued fields missed and leaves blank fields unscored
  it('AC62: 시간 초과 사례는 값이 있는 칸 4개가 못 읽음, 표기 없는 칸 2개는 채점하지 않아요', () => {
    const fields = failedFields([
      { field: '상품1 이름', expected: '오징어짬뽕' },
      { field: '상품1 가격', expected: '3980' },
      { field: '상품1 가격 조건', expected: null },
      { field: '상품1 개당 용량', expected: '67' },
      { field: '상품1 단위', expected: 'g' },
      { field: '상품1 개수', expected: null },
    ])
    expect(fields.map((f) => f.outcome)).toEqual(['missed', 'missed', 'unscored', 'missed', 'missed', 'unscored'])
    expect(fields.every((f) => f.got === null)).toBe(true)
    expect(fields[1]).toEqual({ field: '상품1 가격', expected: '3980', got: null, outcome: 'missed' })
  })
})

describe('scoreTagCase', () => {
  const expected = [
    tagExpected('보리차', { price: 4550, size: 1.5, unit: 'g', count: 50 }),
    tagExpected('옥수수', { price: 4950 }),
  ]

  it('AC62: 정답 2개에 AI 3개면 짝 2개만 채점하고 나머지는 더 읽음 1개예요', () => {
    const result = scoreTagCase('rt99', expected, {
      httpStatus: 200,
      ms: 3100,
      items: [
        item('동서 한잔용 보리차', { price: 4550, size: 1.5, unit: 'g', count: 50 }),
        item('동서 루이보스 보리차', { price: 4500 }),
        item('동서 한잔용 옥수수차', { price: 4950 }),
      ],
    })
    expect(result.httpStatus).toBe(200)
    expect(result.ms).toBe(3100)
    expect(result.fields).toHaveLength(12)
    expect(result.fields.slice(0, 6).map((f) => f.outcome)).toEqual([
      'correct',
      'correct',
      'blank-ok',
      'correct',
      'correct',
      'correct',
    ])
    expect(result.fields[0]).toEqual({ field: '상품1 이름', expected: '보리차', got: '동서 한잔용 보리차', outcome: 'correct' })
    expect(result.fields[7]).toEqual({ field: '상품2 가격', expected: '4950', got: '4950', outcome: 'correct' })
    expect(result.extra).toEqual(['동서 루이보스 보리차'])
  })

  it('숫자는 글자로 바꿔 비교해서 다른 가격은 틀림, 표기 없는 칸에 낸 값은 채움이에요', () => {
    const result = scoreTagCase('rt99', [expected[1]], {
      httpStatus: 200,
      ms: 2000,
      items: [item('한잔용 옥수수차', { price: 4550, count: 50 })],
    })
    expect(result.fields.find((f) => f.field === '상품1 가격')).toEqual({
      field: '상품1 가격',
      expected: '4950',
      got: '4550',
      outcome: 'wrong',
    })
    expect(result.fields.find((f) => f.field === '상품1 개수')).toEqual({
      field: '상품1 개수',
      expected: null,
      got: '50',
      outcome: 'filled',
    })
  })

  it('AC62: 키워드가 든 AI 상품이 없는 정답은 값이 있는 칸 모두 못 읽음, 표기 없는 칸은 맞음이에요', () => {
    const result = scoreTagCase('rt99', [expected[0]], {
      httpStatus: 200,
      ms: 2000,
      items: [item('현미녹차', { price: 4550 })],
    })
    expect(result.fields.map((f) => f.outcome)).toEqual(['missed', 'missed', 'blank-ok', 'missed', 'missed', 'missed'])
    expect(result.extra).toEqual(['현미녹차'])
  })

  it('AC62: 429 사례는 칸을 채점하지 않아요', () => {
    const result = scoreTagCase('rt99', expected, { httpStatus: 429, ms: 40, items: null })
    expect(result).toEqual({ id: 'rt99', httpStatus: 429, ms: 40, fields: [], extra: [] })
  })

  it('503 사례도 칸을 채점하지 않아요', () => {
    expect(scoreTagCase('rt99', expected, { httpStatus: 503, ms: 30, items: null }).fields).toEqual([])
  })

  it('AC62: 시간 초과 사례는 값이 있는 칸을 못 읽음, 표기 없는 칸을 채점하지 않음으로 적어요', () => {
    const result = scoreTagCase('rt99', expected, { httpStatus: null, ms: null, items: null })
    // 정답 상품 1은 값이 있는 칸 5개(이름·가격·용량·단위·개수), 상품 2는 2개(이름·가격). 나머지 5칸은 표기 없음.
    expect(result.fields.filter((f) => f.outcome === 'missed')).toHaveLength(7)
    expect(result.fields.filter((f) => f.outcome === 'unscored')).toHaveLength(5)
    expect(result.fields.every((f) => f.got === null)).toBe(true)
    expect(result.extra).toEqual([])
  })
})

describe('scoreVoiceCase', () => {
  const expected = { nameKeywords: '요가 매트', price: 35000, reasonKeywords: '홈트', desire: null, periodDays: 3 }

  it('상품명·이유는 키워드로, 나머지는 같은 값으로 채점해요', () => {
    const result = scoreVoiceCase('vf99', expected, {
      httpStatus: 200,
      ms: 5200,
      value: { transcript: '…', name: '요가 매트', price: 35000, reason: '집에서 홈트 하려고', desire: 2, periodDays: 7 },
    })
    expect(result.fields).toEqual([
      { field: '상품명', expected: '요가 매트', got: '요가 매트', outcome: 'correct' },
      { field: '가격', expected: '35000', got: '35000', outcome: 'correct' },
      { field: '이유 키워드', expected: '홈트', got: '집에서 홈트 하려고', outcome: 'correct' },
      { field: '정도', expected: null, got: '2', outcome: 'filled' },
      { field: '기간', expected: '3', got: '7', outcome: 'wrong' },
    ])
    expect(result.extra).toEqual([])
  })

  it('실패한 요청은 값이 있는 칸 못 읽음, 표기 없는 칸 채점하지 않음이에요', () => {
    const result = scoreVoiceCase('vf99', expected, { httpStatus: 502, ms: 900, value: null })
    expect(result.fields.map((f) => f.outcome)).toEqual(['missed', 'missed', 'missed', 'unscored', 'missed'])
  })
})

describe('scoreDanawaCase', () => {
  const wanted = { name: '농심 오징어짬뽕 소컵', count: 6 }

  it('고른 줄 칸 하나를 허용 줄 기준으로 채점해요', () => {
    const result = scoreDanawaCase('dn99', { wanted, accepted: [2, 3] }, { httpStatus: 200, ms: 6000, picked: [3, 2], prices: PRICES })
    expect(result.fields).toEqual([{ field: '고른 줄', expected: '2,3', got: '3,2', outcome: 'correct' }])
  })

  it('허용 줄이 없고 못 고르면 정답·AI 모두 빈칸이고 맞음(blank-ok)이에요', () => {
    const result = scoreDanawaCase('dn99', { wanted, accepted: [] }, { httpStatus: 200, ms: 6000, picked: [], prices: PRICES })
    expect(result.fields).toEqual([{ field: '고른 줄', expected: null, got: null, outcome: 'blank-ok' }])
  })

  it('Gemini 실패(502)는 허용 줄이 있으면 못 읽음, 없으면 채점하지 않음이에요', () => {
    expect(
      scoreDanawaCase('dn99', { wanted, accepted: [2] }, { httpStatus: 502, ms: 40000, picked: null, prices: PRICES }).fields,
    ).toEqual([{ field: '고른 줄', expected: '2', got: null, outcome: 'missed' }])
    expect(
      scoreDanawaCase('dn99', { wanted, accepted: [] }, { httpStatus: 502, ms: 40000, picked: null, prices: PRICES }).fields,
    ).toEqual([{ field: '고른 줄', expected: null, got: null, outcome: 'unscored' }])
  })
})

describe('tally', () => {
  const ok: EvalCase = {
    id: 'a',
    httpStatus: 200,
    ms: 3000,
    fields: [
      { field: '상품1 이름', expected: '보리차', got: '보리차', outcome: 'correct' },
      { field: '상품1 가격', expected: '4550', got: '4500', outcome: 'wrong' },
      { field: '상품1 가격 조건', expected: null, got: null, outcome: 'blank-ok' },
      { field: '상품1 개수', expected: null, got: '50', outcome: 'filled' },
    ],
    extra: ['루이보스'],
  }
  const timeout: EvalCase = {
    id: 'b',
    httpStatus: null,
    ms: null,
    fields: failedFields([
      { field: 'v1', expected: '1' },
      { field: 'v2', expected: '2' },
      { field: 'v3', expected: '3' },
      { field: 'v4', expected: '4' },
      { field: 'b1', expected: null },
      { field: 'b2', expected: null },
    ]),
    extra: [],
  }
  const limited: EvalCase = { id: 'c', httpStatus: 429, ms: 50, fields: [], extra: [] }
  const ok2: EvalCase = { id: 'd', httpStatus: 200, ms: 5000, fields: [], extra: [] }

  it('AC62: 시간 초과 사례는 실패 1번, 못 읽음 4칸, 채점하지 않은 칸 2칸으로 세요', () => {
    const t = tally([timeout])
    expect(t.requests).toBe(1)
    expect(t.failed).toBe(1)
    expect(t.missed).toBe(4)
    expect(t.valued).toBe(4)
    expect(t.unscored).toBe(2)
    expect(t.blank).toBe(0)
  })

  it('AC62: 429 사례는 제한·꺼짐 1번이고 요청 수와 칸에 넣지 않아요', () => {
    const t = tally([limited])
    expect(t.cases).toBe(1)
    expect(t.limited).toBe(1)
    expect(t.requests).toBe(0)
    expect(t.failed).toBe(0)
    expect(t.valued).toBe(0)
    expect(t.answered).toBe(0)
    expect(t.medianMs).toBeNull()
  })

  it('여러 사례의 분모를 모두 세고, 응답 시간은 200을 받은 요청만 재요', () => {
    const t = tally([ok, timeout, limited, ok2])
    expect(t).toEqual({
      cases: 4,
      requests: 3,
      limited: 1,
      failed: 1,
      valued: 6,
      correct: 1,
      wrong: 1,
      missed: 4,
      blank: 2,
      blankOk: 1,
      filled: 1,
      unscored: 2,
      extra: 1,
      answered: 2,
      medianMs: 4000,
      maxMs: 5000,
    })
  })

  it('응답 시간 중앙값은 홀수 개면 가운데 값이에요', () => {
    const t = tally([ok, ok2, { ...ok2, id: 'e', ms: 9000 }])
    expect(t.medianMs).toBe(5000)
    expect(t.maxMs).toBe(9000)
  })
})
