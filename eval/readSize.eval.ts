// 치수 읽기 평가(F44 2단계, 채점 F43). 실제 Gemini를 부르므로 CI가 아니라 손으로 돌린다.
//   npm run worker:dev   (worker/.dev.vars에 키·ALLOWED_ORIGINS=http://localhost:5173)
//   node eval/readSize.eval.ts --set 조정용 --server http://localhost:8787
//   node eval/readSize.eval.ts --set 평가용 --check     (자료만 검사, 서버를 부르지 않음)
import { READ_SIZE_PROMPT, READ_SIZE_SCHEMA } from '../worker/src/readSize.ts'
import {
  asSizeCandidates,
  caseLine,
  checkSizeExpected,
  finish,
  GAP_MS,
  gitState,
  guardSecondRun,
  loadCases,
  loadPhoto,
  main,
  modelName,
  parseArgs,
  postJson,
  promptVersion,
  runSequential,
  today,
  withRunLock,
} from './lib.ts'
import { scoreSizeCase } from './score.ts'

const CASES = 'eval/cases/read-size.json'

main(async () => {
  const args = parseArgs(process.argv.slice(2), { server: true })
  const { cases, sha256 } = loadCases(CASES, args.set, checkSizeExpected, 'read-size')
  // 모델을 부르기 전에 모든 자료를 먼저 검사한다
  const photos = cases.map((c) => ({ c, ...loadPhoto(c.id, c.file) }))

  if (args.check) {
    for (const { c, width, height, image } of photos) {
      const kb = Math.round((image.length * 3) / 4 / 1024)
      console.log(`${c.id} · ${width}×${height} · ${kb}KB · 정답 표기 ${c.expected.length}개${c.uncertain ? ' · 애매함' : ''}`)
    }
    console.log(`read-size ${args.set} 자료 ${photos.length}개 검사 통과(서버는 부르지 않음)`)
    return
  }

  guardSecondRun('read-size', args.set, args.again)
  const server = args.server as string
  await withRunLock('read-size', async () => {
    const raw: unknown[] = []
    const scored = await runSequential(photos, async ({ c, image }) => {
      const reply = await postJson(server, '/api/read-size', { image, mimeType: 'image/jpeg' })
      const candidates = reply.httpStatus === 200 ? asSizeCandidates(reply.body) : null
      // 200인데 모양이 다르면 실패(502로 적는다). 실제 상태는 원시 결과에 남는다
      const httpStatus = reply.httpStatus === 200 && candidates === null ? 502 : reply.httpStatus
      raw.push({ id: c.id, httpStatus: reply.httpStatus, ms: reply.ms, body: reply.body })
      const one = scoreSizeCase(c.id, c.expected, { httpStatus, ms: reply.ms, candidates })
      console.log(caseLine(one))
      return one
    })
    finish(
      {
        date: today(),
        model: modelName(),
        feature: 'read-size',
        set: args.set,
        promptVersion: promptVersion(READ_SIZE_PROMPT, JSON.stringify(READ_SIZE_SCHEMA)),
        cases: scored,
      },
      {
        casesFile: CASES,
        casesSha256: sha256,
        git: gitState(),
        server,
        gapMs: GAP_MS,
        retry: '다시 보내지 않음(429·503은 따로 셈)',
        uncertainIds: cases.filter((c) => c.uncertain).map((c) => c.id),
      },
      raw,
    )
  })
})
