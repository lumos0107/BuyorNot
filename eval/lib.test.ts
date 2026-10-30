// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { seconds } from '../src/ai/evalSummary.ts'
import type { DanawaRow } from '../src/ai/types.ts'
import {
  asDanawaPicks,
  asSizeCandidates,
  checkDanawaExpected,
  checkSizeExpected,
  checkTagExpected,
  checkVoiceExpected,
  formatTally,
  jpegSize,
  parseArgs,
  selectCases,
  wavSeconds,
} from './lib.ts'
import { keywordMatch, scoreDanawaCase, tally } from './score.ts'

function tagCase(id: string, set: '조정용' | '평가용', over: Record<string, unknown> = {}) {
  return {
    id,
    file: `사진/${set}/${id}.jpg`,
    source: '직접 만듦(합성)',
    license: '직접 만든 자료',
    edits: '없음',
    set,
    group: `g-${id}`,
    expected: [{ nameKeywords: '보리차', price: 4550, priceCondition: null, size: 1.5, unit: 'g', count: 50 }],
    ...over,
  }
}

describe('selectCases', () => {
  it('고른 묶음의 사례만 파일 순서대로 돌려줘요', () => {
    const raw = [tagCase('rt01', '조정용'), tagCase('rt11', '평가용'), tagCase('rt02', '조정용')]
    const cases = selectCases(raw, '조정용', checkTagExpected, 'read-tag')
    expect(cases.map((c) => c.id)).toEqual(['rt01', 'rt02'])
    expect(cases[0].expected[0].price).toBe(4550)
  })

  it('고른 묶음의 사례가 0개면 실행하지 않고 오류를 던져요', () => {
    const raw = [tagCase('rt11', '평가용')]
    expect(() => selectCases(raw, '조정용', checkTagExpected, 'read-tag')).toThrow(/조정용.*0개/)
    expect(() => selectCases([], '평가용', checkTagExpected, 'read-tag')).toThrow(/평가용.*0개/)
  })

  it('정답 파일이 배열이 아니면 오류예요', () => {
    expect(() => selectCases({}, '조정용', checkTagExpected, 'read-tag')).toThrow(/배열/)
  })

  it('같은 묶음 id(group)가 조정용과 평가용에 함께 있으면 누출이라 오류예요', () => {
    const raw = [tagCase('rt01', '조정용', { group: 'shelf-a' }), tagCase('rt11', '평가용', { group: 'shelf-a' })]
    expect(() => selectCases(raw, '조정용', checkTagExpected, 'read-tag')).toThrow(/shelf-a/)
  })

  it('출처·이용 조건·편집 내역이 비어 있으면 오류예요', () => {
    for (const key of ['source', 'license', 'edits']) {
      const raw = [tagCase('rt01', '조정용', { [key]: '' })]
      expect(() => selectCases(raw, '조정용', checkTagExpected, 'read-tag')).toThrow(new RegExp(key))
    }
  })

  it('자료 경로가 종류/묶음/파일 꼴이 아니거나 묶음 폴더가 set과 다르면 오류예요', () => {
    const wrongFolder = [tagCase('rt01', '조정용', { file: '사진/평가용/rt01.jpg' })]
    expect(() => selectCases(wrongFolder, '조정용', checkTagExpected, 'read-tag')).toThrow(/rt01/)
    const escape = [tagCase('rt01', '조정용', { file: '../gemini_key.txt' })]
    expect(() => selectCases(escape, '조정용', checkTagExpected, 'read-tag')).toThrow(/rt01/)
  })

  it('id가 겹치면 오류예요', () => {
    const raw = [tagCase('rt01', '조정용'), tagCase('rt01', '조정용', { group: 'other' })]
    expect(() => selectCases(raw, '조정용', checkTagExpected, 'read-tag')).toThrow(/rt01/)
  })

  it('uncertain이면 이유(uncertainReason)를 함께 적어야 해요', () => {
    const raw = [tagCase('rt01', '조정용', { uncertain: true })]
    expect(() => selectCases(raw, '조정용', checkTagExpected, 'read-tag')).toThrow(/uncertainReason/)
    const ok = [tagCase('rt01', '조정용', { uncertain: true, uncertainReason: '가격표가 흐림' })]
    expect(selectCases(ok, '조정용', checkTagExpected, 'read-tag')[0].uncertain).toBe(true)
  })
})

