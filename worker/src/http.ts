import type { Deps, Env, RequestContext } from './env.ts'
import type { GeminiFailure } from './gemini.ts'

export type ErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'disabled'
  | 'rate_limited'
  | 'upstream_limited'
  | 'too_large'
  | 'bad_request'
  | 'upstream'

export type Route = {
  limit: number
  run: (body: unknown, env: Env, deps: Deps, ctx: RequestContext) => Promise<Response>
}

export function json(status: number, body: unknown, ctx: RequestContext): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Origin': ctx.origin,
      Vary: 'Origin',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function fail(status: number, error: ErrorCode, ctx: RequestContext): Response {
  return json(status, { error }, ctx)
}

// Gemini 호출이 실패했을 때의 응답. Gemini의 429는 우리 서버의 IP 제한(rate_limited)과 달리 upstream_limited,
// 키 없음은 disabled(Gemini 요청 없이), 그 밖(시간 초과·5xx·모양이 다른 응답)은 upstream이다
export function geminiFailed(failure: GeminiFailure, ctx: RequestContext): Response {
  if (failure.reason === 'limited') return fail(429, 'upstream_limited', ctx)
  if (failure.reason === 'no_key') return fail(503, 'disabled', ctx)
  return fail(502, 'upstream', ctx)
}

// 허용하지 않은 출처에는 CORS 헤더를 주지 않는다
function forbidden(): Response {
  return new Response(JSON.stringify({ error: 'forbidden' satisfies ErrorCode }), {
    status: 403,
    headers: {
      Vary: 'Origin',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

// 환경 변수가 빠져 있어도 오류 없이 모든 출처를 막는다
function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '')
}

// IPv6 주소를 16비트 8칸(앞 0을 뗀 소문자)으로 편다. '::' 줄임을 풀고, 모양이 맞지 않으면 null
function ipv6Groups(address: string): string[] | null {
  const halves = address.split('::')
  if (halves.length > 2) return null
  const head = halves[0] === '' ? [] : halves[0].split(':')
  const tail = halves.length === 2 && halves[1] !== '' ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...head, ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => '0'), ...tail]
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null
  return groups.map((g) => parseInt(g, 16).toString(16))
}

// IP 제한 키. IPv6는 한 가입자가 /64를 통째로 받는 일이 많아 앞 64비트로 묶는다.
// IPv4·'unknown'과, 점 표기가 섞였거나 모양이 맞지 않는 주소는 그대로 둔다
export function rateLimitKey(ip: string): string {
  if (!ip.includes(':') || ip.includes('.')) return ip
  const groups = ipv6Groups(ip.split('%')[0])
  return groups === null ? ip : `${groups.slice(0, 4).join(':')}::/64`
}

// 본문을 상한까지만 읽는다. 글자 수 상한은 UTF-16 단위로 세고 한 단위는 UTF-8로 최대 3바이트라, 바이트 상한은 그 3배다.
// 길이 헤더가 그보다 크면 읽지 않고, 헤더가 없거나 맞지 않아도 그 바이트를 넘는 순간 읽기를 멈춘다.
// 읽기가 실패하면 그대로 던진다(handle이 400으로 바꾼다).
async function readLimitedText(request: Request, limit: number): Promise<string | 'too_large'> {
  const maxBytes = limit * 3
  const declared = request.headers.get('Content-Length')
  if (declared !== null && Number(declared) > maxBytes) return 'too_large'
  if (request.body === null) return ''

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return 'too_large'
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

export async function handle(
  request: Request,
  env: Env,
  deps: Deps,
  routes: Record<string, Route>,
): Promise<Response> {
  const startedAt = deps.now()

  const origin = request.headers.get('Origin')
  if (origin === null || !allowedOrigins(env).includes(origin)) return forbidden()
  const ctx: RequestContext = { origin, startedAt }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
        'Cache-Control': 'no-store',
      },
    })
  }

  const path = new URL(request.url).pathname
  if (request.method !== 'POST' || !Object.hasOwn(routes, path)) {
    return fail(404, 'not_found', ctx)
  }
  const route = routes[path]

  if (env.AI_ENABLED !== 'true') return fail(503, 'disabled', ctx)

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (!deps.limiter.take(rateLimitKey(ip), startedAt)) return fail(429, 'rate_limited', ctx)

  let text: string
  try {
    const read = await readLimitedText(request, route.limit)
    if (read === 'too_large') return fail(413, 'too_large', ctx)
    text = read
  } catch {
    return fail(400, 'bad_request', ctx)
  }
  // 글자 수 상한은 그대로 JSON을 풀기 전에 검사한다 (PRD 10장 AI 공통)
  if (text.length > route.limit) return fail(413, 'too_large', ctx)

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return fail(400, 'bad_request', ctx)
  }

  try {
    return await route.run(body, env, deps, ctx)
  } catch {
    // 본문이나 오류 내용을 남기지 않는다
    return fail(502, 'upstream', ctx)
  }
}
