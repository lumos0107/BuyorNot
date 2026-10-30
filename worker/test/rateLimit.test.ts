// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../src/rateLimit.ts'

describe('IP당 요청 수 제한', () => {
  // plan: allows 10 requests then blocks the 11th within 60s
  it('60초 안에 열 번은 받고 열한 번째부터 막아요', () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })
    for (let i = 0; i < 10; i++) {
      expect(limiter.take('1.1.1.1', i * 1000)).toBe(true)
    }
    expect(limiter.take('1.1.1.1', 59_999)).toBe(false)
  })

  // plan: allows again after 60s
  it('처음 요청으로부터 60초가 지나면 다시 받아요', () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })
    for (let i = 0; i < 10; i++) limiter.take('1.1.1.1', 0)
    expect(limiter.take('1.1.1.1', 59_999)).toBe(false)
    expect(limiter.take('1.1.1.1', 60_000)).toBe(true)
  })

  // plan: counts each key separately
  it('키마다 따로 세요', () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })
    for (let i = 0; i < 10; i++) limiter.take('1.1.1.1', 0)
    expect(limiter.take('1.1.1.1', 1)).toBe(false)
    expect(limiter.take('2.2.2.2', 1)).toBe(true)
  })

  it('막힌 요청은 횟수에 넣지 않아요', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 })
    expect(limiter.take('k', 0)).toBe(true)
    expect(limiter.take('k', 500)).toBe(true)
    expect(limiter.take('k', 600)).toBe(false)
    expect(limiter.take('k', 700)).toBe(false)
    // 0ms 요청만 창 밖으로 나가면 자리 하나가 비어요
    expect(limiter.take('k', 1000)).toBe(true)
    expect(limiter.take('k', 1001)).toBe(false)
  })

  it('키가 1000개를 넘으면 가장 오래된 키부터 지워요', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    for (let i = 0; i < 1000; i++) limiter.take(`ip-${i}`, 0)
    expect(limiter.take('ip-0', 1)).toBe(false)
    // 1001번째 키가 들어오면 가장 오래된 ip-0 기록이 사라져요
    expect(limiter.take('ip-new', 1)).toBe(true)
    expect(limiter.take('ip-0', 2)).toBe(true)
    expect(limiter.take('ip-999', 2)).toBe(false)
  })
})
