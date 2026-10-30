// AI 기능 테스트가 함께 쓰는 가짜 전역(createImageBitmap·canvas·URL.createObjectURL·fetch). 가짜 전역은 이 파일에만 둔다.
// 쓰는 테스트는 afterEach에서 vi.unstubAllGlobals()·vi.unstubAllEnvs()·vi.useRealTimers()로 되돌린다.
// (canvas의 getContext·toBlob은 전역이 아니라 prototype이라 mockImagePipeline이 테스트가 끝날 때 스스로 되돌린다.)
import { onTestFinished, vi } from 'vitest'

export type DrawCall = {
  image: unknown
  // drawImage에 넘긴 인자(그리는 원본을 뺀 나머지)
  args: number[]
  // 그리는 순간 canvas의 크기
  canvasWidth: number
  canvasHeight: number
}

export type ImagePipelineOptions = {
  decode: 'ok' | 'fail'
  toBlob: 'ok' | 'null'
  // 가짜 비트맵의 크기(기본 4032×3024, 폰 사진 크기)
  width?: number
  height?: number
}

// createImageBitmap과 canvas(getContext('2d')·drawImage·toBlob)를 가짜로 바꾼다.
// decode 'fail'이면 createImageBitmap이 거절하고, toBlob 'null'이면 toBlob이 null을 준다.
export function mockImagePipeline(opts: ImagePipelineOptions) {
  const { decode, toBlob, width = 4032, height = 3024 } = opts
  let closeCount = 0
  const decodeCalls: { file: unknown; options: unknown }[] = []
  const draws: DrawCall[] = []
  const toBlobCalls: { type: string | undefined; quality: number | undefined }[] = []

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (file: unknown, options?: unknown) => {
      decodeCalls.push({ file, options })
      if (decode === 'fail') throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
      return {
        width,
        height,
        close: () => {
          closeCount += 1
        },
      }
    }),
  )

  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (this: HTMLCanvasElement, contextId: string) {
      if (contextId !== '2d') return null
      return {
        // 화살표 함수라 this는 getContext를 부른 canvas다
        drawImage: (image: unknown, ...args: number[]) => {
          draws.push({ image, args, canvasWidth: this.width, canvasHeight: this.height })
        },
      }
    } as never)

  const toBlobSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation(function (callback: BlobCallback, type?: string, quality?: number) {
      toBlobCalls.push({ type, quality })
      const blob = toBlob === 'ok' ? new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: type ?? 'image/png' }) : null
      // 실제 toBlob처럼 나중에 콜백을 부른다
      void Promise.resolve().then(() => callback(blob))
    } as never)

  onTestFinished(() => {
    getContext.mockRestore()
    toBlobSpy.mockRestore()
  })

  return {
    // 비트맵을 close()한 횟수
    closed: () => closeCount,
    decodeCalls,
    draws,
    toBlobCalls,
  }
}

// URL.createObjectURL·revokeObjectURL을 가짜로 바꾼다. 호출마다 다른 주소를 주고 만든 것과 해제한 것을 기록한다.
// URL 자체는 하위 클래스로 바꿔서 new URL(...)은 그대로 쓸 수 있다.
export function mockObjectUrls() {
  const created: string[] = []
  const revoked: string[] = []

  class FakeURL extends URL {
    static createObjectURL(_object: Blob | MediaSource): string {
      const url = `blob:http://localhost/mock-${created.length + 1}`
      created.push(url)
      return url
    }
    static revokeObjectURL(url: string): void {
      revoked.push(url)
    }
  }
  vi.stubGlobal('URL', FakeURL)

  return { created, revoked }
}

// ---- AI 서버 흉내 (화면 테스트용) ----
// 경로마다 차례 응답을 둔다. 등록하지 않은 경로·POST가 아닌 요청·차례 응답을 다 쓴 뒤의 요청은
// unexpected에 적고 거절한다. 테스트는 afterEach에서 unexpected가 비었는지 본다.

/** 서버가 끝내 돌려주는 답: JSON 응답(상태 코드 포함) 또는 네트워크 오류 */
export type SettledReply = { kind: 'response'; status: number; body: unknown } | { kind: 'network' }
/**
 * 테스트가 release할 때까지 끝나지 않는 답. 취소 신호를 무시해서 늦은 응답을 만든다(요청 번호 방어 시험용).
 * signal은 이 답을 받은 요청의 것이라, 앞 요청이 끊겼는지 `held.signal?.aborted`로 본다.
 */
export type HeldReply = {
  kind: 'hold'
  signal: AbortSignal | undefined
  release: (reply: SettledReply) => void
  released: Promise<SettledReply>
}
/** 끝나지 않다가 요청이 끊기면 실제 fetch처럼 AbortError로 끝나는 답(취소·시간 초과용) */
export type HangReply = { kind: 'hang' }
export type AiReply = SettledReply | HeldReply | HangReply

