import type { Deps, RequestContext } from './env.ts'

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } }

const MODEL_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
const DEFAULT_TIMEOUT_MS = 40_000
const DEFAULT_BUDGET_MS = 55_000
const RETRY_MIN_REMAINING_MS = 15_000
// 출력 토큰 상한(생각 토큰 포함). 상한 없이 보낸 치수 읽기가 40초·90초 안에 답하지 않았고 같은 요청에 이 상한을
// 더하자 4.4초에 답했다(2026-10-31). 길어진 생성(스키마 JSON 숫자 칸의 반복 등)은 상한이 없으면 모델 기본값
// 65,536토큰까지 갈 수 있다. 정상 응답은 가장 큰 가격표 20개도 약 3,300토큰으로 추정한다.
const MAX_OUTPUT_TOKENS = 4096

type Attempt = { kind: 'ok'; envelope: unknown } | { kind: 'busy' } | { kind: 'fail' }

// 한 번의 시도. fetch와 본문 json()을 같은 상한 안에서 기다린다.
async function attemptOnce(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
  limitMs: number,
): Promise<Attempt> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), limitMs)
  // 신호를 무시하는 fetch·본문이 있어도 상한 시각에 반드시 끝나도록 신호와 겨룬다
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
  aborted.catch(() => {})
  try {
    const run = async (): Promise<Attempt> => {
      const res = await fetchFn(url, { ...init, signal: controller.signal })
      if (res.status === 503) return { kind: 'busy' }
      if (!res.ok) return { kind: 'fail' }
      return { kind: 'ok', envelope: await res.json() }
    }
    return await Promise.race([run(), aborted])
  } catch {
    // 오류 내용에는 요청 정보가 섞일 수 있어 남기지 않는다
    return { kind: 'fail' }
  } finally {
    clearTimeout(timer)
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

// candidates[0].content.parts[*].text를 이어 붙인다. 모양이 다르면 null.
function joinText(envelope: unknown): string | null {
  if (!isRecord(envelope) || !Array.isArray(envelope.candidates)) return null
  const first: unknown = envelope.candidates[0]
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) {
    return null
  }
  let text = ''
  let found = false
  for (const part of first.content.parts as unknown[]) {
    if (isRecord(part) && typeof part.text === 'string') {
      text += part.text
      found = true
    }
  }
  return found ? text : null
}

export async function callGemini(opts: {
  key: string
  parts: GeminiPart[]
  schema: object
  deps: Pick<Deps, 'fetch' | 'now'>
  ctx: RequestContext
  timeoutMs?: number
  budgetMs?: number
}): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const { key, parts, schema, deps, ctx } = opts
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS
  const remaining = () => ctx.startedAt + budgetMs - deps.now()

  const init: RequestInit = {
    method: 'POST',
    // 키는 헤더에만 둔다
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    }),
  }

  let result: Attempt = { kind: 'fail' }
  for (let tries = 0; tries < 2; tries++) {
    const left = remaining()
    if (left <= 0) return { ok: false }
    result = await attemptOnce(MODEL_URL, init, deps.fetch, Math.min(timeoutMs, left))
    // 503이고 남은 시간이 충분할 때만 한 번 더
    if (result.kind === 'busy' && remaining() >= RETRY_MIN_REMAINING_MS) continue
    break
  }
  if (result.kind !== 'ok') return { ok: false }

  const text = joinText(result.envelope)
  if (text === null) return { ok: false }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}
