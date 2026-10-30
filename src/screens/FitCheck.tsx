import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { fitLines, fitSummary, formatCm, latestPlace, parseCm, validatePlace, type Dims, type Fit } from '../logic/fit'
import type { WishItem } from '../logic/wishlist'
import { Button } from '../ui/Button'
import { TextField } from '../ui/Field'
import { useFocusFirstError } from '../ui/useFocusFirstError'

// PRD F44 놓을 자리 확인 1단계(직접 입력): 고민 중 카드(고민 기간이 끝난 카드 포함)에 서버 주소와 상관없이 보인다.
// 결과 칸은 저장한 값(item.fit)으로만 그린다. 칸을 고쳐도 저장하기 전에는 결과와 접힌 제목이 바뀌지 않는다.

/** 가로·깊이·높이 칸에 적힌 글자(cm) */
export type SizeText = { w: string; d: string; h: string }

/** 2단계(AI 치수 읽기)가 물건 치수 칸 위에 그릴 자리 (판정 R18) */
export type FitAiSlot = {
  /** 물건 세 칸을 이 글자로 바꾸고(빈 글자는 그 칸을 비움) 기준도 바꾼다. 그 뒤 첫 빈 물건 칸(없으면 '확인하고 저장')으로 포커스 */
  apply: (fields: SizeText, basis: string | null) => void
  /** 접이식이 열려 있고 고민 중인 물건인가 */
  active: boolean
  /** 지금 고치고 있는 물건 칸 글자 (저장한 값이 아니다) */
  current: SizeText
}

type Axis = keyof SizeText
const AXES: readonly Axis[] = ['w', 'd', 'h']
const SPACE_LABEL: Record<Axis, string> = { w: '놓을 곳 가로(cm)', d: '놓을 곳 깊이(cm)', h: '놓을 곳 높이(cm)' }
const ITEM_LABEL: Record<Axis, string> = { w: '물건 가로(cm)', d: '물건 깊이(cm)', h: '물건 높이(cm)' }
const EMPTY: SizeText = { w: '', d: '', h: '' }

type Draft = {
  place: string
  space: SizeText
  item: SizeText
  /** 2단계에서 읽은 치수의 기준. 물건 칸 하나라도 손으로 고치면 지운다(놓을 곳 칸은 상관없다) */
  basis: string | null
  /** 다른 물건에서 가져온 놓을 곳 이름. "최근에 쓴 놓을 곳이에요" 문장에 쓴다 */
  recent: string | null
}

const toText = (dims: Dims): SizeText => ({ w: formatCm(dims.w), d: formatCm(dims.d), h: formatCm(dims.h) })

/** 처음 열 때의 칸: 이 물건에 저장한 값, 없으면 놓을 곳 네 칸만 가장 최근에 저장한 다른 물건의 값 */
function firstDraft(item: WishItem, items: readonly WishItem[]): Draft {
  if (item.fit) {
    const { place, space, item: size, basis } = item.fit
    return { place, space: toText(space), item: toText(size), basis: basis ?? null, recent: null }
  }
  const recent = latestPlace(items, item.id)
  if (recent) return { place: recent.place, space: toText(recent.space), item: EMPTY, basis: null, recent: recent.place }
  return { place: '', space: EMPTY, item: EMPTY, basis: null, recent: null }
}

type Errors = { place?: string; space: Partial<SizeText>; item: Partial<SizeText> }
const NO_ERRORS: Errors = { space: {}, item: {} }

function checkDraft(draft: Draft): { value?: Pick<Fit, 'place' | 'space' | 'item'>; errors: Errors } {
  const place = validatePlace(draft.place)
  const errors: Errors = { place: place.error, space: {}, item: {} }
  const read = (group: 'space' | 'item'): Dims | null => {
    const mm: Partial<Dims> = {}
    for (const axis of AXES) {
      const parsed = parseCm(draft[group][axis])
      if (parsed.mm === undefined) errors[group][axis] = parsed.error
      else mm[axis] = parsed.mm
    }
    return mm.w !== undefined && mm.d !== undefined && mm.h !== undefined ? { w: mm.w, d: mm.d, h: mm.h } : null
  }
  const space = read('space')
  const size = read('item')
  if (place.value === undefined || !space || !size) return { errors }
  return { value: { place: place.value, space, item: size }, errors }
}

