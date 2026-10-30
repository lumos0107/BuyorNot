import { useEffect, useId, useRef, useState } from 'react'
import { isReadTagResponse, postJson } from '../../ai/client'
import { PHOTO_TIMEOUT_MS } from '../../ai/config'
import { blobToBase64, shrinkImage } from '../../ai/image'
import { aiFailureMessage, PHOTO_DECODE_FAILED, PHOTO_NOTICE } from '../../ai/messages'
import { UNIT_LABEL, type BundleRawInput, type Unit } from '../../logic/bundle'
import { completeBundle, tagToBundle, type BundleFill } from '../../logic/bundleFill'
import { Button } from '../../ui/Button'
import { SelectField } from '../../ui/Field'
import { PhotoPicker } from './PhotoPicker'
import { PhotoPreview } from './PhotoPreview'
import { Progress } from './Progress'

// PRD F32 두 상품 사진으로 묶음 비교 채우기. 상품 A·B 카드마다 하나씩 둔다.
// 흐름: idle → reading(사진을 읽는 중) → confirm(확인 상자). 확인 상자에서 채우기를 누르거나 취소하면 idle로 돌아간다.
// 요청은 카드마다 한 번에 하나만 둔다. 새 사진·취소·화면이 사라짐이면 앞 요청을 끊고(AbortController),
// 그래도 늦게 온 응답은 요청 번호가 마지막이 아니라서 버린다 (PRD 10장 앱 공통).
type Phase = 'idle' | 'reading' | 'confirm'

// 읽은 상품 하나와 칸 값으로 바꾼 결과. 라디오에는 읽은 상품명을 쓴다
type Entry = { name: string; fill: BundleFill }

const UNITS: readonly Unit[] = ['g', 'kg', 'mL', 'L', 'ea']

// F32에는 이 경우의 문장이 따로 없어 F31의 "상품을 하나도 못 찾았을 때" 문장을 쓴다
const NOT_FOUND = '상품이나 가격표를 찾지 못했어요. 다시 찍거나 직접 입력해 주세요.'

