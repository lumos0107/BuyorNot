import type { Deps, Env, RequestContext } from './env.ts'

export type ErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'disabled'
  | 'rate_limited'
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

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '')
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
  if (!deps.limiter.take(ip, startedAt)) return fail(429, 'rate_limited', ctx)

  const text = await request.text()
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
