// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Deps, Env } from '../src/env.ts'
import type { Route } from '../src/http.ts'
import { handle, json, rateLimitKey } from '../src/http.ts'
import { createRateLimiter } from '../src/rateLimit.ts'

const ORIGIN = 'https://lumos0107.github.io'

const env: Env = {
  GEMINI_API_KEY: 'test-key',
  ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
  AI_ENABLED: 'true',
  DANAWA_ENABLED: 'false',
}

function makeDeps(now = 1_000) {
  const fetchMock = vi.fn()
  const deps: Deps = {
    fetch: fetchMock as unknown as typeof fetch,
    now: () => now,
    limiter: createRateLimiter({ limit: 10, windowMs: 60_000 }),
  }
  return { deps, fetchMock }
}

function makeRoutes(limit = 100) {
  const run = vi.fn<Route['run']>(async (body, _env, _deps, ctx) =>
    json(200, { body, ctx }, ctx),
  )
  return { routes: { '/api/echo': { limit, run } } as Record<string, Route>, run }
}

function post(body: string, init: { origin?: string | null; ip?: string; path?: string } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN)
  if (init.ip) headers.set('CF-Connecting-IP', init.ip)
  return new Request(`https://ai.example.workers.dev${init.path ?? '/api/echo'}`, {
    method: 'POST',
    headers,
    body,
  })
}

// 조각을 읽을 때만 하나씩 내주는 본문(highWaterMark 0이라 미리 읽어 두지 않는다).
// 몇 번 읽혔는지, 몇 바이트를 내줬는지, 취소됐는지를 기록한다. chunks개를 내주면 끝나고, fail이면 첫 읽기에서 오류가 난다.
function streamBody(chunk: Uint8Array, options: { chunks?: number; fail?: boolean } = {}) {
  const log = { pulls: 0, bytes: 0, cancelled: false }
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        log.pulls += 1
        if (options.fail) {
          controller.error(new Error('read failed'))
          return
        }
        if (options.chunks !== undefined && log.pulls > options.chunks) {
          controller.close()
          return
        }
        log.bytes += chunk.byteLength
        controller.enqueue(chunk)
      },
      cancel() {
        log.cancelled = true
      },
    },
    { highWaterMark: 0 },
  )
  return { stream, log }
}

function postStream(stream: ReadableStream<Uint8Array>, init: { ip?: string; contentLength?: string } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: ORIGIN })
  if (init.ip) headers.set('CF-Connecting-IP', init.ip)
  if (init.contentLength !== undefined) headers.set('Content-Length', init.contentLength)
  return new Request('https://ai.example.workers.dev/api/echo', {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit)
}

