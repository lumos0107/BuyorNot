// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '../src/env.ts'
import type { GeminiPart } from '../src/gemini.ts'
import { callGemini } from '../src/gemini.ts'

const MODEL_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
const KEY = 'test-secret-key-123'
const SCHEMA = { type: 'OBJECT', properties: { name: { type: 'STRING' } } }
const PARTS: GeminiPart[] = [{ text: '이 사진을 읽어 줘' }]

function geminiBody(text: string): string {
  return JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })
}

function ok(text: string): Response {
  return new Response(geminiBody(text), { status: 200 })
}

function status(code: number): Response {
  return new Response('{}', { status: code })
}

// 신호가 중단될 때만 거절되는 fetch (헤더도 오지 않은 상태)
function hangingFetch(onAbort: () => void) {
  return (_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        onAbort()
        reject(new Error('aborted'))
      })
    })
}

// deps.now와 같은 시계를 테스트에서 직접 움직인다
function setup(startedAt = 0) {
  const clock = { t: startedAt }
  const fetchMock = vi.fn<typeof fetch>()
  const deps = { fetch: fetchMock as unknown as typeof fetch, now: () => clock.t }
  const ctx: RequestContext = { origin: 'https://lumos0107.github.io', startedAt }
  const call = (extra: { timeoutMs?: number; budgetMs?: number; maxOutputTokens?: number } = {}) =>
    callGemini({ key: KEY, parts: PARTS, schema: SCHEMA, deps, ctx, ...extra })
  return { clock, fetchMock, call }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Gemini 호출', () => {
  // plan: sends the model URL, key header, schema and temperature 0
  it('모델 주소와 키 헤더, 스키마, 온도 0으로 보내요', async () => {
    const { fetchMock, clock } = setup()
    fetchMock.mockResolvedValueOnce(ok('{"name":"우유"}'))
    const parts: GeminiPart[] = [
      { text: '읽어 줘' },
      { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } },
    ]
    const result = await callGemini({
      key: KEY,
      parts,
      schema: SCHEMA,
      deps: { fetch: fetchMock as unknown as typeof fetch, now: () => clock.t },
      ctx: { origin: 'https://lumos0107.github.io', startedAt: 0 },
    })
    expect(result).toEqual({ ok: true, value: { name: '우유' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(MODEL_URL)
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('x-goog-api-key')).toBe(KEY)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        temperature: 0,
        maxOutputTokens: 4096,
      },
    })
  })

  // 치수 읽기 실제 호출에서 모델이 숫자 칸을 "22.0000…"처럼 끝없이 이어 썼고, 상한이 없으면 40초 안에 끝나지
  // 않았다(2026-10-31). 상한은 이런 응답을 빨리 끊는다. 이 테스트는 상한이 빠지면 실패한다.
  it('출력 토큰 상한 4096을 함께 보내요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockResolvedValueOnce(ok('{}'))
    await call()
    const sent = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      generationConfig: Record<string, unknown>
    }
    expect(sent.generationConfig.maxOutputTokens).toBe(4096)
  })

  it('maxOutputTokens를 주면 그 상한을 보내요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockResolvedValueOnce(ok('{}'))
    await call({ maxOutputTokens: 6144 })
    const sent = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      generationConfig: Record<string, unknown>
    }
    expect(sent.generationConfig.maxOutputTokens).toBe(6144)
  })

  it('키를 주소에 싣지 않아요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockResolvedValueOnce(ok('{}'))
    await call()
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(KEY)
  })

  it('여러 조각으로 나뉜 글을 이어 붙여 해석해요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }],
        }),
        { status: 200 },
      ),
    )
    expect(await call()).toEqual({ ok: true, value: { a: 1 } })
  })

  // plan: retries once on 503 and returns the parsed JSON
  it('503이면 한 번 더 불러서 해석한 JSON을 돌려줘요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok('{"price":3980}'))
    expect(await call()).toEqual({ ok: true, value: { price: 3980 } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // plan: gives up after two 503s
  it('503이 두 번 나오면 포기하고 세 번째는 부르지 않아요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockImplementation(async () => status(503))
    expect(await call()).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // plan: does not retry on 429
  it('429는 다시 부르지 않아요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockImplementation(async () => status(429))
    expect(await call()).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('503이 아닌 다른 오류 상태도 다시 부르지 않아요', async () => {
    for (const code of [400, 403, 500, 502]) {
      const { fetchMock, call } = setup()
      fetchMock.mockImplementation(async () => status(code))
      expect(await call()).toEqual({ ok: false })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  // plan: does not retry when less than 15s of the budget is left
  it('남은 시간이 15초보다 적으면 503이어도 다시 부르지 않아요', async () => {
    const { clock, fetchMock, call } = setup()
    fetchMock.mockImplementationOnce(async () => {
      clock.t = 40_001 // 55,000 - 40,001 = 14,999ms 남음
      return status(503)
    })
    fetchMock.mockImplementation(async () => ok('{}'))
    expect(await call()).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('남은 시간이 정확히 15초면 한 번 더 불러요', async () => {
    const { clock, fetchMock, call } = setup()
    fetchMock.mockImplementationOnce(async () => {
      clock.t = 40_000 // 55,000 - 40,000 = 15,000ms 남음
      return status(503)
    })
    fetchMock.mockResolvedValueOnce(ok('{"ok":1}'))
    expect(await call()).toEqual({ ok: true, value: { ok: 1 } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('요청이 시작된 뒤 이미 흐른 시간을 예산에서 빼요', async () => {
    const { clock, fetchMock, call } = setup(1_000)
    clock.t = 1_000 + 50_000 // 앞에서 50초를 썼다: 5초 남음
    let aborted = false
    fetchMock.mockImplementation(hangingFetch(() => (aborted = true)))
    const pending = call()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(aborted).toBe(true)
    expect(await pending).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('예산을 이미 다 썼으면 부르지 않아요', async () => {
    const { clock, fetchMock, call } = setup()
    clock.t = 55_000
    expect(await call()).toEqual({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('한 번의 상한은 40초이고 시간이 넘으면 중단해요', async () => {
    const { fetchMock, call } = setup()
    let aborted = false
    fetchMock.mockImplementation(hangingFetch(() => (aborted = true)))
    const pending = call()
    await vi.advanceTimersByTimeAsync(39_999)
    expect(aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(aborted).toBe(true)
    expect(await pending).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // plan: returns ok:false when the text is not JSON
  it('글이 JSON이 아니면 ok:false를 돌려주고 다시 부르지 않아요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockImplementation(async () => ok('이건 JSON이 아니에요'))
    expect(await call()).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('후보나 조각이 없는 응답 모양이면 ok:false를 돌려줘요', async () => {
    const bodies = [
      {},
      { candidates: [] },
      { candidates: [{}] },
      { candidates: [{ content: {} }] },
      { candidates: [{ content: { parts: [] } }] },
      { candidates: [{ content: { parts: [{ inlineData: {} }] } }] },
      null,
      'text',
    ]
    for (const body of bodies) {
      const { fetchMock, call } = setup()
      fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }))
      expect(await call()).toEqual({ ok: false })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it('본문 전체가 JSON이 아니어도 던지지 않고 ok:false를 돌려줘요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockImplementation(async () => new Response('<html>oops</html>', { status: 200 }))
    expect(await call()).toEqual({ ok: false })
  })

  it('fetch가 던져도 던지지 않고 ok:false를 돌려주며 키를 싣지 않아요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockRejectedValue(new Error(`network down ${KEY}`))
    const result = await call()
    expect(result).toEqual({ ok: false })
    expect(JSON.stringify(result)).not.toContain(KEY)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // plan: aborts when the body is still streaming at the deadline
  it('상한 시각에 본문이 아직 오는 중이면 끊고 ok:false를 돌려줘요', async () => {
    const { fetchMock, call } = setup()
    let bodyAborted = false
    fetchMock.mockImplementation((_url, init) => {
      // 헤더는 왔지만 json()은 신호가 중단될 때만 끝나는 응답
      const streaming = {
        ok: true,
        status: 200,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              bodyAborted = true
              reject(new DOMException('aborted', 'AbortError'))
            })
          }),
      }
      return Promise.resolve(streaming as unknown as Response)
    })
    const pending = call()
    await vi.advanceTimersByTimeAsync(39_999)
    expect(bodyAborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(bodyAborted).toBe(true)
    expect(await pending).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('신호를 무시하고 끝나지 않는 본문도 상한 시각에 끊어요', async () => {
    const { fetchMock, call } = setup()
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          json: () => new Promise<unknown>(() => {}),
        }) as unknown as Response,
    )
    const pending = call()
    await vi.advanceTimersByTimeAsync(40_000)
    expect(await pending).toEqual({ ok: false })
  })

  it('다시 부르는 시도도 처음 시작 시각 기준의 남은 시간만 써요', async () => {
    const { clock, fetchMock, call } = setup()
    // 첫 시도: 20초 걸려 503 → 35초 남음. 두 번째 시도는 40초가 아니라 35초까지만.
    fetchMock.mockImplementationOnce(async () => {
      clock.t = 20_000
      return status(503)
    })
    let secondAborted = false
    fetchMock.mockImplementationOnce(hangingFetch(() => (secondAborted = true)))
    const pending = call()
    await vi.advanceTimersByTimeAsync(34_999)
    expect(secondAborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(secondAborted).toBe(true)
    expect(await pending).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('timeoutMs와 budgetMs를 바꿔 쓸 수 있어요', async () => {
    const { fetchMock, call } = setup()
    let aborted = false
    fetchMock.mockImplementation(hangingFetch(() => (aborted = true)))
    const pending = call({ timeoutMs: 5_000, budgetMs: 8_000 })
    await vi.advanceTimersByTimeAsync(4_999)
    expect(aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(aborted).toBe(true)
    expect(await pending).toEqual({ ok: false })
  })
})
