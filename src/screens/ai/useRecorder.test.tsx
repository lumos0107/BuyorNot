import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeMediaRecorder, mockAiServer, mockMicrophone, ThrowingMediaRecorder } from '../../test/aiMocks'
import { useRecorder, type RecordingResult, type StartResult } from './useRecorder'

// PRD F33 말로 담기의 녹음기와 10장 앱 공통(GPT 36번): 권한, 20초 자동 멈춤, 1초 미만 거절, 끊김, 정리.
// 이 훅은 아무것도 보내지 않고 녹음 하나마다 onStopped를 정확히 한 번 부른다. 화면 문구(AC58의 안내 글)는 말로 담기 화면 테스트가 본다.
// 가짜 타이머: 계획은 Date·setTimeout·setInterval만 적었지만, clearTimeout·clearInterval도 함께 가짜로 둔다.
// 그렇지 않으면 훅이 지운 타이머가 가짜 시계에서는 그대로 남아 20초에 다시 울려서 "정리했다"를 시험할 수 없다.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})

// skill의 순서: cleanup() → 전역 되돌리기 → 환경 변수 → 실제 타이머. (setup.ts의 cleanup은 이 afterEach보다 뒤에 돌아서 먼저 한 번 부른다)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

type Permission = 'granted' | 'denied' | 'pending'

function setup(options: { permission?: Permission | null; trackCount?: number; withRecorder?: boolean } = {}) {
  const { permission = 'granted', trackCount, withRecorder = true } = options
  // permission이 null이면 navigator.mediaDevices가 없는 브라우저
  const mic = permission === null ? null : mockMicrophone({ permission, trackCount })
  if (withRecorder) vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  // 경로를 하나도 등록하지 않은 AI 서버: 이 훅이 무엇을 보내면 calls나 unexpected에 남는다
  const server = mockAiServer()
  const onStopped = vi.fn<(result: RecordingResult) => void>()
  const hook = renderHook((props: { active: boolean }) => useRecorder({ active: props.active, onStopped }), { initialProps: { active: true } })
  return { mic: mic!, onStopped, server, ...hook }
}
type Setup = ReturnType<typeof setup>

// 이 훅은 아무것도 보내지 않는다: 서버에 요청이 가지도, 등록하지 않은 주소로 요청이 가지도 않았다
function expectNothingSent(s: Setup) {
  expect(s.server.calls).toEqual([])
  expect(s.server.unexpected).toEqual([])
}

async function startRecording(s: Setup): Promise<StartResult> {
  let result: StartResult | undefined
  await act(async () => {
    result = await s.result.current.start()
  })
  return result!
}

