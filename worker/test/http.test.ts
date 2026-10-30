// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Deps, Env } from '../src/env.ts'
import type { Route } from '../src/http.ts'
import { handle, json } from '../src/http.ts'
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

  it('IP 헤더가 없으면 unknown 하나로 묶어서 세요', async () => {
    const { deps } = makeDeps()
    const { routes } = makeRoutes()
    for (let i = 0; i < 10; i++) await handle(post('{}'), env, deps, routes)
    const res = await handle(post('{}'), env, deps, routes)
    expect(res.status).toBe(429)
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
