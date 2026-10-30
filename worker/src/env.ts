import type { RateLimiter } from './rateLimit.ts'

export type Env = {
  // 배포에서 비밀 변수를 빠뜨리면 undefined다
  GEMINI_API_KEY?: string
  ALLOWED_ORIGINS: string
  AI_ENABLED: string
  DANAWA_ENABLED: string
}

// 모듈에 하나 두고 요청마다 바꾸지 않는다
export type Deps = {
  fetch: typeof fetch
  now: () => number
  limiter: RateLimiter
}

// 요청마다 새로 만든다
export type RequestContext = {
  origin: string
  startedAt: number
}
