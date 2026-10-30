import { useCallback, useEffect, useRef, useState } from 'react'

// PRD F33 말로 담기의 녹음기와 10장 앱 공통(GPT 36번). 마이크 권한을 받아 최대 20초까지 녹음하고, 녹음 하나마다 결과를 onStopped로 정확히 한 번 알린다.
// 이 훅은 아무것도 보내지 않는다(서버로 보내는 일은 쓰는 화면이 한다). navigator.mediaDevices와 MediaRecorder는 이 파일만 만진다.
//
// 결과를 알리는 곳:
// - start()의 약속: 녹음을 시작하지 못한 경우('unsupported'·'denied')와 권한을 기다리다 취소된 경우('cancelled'). 이때 onStopped는 부르지 않는다.
// - onStopped: 녹음이 시작된 뒤의 모든 끝. 손으로 멈춤·20초 자동 멈춤(소리 또는 too-short), 사용자가 멈추지 않았는데 끊김(interrupted), 버려짐(cancelled).
// 어떤 끝이든 마이크 트랙은 모두 멈춘다. 정리 순서는 녹음기 stop() → stop 이벤트 → 모든 트랙 stop().
export type RecordingResult = { ok: true; blob: Blob; mimeType: string } | { ok: false; reason: 'too-short' | 'interrupted' | 'cancelled' }
export type RecorderState = 'idle' | 'asking' | 'recording'
export type StartResult = 'recording' | 'unsupported' | 'denied' | 'cancelled'

const MAX_SECONDS = 20
const MAX_MS = MAX_SECONDS * 1000
// 1초 미만 녹음은 서버로 보내지 않는다
const MIN_MS = 1000
// 녹음기에 stop()을 불렀는데 stop 이벤트가 오지 않아도 마이크가 계속 켜져 있지 않게, 이만큼 기다린 뒤 트랙을 멈춘다
const STOP_EVENT_WAIT_MS = 1000

// 녹음이 어떻게 끝나는가: 사용자가 멈춤·20초 자동 멈춤(finished), 사용자가 멈추지 않았는데 끊김(interrupted), 버려짐(cancelled)
type Ending = 'finished' | 'interrupted' | 'cancelled'

// 녹음 하나(마이크 권한을 묻는 때부터 트랙을 멈출 때까지)의 상태
type Session = {
  settleStart: (result: StartResult) => void
  startResult: Promise<StartResult>
  // 권한을 기다리는 중에 취소됐다. 허가가 나중에 와도 녹음하지 않는다
  cancelled: boolean
  stream: MediaStream | null
  recorder: MediaRecorder | null
  chunks: Blob[]
  startedAt: number
  // 멈추라고 한 순간까지 녹음한 시간
  elapsedMs: number
  ending: Ending | null
  done: boolean
  autoStopTimer: ReturnType<typeof setTimeout> | undefined
  countdownTimer: ReturnType<typeof setInterval> | undefined
  graceTimer: ReturnType<typeof setTimeout> | undefined
}

function newSession(): Session {
  let settleStart: (result: StartResult) => void = () => {}
  const startResult = new Promise<StartResult>((resolve) => {
    settleStart = resolve
  })
  return {
    settleStart,
    startResult,
    cancelled: false,
    stream: null,
    recorder: null,
    chunks: [],
    startedAt: 0,
    elapsedMs: 0,
    ending: null,
    done: false,
    autoStopTimer: undefined,
    countdownTimer: undefined,
    graceTimer: undefined,
  }
}

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

function resultOf(session: Session): RecordingResult {
  if (session.ending === 'cancelled') return { ok: false, reason: 'cancelled' }
  if (session.ending === 'interrupted') return { ok: false, reason: 'interrupted' }
  if (session.elapsedMs < MIN_MS) return { ok: false, reason: 'too-short' }
  // 브라우저가 만든 형식 그대로 보낸다: audio/webm;codecs=opus → audio/webm
  const mimeType = (session.recorder?.mimeType ?? '').split(';')[0].trim()
  const blob = new Blob(session.chunks, { type: mimeType })
  // 1초 넘게 녹음했는데 소리가 하나도 없으면 녹음이 깨진 것이다
  if (blob.size === 0) return { ok: false, reason: 'interrupted' }
  return { ok: true, blob, mimeType }
}

