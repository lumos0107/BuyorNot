import { useEffect, useRef, useState, type RefObject } from 'react'
import { isVoiceFillResponse, postJson } from '../../ai/client'
import { VOICE_TIMEOUT_MS } from '../../ai/config'
import { blobToBase64 } from '../../ai/image'
import { aiFailureMessage, VOICE_NOTICE } from '../../ai/messages'
import type { VoiceFillResponse } from '../../ai/types'
import { Button } from '../../ui/Button'
import { Progress } from './Progress'
import { useRecorder, type RecordingResult } from './useRecorder'

// PRD F33 말로 담기의 버튼과 보내기. 담기 폼 맨 위에 둔다.
// 흐름: "말로 담기" → (마이크 권한 대기: 버튼을 누를 수 없음) → "듣는 중 · {n}초 남음"("멈추기"·"취소") → "AI가 받아쓰는 중이에요"("취소") → onFill.
// 칸에 넣기·결과 안내·채운 뒤 포커스는 폼이 한다(그 순간의 폼 값이 필요해서). 이 컴포넌트는 녹음과 요청, 실패 문구와 취소 뒤 포커스를 맡는다.
//
// 흐름 번호: 말로 담기를 누를 때마다 새 번호를 받는다. 취소·화면이 사라짐이면 번호를 올려, 그 뒤에 오는 녹음 결과·응답은 버린다(applying-ai-results 규칙 1).
// 녹음은 권한을 기다리는 중이든 녹음 중이든 다른 메뉴로 옮기면 버리고(훅이 멈춤), 녹음이 끝나 받아쓰는 중이면 요청은 이어진다(PRD 10장 앱 공통).

// PRD F33 "안 될 때"
const UNSUPPORTED = '이 브라우저에서는 녹음할 수 없어요. 직접 입력해 주세요.'
const DENIED = '마이크를 쓸 수 없어요. 직접 입력해 주세요.'
const TOO_SHORT = '녹음이 너무 짧아요. 다시 말해 주세요.'
const INTERRUPTED = '녹음이 중간에 멈췄어요. 다시 말해 주세요.'

/** 폼이 보일 안내. 줄이 없으면 앞 안내를 지운다(새 녹음을 시작할 때) */
export type VoiceMessage = { kind: 'status' | 'alert'; lines: string[] }