describe('정답 검사', () => {
  it('가격표 정답의 단위는 서버가 정규화한 값(g·kg·mL·L·ea)만 받아요', () => {
    const one = (unit: unknown) => [{ nameKeywords: '우유', price: null, priceCondition: null, size: 190, unit, count: 24 }]
    expect(checkTagExpected(one('mL'), 'rt01')[0].unit).toBe('mL')
    expect(() => checkTagExpected(one('ml'), 'rt01')).toThrow(/rt01/)
    expect(() => checkTagExpected(one('개'), 'rt01')).toThrow(/rt01/)
  })

  it('가격표 정답은 상품이 없는 사진을 위해 빈 배열도 받지만 이름 키워드는 비울 수 없어요', () => {
    expect(checkTagExpected([], 'rt01')).toEqual([])
    const blank = [{ nameKeywords: ' ', price: null, priceCondition: null, size: null, unit: null, count: null }]
    expect(() => checkTagExpected(blank, 'rt01')).toThrow(/nameKeywords/)
  })

  it('녹음 정답의 정도는 1~5, 기간은 1~30이에요', () => {
    const voice = (desire: unknown, periodDays: unknown) => ({ nameKeywords: '요가 매트', price: 35000, reasonKeywords: null, desire, periodDays })
    expect(checkVoiceExpected(voice(4, 3), 'vf01').desire).toBe(4)
    expect(() => checkVoiceExpected(voice(6, 3), 'vf01')).toThrow(/desire/)
    expect(() => checkVoiceExpected(voice(null, 31), 'vf01')).toThrow(/periodDays/)
  })

  it('다나와 정답의 허용 줄은 1부터의 겹치지 않는 정수예요', () => {
    expect(checkDanawaExpected({ wanted: { name: '햇반 210g' }, accepted: [1, 2] }, 'dn01').accepted).toEqual([1, 2])
    expect(() => checkDanawaExpected({ wanted: { name: '햇반 210g' }, accepted: [0] }, 'dn01')).toThrow(/accepted/)
    expect(() => checkDanawaExpected({ wanted: { name: '햇반 210g' }, accepted: [2, 2] }, 'dn01')).toThrow(/accepted/)
    expect(() => checkDanawaExpected({ wanted: {}, accepted: [] }, 'dn01')).toThrow(/wanted/)
  })
})

describe('치수 정답 검사', () => {
  const one = (over: Record<string, unknown> = {}) => [
    { textKeywords: '제품 32', kind: 'product', w: 32, d: 25, h: 47, unit: 'cm', ...over },
  ]

  it('치수 정답은 표기마다 키워드·제품/포장·세 축·단위를 받고, 표기가 없는 사진을 위해 빈 배열도 받아요', () => {
    expect(checkSizeExpected(one(), 'sz11')).toEqual(one())
    expect(checkSizeExpected([], 'sz18')).toEqual([])
  })

  it('치수 정답의 제품/포장은 product·package·unknown만, 단위는 mm·cm·m·mixed나 null만 받아요', () => {
    expect(checkSizeExpected(one({ kind: 'unknown', unit: null }), 'sz11')[0].kind).toBe('unknown')
    expect(checkSizeExpected(one({ unit: 'mixed' }), 'sz11')[0].unit).toBe('mixed')
    expect(() => checkSizeExpected(one({ kind: 'box' }), 'sz11')).toThrow(/sz11.*kind/)
    expect(() => checkSizeExpected(one({ unit: 'CM' }), 'sz11')).toThrow(/sz11.*unit/)
    expect(() => checkSizeExpected(one({ unit: 'inch' }), 'sz11')).toThrow(/unit/)
  })

  it('치수 정답의 축은 0 초과 수나 null(모르는 축)이고 표기 키워드는 비울 수 없어요', () => {
    expect(checkSizeExpected(one({ d: null }), 'sz11')[0].d).toBeNull()
    expect(() => checkSizeExpected(one({ w: 0 }), 'sz11')).toThrow(/sz11.*w/)
    expect(() => checkSizeExpected(one({ h: -3 }), 'sz11')).toThrow(/h/)
    expect(() => checkSizeExpected(one({ d: '25' }), 'sz11')).toThrow(/d/)
    expect(() => checkSizeExpected(one({ textKeywords: ' ' }), 'sz11')).toThrow(/textKeywords/)
    expect(() => checkSizeExpected({}, 'sz11')).toThrow(/배열/)
  })
})

