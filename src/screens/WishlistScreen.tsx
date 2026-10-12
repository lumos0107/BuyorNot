import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react'
import { formatDate } from '../logic/dates'
import { DESIRE_LEVELS, DESIRE_TEXT, desireTrend } from '../logic/desire'
import type { WishDraft } from '../logic/draft'
import { impulseSignals, otherAnswers, priceInHours, unansweredQuestions, type ImpulseSignal } from '../logic/impulse'
import { formatWon, josa } from '../logic/number'
import { CHOICES, QUESTION_ORDER, QUESTION_TEXT, answerLabel, cardQuestions, hasAnswer, validateProblem, type ChoiceKey, type QuestionKey } from '../logic/questions'
import { sameRecord } from '../logic/records'
import { compareLinks, describeSimilar, findSimilar } from '../logic/similar'
import {
  COOLING_PRESETS,
  EXAMPLE_ADD,
  EXTEND_DAYS,
  NOTE_MAX,
  coolingDays,
  isExample,
  formatRemaining,
  reviewState,
  sortConsidering,
  validateNote,
  validateWishInput,
  validateWishPatch,
  type Answers,
  type DesireLevel,
  type NewWishInput,
  type WishFieldErrors,
  type WishItem,
  type WishPatch,
  type WishPatchRaw,
} from '../logic/wishlist'
import { Button } from '../ui/Button'
import { ExampleBar } from '../ui/ExampleBar'
import { TextAreaField, TextField } from '../ui/Field'
import { useFocusFirstError } from '../ui/useFocusFirstError'

// PRD F01 상품 등록·관리, F02 고민 기간과 결정, F07 연장, F08 결정 메모, F15 사기 전에 한 번 더, F22 고민 노트
type Decision = 'purchased' | 'skipped'

type Props = {
  items: WishItem[]
  now: Date
  onAdd: (input: NewWishInput) => void
  onEdit: (id: string, patch: WishPatch) => void
  /** 결정한 기록을 돌려주면 되돌리기 알림을 지금 기록과 맞춰 볼 수 있다 */
  onDecide: (id: string, decision: Decision, note?: string) => WishItem | undefined | void
  onExtend: (id: string, days: number) => void
  onRemove: (id: string) => void
  /** 시연용 예시 데이터 넣기. 목록이 비어 있을 때만 보여준다 */
  onAddDemo?: () => void
  /** 예시만 지우기 (결정 기록의 예시 포함) */
  onRemoveExamples?: () => void
  /** 결정 직후 되돌리기 (F18) */
  onReconsider?: (id: string) => void
  /** 사기 전 점검에서 금액을 시간으로 보여줄 때 쓴다 (결정 기록의 시급 설정) */
  hourlyWage?: number | null
  /** 가격 비교에서 가져온 가격과 이유 (F21) */
  draft?: WishDraft | null
  onDraftUsed?: () => void
  /** 오늘의 갖고 싶은 정도 (F22). 반영됐는지 돌려준다 */
  onCheckDesire?: (id: string, level: DesireLevel) => boolean
  /** 카드에서 답하기, 값 없이 부르면 다시 답하기 (F22). 반영됐는지 돌려준다 */
  onAnswer?: (id: string, key: QuestionKey, value: Answers[QuestionKey] | undefined) => boolean
}

const NOT_APPLIED = () => false

