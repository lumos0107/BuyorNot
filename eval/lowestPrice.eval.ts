// 다나와 같은 상품 고르기 평가(F31, 채점 F43). 서버도 실제 다나와 조회도 쓰지 않는다(DANAWA_ENABLED 결정 전).
// 조회한 날 저장한 검색 결과 페이지 사본에서 서버와 같은 함수로 줄을 뽑고(parseDanawaRows), 서버와 같은
// 프롬프트로 Gemini가 고른 줄 '전체'를 채점한다(앱에 보이는 최대 3줄이 아니라).
//   node eval/lowestPrice.eval.ts --set 조정용
//   node eval/lowestPrice.eval.ts --set 평가용 --check   (줄 목록과 허용 줄만 보이고 Gemini를 부르지 않음)
// 키는 worker/.dev.vars의 GEMINI_API_KEY를 읽어 쓰고 화면·결과에 남기지 않는다.
import { readFileSync } from 'node:fs'
import type { DanawaRow } from '../src/ai/types.ts'
import { parseDanawaRows } from '../worker/src/danawa.ts'
import { callGemini } from '../worker/src/gemini.ts'
import { buildPickPrompt, normalizeRequest, PICK_PROMPT, PICK_SCHEMA } from '../worker/src/lowestPrice.ts'
import {
  asDanawaPicks,
  caseLine,
  checkDanawaExpected,
  dataPath,
  finish,
  GAP_MS,
  gitState,
  guardSecondRun,
  loadCases,
  main,
  modelName,
  ORIGIN,
  parseArgs,
  promptVersion,
  runSequential,
  today,
  withRunLock,
} from './lib.ts'
import { scoreDanawaCase } from './score.ts'

const CASES = 'eval/cases/lowest-price.json'

// 키 값은 어디에도 찍지 않는다(오류 문장에도 넣지 않음)
function readKey(): string {
  const line = readFileSync('worker/.dev.vars', 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*GEMINI_API_KEY\s*=/.test(l))
  const key = line === undefined ? '' : line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  if (key === '') throw new Error('worker/.dev.vars에 GEMINI_API_KEY가 없다')
  return key
}

function rowText(row: DanawaRow, n: number): string {
  const pack = row.packCount ? `${row.packCount}개 묶음` : '묶음 표시 없음'
  return `${n} | ${row.name} | ${pack} | ${row.price.toLocaleString('ko-KR')}원`
}

main(async () => {
  const args = parseArgs(process.argv.slice(2), { server: false })
  const { cases, sha256 } = loadCases(CASES, args.set, checkDanawaExpected, 'lowest-price')
  // 모델을 부르기 전에 모든 사본을 먼저 검사한다(줄을 못 뽑거나 허용 줄 번호가 줄 수를 넘으면 멈춤)
  const pages = cases.map((c) => {
    const rows = parseDanawaRows(readFileSync(dataPath(c.file), 'utf8'))
    if (rows.length === 0) throw new Error(`${c.id}: 사본에서 줄을 뽑지 못했다`)
    const over = c.expected.accepted.filter((n) => n > rows.length)
    if (over.length > 0) throw new Error(`${c.id}: 허용 줄 ${over.join(',')}이 줄 수(${rows.length})를 넘는다`)
    const wanted = normalizeRequest(c.expected.wanted)
    if (wanted === null) throw new Error(`${c.id}: wanted가 서버 요청 규칙(normalizeRequest)에 맞지 않는다`)
    return { c, rows, wanted }
  })

  if (args.check) {
    for (const { c, rows } of pages) {
      console.log(`${c.id} · 줄 ${rows.length}개 · 허용 줄 ${c.expected.accepted.join(',') || '없음'}${c.uncertain ? ' · 애매함' : ''}`)
      rows.forEach((row, i) => console.log(`  ${c.expected.accepted.includes(i + 1) ? '허용' : '    '} ${rowText(row, i + 1)}`))
    }
    console.log(`lowest-price ${args.set} 사본 ${pages.length}개 검사 통과(Gemini는 부르지 않음)`)
    return
  }

  guardSecondRun('lowest-price', args.set, args.again)
  const key = readKey()
  await withRunLock('lowest-price', async () => {
    const raw: unknown[] = []
    const scored = await runSequential(pages, async ({ c, rows, wanted }) => {
      const startedAt = Date.now()
      const result = await callGemini({
        key,
        parts: [{ text: buildPickPrompt(wanted, rows) }],
        schema: PICK_SCHEMA,
        deps: { fetch: (input, init) => fetch(input, init), now: () => Date.now() },
        ctx: { origin: ORIGIN, startedAt },
      })
      const ms = Date.now() - startedAt
      // 다나와 직접 호출: 성공 200, Gemini 429 → 429(제한으로 셈), 그 밖의 Gemini 실패·모양이 다른 응답 502(asDanawaPicks)
      const { httpStatus, picked } = asDanawaPicks(rows, result)
      raw.push({ id: c.id, ok: result.ok, ms, value: result.ok ? result.value : null, rows })
      const one = scoreDanawaCase(c.id, c.expected, { httpStatus, ms, picked, prices: rows.map((row) => row.price) })
      console.log(caseLine(one))
      return one
    })
    finish(
      {
        date: today(),
        model: modelName(),
        feature: 'lowest-price',
        set: args.set,
        promptVersion: promptVersion(PICK_PROMPT, JSON.stringify(PICK_SCHEMA)),
        cases: scored,
      },
      {
        casesFile: CASES,
        casesSha256: sha256,
        git: gitState(),
        server: null,
        gapMs: GAP_MS,
        retry: 'callGemini 규칙 그대로(503일 때만 남은 시간이 15초 이상이면 1번 더)',
        uncertainIds: cases.filter((c) => c.uncertain).map((c) => c.id),
      },
      raw,
    )
  })
})
