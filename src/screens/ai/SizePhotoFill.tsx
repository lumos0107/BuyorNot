import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { isReadSizeResponse, postJson } from '../../ai/client'
import { PHOTO_TIMEOUT_MS } from '../../ai/config'
import { blobToBase64, shrinkImage } from '../../ai/image'
import { aiFailureMessage, PHOTO_DECODE_FAILED, PHOTO_NOTICE } from '../../ai/messages'
import type { SizeCandidate, SizeUnit } from '../../ai/types'
import { candidateBasis, candidateToFields, candidateView } from '../../logic/sizeFill'
import { Button } from '../../ui/Button'
import { SelectField } from '../../ui/Field'
import { PhotoPicker } from './PhotoPicker'
import { PhotoPreview } from './PhotoPreview'
import { Progress } from './Progress'

// PRD F44 놓을 자리 확인 2단계: 상품 페이지 캡처에서 치수 읽기. FitCheck의 aiSlot 자리(물건 치수 칸 위)에 그린다 (판정 R18).
// 흐름: idle → reading(읽는 중) → choose(확인 상자). 넣기를 누르거나 취소하면 idle로 돌아간다.
// 채우기(F44): 넣기를 눌러야 물건 세 칸을 바꾸고(모르는 값은 그 칸을 비움), 누르기 전에 지울 칸을 알린다. 취소·접기는 칸을 건드리지 않는다.
// 요청은 한 번에 하나만 둔다. 새 사진·취소·화면이 사라짐이면 앞 요청을 끊고(AbortController),
// 그래도 늦게 온 응답은 요청 번호가 마지막이 아니라서 버린다 (PRD 10장 앱 공통).
// 접거나 물건을 결정해 active가 false가 되면 읽기 흐름을 통째로 내린다: 언마운트 정리가 요청을 끊고 미리보기 주소를 해제하며,
// 다시 펼치면 처음(idle)부터다 (PRD F44 "읽는 중에 그 물건을 결정하거나 접으면 읽기를 끊고 늦은 응답은 버린다").
// 이 자리는 FitCheck의 <form> 안이라 <form>을 두지 않고, 모든 버튼은 type="button"(Button 기본값)이며, 단위 선택에는 오류 표시를 두지 않는다
// (저장에 실패했을 때 첫 오류 칸 포커스를 가져가지 않게).
type Phase = 'idle' | 'reading' | 'choose'

type SizeText = { w: string; d: string; h: string }

const UNITS: readonly SizeUnit[] = ['mm', 'cm', 'm']
const NO_CANDIDATES: SizeCandidate[] = []

const NOT_FOUND = '치수 표기를 찾지 못했어요. 직접 입력해 주세요.'

// 라디오에서 Enter를 누르면 브라우저가 바깥 폼을 제출('확인하고 저장')하므로 막는다
function blockEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.preventDefault()
}

type FlowProps = {
  /** 지금 물건 칸 글자. 지울 칸 안내에 쓴다 */
  current: SizeText
  onApply: (fields: SizeText, basis: string | null) => void
}

type Props = FlowProps & {
  /** 놓을 자리 확인이 펼쳐져 있고 물건이 고민 중인가 */
  active: boolean
}

export function SizePhotoFill({ active, ...flow }: Props) {
  return active ? <SizeReadFlow {...flow} /> : null
}

