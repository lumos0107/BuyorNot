import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiReply, FakeMediaRecorder, mockAiServer, mockImagePipeline, mockMicrophone, mockObjectUrls } from './aiMocks'

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

describe('mockMicrophone', () => {
  const open = () => navigator.mediaDevices.getUserMedia({ audio: true })

  it('granted면 바로 스트림을 주고, 트랙의 stop() 횟수를 세고, end()로 ended를 보낸다', async () => {
    const mic = mockMicrophone({ permission: 'granted', trackCount: 2 })

    const stream = await open()
    const ended = vi.fn()
    mic.tracks[0].addEventListener('ended', ended)
    mic.tracks[0].stop()
    mic.tracks[0].end()

    expect(mic.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(stream.getTracks()).toEqual(mic.tracks)
    expect(mic.tracks).toHaveLength(2)
    expect(mic.tracks.map((track) => track.stopCalls)).toEqual([1, 0])
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('denied면 NotAllowedError로 거절하고 트랙을 만들지 않는다', async () => {
    const mic = mockMicrophone({ permission: 'denied' })

    await expect(open()).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(mic.tracks).toEqual([])
  })

  it('pending이면 grant()를 부를 때까지 기다리고, 허가가 난 순간에 트랙이 생긴다', async () => {
    const mic = mockMicrophone({ permission: 'pending' })
    const settled = vi.fn()

    const request = open().then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    expect(mic.tracks).toEqual([])

    mic.grant()
    await request

    expect(settled).toHaveBeenCalledTimes(1)
    expect(mic.tracks).toHaveLength(1)
  })

  it('테스트가 끝나면 navigator가 원래대로 돌아오고, 가짜 아래에서도 navigator의 다른 값은 그대로 읽힌다', () => {
    const real = navigator
    mockMicrophone({ permission: 'granted' })

    expect(navigator).not.toBe(real)
    expect(navigator.userAgent).toBe(real.userAgent)
    expect(typeof navigator.mediaDevices.getUserMedia).toBe('function')

    vi.unstubAllGlobals()
    expect(navigator).toBe(real)
    expect(navigator.mediaDevices).toBeUndefined()
  })
})

describe('FakeMediaRecorder', () => {
  it('stop()은 dataavailable(Blob) 다음 stop 이벤트를 보내고, 마이크 스트림에서 만들면 stop → stop 이벤트 → 트랙 stop 순서가 기록된다', async () => {
    const mic = mockMicrophone({ permission: 'granted' })
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new FakeMediaRecorder(stream)
    const events: string[] = []
    recorder.addEventListener('dataavailable', (event) => events.push(`dataavailable:${(event as unknown as { data: Blob }).data.size > 0}`))
    recorder.addEventListener('stop', () => {
      events.push('stop')
      mic.tracks[0].stop()
    })

    recorder.start()
    expect(recorder.state).toBe('recording')
    recorder.stop()

    expect(recorder.state).toBe('inactive')
    expect(events).toEqual(['dataavailable:true', 'stop'])
    expect(mic.recorders).toEqual([recorder])
    expect(mic.timeline).toEqual(['recorder.stop', 'stop event', 'track.stop'])
  })

  it('이미 멈춘 녹음기의 stop()과 이미 녹음 중인 녹음기의 start()는 InvalidStateError를 던진다', () => {
    const recorder = new FakeMediaRecorder()

    expect(() => recorder.stop()).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
    recorder.start()
    expect(() => recorder.start()).toThrow(expect.objectContaining({ name: 'InvalidStateError' }))
  })

  it('fail()은 error 이벤트만 보내고 녹음 상태는 그대로 둔다', () => {
    const recorder = new FakeMediaRecorder()
    const onError = vi.fn()
    recorder.addEventListener('error', onError)
    recorder.start()

    recorder.fail()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(recorder.state).toBe('recording')
  })
})
