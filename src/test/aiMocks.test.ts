import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiReply, mockAiServer, mockImagePipeline, mockObjectUrls } from './aiMocks'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// 가짜 전역이 제대로 동작하고, 테스트가 끝나면 원래대로 돌아오는지 확인한다(다른 테스트가 새지 않게).
describe('mockObjectUrls', () => {
  it('호출마다 다른 주소를 주고 만든 것과 해제한 것을 기록한다', () => {
    const urls = mockObjectUrls()

    const a = URL.createObjectURL(new Blob(['a']))
    const b = URL.createObjectURL(new Blob(['b']))
    URL.revokeObjectURL(a)

    expect(a).not.toBe(b)
    expect(a.startsWith('blob:')).toBe(true)
    expect(urls.created).toEqual([a, b])
    expect(urls.revoked).toEqual([a])
  })

  it('가짜로 바꿔도 new URL은 그대로 쓸 수 있고, 되돌리면 원래 URL이 돌아온다', () => {
    const RealURL = URL
    mockObjectUrls()

    expect(new URL('https://ai.example.com/a?b=1').origin).toBe('https://ai.example.com')
    expect(URL).not.toBe(RealURL)

    vi.unstubAllGlobals()
    expect(URL).toBe(RealURL)
  })
})

describe('mockImagePipeline', () => {
  it('테스트가 끝나면 createImageBitmap과 canvas가 원래대로 돌아온다', async () => {
    const proto = HTMLCanvasElement.prototype
    const originalGetContext = proto.getContext
    expect(typeof createImageBitmap).toBe('undefined')

    mockImagePipeline({ decode: 'ok', toBlob: 'ok' })
    expect(proto.getContext).not.toBe(originalGetContext)
    expect(typeof createImageBitmap).toBe('function')

    vi.unstubAllGlobals()
    expect(typeof createImageBitmap).toBe('undefined')
  })

  it('앞 테스트의 canvas 가짜가 남아 있지 않다', () => {
    expect(vi.isMockFunction(HTMLCanvasElement.prototype.getContext)).toBe(false)
    expect(vi.isMockFunction(HTMLCanvasElement.prototype.toBlob)).toBe(false)
  })
})

describe('mockAiServer', () => {
  const post = (path: string, body: unknown, signal?: AbortSignal) =>
    fetch(`https://ai.test${path}`, { method: 'POST', body: JSON.stringify(body), signal })

  it('경로마다 차례 응답을 주고, 보낸 경로·본문을 기록하며, 등록하지 않았거나 다 쓴 요청은 거절하고 적어 둔다', async () => {
    const server = mockAiServer('https://ai.test')
    server.on('/api/a', aiReply.ok({ n: 1 }), aiReply.status(429))

    const first = await post('/api/a', { q: 1 })
    const second = await post('/api/a', { q: 2 })

    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ n: 1 })
    expect(second.status).toBe(429)
    expect(server.callsTo('/api/a').map((call) => call.body)).toEqual([{ q: 1 }, { q: 2 }])
    await expect(post('/api/a', {})).rejects.toThrow()
    await expect(post('/api/b', {})).rejects.toThrow()
    expect(server.unexpected).toEqual(['POST https://ai.test/api/a', 'POST https://ai.test/api/b'])
  })

  it('보류 응답은 끊겨도 기다렸다가 풀어 준 답을 주고, 매달린 응답은 끊기면 AbortError로 끝난다', async () => {
    const server = mockAiServer('https://ai.test')
    const held = aiReply.hold()
    server.on('/api/a', held, aiReply.hang())
    const heldController = new AbortController()
    const hangController = new AbortController()

    const heldResponse = post('/api/a', {}, heldController.signal)
    const hung = post('/api/a', {}, hangController.signal)
    heldController.abort()
    hangController.abort()
    held.release(aiReply.ok({ late: true }))

    expect(held.signal?.aborted).toBe(true)
    expect(await (await heldResponse).json()).toEqual({ late: true })
    await expect(hung).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('네트워크 오류 응답은 fetch를 TypeError로 거절한다', async () => {
    const server = mockAiServer('https://ai.test')
    server.on('/api/a', aiReply.network())

    await expect(post('/api/a', {})).rejects.toThrow(TypeError)
  })
})
