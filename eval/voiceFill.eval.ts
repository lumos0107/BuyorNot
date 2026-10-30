// 말로 담기 평가(F33, 채점 F43). 실제 Gemini를 부르므로 CI가 아니라 손으로 돌린다.
//   npm run worker:dev   (worker/.dev.vars에 키·ALLOWED_ORIGINS=http://localhost:5173)
//   node eval/voiceFill.eval.ts --set 조정용 --server http://localhost:8787
//   node eval/voiceFill.eval.ts --set 평가용 --check     (자료만 검사, 서버를 부르지 않음)
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { VOICE_PROMPT, VOICE_SCHEMA } from '../worker/src/voiceFill.ts'
import {
  asVoice,
  caseLine,
  checkVoiceExpected,
  dataPath,
  finish,
  GAP_MS,
  gitState,
  guardSecondRun,
  loadCases,
  main,
  modelName,
  parseArgs,
  postJson,
  promptVersion,
  runSequential,
  today,
  wavSeconds,
  withRunLock,
} from './lib.ts'
import { scoreVoiceCase } from './score.ts'

const CASES = 'eval/cases/voice-fill.json'
const MAX_SECONDS = 20 // 앱은 녹음을 20초에서 멈춘다
const MAX_CHARS = 2_100_000 // 서버의 녹음 본문 상한(글자)
// 녹음은 브라우저가 만든 형식 그대로 보낸다. 파일 확장자로 형식을 정한다
const MIME: Record<string, string> = {
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
}

function loadAudio(id: string, file: string): { audio: string; mimeType: string; seconds: number | null } {
  const mimeType = MIME[extname(file).toLowerCase()]
  if (mimeType === undefined) throw new Error(`${id}: 모르는 녹음 형식(${extname(file)})`)
  const bytes = readFileSync(dataPath(file))
  const seconds = mimeType === 'audio/wav' ? wavSeconds(bytes) : null
  if (mimeType === 'audio/wav' && seconds === null) throw new Error(`${id}: WAV 머리를 읽지 못했다`)
  if (seconds !== null && seconds > MAX_SECONDS) throw new Error(`${id}: ${seconds.toFixed(1)}초. 앱처럼 ${MAX_SECONDS}초 이하만 쓴다`)
  const audio = bytes.toString('base64')
  if (audio.length + 100 > MAX_CHARS) throw new Error(`${id}: 서버 상한(${MAX_CHARS}자)을 넘는다`)
  return { audio, mimeType, seconds }
}

main(async () => {
  const args = parseArgs(process.argv.slice(2), { server: true })
  const { cases, sha256 } = loadCases(CASES, args.set, checkVoiceExpected, 'voice-fill')
  const clips = cases.map((c) => ({ c, ...loadAudio(c.id, c.file) }))

  if (args.check) {
    for (const { c, mimeType, seconds } of clips) {
      console.log(`${c.id} · ${mimeType} · ${seconds === null ? '길이 모름' : `${seconds.toFixed(1)}초`}${c.uncertain ? ' · 애매함' : ''}`)
    }
    console.log(`voice-fill ${args.set} 자료 ${clips.length}개 검사 통과(서버는 부르지 않음)`)
    return
  }

  guardSecondRun('voice-fill', args.set, args.again)
  const server = args.server as string
  await withRunLock('voice-fill', async () => {
    const raw: unknown[] = []
    const scored = await runSequential(clips, async ({ c, audio, mimeType }) => {
      const reply = await postJson(server, '/api/voice-fill', { audio, mimeType })
      const value = reply.httpStatus === 200 ? asVoice(reply.body) : null
      const httpStatus = reply.httpStatus === 200 && value === null ? 502 : reply.httpStatus
      raw.push({ id: c.id, httpStatus: reply.httpStatus, ms: reply.ms, body: reply.body })
      const one = scoreVoiceCase(c.id, c.expected, { httpStatus, ms: reply.ms, value })
      console.log(caseLine(one))
      return one
    })
    finish(
      {
        date: today(),
        model: modelName(),
        feature: 'voice-fill',
        set: args.set,
        promptVersion: promptVersion(VOICE_PROMPT, JSON.stringify(VOICE_SCHEMA)),
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