function SizeReadFlow({ current, onApply }: FlowProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [photo, setPhoto] = useState<File | null>(null)
  const [candidates, setCandidates] = useState<SizeCandidate[]>(NO_CANDIDATES)
  const [selected, setSelected] = useState<number | null>(null)
  // 확인 상자에서 사용자가 고른 단위. 읽은 단위가 없을 때만 쓴다('' = 아직 안 고름)
  const [unit, setUnit] = useState<SizeUnit | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  // 읽기가 끝난 뒤 옮길 포커스. 새 객체로 바꿔야 같은 곳으로 다시 옮긴다
  const [focusBox, setFocusBox] = useState<object | null>(null)

  const radioName = useId()
  // 확인 상자 첫 줄(AI가 읽은 내용)의 id. 상자의 설명(aria-describedby)이 가리킨다
  const firstLineId = useId()
  const root = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)

  // 요청 번호와 지금 요청의 취소. 번호가 바뀐 뒤 온 응답은 늦은 응답이다
  const requestId = useRef(0)
  const inFlight = useRef<AbortController | null>(null)
  const isLatest = (id: number) => id === requestId.current

  // 무효화 경로는 하나: 앞 요청을 끊고, 읽은 표기·고른 단위·문구를 지우고 미리보기를 없앤다(주소는 PhotoPreview가 해제한다)
  const discard = () => {
    requestId.current += 1
    inFlight.current?.abort()
    inFlight.current = null
    setPhase('idle')
    setPhoto(null)
    setCandidates(NO_CANDIDATES)
    setSelected(null)
    setUnit('')
    setError(null)
    setNotFound(false)
  }

  // 화면이 사라지거나 active가 false가 되어 흐름을 내리면 진행 중인 요청을 끊는다
  useEffect(
    () => () => {
      requestId.current += 1
      inFlight.current?.abort()
    },
    [],
  )

  // 읽기가 끝나면 사라진 '취소' 대신 확인 상자로 포커스를 옮긴다. 다음은 안 옮기는 경우다:
  // - 다른 메뉴를 보는 동안 끝났으면(숨은 화면) 옮기지 않는다. 돌아오면 확인 상자는 그대로 보인다 (PRD 10장 앱 공통)
  // - 포커스가 이 자리 밖(예: 놓을 곳 칸에 적는 중)에 있으면 빼앗지 않는다
  useEffect(() => {
    if (focusBox === null) return
    const element = box.current
    const focused = document.activeElement
    const free = focused === null || focused === document.body || root.current?.contains(focused) === true
    if (element && free && !element.closest('[hidden]')) element.focus()
  }, [focusBox])

  const pick = async (file: File) => {
    discard()
    const controller = new AbortController()
    inFlight.current = controller
    const id = requestId.current
    setPhoto(file)
    setPhase('reading')

    let image: string
    try {
      image = await blobToBase64(await shrinkImage(file))
    } catch {
      // 브라우저가 열 수 없는 사진(예: 일부 HEIC)은 서버로 보내지 않는다
      if (!isLatest(id)) return
      inFlight.current = null
      setPhase('idle')
      setPhoto(null)
      setError(PHOTO_DECODE_FAILED)
      return
    }
    if (!isLatest(id)) return
    const result = await postJson(
      '/api/read-size',
      { image, mimeType: 'image/jpeg' },
      { timeoutMs: PHOTO_TIMEOUT_MS, signal: controller.signal, guard: isReadSizeResponse },
    )
    // 성공·실패 모두 최신 요청일 때만 상태를 바꾼다(늦은 실패가 새 읽기의 '읽는 중'을 지우지 않게)
    if (!isLatest(id)) return
    inFlight.current = null
    setPhase('idle')
    if (!result.ok) {
      setPhoto(null)
      if (result.error !== 'cancelled') setError(aiFailureMessage(result.error))
      return
    }
    const found = result.data.candidates
    if (found.length === 0) {
      setPhoto(null)
      setNotFound(true)
      return
    }
    setCandidates(found)
    // 하나면 자동으로 고르고, 여러 개면 사용자가 고른다
    setSelected(found.length > 1 ? null : 0)
    setPhase('choose')
    setFocusBox({})
  }

  // 읽는 중의 '취소'와 확인 상자의 '취소'는 같다: 요청을 끊고 닫은 뒤 치수 읽기 버튼으로 포커스를 돌린다. 물건 칸은 그대로다
  const close = () => {
    discard()
    picker.current?.focus()
  }

  const choose = (index: number) => {
    setSelected(index)
    setUnit('')
  }

  const chosen = selected === null ? null : (candidates[selected] ?? null)
  const chosenUnit = unit === '' ? null : unit
  // 확인 상자 문장은 고른 단위로 같은 함수가 다시 만든다(applying-ai-results 규칙 4)
  const view = chosen === null ? null : candidateView(chosen, chosenUnit, current)
  // 넣기를 막는 것은 단위 mixed(판정 R19)와 아직 모르는 단위다
  const mixed = chosen?.unit === 'mixed'
  const needsUnit = chosen !== null && chosen.unit === null
  const usedUnit: SizeUnit | null = chosen === null || chosen.unit === 'mixed' ? null : (chosen.unit ?? chosenUnit)
  // 단위가 mixed면 AI가 읽은 내용과 단위 문장만 보인다(PRD F44)
  const lines = view === null ? [] : mixed ? [view.read, view.notice] : [view.read, view.kind, view.axes, view.fill, view.clears]

  // 포커스는 FitCheck가 옮긴다(첫 빈 물건 칸, 없으면 '확인하고 저장'). 여기서는 상자만 닫는다
  const apply = () => {
    if (chosen === null || usedUnit === null) return
    onApply(candidateToFields(chosen, usedUnit), candidateBasis(chosen))
    discard()
  }

  return (
    <div ref={root} className="stack">
      <PhotoPicker label="상품 페이지 캡처에서 치수 읽기" inputRef={picker} onPick={(file) => void pick(file)} />
      <p className="note">{PHOTO_NOTICE}</p>
      {photo ? <PhotoPreview file={photo} enlarge={{ label: '캡처 크게 보기', alt: '고른 캡처' }} /> : null}
      {phase === 'reading' ? <Progress text="읽는 중" onCancel={close} /> : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {notFound ? (
        <p className="note" role="status">
          {NOT_FOUND}
        </p>
      ) : null}

      {phase === 'choose' ? (
        // 첫 줄을 상자의 설명으로 이어 포커스가 갈 때 함께 읽히게 한다. 표기를 고르기 전에는 첫 줄이 없어 잇지 않는다 (AC77)
        <div ref={box} className="card stack" role="group" aria-label="확인 상자" aria-describedby={view === null ? undefined : firstLineId} tabIndex={-1}>
          {candidates.length > 1 ? (
            <div className="stack">
              {candidates.map((candidate, index) => (
                <label key={index} className="product-choice">
                  <input type="radio" name={radioName} checked={selected === index} onChange={() => choose(index)} onKeyDown={blockEnter} />
                  {candidateView(candidate, null, current).choice}
                </label>
              ))}
            </div>
          ) : null}
          {/* 고른 표기·단위·물건 칸이 바뀌면 문장이 바뀌므로 알림 칸에 둔다 */}
          <div className="stack" role="status">
            {lines.map((line, index) => (line === null ? null : <p key={line} id={index === 0 ? firstLineId : undefined}>{line}</p>))}
          </div>
          {needsUnit ? (
            <SelectField label="단위" value={unit} onChange={(event) => setUnit(event.target.value as SizeUnit | '')}>
              <option value="">단위 고르기</option>
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectField>
          ) : null}
          <div className="btn-row">
            {mixed ? null : (
              <Button variant="primary" disabled={usedUnit === null} onClick={apply}>
                {view?.applyLabel ?? '넣기'}
              </Button>
            )}
            <Button onClick={close}>취소</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