export function FitCheck({
  item,
  items,
  onSave,
  aiSlot,
}: {
  item: WishItem
  /** 최근에 쓴 놓을 곳을 찾을 전체 기록 */
  items: readonly WishItem[]
  /** 저장(fit)·지우기(null). 반영됐는지 돌려준다(다른 탭에서 결정됨 등이면 false) */
  onSave: (id: string, fit: Fit | null) => boolean
  aiSlot?: (slot: FitAiSlot) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  // 처음 열 때 칸을 정하고, 그 뒤로는 사용자가 고친 칸을 그대로 둔다. 열기 전에는 지금 기록으로 계산한 값이다
  const [draft, setDraft] = useState<Draft | null>(null)
  const shown = draft ?? firstDraft(item, items)
  const edit = (change: (current: Draft) => Draft) => setDraft((current) => change(current ?? firstDraft(item, items)))
  const [attempted, setAttempted] = useState(false)
  const { ref: formRef, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const baseId = useId()
  const itemFieldId = (axis: Axis) => `${baseId}-item-${axis}`
  const resultTitleId = `${baseId}-result`

  // AI 값을 넣은 뒤 옮길 포커스: 첫 빈 물건 칸, 없으면 '확인하고 저장'. 접혀 있으면 옮기지 않는다
  const [applyFocus, setApplyFocus] = useState<{ axis: Axis | null } | null>(null)
  useEffect(() => {
    if (applyFocus === null || !detailsRef.current?.open) return
    const target = applyFocus.axis === null ? saveRef.current : document.getElementById(`${baseId}-item-${applyFocus.axis}`)
    target?.focus()
  }, [applyFocus, baseId])

  if (item.status !== 'considering') return null

  const fit = item.fit
  const { value, errors } = checkDraft(shown)
  const shownErrors = attempted ? errors : NO_ERRORS

  const apply = (fields: SizeText, basis: string | null) => {
    edit((current) => ({ ...current, item: { w: fields.w, d: fields.d, h: fields.h }, basis }))
    setApplyFocus({ axis: AXES.find((axis) => fields[axis].trim() === '') ?? null })
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setAttempted(true)
      focusFirstError()
      return
    }
    const next: Fit = { ...value, ...(shown.basis ? { basis: shown.basis } : {}), savedAt: new Date().toISOString() }
    // 반영되지 않았으면(다른 탭에서 결정됨 등) 결과·제목·포커스·입력을 그대로 둔다
    if (!onSave(item.id, next)) return
    setAttempted(false)
    // 저장한 뒤에는 이 칸이 이 물건의 값이라 "최근에 쓴 놓을 곳" 문장을 다시 보이지 않는다
    setDraft({ ...shown, recent: null })
  }

  const clear = () => {
    if (!onSave(item.id, null)) return
    saveRef.current?.focus()
  }

  return (
    <details
      className="questions"
      ref={detailsRef}
      onToggle={(event) => {
        const isOpen = event.currentTarget.open
        setOpen(isOpen)
        if (isOpen) setDraft((current) => current ?? firstDraft(item, items))
      }}
    >
      <summary className="field-label">{fit ? `놓을 자리 확인 · ${fitSummary(fit)}` : '놓을 자리 확인'}</summary>
      <form className="stack" onSubmit={save} noValidate ref={formRef}>
        {shown.recent !== null && !fit ? <p className="note">{`최근에 쓴 놓을 곳이에요: ${shown.recent}. 다르면 고쳐 주세요.`}</p> : null}
        <TextField
          label="놓을 곳 이름"
          value={shown.place}
          error={shownErrors.place}
          onChange={(e) => {
            const text = e.target.value
            edit((current) => ({ ...current, place: text }))
          }}
        />
        {AXES.map((axis) => (
          <TextField
            key={axis}
            label={SPACE_LABEL[axis]}
            inputMode="decimal"
            value={shown.space[axis]}
            error={shownErrors.space[axis]}
            onChange={(e) => {
              const text = e.target.value
              edit((current) => ({ ...current, space: { ...current.space, [axis]: text } }))
            }}
          />
        ))}
        {/* 고민 중이 아니면 위에서 그리지 않으므로 active는 열려 있는지와 같다 */}
        {aiSlot ? aiSlot({ apply, active: open, current: shown.item }) : null}
        {AXES.map((axis) => (
          <TextField
            key={axis}
            id={itemFieldId(axis)}
            label={ITEM_LABEL[axis]}
            inputMode="decimal"
            value={shown.item[axis]}
            error={shownErrors.item[axis]}
            onChange={(e) => {
              const text = e.target.value
              edit((current) => ({ ...current, item: { ...current.item, [axis]: text }, basis: null }))
            }}
          />
        ))}
        <div className="btn-row">
          <Button variant="primary" type="submit" ref={saveRef}>
            확인하고 저장
          </Button>
          {fit ? <Button onClick={clear}>지우기</Button> : null}
        </div>
        <div role="status" aria-labelledby={fit ? resultTitleId : undefined} className={fit ? 'stack' : 'similar-empty'}>
          {fit ? (
            <>
              <p className="field-label" id={resultTitleId}>
                저장한 치수로 본 결과
              </p>
              {fitLines(fit).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </>
          ) : null}
        </div>
      </form>
    </details>
  )
}
