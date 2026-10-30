import type { Deps, Env } from './env.ts'
import { handle, type Route } from './http.ts'
import { createRateLimiter } from './rateLimit.ts'

// 인스턴스 하나가 살아 있는 동안 IP별 횟수를 센다 (대략적 제한)
const deps: Deps = {
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  limiter: createRateLimiter({ limit: 10, windowMs: 60_000 }),
}

// 경로는 Task 3·5·6이 채운다
const routes: Record<string, Route> = {}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, deps, routes)
  },
}
