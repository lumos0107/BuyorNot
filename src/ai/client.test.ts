import { afterEach, describe, expect, it, vi } from 'vitest'
import { isLowestPriceResponse, isReadTagResponse, isVoiceFillResponse, postJson } from './client'
import { aiServerUrl, PHOTO_TIMEOUT_MS, VOICE_TIMEOUT_MS } from './config'
import type { DanawaRow, LowestPriceResponse, ReadTagResponse, TagItem, VoiceFillResponse } from './types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

const SERVER = 'https://ai.example.com'

// ---- 응답 모양 견본(서버가 실제로 돌려주는 모양: 모든 칸이 늘 있다) ----

const TAG_ITEM: TagItem = {
  name: '농심 오징어짬뽕 소컵 6입',
  brand: '농심',
  price: 3980,
  priceCondition: '회원가',
  regularPrice: 4980,
  priceBasis: null,
  sizeText: '67g×6',
  size: 67,
  unit: 'g',
  count: 6,
  tagReadable: true,
}
const TAG_RESPONSE: ReadTagResponse = { items: [TAG_ITEM], note: null }

const ROW: DanawaRow = { name: '농심 오징어짬뽕 소컵', packCount: 6, price: 4900, unitPriceText: '816원/g', malls: '573' }
const LOWEST_RESPONSE: LowestPriceResponse = {
  status: 'found',
  searchUrl: 'https://search.danawa.com/?query=%EC%98%A4%EC%A7%95%EC%96%B4',
  matches: [ROW],
  candidates: [],
}

const VOICE_RESPONSE: VoiceFillResponse = {
  transcript: '요가 매트 삼만 오천 원짜리 사고 싶어.',
  name: '요가 매트',
  price: 35000,
  reason: '집에서 홈트 하려고',
  desire: 4,
  periodDays: 3,
}

// ---- 가짜 fetch ----

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<unknown>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// 응답이 오지 않고, 요청에 abort 신호가 오면 AbortError로 끝나는 fetch
function hangingFetch() {
  return stubFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
  )
}

const anyObject = (v: unknown): v is { ok: boolean } => typeof v === 'object' && v !== null
const READ_TAG_PATH = '/api/read-tag'

describe('aiServerUrl', () => {
  // plan: aiServerUrl trims the trailing slash
  it('끝의 /를 떼고 돌려준다', () => {
    vi.stubEnv('VITE_AI_SERVER_URL', 'https://ai.example.com/')
    expect(aiServerUrl()).toBe('https://ai.example.com')
    vi.stubEnv('VITE_AI_SERVER_URL', '  http://localhost:8787//  ')
    expect(aiServerUrl()).toBe('http://localhost:8787')
    vi.stubEnv('VITE_AI_SERVER_URL', 'https://ai.example.com')
    expect(aiServerUrl()).toBe('https://ai.example.com')
  })

  // plan: aiServerUrl is null when unset or not a URL
  it('비어 있거나 http·https 주소가 아니면 null이다', () => {
    vi.stubEnv('VITE_AI_SERVER_URL', undefined)
    expect(aiServerUrl()).toBeNull()
    for (const value of ['', '   ', 'not a url', 'localhost:8787', 'ftp://ai.example.com', 'javascript:alert(1)']) {
      vi.stubEnv('VITE_AI_SERVER_URL', value)
      expect(aiServerUrl()).toBeNull()
    }
  })

  it('부를 때마다 환경 변수를 다시 읽는다', () => {
    vi.stubEnv('VITE_AI_SERVER_URL', 'https://one.example.com')
    expect(aiServerUrl()).toBe('https://one.example.com')
    vi.stubEnv('VITE_AI_SERVER_URL', 'https://two.example.com')
    expect(aiServerUrl()).toBe('https://two.example.com')
  })

  it('대기 상한은 사진 60초, 녹음 60초다', () => {
    expect(PHOTO_TIMEOUT_MS).toBe(60_000)
    expect(VOICE_TIMEOUT_MS).toBe(60_000)
  })
})