// 권한 창이 떠 있는 동안: start()의 약속을 붙들고 있는다
function startAsking(s: Setup): Promise<StartResult> {
  let request: Promise<StartResult> | undefined
  act(() => {
    request = s.result.current.start()
  })
  return request!
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function hideDocument() {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

// 녹음을 시작하게 만든 사용자 동작 말고, 녹음을 버리게 하는 네 가지 일
const discardTriggers: [name: string, trigger: (s: Setup) => void][] = [
  ['cancel()을 부르면', (s) => act(() => s.result.current.cancel())],
  ['active가 false가 되면', (s) => s.rerender({ active: false })],
  ['화면이 숨겨지면', () => hideDocument()],
  ['화면이 사라지면', (s) => s.unmount()],
]

describe('useRecorder 시작 전', () => {
  // plan: reports unsupported without MediaRecorder
  it('AC58: MediaRecorder가 없는 브라우저에서는 unsupported를 돌려주고 마이크를 열지 않는다', async () => {
    const s = setup({ withRecorder: false })

    expect(await startRecording(s)).toBe('unsupported')

    expect(s.mic.getUserMedia).not.toHaveBeenCalled()
    expect(s.result.current.state).toBe('idle')
    expect(s.onStopped).not.toHaveBeenCalled()
  })

  it('navigator.mediaDevices가 없는 브라우저에서도 unsupported를 돌려준다', async () => {
    const s = setup({ permission: null })

    expect(await startRecording(s)).toBe('unsupported')

    expect(s.result.current.state).toBe('idle')
    expect(s.onStopped).not.toHaveBeenCalled()
  })

  it('MediaRecorder를 만들지 못하면 unsupported를 돌려주고 이미 연 마이크 트랙을 멈춘다', async () => {
    const s = setup()
    vi.stubGlobal('MediaRecorder', ThrowingMediaRecorder)

    expect(await startRecording(s)).toBe('unsupported')

    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1])
    expect(s.result.current.state).toBe('idle')
    expect(s.onStopped).not.toHaveBeenCalled()
  })

  // plan: reports denied when permission is refused
  it('AC58: 마이크 권한을 거부하면 denied를 돌려주고 녹음을 시작하지 않는다', async () => {
    const s = setup({ permission: 'denied' })

    expect(await startRecording(s)).toBe('denied')

    expect(s.mic.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(s.mic.recorders).toEqual([])
    expect(s.mic.tracks).toEqual([])
    expect(s.result.current.state).toBe('idle')
    expect(s.onStopped).not.toHaveBeenCalled()
  })

  it('권한을 기다리는 동안은 asking이고, 허가가 나면 recording이 되며 남은 시간은 20초다', async () => {
    const s = setup({ permission: 'pending' })
    expect(s.result.current.state).toBe('idle')
    expect(s.result.current.secondsLeft).toBe(20)

    const request = startAsking(s)
    expect(s.result.current.state).toBe('asking')
    expect(s.mic.recorders).toEqual([])

    await act(async () => {
      s.mic.grant()
      expect(await request).toBe('recording')
    })

    expect(s.result.current.state).toBe('recording')
    expect(s.result.current.secondsLeft).toBe(20)
    expect(s.mic.recorders).toHaveLength(1)
    expect(s.mic.recorders[0].state).toBe('recording')
  })

  it('이미 권한을 기다리거나 녹음 중일 때 start()를 또 불러도 마이크를 다시 열지 않는다', async () => {
    const s = setup({ permission: 'pending' })

    const first = startAsking(s)
    const second = startAsking(s)
    await act(async () => {
      s.mic.grant()
      expect(await first).toBe('recording')
      expect(await second).toBe('recording')
    })
    expect(await startRecording(s)).toBe('recording')

    expect(s.mic.getUserMedia).toHaveBeenCalledTimes(1)
    expect(s.mic.recorders).toHaveLength(1)
  })

  it('녹음을 시작하지 않았으면 stop()과 cancel()은 아무것도 알리지 않는다', () => {
    const s = setup()

    act(() => {
      s.result.current.stop()
      s.result.current.cancel()
    })

    expect(s.onStopped).not.toHaveBeenCalled()
    expect(s.result.current.state).toBe('idle')
  })
})

describe('useRecorder 녹음 중', () => {
  it('secondsLeft는 20에서 시작해 1초마다 하나씩 줄어든다', async () => {
    const s = setup()
    await startRecording(s)

    advance(999)
    expect(s.result.current.secondsLeft).toBe(20)
    advance(1)
    expect(s.result.current.secondsLeft).toBe(19)
    advance(4000)
    expect(s.result.current.secondsLeft).toBe(15)
    advance(14_000)
    expect(s.result.current.secondsLeft).toBe(1)
    expect(s.onStopped).not.toHaveBeenCalled()
  })

  it('타이머가 조금 늦게 울려도 남은 시간은 올림으로 세서 숫자를 건너뛰지 않는다', async () => {
    const s = setup()
    await startRecording(s)
    // 첫 1초 타이머가 3ms 늦게 울린 것처럼 시계만 앞으로 당긴다
    vi.setSystemTime(Date.now() + 3)

    advance(1000)

    expect(s.result.current.secondsLeft).toBe(19)
  })

  // plan: auto-stops at 20 seconds and reports exactly once
  it('AC58: 20초가 되면 자동으로 멈추고 결과를 정확히 한 번 알리며, 아무것도 보내지 않는다', async () => {
    const s = setup({ trackCount: 2 })
    await startRecording(s)

    advance(19_999)
    expect(s.onStopped).not.toHaveBeenCalled()
    expect(s.result.current.state).toBe('recording')

    advance(1)
    expect(s.onStopped).toHaveBeenCalledTimes(1)
    const result = s.onStopped.mock.calls[0][0]
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.blob.size).toBeGreaterThan(0)
      expect(result.blob.type).toBe('audio/webm')
      expect(result.mimeType).toBe('audio/webm')
    }
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(s.result.current.state).toBe('idle')
    expect(s.result.current.secondsLeft).toBe(20)

    // 그 뒤 시간이 흘러도, 손으로 멈추거나 취소해도 다시 알리지 않는다
    advance(60_000)
    act(() => {
      s.result.current.stop()
      s.result.current.cancel()
    })
    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expectNothingSent(s)
  })

  it('손으로 멈추면 그때까지 녹음한 소리를 알리고, 멈춘 뒤 20초 타이머가 다시 울리지 않는다', async () => {
    const s = setup()
    await startRecording(s)
    advance(7000)

    act(() => s.result.current.stop())

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped.mock.calls[0][0]).toMatchObject({ ok: true, mimeType: 'audio/webm' })
    expect(s.mic.recorders[0].state).toBe('inactive')
    expect(s.result.current.state).toBe('idle')
    advance(60_000)
    expect(s.onStopped).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['audio/mp4', 'audio/mp4'],
    [' audio/ogg ; codecs=opus', 'audio/ogg'],
  ])('녹음기의 mimeType %j에서 ;부터 뒤를 떼고 앞뒤 공백을 지운 %j을 알린다', async (recorderType, expected) => {
    const s = setup()
    await startRecording(s)
    s.mic.recorders[0].mimeType = recorderType
    advance(2000)

    act(() => s.result.current.stop())

    const result = s.onStopped.mock.calls[0][0]
    expect(result.ok && result.mimeType).toBe(expected)
    expect(result.ok && result.blob.type).toBe(expected)
  })

  it('결과를 알린 뒤 다시 녹음할 수 있고, 그 녹음도 한 번만 알린다', async () => {
    const s = setup()
    await startRecording(s)
    advance(2000)
    act(() => s.result.current.stop())

    expect(await startRecording(s)).toBe('recording')
    expect(s.result.current.secondsLeft).toBe(20)
    advance(20_000)

    expect(s.onStopped).toHaveBeenCalledTimes(2)
    expect(s.mic.recorders).toHaveLength(2)
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
  })
})