export function WishlistScreen({
  items,
  now,
  onAdd,
  onEdit,
  onDecide,
  onExtend,
  onRemove,
  onAddDemo,
  onRemoveExamples,
  onReconsider,
  hourlyWage = null,
  draft = null,
  onDraftUsed,
  onCheckDesire = NOT_APPLIED,
  onAnswer = NOT_APPLIED,
}: Props) {
  const considering = sortConsidering(items, now)
  const exampleCount = items.filter((item) => isExample(item.name)).length
  // 결정·삭제로 카드가 사라지면 포커스를 화면 제목으로 옮긴다 (키보드 사용자가 위치를 잃지 않게)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // 결정 직후에는 "되돌리기"를 보여준다 (F18). 다음 결정이 생기면 바뀐다.
  // 다시 고민하기·예시 지우기·백업 불러오기 등으로 그 결정이 바뀌면(같은 ID·결정·결정 시각이 아니면) 숨긴다
  const [undo, setUndo] = useState<{ id: string; name: string; decision: Decision; decidedAt: string | null } | null>(null)
  const undoActive =
    undo !== null && items.some((item) => item.id === undo.id && item.status === undo.decision && item.decidedAt === undo.decidedAt)
  const decide = (id: string, decision: Decision, note?: string) => {
    const decided = onDecide(id, decision, note)
    if (decided && onReconsider) setUndo({ id, name: decided.name, decision, decidedAt: decided.decidedAt })
    headingRef.current?.focus()
  }
  const remove = (id: string) => {
    onRemove(id)
    headingRef.current?.focus()
  }
  // 정도·답 저장이 다른 탭 기록 때문에 반영되지 않았는데 누른 요소가 사라졌으면(카드가 결정·삭제됐거나 같은 질문에 먼저 답함)
  // 화면 제목으로 포커스를 옮긴다. 누르기 직전의 요소를 기억해 그 요소가 화면에서 빠졌을 때만 옮긴다
  // (버튼을 눌러도 포커스가 가지 않는 브라우저에서 요소가 남아 있는데 옮기지 않게, F22·GPT 후속 확인)
  const rescueFrom = useRef<Element | null>(null)
  useEffect(() => {
    const from = rescueFrom.current
    if (!from) return
    rescueFrom.current = null
    if (!from.isConnected) headingRef.current?.focus()
  }, [items])
  const watch = (applied: boolean) => {
    if (!applied) rescueFrom.current = document.activeElement
    return applied
  }
  const checkDesire = (id: string, level: DesireLevel) => watch(onCheckDesire(id, level))
  const answer = (id: string, key: QuestionKey, value: Answers[QuestionKey] | undefined) => watch(onAnswer(id, key, value))
  // 예시 물건 넣기는 예시 카드와 함께 담기 폼을 체크리스트까지 채운다 (F28). 늘어날 때마다 폼이 한 번 채운다
  const [exampleFill, setExampleFill] = useState(0)
  return (
    <div className="stack">
      <h2 className="screen-title" tabIndex={-1} ref={headingRef}>
        고민 중인 물건
      </h2>
      <div role="status" aria-label="결정 알림" className={undo && undoActive ? undefined : 'similar-empty'}>
        {undo && undoActive ? (
          <div className="example-bar">
            <span className="note">{`‘${undo.name}’${josa(undo.name, '을/를')} ${undo.decision === 'purchased' ? '구매함으로' : '구매 포기로'} 옮겼어요.`}</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                onReconsider?.(undo.id)
                setUndo(null)
                headingRef.current?.focus()
              }}
            >
              되돌리기
            </button>
          </div>
        ) : null}
      </div>
      {onRemoveExamples && exampleCount > 0 ? (
        <ExampleBar
          label="예시만 지우기"
          message={`이름이 '(예시)'로 시작하는 물건 ${exampleCount}개를 지울까요? 결정 기록의 예시도 함께 지워져요.`}
          onConfirm={() => {
            onRemoveExamples()
            headingRef.current?.focus()
          }}
        />
      ) : null}
      {/* 처음 연 사람이 바로 둘러볼 수 있게, 비어 있을 때 예시 물건 넣기를 담기 폼 위에 둔다 (2026-10-11 제작자 요청) */}
      {considering.length === 0 && onAddDemo ? (
        <div className="example-bar">
          <span className="note">처음이라면 예시로 둘러보세요.</span>
          <Button
            onClick={() => {
              onAddDemo()
              setExampleFill((n) => n + 1)
            }}
          >
            예시 물건 넣기
          </Button>
        </div>
      ) : null}
      {/* 담기 폼은 짧아서 고민 중인 물건이 있어도 맨 위에 둔다 (F24) */}
      <AddForm onAdd={onAdd} items={items} now={now} draft={draft} onDraftUsed={onDraftUsed} exampleFill={exampleFill} />
      {considering.length === 0 ? (
        <div className="empty card stack">
          <p>아직 담아 둔 물건이 없어요.</p>
          <p className="note">사고 싶은 물건을 담아 두면 고민 기간이 지난 뒤 다시 물어봐요.</p>
        </div>
      ) : (
        <section className="stack" aria-label="고민 중인 물건 목록">
          {considering.map((item) => (
            <WishCard
              key={item.id}
              item={item}
              items={items}
              now={now}
              hourlyWage={hourlyWage}
              onEdit={onEdit}
              onDecide={decide}
              onExtend={onExtend}
              onRemove={remove}
              onCheckDesire={checkDesire}
              onAnswer={answer}
            />
          ))}
        </section>
      )}
      <CoolingGuide />
    </div>
  )
}

// 안내문 (F11): 효과를 단정하지 않고 이 앱이 하는 일만 적는다
function CoolingGuide() {
  return (
    <details className="card guide">
      <summary className="card-title">며칠 고민하면 뭐가 좋을까요?</summary>
      <div className="stack">
        <p>사고 싶은 마음은 시간이 지나면 처음보다 약해지기도 해요.</p>
        <p>살까말까는 담을 때 적은 이유와 답을 기간이 지난 뒤 다시 보여줘서, 그때의 마음과 지금의 생각을 나란히 볼 수 있게 해요.</p>
        <p>사기로 했다면 가격 비교에서 더 싼 조건을 고르고, 결정 기록에서 내가 어떤 물건을 사고 포기했는지 돌아볼 수 있어요.</p>
        <p>모든 사람에게 같은 효과가 있다고 말할 수는 없어요. 기록이 쌓이면 나에게 맞는 고민 기간을 찾는 데 도움이 될 수 있어요.</p>
      </div>
    </details>
  )
}

// ---------- 등록 폼 ----------

type Preset = (typeof COOLING_PRESETS)[number] | 'custom'
type AddRaw = { name: string; price: string; reason: string; url: string; preset: Preset; customDays: string }
const EMPTY_ADD: AddRaw = { name: '', price: '', reason: '', url: '', preset: 3, customDays: '' }