describe('asSizeCandidates', () => {
  const candidate = { text: '제품 크기 32 x 25 x 47 cm', label: null, kind: 'product', axes: 'order', w: 32, d: 25, h: 47, unit: 'cm' }

  it('서버 응답의 표기 목록을 채점에 쓰는 칸만 돌려줘요', () => {
    expect(asSizeCandidates({ candidates: [candidate], note: null })).toEqual([
      { text: '제품 크기 32 x 25 x 47 cm', kind: 'product', w: 32, d: 25, h: 47, unit: 'cm' },
    ])
  })

  it('표기가 하나도 없는 응답(빈 목록)도 쓸 수 있는 응답이에요', () => {
    expect(asSizeCandidates({ candidates: [], note: null })).toEqual([])
  })

  it('모양이 다른 응답은 null(실패로 센다)이에요', () => {
    expect(asSizeCandidates(null)).toBeNull()
    expect(asSizeCandidates({})).toBeNull()
    expect(asSizeCandidates({ candidates: '없음' })).toBeNull()
    expect(asSizeCandidates({ candidates: [{ ...candidate, kind: 'box' }] })).toBeNull()
    expect(asSizeCandidates({ candidates: [{ ...candidate, w: '32' }] })).toBeNull()
    expect(asSizeCandidates({ candidates: [{ ...candidate, unit: 'inch' }] })).toBeNull()
    expect(asSizeCandidates({ candidates: [{ ...candidate, text: 7 }] })).toBeNull()
  })

  it('단위 mixed와 null, 제품/포장 unknown은 그대로 받아요', () => {
    const out = asSizeCandidates({ candidates: [{ ...candidate, kind: 'unknown', unit: 'mixed' }, { ...candidate, unit: null }] })
    expect(out?.map((c) => [c.kind, c.unit])).toEqual([
      ['unknown', 'mixed'],
      ['product', null],
    ])
  })
})

describe('응답 시간 초 표기', () => {
  // 이월(Task 1 리뷰): 평가 스크립트의 초 표기가 앱 성적표의 seconds()와 같아야 한다. x.x50 같은 경계에서
  // (ms/1000).toFixed(1)은 0.15 → '0.1', 2.05 → '2.0'으로 내려가 앱(0.2, 2.1)과 다르다.
  const timed = (medianMs: number, maxMs: number) =>
    formatTally({ ...tally([{ id: 'a', httpStatus: 200, ms: medianMs, fields: [], extra: [] }]), medianMs, maxMs }).at(-1)

  it('앱의 seconds()와 같은 100ms 단위 반올림이라 150ms는 0.2초, 2050ms는 2.1초예요', () => {
    expect(seconds(150)).toBe('0.2')
    expect(seconds(2050)).toBe('2.1')
    expect(timed(150, 2050)).toBe('응답 시간 중앙값 0.2초 · 최대 2.1초 (1번)')
  })

  it('경계가 아닌 값은 가까운 소수 첫째 자리로 보여요', () => {
    expect(timed(3022, 4942)).toBe('응답 시간 중앙값 3.0초 · 최대 4.9초 (1번)')
    expect(timed(12349, 12350)).toBe('응답 시간 중앙값 12.3초 · 최대 12.4초 (1번)')
  })
})