describe('AI 서버 요청 처리', () => {
  // plan: rejects a disallowed origin with 403 and calls no route
  it('허용하지 않은 출처는 403으로 막고 경로를 실행하지 않아요', async () => {
    const { deps, fetchMock } = makeDeps()
    const { routes, run } = makeRoutes()
    const res = await handle(post('{}', { origin: 'https://evil.example' }), env, deps, routes)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(run).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('출처 헤더가 없는 요청도 403으로 막아요', async () => {
    const { deps } = makeDeps()
    const { routes, run } = makeRoutes()
    const res = await handle(post('{}', { origin: null }), env, deps, routes)
    expect(res.status).toBe(403)
    expect(run).not.toHaveBeenCalled()
  })

  it('ALLOWED_ORIGINS가 설정되지 않았으면 오류 없이 403으로 막아요', async () => {
    const { deps } = makeDeps()
    const { routes, run } = makeRoutes()
    const unset = { ...env, ALLOWED_ORIGINS: undefined } as unknown as Env
    const res = await handle(post('{}'), unset, deps, routes)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(run).not.toHaveBeenCalled()
  })

  // plan: answers OPTIONS for an allowed origin with 204 and CORS headers
  it('허용한 출처의 OPTIONS 사전 요청에 204와 CORS 헤더로 답해요', async () => {
    const { deps } = makeDeps()
    const { routes, run } = makeRoutes()
    const req = new Request('https://ai.example.workers.dev/api/echo', {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN },
    })
    const res = await handle(req, env, deps, routes)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST')
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    expect(res.headers.get('Access-Control-Max-Age')).toBe('600')
    expect(res.headers.get('Vary')).toBe('Origin')
    expect(run).not.toHaveBeenCalled()
  })

  it('쉼표로 나눈 두 번째 허용 출처도 받아요', async () => {
    const { deps } = makeDeps()
    const { routes } = makeRoutes()
    const res = await handle(post('{}', { origin: 'http://localhost:5173' }), env, deps, routes)
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
  })

  // plan: returns 503 disabled when AI_ENABLED is not "true"
  it('AI_ENABLED가 "true"가 아니면 503 disabled로 답해요', async () => {
    const { routes, run } = makeRoutes()
    for (const value of ['false', '', 'TRUE', '1']) {
      const { deps } = makeDeps()
      const res = await handle(post('{}'), { ...env, AI_ENABLED: value }, deps, routes)
      expect(res.status, `AI_ENABLED=${value}`).toBe(503)
      expect(await res.json()).toEqual({ error: 'disabled' })
    }
    expect(run).not.toHaveBeenCalled()
  })

  // plan: returns 429 on the 11th request from one IP within a minute and makes no outbound fetch
  it('같은 IP의 11번째 요청은 429로 막고 바깥으로 요청하지 않아요', async () => {
    const { deps, fetchMock } = makeDeps()
    const { routes, run } = makeRoutes()
    for (let i = 0; i < 10; i++) {
      const res = await handle(post('{}', { ip: '203.0.113.5' }), env, deps, routes)
      expect(res.status).toBe(200)
    }
    const blocked = await handle(post('{}', { ip: '203.0.113.5' }), env, deps, routes)
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toEqual({ error: 'rate_limited' })
    expect(run).toHaveBeenCalledTimes(10)
    expect(fetchMock).not.toHaveBeenCalled()
    // 다른 IP는 영향 없어요
    const other = await handle(post('{}', { ip: '203.0.113.6' }), env, deps, routes)
    expect(other.status).toBe(200)
  })

  // 우리 서버의 IP 제한(rate_limited)과 Gemini의 제한(upstream_limited)은 앱이 다른 문구로 보인다. 앞의 것은 본문이 rate_limited로 남아야 한다
  it('AC75: 같은 IP 11번째는 본문이 rate_limited인 429예요', async () => {
    const { deps, fetchMock } = makeDeps()
    const { routes, run } = makeRoutes()
    for (let i = 0; i < 10; i++) await handle(post('{}', { ip: '203.0.113.9' }), env, deps, routes)
    const blocked = await handle(post('{}', { ip: '203.0.113.9' }), env, deps, routes)
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toEqual({ error: 'rate_limited' })
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(blocked.headers.get('Cache-Control')).toBe('no-store')
    expect(run).toHaveBeenCalledTimes(10)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('IP 헤더가 없으면 unknown 하나로 묶어서 세요', async () => {
    const { deps } = makeDeps()
    const { routes } = makeRoutes()
    for (let i = 0; i < 10; i++) await handle(post('{}'), env, deps, routes)
    const res = await handle(post('{}'), env, deps, routes)
    expect(res.status).toBe(429)
  })

  it('IP 제한은 본문을 읽기 전에 검사해서 막힌 요청의 본문은 읽지 않아요', async () => {
    const { deps } = makeDeps()
    const { routes } = makeRoutes()
    for (let i = 0; i < 10; i++) await handle(post('{}', { ip: '203.0.113.7' }), env, deps, routes)
    const { stream, log } = streamBody(new TextEncoder().encode('{}'), { chunks: 1 })
    const res = await handle(postStream(stream, { ip: '203.0.113.7' }), env, deps, routes)
    expect(res.status).toBe(429)
    expect(log.pulls).toBe(0)
  })

  // plan: accepts a body of exactly the limit and returns 413 one character over
  it('본문이 상한과 같으면 받고 한 글자 넘으면 413으로 막아요', async () => {
    const { deps } = makeDeps()
    const { routes, run } = makeRoutes(100)
    // {"a":"…"} 는 꾸밈 글자가 8개라 안쪽 x를 n-8개 넣으면 전체가 n글자
    const sized = (n: number) => `{"a":"${'x'.repeat(n - 8)}"}`
    expect(sized(100)).toHaveLength(100)
    const ok = await handle(post(sized(100), { ip: '1.1.1.1' }), env, deps, routes)
    expect(ok.status).toBe(200)
    const over = await handle(post(sized(101), { ip: '1.1.1.2' }), env, deps, routes)
    expect(over.status).toBe(413)
    expect(await over.json()).toEqual({ error: 'too_large' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('본문 크기는 바이트가 아니라 글자 수로 세요', async () => {
    const { deps } = makeDeps()
    const { routes } = makeRoutes(100)
    // 한글 한 글자는 3바이트지만 글자 수로는 1
    const body = `{"a":"${'가'.repeat(92)}"}`
    expect(body).toHaveLength(100)
    const res = await handle(post(body), env, deps, routes)
    expect(res.status).toBe(200)
  })

  // 바이트 상한 = 글자 수 상한 × 3 (UTF-16 한 단위는 UTF-8로 최대 3바이트). 상한 100이면 300바이트
  it('Content-Length가 상한 × 3바이트보다 크면 본문을 읽지 않고 413으로 막아요', async () => {
    const { deps } = makeDeps()
    const { routes, run } = makeRoutes(100)
    const small = () => streamBody(new TextEncoder().encode('{"a":1}'), { chunks: 1 })

    const over = small()
    const res = await handle(postStream(over.stream, { contentLength: '301', ip: '1.1.1.1' }), env, deps, routes)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too_large' })
    expect(over.log.pulls).toBe(0)
    expect(run).not.toHaveBeenCalled()

    // 300바이트까지는 읽어서 글자 수로 다시 센다
    const edge = small()
    const ok = await handle(postStream(edge.stream, { contentLength: '300', ip: '1.1.1.2' }), env, deps, routes)
    expect(ok.status).toBe(200)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('길이 헤더가 없는 큰 본문은 상한 × 3바이트를 넘는 순간 읽기를 멈추고 취소한 뒤 413으로 막아요', async () => {
    const { deps } = makeDeps()
    const { routes, run } = makeRoutes(100)
    // 64바이트 조각 1,000개(64,000바이트)를 내줄 수 있는 본문
    const { stream, log } = streamBody(new TextEncoder().encode('x'.repeat(64)), { chunks: 1000 })
    const res = await handle(postStream(stream), env, deps, routes)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too_large' })
    expect(log.cancelled).toBe(true)
    // 300바이트를 넘긴 조각(64 × 5 = 320바이트)에서 멈춘다
    expect(log.bytes).toBe(320)
    expect(run).not.toHaveBeenCalled()
  })

  it('본문 읽기가 실패하면 400 bad_request로 답해요', async () => {
    const { deps } = makeDeps()
    const { routes, run } = makeRoutes(100)
    const { stream } = streamBody(new Uint8Array(1), { fail: true })
    const res = await handle(postStream(stream), env, deps, routes)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad_request' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(run).not.toHaveBeenCalled()
  })

  // plan: returns 400 for a body that is not JSON
  it('JSON이 아닌 본문은 400으로 답해요', async () => {
    const { deps } = makeDeps()
    const { routes, run } = makeRoutes()
    const res = await handle(post('not json'), env, deps, routes)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad_request' })
    expect(run).not.toHaveBeenCalled()
  })

  // plan: returns 404 for an unknown path
  it('없는 경로와 POST가 아닌 요청은 404로 답해요', async () => {
    const { deps } = makeDeps()
    const { routes, run } = makeRoutes()
    const unknown = await handle(post('{}', { path: '/api/nothing' }), env, deps, routes)
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({ error: 'not_found' })
    const proto = await handle(post('{}', { path: '/constructor' }), env, deps, routes)
    expect(proto.status).toBe(404)
    const get = await handle(
      new Request('https://ai.example.workers.dev/api/echo', { headers: { Origin: ORIGIN } }),
      env,
      deps,
      routes,
    )
    expect(get.status).toBe(404)
    expect(run).not.toHaveBeenCalled()
  })

  // plan: passes the parsed body and a fresh context with origin and startedAt
  it('풀어 읽은 본문과 출처·시작 시각이 담긴 새 문맥을 경로에 넘겨요', async () => {
    const { routes, run } = makeRoutes()
    const first = makeDeps(1_234)
    await handle(post('{"a":1}', { ip: '9.9.9.1' }), env, first.deps, routes)
    const second = makeDeps(5_678)
    await handle(
      post('{"b":2}', { origin: 'http://localhost:5173', ip: '9.9.9.2' }),
      env,
      second.deps,
      routes,
    )

    expect(run).toHaveBeenCalledTimes(2)
    const [body1, env1, deps1, ctx1] = run.mock.calls[0]
    const [body2, , , ctx2] = run.mock.calls[1]
    expect(body1).toEqual({ a: 1 })
    expect(env1).toBe(env)
    expect(deps1).toBe(first.deps)
    expect(ctx1).toEqual({ origin: ORIGIN, startedAt: 1_234 })
    expect(body2).toEqual({ b: 2 })
    expect(ctx2).toEqual({ origin: 'http://localhost:5173', startedAt: 5_678 })
    expect(ctx1).not.toBe(ctx2)
  })

  // plan: sets CORS and no-store headers
  it('성공 응답에 CORS와 no-store 헤더를 붙여요', async () => {
    const { deps } = makeDeps()
    const { routes } = makeRoutes()
    const res = await handle(post('{}'), env, deps, routes)
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Vary')).toBe('Origin')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
  })

  it('오류 응답도 CORS와 no-store 헤더를 붙여요', async () => {
    const { deps } = makeDeps()
    const { routes } = makeRoutes()
    const res = await handle(post('not json'), env, deps, routes)
    expect(res.status).toBe(400)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  // plan: returns 502 when the route throws
  it('경로가 오류를 던지면 502 upstream으로 답하고 본문을 찍지 않아요', async () => {
    const { deps } = makeDeps()
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    )
    const routes: Record<string, Route> = {
      '/api/boom': {
        limit: 100,
        run: async () => {
          throw new Error('secret-body-text')
        },
      },
    }
    const res = await handle(post('{"secret":"body"}', { path: '/api/boom' }), env, deps, routes)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream' })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })
})

describe('IP 제한 키', () => {
  it('같은 /64 안의 IPv6 주소 둘은 같은 키예요(줄여 쓴 표기·대소문자와 상관없이)', () => {
    expect(rateLimitKey('2001:db8:85a3:1:aaaa::1')).toBe(rateLimitKey('2001:0DB8:85a3:0001:bbbb:cccc:dddd:eeee'))
    expect(rateLimitKey('2001:db8::1')).toBe(rateLimitKey('2001:db8:0:0:ffff::2'))
  })

  it('다른 /64의 IPv6 주소는 다른 키예요', () => {
    expect(rateLimitKey('2001:db8:85a3:1::1')).not.toBe(rateLimitKey('2001:db8:85a3:2::1'))
    expect(rateLimitKey('2001:db8::1')).not.toBe(rateLimitKey('2001:db9::1'))
  })

  it('IPv4 주소와 unknown은 그대로 키예요', () => {
    expect(rateLimitKey('203.0.113.5')).toBe('203.0.113.5')
    expect(rateLimitKey('unknown')).toBe('unknown')
  })

  it('같은 /64에서 온 11번째 요청은 주소가 달라도 429로 막아요', async () => {
    const { deps } = makeDeps()
    const { routes } = makeRoutes()
    for (let i = 1; i <= 10; i++) {
      const res = await handle(post('{}', { ip: `2001:db8:1:2::${i}` }), env, deps, routes)
      expect(res.status).toBe(200)
    }
    const blocked = await handle(post('{}', { ip: '2001:db8:1:2:ffff:ffff:ffff:ffff' }), env, deps, routes)
    expect(blocked.status).toBe(429)
    const otherNetwork = await handle(post('{}', { ip: '2001:db8:1:3::1' }), env, deps, routes)
    expect(otherNetwork.status).toBe(200)
  })
})