export function useRecorder(options: { active: boolean; onStopped: (result: RecordingResult) => void }): {
  state: RecorderState
  secondsLeft: number
  start(): Promise<StartResult>
  stop(): void
  cancel(): void
} {
  const { active, onStopped } = options
  const [state, setState] = useState<RecorderState>('idle')
  const [secondsLeft, setSecondsLeft] = useState(MAX_SECONDS)
  const current = useRef<Session | null>(null)
  const onStoppedRef = useRef(onStopped)
  useEffect(() => {
    onStoppedRef.current = onStopped
  })

  // 이 녹음을 훅의 현재 녹음에서 내려놓고 화면 상태를 처음으로 돌린다
  const release = useCallback((session: Session) => {
    if (current.current !== session) return
    current.current = null
    setState('idle')
    setSecondsLeft(MAX_SECONDS)
  }, [])

  // 모든 트랙을 멈추고 결과를 한 번 알린다. stop 이벤트·정리 시간·이미 멈춘 녹음기 중 먼저 오는 것이 부른다
  const finalize = useCallback(
    (session: Session) => {
      if (session.done) return
      session.done = true
      clearTimeout(session.graceTimer)
      stopTracks(session.stream)
      release(session)
      onStoppedRef.current(resultOf(session))
    },
    [release],
  )

  // 녹음을 끝내기 시작한다. 이미 끝내는 중이면 버리라는 요청(cancelled)만 결과를 바꾼다
  const end = useCallback(
    (session: Session, ending: Ending) => {
      if (session.ending !== null) {
        if (ending === 'cancelled') session.ending = 'cancelled'
        return
      }
      session.ending = ending
      session.elapsedMs = Date.now() - session.startedAt
      clearTimeout(session.autoStopTimer)
      clearInterval(session.countdownTimer)
      const recorder = session.recorder
      // 브라우저가 이미 멈춘 녹음기에는 stop()을 부를 수 없다(InvalidStateError)
      if (recorder === null || recorder.state === 'inactive') {
        finalize(session)
        return
      }
      session.graceTimer = setTimeout(() => finalize(session), STOP_EVENT_WAIT_MS)
      try {
        recorder.stop()
      } catch {
        finalize(session)
      }
    },
    [finalize],
  )

  // 권한이 나오면 녹음기를 만들어 시작한다. 시작하지 못하면 이유를 start()의 약속으로 알린다
  const begin = useCallback(
    async (session: Session) => {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        // 이미 취소했다면 settleStart('cancelled')가 먼저라 이 'denied'는 무시된다
        release(session)
        session.settleStart('denied')
        return
      }
      session.stream = stream
      if (session.cancelled) {
        // 권한을 기다리는 사이 취소됐다: 받은 마이크를 바로 놓고 녹음하지 않는다
        stopTracks(stream)
        return
      }

      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream)
        recorder.addEventListener('dataavailable', (event) => {
          const { data } = event as BlobEvent
          if (data.size > 0) session.chunks.push(data)
        })
        recorder.addEventListener('stop', () => {
          // 멈추라고 하지 않았는데 녹음기가 멈췄다(마이크가 빠지는 등)
          if (session.ending === null) end(session, 'interrupted')
          else finalize(session)
        })
        recorder.addEventListener('error', () => end(session, 'interrupted'))
        for (const track of stream.getTracks()) track.addEventListener('ended', () => end(session, 'interrupted'))
        session.recorder = recorder
        recorder.start()
      } catch {
        // 이 브라우저의 녹음기가 이 마이크로는 녹음하지 못한다
        session.done = true
        stopTracks(stream)
        release(session)
        session.settleStart('unsupported')
        return
      }

      session.startedAt = Date.now()
      session.autoStopTimer = setTimeout(() => end(session, 'finished'), MAX_MS)
      session.countdownTimer = setInterval(() => {
        setSecondsLeft(Math.max(0, Math.ceil((MAX_MS - (Date.now() - session.startedAt)) / 1000)))
      }, 1000)
      setSecondsLeft(MAX_SECONDS)
      setState('recording')
      session.settleStart('recording')
    },
    [end, finalize, release],
  )

  const start = useCallback((): Promise<StartResult> => {
    // 권한을 기다리거나 녹음 중이면 마이크를 다시 열지 않고 그 녹음의 결과를 돌려준다
    if (current.current) return current.current.startResult
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function' || typeof MediaRecorder === 'undefined') return Promise.resolve('unsupported')
    const session = newSession()
    current.current = session
    setState('asking')
    void begin(session)
    return session.startResult
  }, [begin])

  const stop = useCallback(() => {
    const session = current.current
    // 권한을 기다리는 중에는 멈출 녹음이 없다
    if (session?.recorder) end(session, 'finished')
  }, [end])

  const cancel = useCallback(() => {
    const session = current.current
    if (!session) return
    if (session.recorder === null) {
      // 권한을 기다리는 중: start()는 허가를 기다리지 않고 바로 cancelled를 받고, 나중에 오는 허가는 begin이 바로 놓는다
      session.cancelled = true
      release(session)
      session.settleStart('cancelled')
      return
    }
    end(session, 'cancelled')
  }, [end, release])

  // 다른 메뉴로 옮겨 active가 false가 되거나 화면이 숨겨지거나 화면이 사라지면 녹음을 버린다
  useEffect(() => {
    if (!active) cancel()
  }, [active, cancel])
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancel()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [cancel])
  useEffect(() => cancel, [cancel])

  return { state, secondsLeft, start, stop, cancel }
}