describe('치수 읽기 정답 파일', () => {
  // 파일을 읽는 일은 사례 안에서 한다(파일이 없거나 틀리면 이 describe의 사례만 실패하도록)
  const raw = () => JSON.parse(readFileSync('eval/cases/read-size.json', 'utf8')) as unknown
  const evalCases = () => selectCases(raw(), '평가용', checkSizeExpected, 'read-size')

  it('평가용 사례가 6개 이상이고 모두 직접 만든 합성 자료로 출처·이용 조건이 적혀 있어요', () => {
    const cases = evalCases()
    expect(cases.length).toBeGreaterThanOrEqual(6)
    for (const c of cases) {
      expect(c.synthetic).toBe(true)
      expect(c.source).toBe('직접 만듦(합성)')
      expect(c.license).not.toBe('')
      expect(c.file).toMatch(/^치수\/평가용\/sz\d+\.jpg$/)
    }
  })

  it('조정용 사례는 없어요(조정용 치수 자료가 아직 없음)', () => {
    expect(() => selectCases(raw(), '조정용', checkSizeExpected, 'read-size')).toThrow(/조정용.*0개/)
  })

  it('제품·포장 치수가 함께 있는 사진, 상태별 치수가 둘인 사진, 치수 표기가 없는 사진이 있어요', () => {
    const cases = evalCases()
    const kindsOf = (c: { expected: { kind: string }[] }) => new Set(c.expected.map((e) => e.kind))
    expect(cases.some((c) => kindsOf(c).has('product') && kindsOf(c).has('package'))).toBe(true)
    expect(cases.some((c) => c.expected.length === 2 && kindsOf(c).size === 1 && kindsOf(c).has('product'))).toBe(true)
    expect(cases.some((c) => c.expected.length === 0)).toBe(true)
  })

  it('표기 키워드는 자기 숫자에는 맞고 같은 사진의 다른 표기 숫자에는 맞지 않아 서로를 짝으로 잡지 않아요', () => {
    // 가정: AI가 적힌 그대로 옮긴 text에는 세 숫자가 들어 있다(짝짓기는 AI text의 키워드로 한다)
    const canonical = (e: { w: number | null; d: number | null; h: number | null }) => `${e.w} x ${e.d} x ${e.h}`
    for (const c of evalCases()) {
      c.expected.forEach((a, i) => {
        expect(keywordMatch(a.textKeywords, canonical(a)), `${c.id} 표기${i + 1} 자기 숫자`).toBe(true)
        c.expected.forEach((b, j) => {
          if (i !== j) expect(keywordMatch(a.textKeywords, canonical(b)), `${c.id} 표기${i + 1}과 표기${j + 1}`).toBe(false)
        })
      })
    }
  })

  it('단위는 mm·cm·mixed·단위 없음(null)을, 제품/포장은 표기 없음(unknown)까지 덮어요', () => {
    const all = evalCases().flatMap((c) => c.expected)
    const units = new Set(all.map((e) => e.unit))
    for (const unit of ['mm', 'cm', 'mixed', null] as const) expect(units.has(unit)).toBe(true)
    expect(all.some((e) => e.kind === 'unknown')).toBe(true)
  })
})

describe('parseArgs', () => {
  it('--set은 꼭 있어야 하고 조정용·평가용만 받아요', () => {
    expect(() => parseArgs([], { server: false })).toThrow(/--set/)
    expect(() => parseArgs(['--set', '전부'], { server: false })).toThrow(/--set/)
    expect(parseArgs(['--set', '조정용'], { server: false })).toEqual({ set: '조정용', server: null, check: false, again: false })
  })

  it('서버를 부르는 스크립트는 --check가 아니면 --server가 있어야 해요', () => {
    expect(() => parseArgs(['--set', '조정용'], { server: true })).toThrow(/--server/)
    expect(parseArgs(['--set', '조정용', '--check'], { server: true }).check).toBe(true)
    expect(parseArgs(['--set', '평가용', '--server', 'http://localhost:8787/'], { server: true }).server).toBe(
      'http://localhost:8787',
    )
  })

  it('모르는 인자는 오류예요', () => {
    expect(() => parseArgs(['--set', '조정용', '--fast'], { server: false })).toThrow(/--fast/)
  })
})