export const aiReply = {
  ok: (body: unknown): SettledReply => ({ kind: 'response', status: 200, body }),
  status: (status: number, body: unknown = { error: 'x' }): SettledReply => ({ kind: 'response', status, body }),
  network: (): SettledReply => ({ kind: 'network' }),
  hang: (): HangReply => ({ kind: 'hang' }),
  hold: (): HeldReply => {
    let release: (reply: SettledReply) => void = () => {}
    const released = new Promise<SettledReply>((resolve) => {
      release = resolve
    })
    return { kind: 'hold', signal: undefined, release, released }
  },
}

/** 서버가 받은 요청 하나: 경로, JSON을 푼 본문, 그 요청의 취소 신호 */
export type AiServerCall = { path: string; body: unknown; signal: AbortSignal | undefined }

export type MockAiServer = {
  /** 이 경로의 다음 요청들에 줄 답을 차례로 더한다 */
  on: (path: string, ...replies: AiReply[]) => void
  calls: AiServerCall[]
  callsTo: (path: string) => AiServerCall[]
  /** 등록하지 않은 경로·메서드, 차례 응답이 떨어진 뒤의 요청 */
  unexpected: string[]
  /** 이 경로로 n번째 요청이 갈 때까지 기다린다(setImmediate로 돌아 가짜 setTimeout과 함께 써도 멈추지 않는다) */
  waitForCalls: (path: string, n?: number) => Promise<void>
}

// fetch를 가짜로 바꾼다. base는 VITE_AI_SERVER_URL과 같은 값이어야 한다.
export function mockAiServer(base = 'https://ai.test'): MockAiServer {
  const queues = new Map<string, AiReply[]>()
  const calls: AiServerCall[] = []
  const unexpected: string[] = []

  const toResponse = (reply: SettledReply): Response => {
    if (reply.kind === 'network') throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } })
  }

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      const path = url.startsWith(base) ? url.slice(base.length) : null
      const reply = path === null || init?.method !== 'POST' ? undefined : queues.get(path)?.shift()
      if (path === null || reply === undefined) {
        unexpected.push(`${init?.method ?? 'GET'} ${url}`)
        return Promise.reject(new TypeError(`unexpected request: ${url}`))
      }
      const signal = init?.signal ?? undefined
      calls.push({ path, body: JSON.parse(String(init?.body)), signal })
      switch (reply.kind) {
        case 'hold':
          reply.signal = signal
          return reply.released.then(toResponse)
        case 'hang':
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
          })
        default:
          return Promise.resolve().then(() => toResponse(reply))
      }
    }),
  )

  const callsTo = (path: string) => calls.filter((call) => call.path === path)
  return {
    on: (path, ...replies) => queues.set(path, [...(queues.get(path) ?? []), ...replies]),
    calls,
    callsTo,
    unexpected,
    waitForCalls: async (path, n = 1) => {
      for (let turn = 0; turn < 500; turn += 1) {
        if (callsTo(path).length >= n) return
        await nextTask()
      }
      throw new Error(`${path} 요청이 ${n}번 가지 않았어요(지금 ${callsTo(path).length}번)`)
    },
  }
}

// jsdom의 FileReader·작업 큐는 Node의 setImmediate로 돈다. 가짜 타이머(setTimeout만)와 상관없이 실제로 한 턴 넘긴다
// (앱 tsconfig에 Node 타입이 없어 globalThis에서 꺼낸다)
export function nextTask(): Promise<void> {
  const { setImmediate } = globalThis as unknown as { setImmediate: (callback: () => void) => void }
  return new Promise((resolve) => setImmediate(resolve))
}

// ---- 마이크·녹음기 흉내 (녹음 훅 테스트용) ----
// mockMicrophone이 navigator.mediaDevices.getUserMedia를 가짜로 바꾸고, 녹음기는 테스트가 vi.stubGlobal('MediaRecorder', FakeMediaRecorder)로 깐다.
// 둘 다 같은 timeline에 'recorder.stop' → 'stop event' → 'track.stop' 순서를 적어 정리 순서를 볼 수 있게 한다.

/** 마이크가 끊긴 트랙. stop()을 부른 횟수를 세고, end()로 'ended' 이벤트를 보낸다 */
export class FakeMediaTrack extends EventTarget {
  stopCalls = 0
  private readonly timeline: string[]

  constructor(timeline: string[]) {
    super()
    this.timeline = timeline
  }

  stop(): void {
    this.stopCalls += 1
    this.timeline.push('track.stop')
  }

  /** 마이크 연결이 끊긴 것처럼 'ended'를 보낸다(앱이 stop()으로 멈춘 트랙은 이 이벤트를 보내지 않는다) */
  end(): void {
    this.dispatchEvent(new Event('ended'))
  }
}

