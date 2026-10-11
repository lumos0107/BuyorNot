import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react'
import { formatDate } from '../logic/dates'
import { DESIRE_LEVELS, DESIRE_TEXT, desireTrend } from '../logic/desire'
import type { WishDraft } from '../logic/draft'
import { impulseSignals, otherAnswers, priceInHours, unansweredQuestions, type ImpulseSignal } from '../logic/impulse'
import { formatWon, josa } from '../logic/number'
import { CHOICES, QUESTION_TEXT, cardQuestions, validateProblem, type ChoiceKey, type QuestionKey } from '../logic/questions'
import { sameRecord } from '../logic/records'
import { compareLinks, describeSimilar, findSimilar } from '../logic/similar'
import {
  COOLING_PRESETS,
  EXTEND_DAYS,
  coolingDays,
  isExample,
  answerLines,
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
  // 고민 중인 물건이 있으면 목록을 담기 폼보다 먼저 보여준다(F22: 매일 오늘의 고민에 바로 닿게).
  // 같은 key로 순서만 바꿔 담기 폼에 쓰던 내용이 사라지지 않게 한다
  const addFormId = useId()
  const addForm = <AddForm key="add" id={addFormId} onAdd={onAdd} items={items} now={now} draft={draft} onDraftUsed={onDraftUsed} />
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
      {considering.length === 0
        ? [
            addForm,
            <div key="list" className="empty card stack">
              <p>아직 담아 둔 물건이 없어요.</p>
              <p className="note">사고 싶은 물건을 담아 두면 고민 기간이 지난 뒤 다시 물어봐요.</p>
              {onAddDemo ? <Button onClick={onAddDemo}>예시 물건 넣기</Button> : null}
            </div>,
          ]
        : [
            <div key="bar" className="example-bar">
              <span className="note">{`고민 중인 물건 ${considering.length}개`}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => document.getElementById(addFormId)?.querySelector<HTMLInputElement>('input')?.focus()}
              >
                새 물건 담기
              </button>
            </div>,
            <section key="list" className="stack" aria-label="고민 중인 물건 목록">
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
            </section>,
            addForm,
          ]}
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
type AnswersRaw = Omit<Answers, 'problem'> & { problem: string }
const EMPTY_ANSWERS: AnswersRaw = { problem: '' }