describe('파일 머리 읽기', () => {
  it('jpegSize는 SOF 머리에서 가로·세로를 읽어요', () => {
    // SOI, APP0(길이 4), SOF0(길이 17: 정밀도 8, 세로 0x04B0=1200, 가로 0x0640=1600, …)
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x06, 0x40, 0x03,
      0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ])
    expect(jpegSize(bytes)).toEqual({ width: 1600, height: 1200 })
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
  })

  it('wavSeconds는 data 크기를 초당 바이트로 나눠요', () => {
    const buf = new ArrayBuffer(44 + 64000)
    const dv = new DataView(buf)
    const put = (at: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(at + i, ch.charCodeAt(0)))
    put(0, 'RIFF')
    dv.setUint32(4, 36 + 64000, true)
    put(8, 'WAVE')
    put(12, 'fmt ')
    dv.setUint32(16, 16, true)
    dv.setUint16(20, 1, true) // PCM
    dv.setUint16(22, 1, true) // 모노
    dv.setUint32(24, 16000, true) // 16kHz
    dv.setUint32(28, 32000, true) // 초당 바이트
    dv.setUint16(32, 2, true)
    dv.setUint16(34, 16, true)
    put(36, 'data')
    dv.setUint32(40, 64000, true)
    expect(wavSeconds(new Uint8Array(buf))).toBe(2)
    expect(wavSeconds(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})

describe('asDanawaPicks', () => {
  const row = (name: string, price: number): DanawaRow => ({ name, packCount: 1, price, unitPriceText: null, malls: '1' })
  const rows = [row('가', 5000), row('나', 4000), row('다', 4500)]

  it('서버처럼 1~n 정수만 남기고 중복을 뺀 줄 번호를 고른 차례대로 돌려줘요', () => {
    const value = { rows: [2, 0, 9, 2, 3, '1', 1.5], reason: '같은 상품' }
    expect(asDanawaPicks(rows, { ok: true, value })).toEqual({ httpStatus: 200, picked: [2, 3] })
  })

  it('rows가 빈 배열이면 성공(200)이고 고른 줄이 없어요', () => {
    expect(asDanawaPicks(rows, { ok: true, value: { rows: [], reason: '없음' } })).toEqual({ httpStatus: 200, picked: [] })
  })

  it('Gemini 실패나 모양이 다른 응답(객체가 아님·rows가 배열이 아님)은 실패(502)예요', () => {
    const failed = { httpStatus: 502, picked: null }
    expect(asDanawaPicks(rows, { ok: false })).toEqual(failed)
    expect(asDanawaPicks(rows, { ok: true, value: [1, 2] })).toEqual(failed)
    expect(asDanawaPicks(rows, { ok: true, value: '2' })).toEqual(failed)
    expect(asDanawaPicks(rows, { ok: true, value: null })).toEqual(failed)
    expect(asDanawaPicks(rows, { ok: true, value: { reason: 'rows 없음' } })).toEqual(failed)
    expect(asDanawaPicks(rows, { ok: true, value: { rows: 2, reason: '' } })).toEqual(failed)
  })

  it('모양이 다른 응답은 허용 줄이 없어도 맞음이 아니라 채점하지 않음, 허용 줄이 있으면 못 읽음이에요', () => {
    const wanted = { name: '두부 부침용 300g' }
    const malformed = asDanawaPicks(rows, { ok: true, value: { reason: 'rows 없음' } })
    const reply = { ...malformed, ms: 5000, prices: rows.map((r) => r.price) }
    expect(scoreDanawaCase('dn99', { wanted, accepted: [] }, reply)).toEqual({
      id: 'dn99',
      httpStatus: 502,
      ms: 5000,
      fields: [{ field: '고른 줄', expected: null, got: null, outcome: 'unscored' }],
      extra: [],
    })
    expect(scoreDanawaCase('dn99', { wanted, accepted: [2] }, reply).fields[0].outcome).toBe('missed')
  })
})