export function BundlePhotoFill({ cardName, onApply }: { cardName: string; onApply: (raw: BundleRawInput) => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [photo, setPhoto] = useState<File | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  // 확인 상자에서 사용자가 고른 단위. 읽은 단위가 없을 때만 쓴다('' = 아직 안 고름)
  const [unit, setUnit] = useState<Unit | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  // 읽기가 끝난 뒤 옮길 포커스. 새 객체로 바꿔야 같은 곳으로 다시 옮긴다
  const [focusBox, setFocusBox] = useState<object | null>(null)

  const nameId = useId()
  const radioName = useId()
  const root = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)

  // 요청 번호와 지금 요청의 취소. 번호가 바뀐 뒤 온 응답은 늦은 응답이다
  const requestId = useRef(0)
  const inFlight = useRef<AbortController | null>(null)
  const stopRequest = () => {
    requestId.current += 1
    inFlight.current?.abort()
    inFlight.current = null
  }
  const startRequest = () => {
    stopRequest()
    const controller = new AbortController()
    inFlight.current = controller
    return { id: requestId.current, signal: controller.signal }
  }
  const isLatest = (id: number) => id === requestId.current
  // 화면이 사라지면 진행 중인 요청을 끊는다
  useEffect(
    () => () => {
      requestId.current += 1
      inFlight.current?.abort()
    },
    [],
  )

  // 읽기가 끝나면 사라진 '취소' 대신 확인 상자로 포커스를 옮긴다. 다음은 안 옮기는 경우다:
  // - 다른 메뉴·탭을 보는 동안 끝났으면(숨은 화면) 옮기지 않는다. 돌아오면 확인 상자는 그대로 보인다 (PRD 10장 앱 공통)
  // - 포커스가 이 카드의 사진 흐름 밖(예: 다른 칸에 적는 중)에 있으면 빼앗지 않는다
  useEffect(() => {
    if (focusBox === null) return
    const element = box.current
    const active = document.activeElement
    const free = active === null || active === document.body || root.current?.contains(active) === true
    if (element && free && !element.closest('[hidden]')) element.focus()
  }, [focusBox])

  // 사진 흐름을 닫는다: 읽은 상품과 고른 단위를 버리고 미리보기를 없앤다(주소는 PhotoPreview가 해제한다)
  const endFlow = () => {
    setPhase('idle')
    setPhoto(null)
    setEntries([])
    setSelected(null)
    setUnit('')
  }

  const pick = async (file: File) => {
    const { id, signal } = startRequest()
    setPhoto(file)
    setPhase('reading')
    setEntries([])
    setSelected(null)
    setUnit('')
    setError(null)
    setNotFound(false)

    let image: string
    try {
      image = await blobToBase64(await shrinkImage(file))
    } catch {
      // 브라우저가 열 수 없는 사진(예: 일부 HEIC)은 서버로 보내지 않는다
      if (!isLatest(id)) return
      inFlight.current = null
      endFlow()
      setError(PHOTO_DECODE_FAILED)
      return
    }
    if (!isLatest(id)) return
    const result = await postJson('/api/read-tag', { image, mimeType: 'image/jpeg' }, { timeoutMs: PHOTO_TIMEOUT_MS, signal, guard: isReadTagResponse })
    if (!isLatest(id)) return
    inFlight.current = null
    if (!result.ok) {
      endFlow()
      if (result.error !== 'cancelled') setError(aiFailureMessage(result.error))
      return
    }
    const items = result.data.items
    if (items.length === 0) {
      endFlow()
      setNotFound(true)
      return
    }
    setEntries(items.map((tag) => ({ name: tag.name, fill: tagToBundle(tag) })))
    // 하나면 자동으로 고르고, 여러 개면 사용자가 고른다
    setSelected(items.length > 1 ? null : 0)
    setPhase('confirm')
    setFocusBox({})
  }

  // 읽는 중의 '취소'와 확인 상자의 '취소'는 같다: 요청을 끊고 닫은 뒤 "사진으로 채우기" 버튼으로 포커스를 돌린다
  const close = () => {
    stopRequest()
    endFlow()
    picker.current?.focus()
  }

  const choose = (index: number) => {
    setSelected(index)
    setUnit('')
  }

  const chosen = selected === null ? null : (entries[selected] ?? null)
  const fill = chosen?.fill ?? null
  const needsUnit = fill?.ok === true && fill.partial.unit === null
  const canApply = fill?.ok === true && (!needsUnit || unit !== '')

  // 포커스는 카드가 옮긴다(오류가 있는 첫 칸, 없으면 가격 칸). 여기서는 상자만 닫는다
  const apply = () => {
    if (fill === null || !fill.ok) return
    const finalUnit = fill.partial.unit ?? (unit === '' ? null : unit)
    if (finalUnit === null) return
    onApply(completeBundle(fill.partial, finalUnit))
    endFlow()
  }

  return (
    <div ref={root} className="stack">
      {/* 같은 이름의 버튼이 카드마다 있어, 버튼 설명으로 어느 카드의 것인지 알린다 */}
      <span id={nameId} hidden>
        {cardName}
      </span>
      <PhotoPicker label="사진으로 채우기" describedBy={nameId} inputRef={picker} onPick={(file) => void pick(file)} />
      <p className="note">{PHOTO_NOTICE}</p>
      {photo ? <PhotoPreview file={photo} /> : null}
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

      {phase === 'confirm' ? (
        <div ref={box} className="card stack" role="group" aria-label="확인 상자" tabIndex={-1}>
          {entries.length > 1 ? (
            <div className="stack">
              {entries.map((entry, index) => (
                <label key={index} className="product-choice">
                  <input type="radio" name={radioName} checked={selected === index} onChange={() => choose(index)} />
                  {entry.name}
                </label>
              ))}
            </div>
          ) : null}
          {/* 고른 상품이 바뀌면 문장이 바뀌므로 알림 칸에 둔다 */}
          <div className="stack" role="status">
            {fill === null ? null : fill.ok ? (
              <>
                <p>{fill.read}</p>
                <p>{fill.fill}</p>
              </>
            ) : (
              <p>{fill.message}</p>
            )}
          </div>
          {needsUnit ? (
            <SelectField label="단위" value={unit} onChange={(event) => setUnit(event.target.value as Unit | '')}>
              <option value="">단위 고르기</option>
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {UNIT_LABEL[value]}
                </option>
              ))}
            </SelectField>
          ) : null}
          <div className="btn-row">
            <Button variant="primary" disabled={!canApply} onClick={apply}>
              채우기
            </Button>
            <Button onClick={close}>취소</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
