export type RateLimiter = { take(key: string, nowMs: number): boolean }

const MAX_KEYS = 1000

// 메모리에서 세는 대략적 제한. 인스턴스마다 따로 센다 (PRD 10장).
export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>()

  return {
    take(key, nowMs) {
      const recent = (hits.get(key) ?? []).filter((t) => t > nowMs - opts.windowMs)
      const allowed = recent.length < opts.limit
      if (allowed) recent.push(nowMs)

      if (hits.has(key)) {
        hits.set(key, recent)
      } else {
        // 키가 너무 많아지면 가장 먼저 들어온 키부터 지운다 (Map은 넣은 순서를 지킨다)
        while (hits.size >= MAX_KEYS) {
          const oldest = hits.keys().next()
          if (oldest.done) break
          hits.delete(oldest.value)
        }
        hits.set(key, recent)
      }
      return allowed
    },
  }
}