export function VoiceFillButton({
  active,
  onFill,
  onMessage,
  buttonRef,
}: {
  /** 이 화면(고민 목록 메뉴)이 보이는가. false가 되면 녹음과 권한 대기를 버린다 */
  active: boolean
  onFill: (fill: VoiceFillResponse) => void
  onMessage: (message: VoiceMessage) => void
  /** "말로 담기" 버튼. 채울 칸이 없을 때 폼이 이 버튼으로 포커스를 옮긴다 */
  buttonRef?: RefObject<HTMLButtonElement | null>
}) {
  const [transcribing, setTranscribing] = useState(false)
  // 그린 뒤 옮길 포커스. 새 객체로 바꿔야 같은 곳으로 다시 옮긴다
  const [focusTo, setFocusTo] = useState<{ target: 'start' | 'stop' } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const ownStart = useRef<HTMLButtonElement>(null)
  const startRef = buttonRef ?? ownStart
  const stopRef = useRef<HTMLButtonElement>(null)

  // 녹음·요청이 끝나는 때는 여러 번 그린 뒤라, 그때의 폼 값을 아는 최신 처리기를 부른다
  const handlers = useRef({ onFill, onMessage })
  useEffect(() => {
    handlers.current = { onFill, onMessage }
  })

  const flow = useRef(0)
  // 녹음 중인 흐름의 번호(권한 대기 포함). 녹음 결과가 오거나 버려지면 null
  const recordingFlow = useRef<number | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const isCurrent = (id: number) => id === flow.current

  const fail = (line: string) => {
    handlers.current.onMessage({ kind: 'alert', lines: [line] })
    setFocusTo({ target: 'start' })
  }

  // 녹음만 보낸다(PRD F33: 브라우저가 만든 형식 그대로). 자동으로 다시 보내지 않는다
  const send = async (id: number, blob: Blob, mimeType: string) => {
    const controller = new AbortController()
    inFlight.current = controller
    setTranscribing(true)
    let audio: string
    try {
      audio = await blobToBase64(blob)
    } catch {
      if (!isCurrent(id)) return
      inFlight.current = null
      setTranscribing(false)
      fail(aiFailureMessage('failed'))
      return
    }
    if (!isCurrent(id)) return
    const result = await postJson('/api/voice-fill', { audio, mimeType }, { timeoutMs: VOICE_TIMEOUT_MS, signal: controller.signal, guard: isVoiceFillResponse })
    // 취소했거나 화면이 사라진 뒤의 응답(성공·실패 모두)은 버린다
    if (!isCurrent(id)) return
    inFlight.current = null
    setTranscribing(false)
    if (result.ok) handlers.current.onFill(result.data)
    else if (result.error !== 'cancelled') fail(aiFailureMessage(result.error))
  }

  // 녹음 하나마다 한 번 온다. 그 녹음의 흐름이 끝났으면(취소·메뉴 이동·화면이 사라짐) 버린다
  const onStopped = (result: RecordingResult) => {
    const id = recordingFlow.current
    recordingFlow.current = null
    if (id === null || !isCurrent(id)) return
    if (!result.ok) {
      if (result.reason === 'too-short') fail(TOO_SHORT)
      else if (result.reason === 'interrupted') fail(INTERRUPTED)
      return
    }
    // 형식을 알 수 없는 녹음은 서버가 받지 않으므로 보내지 않는다(총괄 판정 R11)
    if (result.mimeType === '') {
      fail(UNSUPPORTED)
      return
    }
    void send(id, result.blob, result.mimeType)
  }

  const recorder = useRecorder({ active, onStopped })

  // 다른 메뉴로 옮기면 녹음 흐름을 버린다(훅이 녹음과 권한 대기를 멈춘다). 받아쓰기 요청은 그대로 둔다
  useEffect(() => {
    if (!active) recordingFlow.current = null
  }, [active])
  // 화면이 사라지면 늦게 오는 녹음 결과와 응답을 버리고 요청을 끊는다
  useEffect(
    () => () => {
      flow.current += 1
      recordingFlow.current = null
      inFlight.current?.abort()
    },
    [],
  )

  // 숨은 화면이거나 사용자가 이 흐름 밖(폼의 다른 칸 등)에 있으면 포커스를 옮기지 않는다
  useEffect(() => {
    if (focusTo === null) return
    const element = focusTo.target === 'start' ? startRef.current : stopRef.current
    const focused = document.activeElement
    const free = focused === null || focused === document.body || root.current?.contains(focused) === true
    if (element && free && !element.closest('[hidden]')) element.focus()
  }, [focusTo, startRef])

  const start = async () => {
    flow.current += 1
    const id = flow.current
    recordingFlow.current = id
    handlers.current.onMessage({ kind: 'status', lines: [] })
    const started = await recorder.start()
    if (!isCurrent(id) || recordingFlow.current !== id) return
    if (started === 'recording') {
      setFocusTo({ target: 'stop' })
      return
    }
    recordingFlow.current = null
    if (started === 'unsupported') fail(UNSUPPORTED)
    else if (started === 'denied') fail(DENIED)
  }

  // 녹음 중 취소: 녹음을 버린다(트랙은 훅이 멈춘다)
  const cancelRecording = () => {
    flow.current += 1
    recordingFlow.current = null
    recorder.cancel()
    setFocusTo({ target: 'start' })
  }

  // 받아쓰는 중 취소: 요청을 끊고 폼은 그대로 둔다
  const cancelTranscribing = () => {
    flow.current += 1
    inFlight.current?.abort()
    inFlight.current = null
    setTranscribing(false)
    setFocusTo({ target: 'start' })
  }

  return (
    <div ref={root} className="stack">
      {transcribing ? (
        <Progress text="AI가 받아쓰는 중이에요" onCancel={cancelTranscribing} />
      ) : recorder.state === 'recording' ? (
        <div className="stack">
          {/* 남은 초는 1초마다 바뀌어 읽어 주면 녹음에 섞이므로 timer(기본으로 읽지 않음)로 둔다 */}
          <p className="note" role="timer">{`듣는 중 · ${recorder.secondsLeft}초 남음`}</p>
          <div className="btn-row">
            <Button ref={stopRef} onClick={recorder.stop}>
              멈추기
            </Button>
            <Button onClick={cancelRecording}>취소</Button>
          </div>
        </div>
      ) : (
        <Button ref={startRef} style={{ alignSelf: 'flex-start' }} disabled={recorder.state === 'asking'} onClick={() => void start()}>
          말로 담기
        </Button>
      )}
      <p className="note">{VOICE_NOTICE}</p>
    </div>
  )
}