function AddForm({
  onAdd,
  items,
  now,
  draft,
  onDraftUsed,
  exampleFill = 0,
}: {
  onAdd: (input: NewWishInput) => void
  items: WishItem[]
  now: Date
  draft: WishDraft | null
  onDraftUsed?: () => void
  /** 늘어나면 예시 값을 체크리스트까지 채운다 (F28) */
  exampleFill?: number
}) {
  const [raw, setRaw] = useState<AddRaw>(EMPTY_ADD)
  // 담을 때 갖고 싶은 정도 (F22, 선택)
  const [desire, setDesire] = useState<DesireLevel | undefined>()
  // 담을 때의 체크리스트 (F28, 선택): 접어 두고 답한 것만 카드로 보낸다
  const [answers, setAnswers] = useState<Answers>({})
  const checklistRef = useRef<HTMLDetailsElement>(null)
  const [attempted, setAttempted] = useState(false)
  // 링크는 접어 두고, 잘못돼 담지 못하면 펼친다 (F24)
  const linkRef = useRef<HTMLDetailsElement>(null)
  // 담은 직후, 적은 값이 언제 어디에 쓰이는지 알려 준다. 폼에 다시 입력하면 지운다 (F24)
  const [added, setAdded] = useState<string | null>(null)
  const { ref: formRef, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  // 가격 비교에서 고른 쪽의 가격과 이유를 채우고 상품명으로 포커스를 옮긴다 (F21). 적던 상품명은 지우지 않는다.
  // 새 비교 값은 그리는 중에 알아차려 폼에 넣고(이전 값 기억), 포커스 이동과 알림은 그린 뒤에 한다
  const [fromCompare, setFromCompare] = useState(false)
  const [appliedDraft, setAppliedDraft] = useState<WishDraft | null>(null)
  if (draft && draft !== appliedDraft) {
    setAppliedDraft(draft)
    setRaw((r) => ({ ...r, price: String(draft.price), reason: draft.reason }))
    setAttempted(false)
    setFromCompare(true)
  }
  useEffect(() => {
    if (!draft) return
    formRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    onDraftUsed?.()
  }, [draft, onDraftUsed, formRef])
  // 예시 채우기 (F28): 새 요청은 그리는 중에 알아차려 값을 넣고, 체크리스트 펼치기와 포커스 이동은 그린 뒤에 한다
  const [fromExample, setFromExample] = useState(false)
  const [appliedFill, setAppliedFill] = useState(exampleFill)
  if (exampleFill !== appliedFill) {
    setAppliedFill(exampleFill)
    setRaw({ ...EMPTY_ADD, name: EXAMPLE_ADD.name, price: EXAMPLE_ADD.price, reason: EXAMPLE_ADD.reason })
    setDesire(EXAMPLE_ADD.desire)
    setAnswers({ ...EXAMPLE_ADD.answers })
    setAttempted(false)
    setAdded(null)
    setFromCompare(false)
    setFromExample(true)
  }
  useEffect(() => {
    if (exampleFill === 0) return
    if (checklistRef.current) checklistRef.current.open = true
    formRef.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [exampleFill, formRef])
  const answeredCount = QUESTION_ORDER.filter((key) => hasAnswer(answers, key)).length
  const setAnswer = <K extends QuestionKey>(key: K, v: Answers[K]) => {
    setAnswers((a) => ({ ...a, [key]: v }))
    setAdded(null)
  }
  const similar = findSimilar(raw.name, items, now)
  const days = raw.preset === 'custom' ? raw.customDays : String(raw.preset)
  const { value, errors } = validateWishInput({ name: raw.name, price: raw.price, reason: raw.reason, days, url: raw.url })
  const shown: WishFieldErrors = attempted ? errors : {}
  const set = <K extends keyof AddRaw>(key: K, v: AddRaw[K]) => {
    setRaw((r) => ({ ...r, [key]: v }))
    setAdded(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setAttempted(true)
      // 접힌 링크 영역 안의 오류가 숨지 않게 펼치고, 폼에서 첫 번째 오류 입력으로 포커스를 옮긴다
      if (errors.url && linkRef.current) linkRef.current.open = true
      focusFirstError()
      return
    }
    // 질문은 접힌 체크리스트에서 답해도 되고(F28), 담은 뒤 카드의 체크리스트에서 답해도 된다 (F24, F27)
    onAdd({ ...value, desire, answers })
    setAdded(
      `‘${value.name}’${josa(value.name, '을/를')} 담았어요. ${value.days}일 뒤에 처음 적은 이유와 갖고 싶은 정도의 변화를 다시 보여 드릴게요. ${
        answeredCount === QUESTION_ORDER.length ? '체크리스트 답은 카드에서 다시 고칠 수 있어요.' : '그동안 카드의 오늘의 고민에서 질문에 하나씩 답해 보세요.'
      }`,
    )
    setRaw(EMPTY_ADD)
    setDesire(undefined)
    setAnswers({})
    if (checklistRef.current) checklistRef.current.open = false
    setAttempted(false)
    setFromCompare(false)
    setFromExample(false)
  }

  return (
    <form className="card stack" aria-label="물건 담기" onSubmit={submit} noValidate ref={formRef}>
      <p className="card-title">물건 담기</p>
      {added ? (
        <p className="note" role="status" aria-label="담은 물건">
          {added}
        </p>
      ) : null}
      {fromCompare ? (
        <p className="note" role="status">
          가격 비교에서 가격과 이유를 가져왔어요. 상품명을 적고 담아 두세요.
        </p>
      ) : null}
      {fromExample ? (
        <p className="note" role="status">
          예시 값을 채웠어요. 담아 두기를 누르면 체크리스트 답까지 카드에 들어가요.
        </p>
      ) : null}
      <TextField
        label="상품명"
        placeholder="예: 무선 헤드폰"
        maxLength={80}
        value={raw.name}
        error={shown.name}
        onChange={(e) => set('name', e.target.value)}
      />
      {/* 내 기록 기반 알림 (F10): 비슷한 이름을 전에 담거나 결정했으면 알려준다 */}
      <div role="status" aria-label="비슷한 기록" className={similar.length > 0 ? 'similar-notice' : 'similar-empty'}>
        {similar.length > 0 ? (
          <ul className="plain-list">
            {similar.map((record) => (
              <li key={record.item.id}>{describeSimilar(record)}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <TextField
        label="가격"
        inputMode="numeric"
        placeholder="원"
        value={raw.price}
        error={shown.price}
        onChange={(e) => set('price', e.target.value)}
      />
      <TextAreaField
        label="사고 싶은 이유"
        placeholder="지금 쓰는 제품이 고장 나서, 세일 중이라서…"
        maxLength={500}
        value={raw.reason}
        error={shown.reason}
        onChange={(e) => set('reason', e.target.value)}
      />
      <DesireScale legend="지금 얼마나 갖고 싶나요? (선택)" name="desire-start" value={desire} onChange={setDesire} />
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">고민 기간</legend>
        <div className="radio-group">
          {COOLING_PRESETS.map((preset) => (
            <label key={preset}>
              <input
                type="radio"
                name="cooling"
                value={preset}
                checked={raw.preset === preset}
                onChange={() => set('preset', preset)}
              />{' '}
              {preset}일
            </label>
          ))}
          <label>
            <input
              type="radio"
              name="cooling"
              value="custom"
              checked={raw.preset === 'custom'}
              onChange={() => set('preset', 'custom')}
            />{' '}
            직접 입력
          </label>
        </div>
        {shown.days && raw.preset !== 'custom' ? <p className="field-error">{shown.days}</p> : null}
      </fieldset>
      {raw.preset === 'custom' ? (
        <TextField
          label="고민 일수"
          inputMode="numeric"
          placeholder="1~30"
          hint="1일부터 30일까지"
          value={raw.customDays}
          error={shown.days}
          onChange={(e) => set('customDays', e.target.value)}
        />
      ) : null}
      <details className="questions" ref={checklistRef}>
        <summary className="field-label">{`체크리스트 (선택)${answeredCount > 0 ? ` · ${answeredCount}/${QUESTION_ORDER.length}` : ''}`}</summary>
        <div className="stack">
          <p className="note">지금 답하지 않아도 담은 뒤 카드의 체크리스트에서 답할 수 있어요.</p>
          {QUESTION_ORDER.map((key) =>
            key === 'problem' ? (
              <TextField
                key={key}
                label={QUESTION_TEXT.problem}
                placeholder="예: 출퇴근길에 음악을 못 들어요"
                maxLength={NOTE_MAX}
                value={answers.problem ?? ''}
                onChange={(e) => setAnswer('problem', e.target.value)}
              />
            ) : (
              <fieldset key={key} className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-label">{QUESTION_TEXT[key]}</legend>
                <div className="radio-group">
                  {(CHOICES[key as ChoiceKey] as readonly (readonly [string, string])[]).map(([choice, label]) => (
                    <label key={choice}>
                      <input
                        type="radio"
                        name={`add-${key}`}
                        value={choice}
                        checked={answers[key] === choice}
                        onChange={() => setAnswer(key, choice as Answers[typeof key])}
                      />{' '}
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ),
          )}
        </div>
      </details>
      <details className="questions" ref={linkRef}>
        <summary className="field-label">상품 링크 (선택)</summary>
        <TextField
          label="링크 (선택)"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={raw.url}
          error={shown.url}
          onChange={(e) => set('url', e.target.value)}
        />
      </details>
      <Button variant="primary" block type="submit">
        담아 두기
      </Button>
    </form>
  )
}

// ---------- 상품 카드 ----------

type CardProps = {
  item: WishItem
  /** 비슷한 기록을 찾을 전체 기록 (F15) */
  items: WishItem[]
  now: Date
  hourlyWage: number | null
  onEdit: (id: string, patch: WishPatch) => void
  onDecide: (id: string, decision: Decision, note?: string) => void
  onExtend: (id: string, days: number) => void
  onRemove: (id: string) => void
  onCheckDesire: (id: string, level: DesireLevel) => boolean
  onAnswer: (id: string, key: QuestionKey, value: Answers[QuestionKey] | undefined) => boolean
}

type CardMode = 'view' | 'edit' | 'confirm-delete' | 'extend' | 'decide-purchased' | 'decide-skipped'

type Trigger = 'purchased' | 'skipped' | 'extend' | 'edit' | 'delete'

function WishCard({ item, items, now, hourlyWage, onEdit, onDecide, onExtend, onRemove, onCheckDesire, onAnswer }: CardProps) {
  const [mode, setMode] = useState<CardMode>('view')
  // 답하거나 다시 답하기가 반영되면 오늘의 고민에서 지금 보이는 질문(없으면 제목)으로 포커스를 옮긴다 (F22)
  const [noteFocus, setNoteFocus] = useState(0)
  const answerAndFocus = (key: QuestionKey, value: Answers[QuestionKey] | undefined) => {
    if (onAnswer(item.id, key, value)) setNoteFocus((n) => n + 1)
  }
  const state = reviewState(item.reviewAt, now)
  const extensions = item.extensions ?? 0

  // 하위 화면(연장·메모·삭제 확인)을 닫으면 그 화면을 연 버튼으로 포커스를 돌려보낸다. 키보드 사용자가 위치를 잃지 않게 (F06)
  const triggers = useRef<Partial<Record<Trigger, HTMLButtonElement | null>>>({})
  const returnTo = useRef<Trigger | null>(null)
  const open = (next: CardMode, from: Trigger) => {
    returnTo.current = from
    setMode(next)
  }
  useEffect(() => {
    if (mode !== 'view' || !returnTo.current) return
    triggers.current[returnTo.current]?.focus()
    returnTo.current = null
  }, [mode])
  const bind = (key: Trigger) => (el: HTMLButtonElement | null) => {
    triggers.current[key] = el
  }

  if (mode === 'edit') {
    return (
      <article className="card stack" aria-label={item.name}>
        <EditForm
          item={item}
          onSave={(patch) => {
            onEdit(item.id, patch)
            setMode('view')
          }}
          onCancel={() => setMode('view')}
        />
      </article>
    )
  }

  return (
    <article className="card stack" aria-label={item.name}>
      <div className="card-row">
        <p className="card-title">{item.name}</p>
        {state.phase === 'ready' ? (
          <span className="status">재검토 가능</span>
        ) : (
          <span className="status status-muted">고민 중 · {formatRemaining(state.remainingMs)}</span>
        )}
      </div>
      <p className="price">{formatWon(item.priceKrw)}</p>
      <p className="card-meta">
        담은 날 {formatDate(item.createdAt)} · {coolingDays(item)}일 고민
        {extensions > 0 ? ` · ${extensions}번 연장` : ''}
        {item.url ? (
          <>
            {' · '}
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              상품 링크
            </a>
          </>
        ) : null}
      </p>
      <p>처음 적은 이유: {item.reason}</p>
      <GominNote item={item} now={now} focusTick={noteFocus} onCheckDesire={(level) => onCheckDesire(item.id, level)} onAnswer={answerAndFocus} />
      <CompareLinks name={item.name} />

      {mode === 'confirm-delete' ? (
        <DeleteConfirm name={item.name} onConfirm={() => onRemove(item.id)} onCancel={() => setMode('view')} />
      ) : mode === 'extend' ? (
        <ExtendPicker
          onPick={(days) => {
            onExtend(item.id, days)
            setMode('view')
          }}
          onCancel={() => setMode('view')}
        />
      ) : mode === 'decide-purchased' || mode === 'decide-skipped' ? (
        <DecisionForm
          decision={mode === 'decide-purchased' ? 'purchased' : 'skipped'}
          check={
            mode === 'decide-purchased'
              ? {
                  signals: impulseSignals(item, items, now),
                  questions: unansweredQuestions(item),
                  hours: priceInHours(item.priceKrw, hourlyWage),
                  desire: desireTrend(item),
                  others: otherAnswers(item),
                }
              : undefined
          }
          onConfirm={(note) => onDecide(item.id, mode === 'decide-purchased' ? 'purchased' : 'skipped', note)}
          onCancel={() => setMode('view')}
        />
      ) : (
        <>
          {/* 사는 쪽으로 기울지 않게 두 버튼은 같은 모양이다 (F22) */}
          <p className="field-label">{state.phase === 'ready' ? '아직 필요한가요?' : '일찍 정할 수도 있어요'}</p>
          <div className="btn-row">
            <Button ref={bind('purchased')} onClick={() => open('decide-purchased', 'purchased')}>
              구매함
            </Button>
            <Button ref={bind('skipped')} onClick={() => open('decide-skipped', 'skipped')}>
              구매 포기
            </Button>
          </div>
          <div className="card-actions">
            <button type="button" className="link-btn" ref={bind('extend')} onClick={() => open('extend', 'extend')}>
              더 고민하기
            </button>
            <button type="button" className="link-btn" ref={bind('edit')} onClick={() => open('edit', 'edit')}>
              수정
            </button>
            <button type="button" className="link-btn" ref={bind('delete')} onClick={() => open('confirm-delete', 'delete')}>
              삭제
            </button>
          </div>
        </>
      )}
    </article>
  )
}

// 비교해 볼 곳 (F10): 실제 추천이 아니라 상품명으로 검색한 결과로 보낸다
function CompareLinks({ name }: { name: string }) {
  return (
    <div className="compare-links">
      <span className="card-meta">비교해 볼 곳</span>
      <span className="note">상품명 검색 결과예요. 추천이 아니에요. 새 창으로 열려요.</span>
      <ul className="link-list" aria-label="비교해 볼 곳">
        {compareLinks(name).map((link) => (
          <li key={link.label}>
            <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`${link.label} 검색 결과 (새 창)`}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

// 더 고민하기: 1·3·7일 중 고른다. 새 종료 시각은 로직(extendItem)이 정한다 (F07)
function ExtendPicker({ onPick, onCancel }: { onPick: (days: number) => void; onCancel: () => void }) {
  return (
    <div className="stack" role="group" aria-label="더 고민하기">
      <p className="field-label">얼마나 더 고민할까요?</p>
      <p className="note">남은 기간에 더해요. 기간이 지났다면 지금부터 세어요.</p>
      <div className="btn-row">
        {EXTEND_DAYS.map((days, index) => (
          <Button key={days} autoFocus={index === 0} onClick={() => onPick(days)}>
            {days}일 더
          </Button>
        ))}
        <Button onClick={onCancel}>취소</Button>
      </div>
    </div>
  )
}

// 결정 메모(선택)를 적고 확인해야 결정이 저장된다 (F08)
type ImpulseCheckData = {
  signals: ImpulseSignal[]
  questions: string[]
  hours: string | null
  /** 갖고 싶은 정도 변화 문장 (F22). 근거로 보여줄 뿐 걸리는 점 개수에 넣지 않는다 */
  desire: string | null
  /** 걸리는 점이 되지 않은 답 (F22 그 밖에 답한 것) */
  others: string[]
}

function DecisionForm({
  decision,
  check,
  onConfirm,
  onCancel,
}: {
  decision: Decision
  /** 구매함일 때만: 사기 전 점검 (F15) */
  check?: ImpulseCheckData
  onConfirm: (note?: string) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | undefined>()
  const label = decision === 'purchased' ? '구매함' : '구매 포기'
  const checkId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  // 메모 입력이 아니라 폼으로 포커스를 옮긴다. 폰 키보드가 올라와 사기 전 점검을 가리지 않게 한다
  useEffect(() => {
    formRef.current?.focus()
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateNote(note)
    if (checked.error) {
      setError(checked.error)
      return
    }
    onConfirm(checked.value)
  }

  return (
    <form
      className="stack"
      aria-label={`${label} 확인`}
      aria-describedby={check ? checkId : undefined}
      tabIndex={-1}
      ref={formRef}
      onSubmit={submit}
      noValidate
    >
      {check ? <ImpulseCheck id={checkId} {...check} /> : null}
      <TextAreaField
        label="결정 메모 (선택)"
        placeholder={decision === 'purchased' ? '왜 사기로 했나요?' : '왜 안 사기로 했나요?'}
        value={note}
        error={error}
        onChange={(e) => {
          setNote(e.target.value)
          setError(undefined)
        }}
      />
      <div className="btn-row">
        <Button variant="primary" type="submit">
          {label} 확인
        </Button>
        <Button onClick={onCancel}>취소</Button>
      </div>
    </form>
  )
}

// 사기 전에 한 번 더 (F15): 내 기록에서 찾은 근거만 보여주고 단정하지 않는다. 메모 입력이 이 내용을 설명으로 읽어 준다
// 답하지 않은 질문은 걸리는 점으로 세지 않고, 중요한 순서로 3개까지 "한 번 생각해 볼 질문"으로 보여준다
const QUESTIONS_SHOWN = 3

function ImpulseCheck({ id, signals, questions, hours, desire, others }: ImpulseCheckData & { id: string }) {
  // "그 밖에 n개 보기"를 누르면 나머지 질문을 펼치고, 버튼이 사라지므로 새로 보인 첫 질문으로 포커스를 옮긴다
  const [showAll, setShowAll] = useState(false)
  const firstHiddenRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (showAll) firstHiddenRef.current?.focus()
  }, [showAll])
  const shown = showAll ? questions : questions.slice(0, QUESTIONS_SHOWN)
  return (
    <section className="impulse-check stack" aria-label="사기 전 점검" id={id}>
      <p className="field-label">사기 전에 한 번 더 · {signals.length > 0 ? `걸리는 점 ${signals.length}개` : '걸리는 점이 없어요'}</p>
      {desire ? <p>{`갖고 싶은 정도: ${desire}`}</p> : null}
      {signals.length > 0 ? (
        <ul className="impulse-list" aria-label="걸리는 점">
          {signals.map((signal) => (
            <li key={signal.key}>{signal.text}</li>
          ))}
        </ul>
      ) : null}
      {others.length > 0 ? (
        <>
          <p className="note">그 밖에 답한 것</p>
          <ul className="impulse-list" aria-label="그 밖에 답한 것">
            {others.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
      {hours ? <p>이 금액은 시급으로 약 {hours}시간이에요.</p> : null}
      {questions.length > 0 ? (
        <>
          <p className="note">한 번 생각해 볼 질문</p>
          <ul className="impulse-list" aria-label="한 번 생각해 볼 질문">
            {shown.map((question, index) =>
              index === QUESTIONS_SHOWN ? (
                <li key={question} tabIndex={-1} ref={firstHiddenRef}>
                  {question}
                </li>
              ) : (
                <li key={question}>{question}</li>
              ),
            )}
          </ul>
          {!showAll && questions.length > QUESTIONS_SHOWN ? (
            <div>
              <button type="button" className="link-btn" onClick={() => setShowAll(true)}>
                {`그 밖에 ${questions.length - QUESTIONS_SHOWN}개 보기`}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {signals.length > 0 ? <p className="note">그래도 필요하다면 사도 괜찮아요.</p> : null}
    </section>
  )
}

// 갖고 싶은 정도 1~5 (F22): 숫자 선택지 5개와 양 끝 설명. 선택지마다 "4 많이"처럼 숫자와 말을 이름으로 둔다(보이는 숫자가 이름 안에 있다).
// 변화 문장은 그룹의 설명으로 연결한다(카드가 많을 때 한꺼번에 읽히지 않게 aria-live는 쓰지 않는다)
function DesireScale({
  legend,
  name,
  value,
  trend,
  onChange,
}: {
  legend: string
  name: string
  value: DesireLevel | undefined
  trend?: string | null
  onChange: (level: DesireLevel) => void
}) {
  const trendId = useId()
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={trend ? trendId : undefined}>
      <legend className="field-label">{legend}</legend>
      <div className="desire-scale">
        {DESIRE_LEVELS.map((level) => (
          <label key={level}>
            <input
              type="radio"
              name={name}
              aria-label={`${level} ${DESIRE_TEXT[level]}`}
              checked={value === level}
              onChange={() => onChange(level)}
            />
            {level}
          </label>
        ))}
      </div>
      <div className="desire-caption" aria-hidden="true">
        <span>{DESIRE_TEXT[1]}</span>
        <span>{DESIRE_TEXT[5]}</span>
      </div>
      {trend ? (
        <p id={trendId} className="note">
          {trend}
        </p>
      ) : null}
    </fieldset>
  )
}

// 오늘의 고민 (F22): 오늘 갖고 싶은 정도와 체크리스트 (F27). 질문 6개를 늘 목록으로 보여주고,
// 답한 것은 답과 다시 답하기, 펼친 질문 하나(고른 것, 없으면 답하지 않은 첫 질문)는 그 자리에서 답한다
function GominNote({
  item,
  now,
  focusTick,
  onCheckDesire,
  onAnswer,
}: {
  item: WishItem
  now: Date
  /** 늘어나면 지금 펼친 질문 문장(없으면 제목)으로 포커스를 옮긴다 */
  focusTick: number
  onCheckDesire: (level: DesireLevel) => void
  /** 값 없이 부르면 다시 답하기(답을 지운다) */
  onAnswer: (key: QuestionKey, value: Answers[QuestionKey] | undefined) => void
}) {
  const today = formatDate(now.toISOString())
  const todayLevel = item.desireChecks?.find((check) => check.day === today)?.level
  const questions = cardQuestions(item)
  // 답하기·다시 답하기로 고른 질문. 답하면 다시 답하지 않은 첫 질문을 펼친다
  const [picked, setPicked] = useState<QuestionKey | null>(null)
  const openKey = picked && questions.includes(picked) ? picked : (questions[0] ?? null)
  const [pickTick, setPickTick] = useState(0)
  const titleRef = useRef<HTMLParagraphElement>(null)
  const questionRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (focusTick === 0 && pickTick === 0) return
    const target = questionRef.current ?? titleRef.current
    target?.focus()
  }, [focusTick, pickTick])
  const answered = QUESTION_ORDER.length - questions.length

  return (
    <section className="gomin-note stack" aria-label="오늘의 고민">
      <p className="field-label" tabIndex={-1} ref={titleRef}>
        오늘의 고민
      </p>
      <DesireScale legend="지금 얼마나 갖고 싶나요?" name={`desire-${item.id}`} value={todayLevel} trend={desireTrend(item)} onChange={onCheckDesire} />
      <p className="field-label">{`체크리스트 ${answered}/${QUESTION_ORDER.length}`}</p>
      <ul className="plain-list checklist" aria-label="체크리스트">
        {QUESTION_ORDER.map((key) => {
          const label = answerLabel(item.answers, key)
          if (label !== null)
            return (
              <li key={key} className="check-row is-done">
                <CheckMark done />
                <span className="answer-text">
                  <span className="check-question">{QUESTION_TEXT[key]}</span>
                  <span className="check-answer">{label}</span>
                </span>
                <button
                  type="button"
                  className="link-btn"
                  aria-label={`‘${QUESTION_TEXT[key]}’ 다시 답하기`}
                  onClick={() => {
                    setPicked(key)
                    onAnswer(key, undefined)
                  }}
                >
                  다시 답하기
                </button>
              </li>
            )
          if (key === openKey)
            return (
              <li key={key} className="check-row is-open">
                <CheckMark />
                <OpenQuestion questionKey={key} questionRef={questionRef} onAnswer={(value) => onAnswer(key, value)} />
              </li>
            )
          return (
            <li key={key} className="check-row">
              <CheckMark />
              <span className="answer-text">
                <span className="check-question">{QUESTION_TEXT[key]}</span>
              </span>
              <button
                type="button"
                className="link-btn"
                aria-label={`‘${QUESTION_TEXT[key]}’ 답하기`}
                onClick={() => {
                  setPicked(key)
                  setPickTick((n) => n + 1)
                }}
              >
                답하기
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// 체크 표시 (Tabler check 아이콘). 상태는 행의 답·버튼 문구로 읽히므로 화면 읽기에서 뺀다
function CheckMark({ done = false }: { done?: boolean }) {
  return (
    <span className={done ? 'check-mark is-done' : 'check-mark'} aria-hidden="true">
      {done ? (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5l10 -10" />
        </svg>
      ) : null}
    </span>
  )
}

// 펼친 질문 (F22, F27): 선택형은 버튼을 누르면 바로, 문제 설명은 입력 후 "답하기"로 저장한다
function OpenQuestion({
  questionKey,
  questionRef,
  onAnswer,
}: {
  questionKey: QuestionKey
  questionRef: Ref<HTMLParagraphElement>
  onAnswer: (value: Answers[QuestionKey]) => void
}) {
  const textId = useId()
  return (
    <div className="stack check-open">
      <p id={textId} className="field-label" tabIndex={-1} ref={questionRef}>
        {QUESTION_TEXT[questionKey]}
      </p>
      {questionKey === 'problem' ? (
        <ProblemAnswer labelledBy={textId} onAnswer={onAnswer} />
      ) : (
        <div className="btn-row" role="group" aria-labelledby={textId}>
          {(CHOICES[questionKey as ChoiceKey] as readonly (readonly [string, string])[]).map(([value, label]) => (
            <Button key={value} onClick={() => onAnswer(value as Answers[QuestionKey])}>
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

// "없으면 어떤 문제가 있나요?"의 카드 답: 앞뒤 공백을 뺀 1~200자. 오류는 입력에 연결한다
function ProblemAnswer({ labelledBy, onAnswer }: { labelledBy: string; onAnswer: (value: string) => void }) {
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | undefined>()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateProblem(raw)
    if (checked.error || checked.value === undefined) {
      setError(checked.error)
      inputRef.current?.focus()
      return
    }
    onAnswer(checked.value)
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <input
        ref={inputRef}
        className="input"
        aria-labelledby={labelledBy}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder="예: 출퇴근길에 음악을 못 들어요"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          setError(undefined)
        }}
      />
      {/* Enter로 다시 제출하면 포커스 이동이 없어 오류를 알림으로 읽힌다 (GPT 코드 검토) */}
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit">답하기</Button>
    </form>
  )
}

export function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="stack" role="group" aria-label="삭제 확인">
      <p className="field-label">{`‘${name}’${josa(name, '을/를')} 지울까요?`}</p>
      <div className="btn-row">
        <Button variant="danger" autoFocus onClick={onConfirm}>
          지우기
        </Button>
        <Button onClick={onCancel}>취소</Button>
      </div>
    </div>
  )
}

function EditForm({ item, onSave, onCancel }: { item: WishItem; onSave: (patch: WishPatch) => void; onCancel: () => void }) {
  const [raw, setRaw] = useState<WishPatchRaw>({
    name: item.name,
    price: String(item.priceKrw),
    reason: item.reason,
    url: item.url ?? '',
  })
  const [attempted, setAttempted] = useState(false)
  const { ref: formRef, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  // 폼을 열 때의 기록. 저장할 때 내용이 바뀌었으면 다른 탭에서 고친 것이라 덮어쓰지 않는다
  const [opened] = useState(item)
  const [stale, setStale] = useState(false)
  const { value, errors } = validateWishPatch(raw)
  const shown: WishFieldErrors = attempted ? errors : {}
  const set = <K extends keyof WishPatchRaw>(key: K, v: string) => setRaw((r) => ({ ...r, [key]: v }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setAttempted(true)
      focusFirstError()
      return
    }
    if (!sameRecord(item, opened)) {
      setStale(true)
      return
    }
    onSave(value)
  }

  return (
    <form className="stack" aria-label="물건 수정" onSubmit={submit} noValidate ref={formRef}>
      <p className="card-title">물건 수정</p>
      <TextField label="상품명" autoFocus maxLength={80} value={raw.name} error={shown.name} onChange={(e) => set('name', e.target.value)} />
      <TextField
        label="가격"
        inputMode="numeric"
        value={raw.price}
        error={shown.price}
        onChange={(e) => set('price', e.target.value)}
      />
      <TextAreaField
        label="사고 싶은 이유"
        maxLength={500}
        value={raw.reason}
        error={shown.reason}
        onChange={(e) => set('reason', e.target.value)}
      />
      <TextField
        label="링크 (선택)"
        type="url"
        inputMode="url"
        value={raw.url}
        error={shown.url}
        onChange={(e) => set('url', e.target.value)}
      />
      <p className="note">고민 기간은 바뀌지 않아요. 다시 볼 날 {formatDate(item.reviewAt)}</p>
      {stale ? (
        <p className="field-error" role="alert">
          다른 탭에서 이 물건이 바뀌었어요. 취소한 뒤 다시 열어 고쳐 주세요.
        </p>
      ) : null}
      <div className="btn-row">
        <Button variant="primary" type="submit">
          저장
        </Button>
        <Button onClick={onCancel}>취소</Button>
      </div>
    </form>
  )
}