describe('useRecorder 1초 미만', () => {
  // plan: reports too-short under one second
  it('AC58: 0.5초 녹음하고 멈추면 too-short로 알리고 트랙을 멈춘다', async () => {
    const s = setup()
    await startRecording(s)
    advance(500)

    act(() => s.result.current.stop())

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'too-short' })
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1])
    expectNothingSent(s)
  })

  it('999ms는 too-short이고 1,000ms부터는 짧지 않은 녹음이다', async () => {
    const short = setup()
    await startRecording(short)
    advance(999)
    act(() => short.result.current.stop())
    expect(short.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'too-short' })

    cleanup()
    const enough = setup()
    await startRecording(enough)
    advance(1000)
    act(() => enough.result.current.stop())
    expect(enough.onStopped.mock.calls[0][0].ok).toBe(true)
  })

  it('시작하자마자(0ms) 멈춰도 too-short로 한 번만 알린다', async () => {
    const s = setup()
    await startRecording(s)

    act(() => s.result.current.stop())

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'too-short' })
  })
})

describe('useRecorder 끊김', () => {
  // plan: reports interrupted when a track ends
  it('AC58: 녹음 중 트랙이 끊기면 interrupted로 한 번 알리고 트랙을 모두 멈춘다', async () => {
    const s = setup({ trackCount: 2 })
    await startRecording(s)
    advance(5000)

    act(() => s.mic.tracks[0].end())

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'interrupted' })
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(s.mic.recorders[0].state).toBe('inactive')
    expect(s.result.current.state).toBe('idle')
    advance(60_000)
    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expectNothingSent(s)
  })

  it('녹음기에서 오류가 나면 interrupted로 한 번 알리고 트랙을 모두 멈춘다', async () => {
    const s = setup({ trackCount: 2 })
    await startRecording(s)
    advance(5000)

    act(() => s.mic.recorders[0].fail())

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'interrupted' })
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    advance(60_000)
    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expectNothingSent(s)
  })

  it('사용자가 멈추지 않았는데 브라우저가 녹음기를 스스로 멈추면 interrupted로 알리고 트랙을 멈춘다', async () => {
    const s = setup()
    await startRecording(s)
    advance(5000)

    // 마이크가 빠지면 브라우저가 녹음기를 스스로 멈추고 stop 이벤트를 보낸다
    act(() => s.mic.recorders[0].stop())

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'interrupted' })
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1])
    expectNothingSent(s)
  })

  it('손으로 멈춘 뒤에 트랙 ended나 녹음기 오류가 와도 결과는 그대로이고 다시 알리지 않는다', async () => {
    const s = setup()
    await startRecording(s)
    advance(5000)
    act(() => s.result.current.stop())

    act(() => {
      s.mic.tracks[0].end()
      s.mic.recorders[0].fail()
    })

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped.mock.calls[0][0].ok).toBe(true)
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1])
  })

  it('2초 넘게 녹음했는데 녹음된 소리가 비어 있으면 interrupted로 알린다', async () => {
    const s = setup()
    await startRecording(s)
    advance(5000)
    // 소리 조각 없이 stop 이벤트만 오는 녹음기
    const recorder = s.mic.recorders[0]
    vi.spyOn(recorder, 'stop').mockImplementation(() => {
      recorder.state = 'inactive'
      recorder.dispatchEvent(new Event('stop'))
    })

    act(() => s.result.current.stop())

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'interrupted' })
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1])
    expectNothingSent(s)
  })
})