describe('postJson', () => {
  // plan: postJson posts JSON to the server path
  it('서버 주소 뒤 경로로 JSON을 POST한다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', `${SERVER}/`)
    const fetchMock = stubFetch(async () => jsonResponse(TAG_RESPONSE))
    const body = { image: 'abc', mimeType: 'image/jpeg' }

    const result = await postJson(READ_TAG_PATH, body, { timeoutMs: PHOTO_TIMEOUT_MS, guard: isReadTagResponse })

    expect(result).toEqual({ ok: true, data: TAG_RESPONSE })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://ai.example.com/api/read-tag')
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('세 경로 모두 같은 방식으로 보낸다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = stubFetch(async () => jsonResponse(VOICE_RESPONSE))

    await postJson('/api/lowest-price', { name: '라면' }, { timeoutMs: PHOTO_TIMEOUT_MS, guard: isVoiceFillResponse })
    await postJson('/api/voice-fill', { audio: 'x' }, { timeoutMs: VOICE_TIMEOUT_MS, guard: isVoiceFillResponse })

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://ai.example.com/api/lowest-price',
      'https://ai.example.com/api/voice-fill',
    ])
  })

  // plan: maps 429 to rate_limited and 503 to disabled
  it('429는 rate_limited, 503은 disabled이고 다시 보내지 않는다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = stubFetch(async () => jsonResponse({ error: 'rate_limited' }, 429))
    const opts = { timeoutMs: PHOTO_TIMEOUT_MS, guard: anyObject }

    expect(await postJson(READ_TAG_PATH, {}, opts)).toEqual({ ok: false, error: 'rate_limited' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockImplementation(async () => jsonResponse({ error: 'disabled' }, 503))
    expect(await postJson(READ_TAG_PATH, {}, opts)).toEqual({ ok: false, error: 'disabled' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // 서버가 Gemini의 제한을 429 upstream_limited로 돌려주면 앱은 우리 서버의 제한(rate_limited)과 다른 문구를 보인다(PRD 10장 실패 문구)
  it('AC76: 429 본문이 upstream_limited면 upstream_limited이고 다시 보내지 않는다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = stubFetch(async () => jsonResponse({ error: 'upstream_limited' }, 429))

    expect(await postJson(READ_TAG_PATH, {}, { timeoutMs: PHOTO_TIMEOUT_MS, guard: anyObject })).toEqual({
      ok: false,
      error: 'upstream_limited',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('AC76: 429 본문이 rate_limited이거나 JSON이 아니면 rate_limited다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = stubFetch(async () => jsonResponse({}))
    const opts = { timeoutMs: PHOTO_TIMEOUT_MS, guard: anyObject }
    const replies: [string, () => Response][] = [
      ['rate_limited 본문', () => jsonResponse({ error: 'rate_limited' }, 429)],
      ['JSON이 아닌 본문', () => new Response('not json', { status: 429 })],
      ['빈 본문', () => new Response(null, { status: 429 })],
      ['error가 없는 객체', () => jsonResponse({}, 429)],
      ['객체가 아닌 JSON', () => jsonResponse(null, 429)],
    ]

    for (const [name, reply] of replies) {
      fetchMock.mockImplementation(async () => reply())
      expect(await postJson(READ_TAG_PATH, {}, opts), name).toEqual({ ok: false, error: 'rate_limited' })
    }
    expect(fetchMock).toHaveBeenCalledTimes(replies.length)
  })

  it('AC76: 429 본문을 읽는 중에 취소하면 cancelled다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    let bodyRequested = false
    // 헤더(429)는 왔지만 본문은 신호가 끊길 때만 끝나는 응답
    const fetchMock = stubFetch(
      async (_url, init) =>
        ({
          ok: false,
          status: 429,
          json: () => {
            bodyRequested = true
            return new Promise<unknown>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
            })
          },
        }) as unknown as Response,
    )
    const caller = new AbortController()

    const pending = postJson(READ_TAG_PATH, {}, { timeoutMs: PHOTO_TIMEOUT_MS, signal: caller.signal, guard: anyObject })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(bodyRequested).toBe(true)
    caller.abort()

    expect(await pending).toEqual({ ok: false, error: 'cancelled' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  // plan: returns failed on network error, 500 and timeout
  it('네트워크 오류는 failed이고 다시 보내지 않는다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    expect(await postJson(READ_TAG_PATH, {}, { timeoutMs: PHOTO_TIMEOUT_MS, guard: anyObject })).toEqual({
      ok: false,
      error: 'failed',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('500과 그 밖의 오류 응답은 failed이다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = stubFetch(async () => jsonResponse({ error: 'upstream' }, 500))
    const opts = { timeoutMs: PHOTO_TIMEOUT_MS, guard: anyObject }

    for (const status of [500, 502, 400, 403, 404, 413]) {
      fetchMock.mockImplementation(async () => jsonResponse({ error: 'x' }, status))
      expect(await postJson(READ_TAG_PATH, {}, opts)).toEqual({ ok: false, error: 'failed' })
    }
  })

  it('시간 상한이 지나면 요청을 끊고 failed이다', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = hangingFetch()

    const pending = postJson(READ_TAG_PATH, {}, { timeoutMs: PHOTO_TIMEOUT_MS, guard: anyObject })
    let settled = false
    void pending.then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(PHOTO_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(await pending).toEqual({ ok: false, error: 'failed' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('호출한 쪽이 정한 시간 상한을 쓴다', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    hangingFetch()

    const pending = postJson('/api/voice-fill', {}, { timeoutMs: 1_000, guard: anyObject })
    await vi.advanceTimersByTimeAsync(1_000)

    expect(await pending).toEqual({ ok: false, error: 'failed' })
  })

  it('끝나면 타이머를 남기지 않는다', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    stubFetch(async () => jsonResponse(VOICE_RESPONSE))

    await postJson('/api/voice-fill', {}, { timeoutMs: VOICE_TIMEOUT_MS, guard: isVoiceFillResponse })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('서버 주소가 없으면 요청 없이 failed이다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', '')
    const fetchMock = stubFetch(async () => jsonResponse({}))

    expect(await postJson(READ_TAG_PATH, {}, { timeoutMs: PHOTO_TIMEOUT_MS, guard: anyObject })).toEqual({
      ok: false,
      error: 'failed',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('JSON이 아닌 응답이나 보낼 수 없는 본문은 던지지 않고 failed이다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = stubFetch(async () => new Response('<html>oops</html>', { status: 200 }))
    const opts = { timeoutMs: PHOTO_TIMEOUT_MS, guard: anyObject }

    expect(await postJson(READ_TAG_PATH, {}, opts)).toEqual({ ok: false, error: 'failed' })

    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(await postJson(READ_TAG_PATH, circular, opts)).toEqual({ ok: false, error: 'failed' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // plan: returns cancelled when the caller aborts
  it('호출한 쪽이 끊으면 cancelled이고 타이머를 남기지 않는다', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = hangingFetch()
    const caller = new AbortController()

    const pending = postJson(READ_TAG_PATH, {}, { timeoutMs: PHOTO_TIMEOUT_MS, signal: caller.signal, guard: anyObject })
    await vi.advanceTimersByTimeAsync(1_000)
    caller.abort()

    expect(await pending).toEqual({ ok: false, error: 'cancelled' })
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('이미 끊긴 신호로 부르면 요청 없이 cancelled이다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = stubFetch(async () => jsonResponse({}))

    const result = await postJson(READ_TAG_PATH, {}, { timeoutMs: PHOTO_TIMEOUT_MS, signal: AbortSignal.abort(), guard: anyObject })

    expect(result).toEqual({ ok: false, error: 'cancelled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('응답 본문을 받는 도중에 끊어도 cancelled이다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const caller = new AbortController()
    let finishBody: (value: unknown) => void = () => {}
    const slowBody = new Promise((resolve) => {
      finishBody = resolve
    })
    // 헤더는 왔고 본문(json)을 아직 읽는 중인 응답
    stubFetch(async () => ({ ok: true, status: 200, json: () => slowBody }))

    const pending = postJson(READ_TAG_PATH, {}, { timeoutMs: PHOTO_TIMEOUT_MS, signal: caller.signal, guard: isReadTagResponse })
    await Promise.resolve()
    caller.abort()
    finishBody(TAG_RESPONSE)

    expect(await pending).toEqual({ ok: false, error: 'cancelled' })
  })

  it('호출한 쪽이 끊은 뒤 오는 오류 응답도 cancelled이다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const caller = new AbortController()
    stubFetch(async () => {
      caller.abort()
      return jsonResponse({ error: 'rate_limited' }, 429)
    })

    const result = await postJson(READ_TAG_PATH, {}, { timeoutMs: PHOTO_TIMEOUT_MS, signal: caller.signal, guard: anyObject })

    expect(result).toEqual({ ok: false, error: 'cancelled' })
  })

  // plan: postJson returns failed when the response does not match the shape guard
  it('응답이 모양 검사에 맞지 않으면 failed이다', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
    const fetchMock = stubFetch(async () => jsonResponse(TAG_RESPONSE))
    const opts = { timeoutMs: PHOTO_TIMEOUT_MS, guard: isReadTagResponse }

    expect(await postJson(READ_TAG_PATH, {}, opts)).toEqual({ ok: true, data: TAG_RESPONSE })

    const mismatches: unknown[] = [
      { items: 'nope', note: null },
      { items: [{ ...TAG_ITEM, price: '3980' }], note: null },
      { items: [], note: 3 },
      { error: 'upstream' },
      [],
      null,
      'ok',
    ]
    for (const wrong of mismatches) {
      fetchMock.mockImplementation(async () => jsonResponse(wrong))
      expect(await postJson(READ_TAG_PATH, {}, opts)).toEqual({ ok: false, error: 'failed' })
    }
  })
})

// 모양 검사: AI 서버가 예상과 다른 JSON을 돌려줘도 화면에 들어가기 전에 막는다.
describe('응답 모양 검사', () => {
  const notObjects: unknown[] = [null, undefined, 'text', 42, true, []]

  describe('isReadTagResponse', () => {
    it('서버가 돌려주는 모양을 받아들인다', () => {
      expect(isReadTagResponse(TAG_RESPONSE)).toBe(true)
      expect(isReadTagResponse({ items: [], note: '상품을 찾지 못했어요' })).toBe(true)
      const allNull: TagItem = {
        name: '상품',
        brand: null,
        price: null,
        priceCondition: null,
        regularPrice: null,
        priceBasis: null,
        sizeText: null,
        size: null,
        unit: null,
        count: null,
        tagReadable: false,
      }
      expect(isReadTagResponse({ items: [allNull, TAG_ITEM], note: null })).toBe(true)
      for (const unit of ['g', 'kg', 'mL', 'L', 'ea']) {
        expect(isReadTagResponse({ items: [{ ...TAG_ITEM, unit }], note: null })).toBe(true)
      }
    })

    it('객체가 아니거나 items·note가 없거나 틀리면 거절한다', () => {
      for (const value of notObjects) expect(isReadTagResponse(value)).toBe(false)
      expect(isReadTagResponse({ note: null })).toBe(false)
      expect(isReadTagResponse({ items: [] })).toBe(false)
      expect(isReadTagResponse({ items: {}, note: null })).toBe(false)
      expect(isReadTagResponse({ items: [], note: undefined })).toBe(false)
      expect(isReadTagResponse({ items: [], note: 0 })).toBe(false)
    })

    it('상품 칸이 빠졌거나 형이 다르면 거절한다', () => {
      const badValue: Record<keyof TagItem, unknown> = {
        name: 3,
        brand: 5,
        price: '3980',
        priceCondition: 1,
        regularPrice: '4980',
        priceBasis: false,
        sizeText: 1,
        size: '67',
        unit: 'oz',
        count: '6',
        tagReadable: 'true',
      }
      for (const key of Object.keys(TAG_ITEM) as (keyof TagItem)[]) {
        const missing: Record<string, unknown> = { ...TAG_ITEM }
        delete missing[key]
        expect(isReadTagResponse({ items: [missing], note: null }), `${key} 없음`).toBe(false)
        expect(isReadTagResponse({ items: [{ ...TAG_ITEM, [key]: badValue[key] }], note: null }), `${key} 형`).toBe(false)
      }
      expect(isReadTagResponse({ items: [{ ...TAG_ITEM, price: Number.NaN }], note: null })).toBe(false)
      expect(isReadTagResponse({ items: [{ ...TAG_ITEM, size: Number.POSITIVE_INFINITY }], note: null })).toBe(false)
    })

    it('배열 안에 상품이 아닌 것이 하나라도 있으면 거절한다', () => {
      for (const bad of [null, 'item', 3, [], {}]) {
        expect(isReadTagResponse({ items: [TAG_ITEM, bad], note: null })).toBe(false)
      }
    })
  })

  describe('isLowestPriceResponse', () => {
    it('서버가 돌려주는 모양을 받아들인다', () => {
      expect(isLowestPriceResponse(LOWEST_RESPONSE)).toBe(true)
      for (const status of ['found', 'not_confirmed', 'unavailable', 'off']) {
        expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, status, matches: [], candidates: [ROW] })).toBe(true)
      }
      expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, matches: [{ ...ROW, packCount: null, unitPriceText: null }] })).toBe(true)
    })

    it('객체가 아니거나 칸이 빠졌거나 status가 목록에 없으면 거절한다', () => {
      for (const value of notObjects) expect(isLowestPriceResponse(value)).toBe(false)
      expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, status: 'maybe' })).toBe(false)
      expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, status: 1 })).toBe(false)
      for (const key of Object.keys(LOWEST_RESPONSE)) {
        const missing: Record<string, unknown> = { ...LOWEST_RESPONSE }
        delete missing[key]
        expect(isLowestPriceResponse(missing), `${key} 없음`).toBe(false)
      }
      expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, searchUrl: 3 })).toBe(false)
      expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, matches: 'rows' })).toBe(false)
      expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, candidates: null })).toBe(false)
    })

    it('줄의 칸이 빠졌거나 형이 다르면 거절한다', () => {
      const badValue: Record<keyof DanawaRow, unknown> = {
        name: 1,
        packCount: '6',
        price: '4900',
        unitPriceText: 5,
        malls: 573,
      }
      for (const key of Object.keys(ROW) as (keyof DanawaRow)[]) {
        const missing: Record<string, unknown> = { ...ROW }
        delete missing[key]
        expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, matches: [missing] }), `matches ${key} 없음`).toBe(false)
        expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, candidates: [{ ...ROW, [key]: badValue[key] }] }), `candidates ${key} 형`).toBe(false)
      }
      expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, matches: [ROW, null] })).toBe(false)
      expect(isLowestPriceResponse({ ...LOWEST_RESPONSE, matches: [{ ...ROW, price: null }] })).toBe(false)
    })
  })

  describe('isVoiceFillResponse', () => {
    it('서버가 돌려주는 모양을 받아들인다', () => {
      expect(isVoiceFillResponse(VOICE_RESPONSE)).toBe(true)
      expect(
        isVoiceFillResponse({ transcript: '', name: null, price: null, reason: null, desire: null, periodDays: null }),
      ).toBe(true)
      for (const desire of [1, 2, 3, 4, 5]) {
        expect(isVoiceFillResponse({ ...VOICE_RESPONSE, desire })).toBe(true)
      }
    })

    it('객체가 아니거나 칸이 빠졌거나 형이 다르면 거절한다', () => {
      for (const value of notObjects) expect(isVoiceFillResponse(value)).toBe(false)
      const badValue: Record<keyof VoiceFillResponse, unknown> = {
        transcript: null,
        name: 3,
        price: '35000',
        reason: 1,
        desire: '4',
        periodDays: '3',
      }
      for (const key of Object.keys(VOICE_RESPONSE) as (keyof VoiceFillResponse)[]) {
        const missing: Record<string, unknown> = { ...VOICE_RESPONSE }
        delete missing[key]
        expect(isVoiceFillResponse(missing), `${key} 없음`).toBe(false)
        expect(isVoiceFillResponse({ ...VOICE_RESPONSE, [key]: badValue[key] }), `${key} 형`).toBe(false)
      }
    })

    it('desire는 1~5 정수만 받아들인다', () => {
      for (const desire of [0, 6, 2.5, -1, Number.NaN]) {
        expect(isVoiceFillResponse({ ...VOICE_RESPONSE, desire })).toBe(false)
      }
    })
  })
})