type MicrophoneLog = { timeline: string[]; recorders: FakeMediaRecorder[] }

/** getUserMedia가 돌려주는 스트림. 녹음기가 이 스트림에서 만들어지면 같은 기록에 이어 적는다 */
export class FakeMediaStream {
  readonly tracks: FakeMediaTrack[]
  readonly log: MicrophoneLog

  constructor(log: MicrophoneLog, trackCount: number) {
    this.log = log
    this.tracks = Array.from({ length: trackCount }, () => new FakeMediaTrack(log.timeline))
  }

  getTracks(): FakeMediaTrack[] {
    return this.tracks
  }

  getAudioTracks(): FakeMediaTrack[] {
    return this.tracks
  }
}

/**
 * MediaRecorder 흉내. start()하면 state가 'recording'이 되고, stop()은 dataavailable(Blob) 다음 stop 이벤트를 바로 보낸다.
 * fail()은 error 이벤트만 보낸다. 실제처럼 이미 멈춘 녹음기의 stop()은 InvalidStateError를 던진다.
 */
export class FakeMediaRecorder extends EventTarget {
  mimeType = 'audio/webm;codecs=opus'
  state: 'inactive' | 'recording' = 'inactive'
  private readonly log: MicrophoneLog | null

  constructor(stream?: unknown) {
    super()
    this.log = stream instanceof FakeMediaStream ? stream.log : null
    this.log?.recorders.push(this)
  }

  start(): void {
    if (this.state !== 'inactive') throw new DOMException('The MediaRecorder is already recording.', 'InvalidStateError')
    this.state = 'recording'
  }

  stop(): void {
    if (this.state === 'inactive') throw new DOMException('The MediaRecorder is already stopped.', 'InvalidStateError')
    this.log?.timeline.push('recorder.stop')
    this.state = 'inactive'
    // jsdom에는 BlobEvent가 없어 data를 단 Event로 흉내 낸다
    const data = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: this.mimeType })
    this.dispatchEvent(Object.assign(new Event('dataavailable'), { data }))
    this.log?.timeline.push('stop event')
    this.dispatchEvent(new Event('stop'))
  }

  /** 녹음기 오류(인코딩 실패 등)를 흉내 낸다 */
  fail(): void {
    this.dispatchEvent(new Event('error'))
  }
}

export type MicrophoneOptions = {
  permission: 'granted' | 'denied' | 'pending'
  // 스트림마다 트랙 수(기본 1). '트랙을 모두 멈춘다'를 볼 때 2 이상으로 둔다
  trackCount?: number
}

// navigator.mediaDevices.getUserMedia를 가짜로 바꾼다. granted면 바로 스트림을, denied면 NotAllowedError로 거절하고,
// pending이면 테스트가 grant()를 부를 때까지 기다린다(권한 창이 떠 있는 상태). 트랙은 허가가 난 순간 만들어진다.
// navigator에는 mediaDevices만 더한 Proxy를 stubGlobal로 깔아서 vi.unstubAllGlobals()가 원래 navigator로 되돌린다.
export function mockMicrophone(opts: MicrophoneOptions) {
  const { permission, trackCount = 1 } = opts
  const log: MicrophoneLog = { timeline: [], recorders: [] }
  const tracks: FakeMediaTrack[] = []
  const waiting: (() => void)[] = []

  const open = (): MediaStream => {
    const stream = new FakeMediaStream(log, trackCount)
    tracks.push(...stream.tracks)
    return stream as unknown as MediaStream
  }

  const getUserMedia = vi.fn((_constraints?: MediaStreamConstraints): Promise<MediaStream> => {
    if (permission === 'denied') return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    if (permission === 'granted') return Promise.resolve(open())
    return new Promise<MediaStream>((resolve) => {
      waiting.push(() => resolve(open()))
    })
  })

  const mediaDevices = { getUserMedia }
  vi.stubGlobal(
    'navigator',
    new Proxy(navigator, {
      get(target, property) {
        if (property === 'mediaDevices') return mediaDevices
        // jsdom의 navigator 메서드·getter는 진짜 navigator를 this로 불러야 한다
        const value: unknown = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }),
  )

  return {
    getUserMedia,
    /** 지금까지 열린 모든 스트림의 트랙 */
    tracks,
    /** 만들어진 FakeMediaRecorder들(마이크 스트림에서 만든 것만) */
    recorders: log.recorders,
    /** 'recorder.stop' · 'stop event' · 'track.stop'이 불린 순서 */
    timeline: log.timeline,
    /** pending일 때 기다리던 권한 요청을 모두 허가한다 */
    grant: () => {
      for (const release of waiting.splice(0)) release()
    },
  }
}