describe('useRecorder 취소와 정리', () => {
  // plan: stops every track and sends nothing when cancelled, hidden or interrupted, including during the permission prompt
  describe.each(discardTriggers)('녹음 중 %s', (_name, trigger) => {
    it('cancelled로 한 번 알리고 녹음기를 멈추고 트랙을 모두 멈추며 아무것도 보내지 않는다', async () => {
      const s = setup({ trackCount: 2 })
      await startRecording(s)
      advance(5000)

      trigger(s)

      expect(s.onStopped).toHaveBeenCalledTimes(1)
      expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'cancelled' })
      expect(s.mic.recorders[0].state).toBe('inactive')
      expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
      advance(60_000)
      expect(s.onStopped).toHaveBeenCalledTimes(1)
      expectNothingSent(s)
    })
  })

  describe.each(discardTriggers)('권한을 기다리는 중 %s', (_name, trigger) => {
    it('start()는 cancelled를 돌려주고, 허가가 나중에 와도 트랙을 바로 멈추고 녹음하지 않으며 아무것도 알리지 않는다', async () => {
      const s = setup({ permission: 'pending', trackCount: 2 })
      const request = startAsking(s)

      trigger(s)
      await act(async () => {
        s.mic.grant()
        expect(await request).toBe('cancelled')
      })

      expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
      expect(s.mic.recorders).toEqual([])
      expect(s.onStopped).not.toHaveBeenCalled()
      advance(60_000)
      expect(s.onStopped).not.toHaveBeenCalled()
      expectNothingSent(s)
    })
  })

  it('권한을 기다리는 중 cancel()하면 바로 idle로 돌아가고 start()도 허가를 기다리지 않고 cancelled를 돌려준다', async () => {
    const s = setup({ permission: 'pending' })
    const request = startAsking(s)
    expect(s.result.current.state).toBe('asking')

    act(() => s.result.current.cancel())

    expect(s.result.current.state).toBe('idle')
    expect(await request).toBe('cancelled')
  })

  it('권한 창을 취소한 뒤 허가가 오기 전에 다시 시작할 수 있고, 앞 허가는 새 녹음에 끼어들지 않는다', async () => {
    const s = setup({ permission: 'pending' })
    const first = startAsking(s)
    act(() => s.result.current.cancel())
    const second = startAsking(s)

    await act(async () => {
      s.mic.grant()
      expect(await first).toBe('cancelled')
      expect(await second).toBe('recording')
    })

    // 앞 요청에서 열린 트랙은 멈추고, 새 요청의 트랙만 살아 있다
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 0])
    expect(s.mic.recorders).toHaveLength(1)
    expect(s.result.current.state).toBe('recording')
  })

  it('권한 요청이 거절돼도 이미 취소한 뒤라면 denied가 아니라 cancelled를 돌려준다', async () => {
    const s = setup({ permission: 'denied' })
    const request = startAsking(s)

    act(() => s.result.current.cancel())

    expect(await request).toBe('cancelled')
    expect(s.onStopped).not.toHaveBeenCalled()
  })

  // plan: cancels when active becomes false
  it('AC58: 녹음 중 다른 메뉴로 옮겨 active가 false가 되면 녹음을 버리고 cancelled로 알리며 트랙을 멈춘다', async () => {
    const s = setup()
    await startRecording(s)
    advance(5000)

    s.rerender({ active: false })

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'cancelled' })
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1])
    expect(s.result.current.state).toBe('idle')
    expectNothingSent(s)
  })

  it('녹음을 하지 않을 때 active가 바뀌거나 화면이 숨겨져도 아무것도 알리지 않는다', () => {
    const s = setup()

    s.rerender({ active: false })
    s.rerender({ active: true })
    hideDocument()

    expect(s.onStopped).not.toHaveBeenCalled()
    expect(s.result.current.state).toBe('idle')
  })

  it('cancel()하면 idle로 돌아가고 secondsLeft는 20으로 되돌아간다', async () => {
    const s = setup()
    await startRecording(s)
    advance(8000)
    expect(s.result.current.secondsLeft).toBe(12)

    act(() => s.result.current.cancel())

    expect(s.result.current.state).toBe('idle')
    expect(s.result.current.secondsLeft).toBe(20)
  })

  it('정리 순서는 녹음기 stop() → stop 이벤트 → 모든 트랙 stop()이다(손으로 멈춤·취소·끊김 모두)', async () => {
    const stopTwice = ['recorder.stop', 'stop event', 'track.stop', 'track.stop']
    const ways: [string, (s: Setup) => void][] = [
      ['손으로 멈춤', (s) => act(() => s.result.current.stop())],
      ['취소', (s) => act(() => s.result.current.cancel())],
      ['트랙 끊김', (s) => act(() => s.mic.tracks[1].end())],
      ['녹음기 오류', (s) => act(() => s.mic.recorders[0].fail())],
    ]
    for (const [way, end] of ways) {
      const s = setup({ trackCount: 2 })
      await startRecording(s)
      advance(3000)

      end(s)

      expect(s.mic.timeline, way).toEqual(stopTwice)
      cleanup()
    }
  })

  it('녹음기가 stop 이벤트를 보내지 않아도 잠시 뒤 트랙을 모두 멈추고 한 번만 알린다', async () => {
    const s = setup({ trackCount: 2 })
    await startRecording(s)
    advance(3000)
    vi.spyOn(s.mic.recorders[0], 'stop').mockImplementation(() => {})

    act(() => s.result.current.cancel())
    // 녹음기가 끝나기를 기다리는 동안은 트랙을 멈추지 않는다
    advance(500)
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([0, 0])
    expect(s.onStopped).not.toHaveBeenCalled()

    advance(2000)

    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'cancelled' })
    expect(s.result.current.state).toBe('idle')
  })

  it('손으로 멈춘 뒤 녹음기가 끝나기를 기다리는 동안 취소하면 소리를 알리지 않고 cancelled로 알린다', async () => {
    const s = setup()
    await startRecording(s)
    advance(5000)
    vi.spyOn(s.mic.recorders[0], 'stop').mockImplementation(() => {})

    act(() => s.result.current.stop())
    act(() => s.result.current.cancel())
    advance(2000)

    expect(s.onStopped).toHaveBeenCalledTimes(1)
    expect(s.onStopped).toHaveBeenCalledWith({ ok: false, reason: 'cancelled' })
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1])
  })

  it('cancelled를 알린 뒤 같은 훅으로 새 녹음을 시작할 수 있다', async () => {
    const s = setup()
    await startRecording(s)
    act(() => s.result.current.cancel())

    expect(await startRecording(s)).toBe('recording')
    advance(3000)
    act(() => s.result.current.stop())

    expect(s.onStopped).toHaveBeenCalledTimes(2)
    expect(s.onStopped.mock.calls[0][0]).toEqual({ ok: false, reason: 'cancelled' })
    expect(s.onStopped.mock.calls[1][0].ok).toBe(true)
  })
})