function AddForm({
  id,
  onAdd,
  items,
  now,
  draft,
  onDraftUsed,
}: {
  id: string
  onAdd: (input: NewWishInput) => void
  items: WishItem[]
  now: Date
  draft: WishDraft | null
  onDraftUsed?: () => void
}) {
  const [raw, setRaw] = useState<AddRaw>(EMPTY_ADD)
  const [answers, setAnswers] = useState<AnswersRaw>(EMPTY_ANSWERS)
  // 담을 때 갖고 싶은 정도 (F22, 선택)
  const [desire, setDesire] = useState<DesireLevel | undefined>()
  const [attempted, setAttempted] = useState(false)
  const problemCheck = validateNote(answers.problem)
  const questionsRef = useRef<HTMLDetailsElement>(null)
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
  const similar = findSimilar(raw.name, items, now)
  const days = raw.preset === 'custom' ? raw.customDays : String(raw.preset)
  const { value, errors } = validateWishInput({ name: raw.name, price: raw.price, reason: raw.reason, days, url: raw.url })
  const shown: WishFieldErrors = attempted ? errors : {}
  const set = <K extends keyof AddRaw>(key: K, v: AddRaw[K]) => setRaw((r) => ({ ...r, [key]: v }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!value || problemCheck.error) {
      setAttempted(true)
      // 접힌 질문 영역 안의 오류가 숨지 않게 펼치고, 폼에서 첫 번째 오류 입력으로 포커스를 옮긴다
      if (problemCheck.error && questionsRef.current) questionsRef.current.open = true
      focusFirstError()
      return
    }
    onAdd({ ...value, answers: { ...answers, problem: problemCheck.value }, desire })
    setRaw(EMPTY_ADD)
    setAnswers(EMPTY_ANSWERS)
    setDesire(undefined)
    setAttempted(false)
    setFromCompare(false)
  }

  return (
    <form id={id} className="card stack" aria-label="물건 담기" onSubmit={submit} noValidate ref={formRef}>
      <p className="card-title">물건 담기</p>
      {fromCompare ? (
        <p className="note" role="status">
          가격 비교에서 가격과 이유를 가져왔어요. 상품명을 적고 담아 두세요.
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
      <TextField
        label="링크 (선택)"
        type="url"
        inputMode="url"
        placeholder="https://"
        value={raw.url}
        error={shown.url}
        onChange={(e) => set('url', e.target.value)}
      />
      {/* 담을 때 질문 3개 (F09). 모두 선택 */}
      <details className="questions" ref={questionsRef}>
        <summary className="field-label">한 번만 생각해 볼까요? (선택)</summary>
        <div className="stack">
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">지금 쓰는 게 있나요?</legend>
            <div className="radio-group">
              {(['yes', 'no'] as const).map((v) => (
                <label key={v}>
                  <input
                    type="radio"
                    name="haveOne"
                    checked={answers.haveOne === v}
                    onChange={() => setAnswers((a) => ({ ...a, haveOne: v }))}
                  />{' '}
                  {v === 'yes' ? '있어요' : '없어요'}
                </label>
              ))}
            </div>
          </fieldset>
          <TextAreaField
            label="없으면 어떤 문제가 있나요?"
            placeholder="예: 출퇴근길에 음악을 못 들어요"
            value={answers.problem}
            error={attempted ? problemCheck.error : undefined}
            onChange={(e) => setAnswers((a) => ({ ...a, problem: e.target.value }))}
          />
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">한 달 뒤에도 쓸까요?</legend>
            <div className="radio-group">
              {([
                ['yes', '쓸 것 같아요'],
                ['no', '아닐 것 같아요'],
                ['unsure', '모르겠어요'],
              ] as const).map(([v, label]) => (
                <label key={v}>
                  <input
                    type="radio"
                    name="useInMonth"
                    checked={answers.useInMonth === v}
                    onChange={() => setAnswers((a) => ({ ...a, useInMonth: v }))}
                  />{' '}
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {/* 질문 6개 중 새 3개 (F09 확장): 답은 '사기 전에 한 번 더'(F15)의 근거가 된다 */}
          <YesNoQuestion
            legend="할인·한정 때문인가요?"
            name="saleDriven"
            options={[
              ['yes', '네'],
              ['no', '아니요'],
            ]}
            value={answers.saleDriven}
            onChange={(v) => setAnswers((a) => ({ ...a, saleDriven: v }))}
          />
          <YesNoQuestion
            legend="놓을 곳과 쓸 시간이 있나요?"
            name="spaceTime"
            options={[
              ['yes', '있어요'],
              ['no', '없어요'],
            ]}
            value={answers.spaceTime}
            onChange={(v) => setAnswers((a) => ({ ...a, spaceTime: v }))}
          />
          <YesNoQuestion
            legend="빌리거나 중고로 대신할 수 있나요?"
            name="alternative"
            options={[
              ['yes', '대신할 수 있어요'],
              ['no', '어려워요'],
            ]}
            value={answers.alternative}
            onChange={(v) => setAnswers((a) => ({ ...a, alternative: v }))}
          />
          <p className="note">기간이 지나 다시 볼 때와 구매함을 누를 때 이 답을 함께 보여줘요.</p>
        </div>
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
      {/* 답한 것 (F09, F22): 고민 중에도 보이고, 잘못 누른 답은 다시 답하기로 지워 질문으로 돌린다 */}
      {answerLines(item.answers).length > 0 ? (
        <ul className="plain-list answers" aria-label="답한 것">
          {answerLines(item.answers).map(({ key, text }) => (
            <li key={key}>
              <span className="answer-text">{text}</span>{' '}
              <button type="button" className="link-btn" aria-label={`‘${text}’ 다시 답하기`} onClick={() => answerAndFocus(key, undefined)}>
                다시 답하기
              </button>
            </li>
          ))}
        </ul>
      ) : null}
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
    <form className="stack" aria-label={`${label} 확인`} onSubmit={submit} noValidate>
      {check ? <ImpulseCheck id={checkId} {...check} /> : null}
      <TextAreaField
        label="결정 메모 (선택)"
        autoFocus
        aria-describedby={check ? checkId : undefined}
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

// 예/아니요로 답하는 선택 질문 (F09 확장)
function YesNoQuestion({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string
  name: string
  options: [['yes', string], ['no', string]]
  value: 'yes' | 'no' | undefined
  onChange: (value: 'yes' | 'no') => void
}) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label">{legend}</legend>
      <div className="radio-group">
        {options.map(([v, label]) => (
          <label key={v}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} /> {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// 사기 전에 한 번 더 (F15): 내 기록에서 찾은 근거만 보여주고 단정하지 않는다. 메모 입력이 이 내용을 설명으로 읽어 준다
// 답하지 않은 질문은 걸리는 점으로 세지 않고, 중요한 순서로 3개까지 "한 번 생각해 볼 질문"으로 보여준다
const QUESTIONS_SHOWN = 3

function ImpulseCheck({ id, signals, questions, hours, desire, others }: ImpulseCheckData & { id: string }) {
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
            {questions.slice(0, QUESTIONS_SHOWN).map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
          {questions.length > QUESTIONS_SHOWN ? <p className="note">{`그 밖에 ${questions.length - QUESTIONS_SHOWN}개`}</p> : null}
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

// 오늘의 고민 (F22): 오늘 갖고 싶은 정도와, 아직 답하지 않은 질문 하나. 하루에 하나로 제한하지 않는다
function GominNote({
  item,
  now,
  focusTick,
  onCheckDesire,
  onAnswer,
}: {
  item: WishItem
  now: Date
  /** 늘어나면 지금 보이는 질문 문장(없으면 제목)으로 포커스를 옮긴다 */
  focusTick: number
  onCheckDesire: (level: DesireLevel) => void
  onAnswer: (key: QuestionKey, value: Answers[QuestionKey]) => void
}) {
  const today = formatDate(now.toISOString())
  const todayLevel = item.desireChecks?.find((check) => check.day === today)?.level
  const questions = cardQuestions(item)
  const titleRef = useRef<HTMLParagraphElement>(null)
  const questionRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (focusTick === 0) return
    const target = questionRef.current ?? titleRef.current
    target?.focus()
  }, [focusTick])

  return (
    <section className="gomin-note stack" aria-label="오늘의 고민">
      <p className="field-label" tabIndex={-1} ref={titleRef}>
        오늘의 고민
      </p>
      <DesireScale legend="지금 얼마나 갖고 싶나요?" name={`desire-${item.id}`} value={todayLevel} trend={desireTrend(item)} onChange={onCheckDesire} />
      {questions.length > 0 ? (
        <NextQuestion
          key={questions[0]}
          questionKey={questions[0]}
          remaining={questions.length}
          questionRef={questionRef}
          onAnswer={(value) => onAnswer(questions[0], value)}
        />
      ) : null}
    </section>
  )
}

// 생각해 볼 질문 하나 (F22): 선택형은 버튼을 누르면 바로, 문제 설명은 입력 후 "답하기"로 저장한다
function NextQuestion({
  questionKey,
  remaining,
  questionRef,
  onAnswer,
}: {
  questionKey: QuestionKey
  remaining: number
  questionRef: Ref<HTMLParagraphElement>
  onAnswer: (value: Answers[QuestionKey]) => void
}) {
  const textId = useId()
  return (
    <div className="stack">
      <p className="note">{`생각해 볼 질문 · ${remaining}개 남음`}</p>
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
