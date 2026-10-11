import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatDate } from '../logic/dates'
import { formatWon, josa } from '../logic/number'
import { sameRecord } from '../logic/records'
import { compareLinks, describeSimilar, findSimilar } from '../logic/similar'
import {
  COOLING_PRESETS,
  EXTEND_DAYS,
  coolingDays,
  describeAnswers,
  formatRemaining,
  reviewState,
  sortConsidering,
  validateNote,
  validateWishInput,
  validateWishPatch,
  type Answers,
  type NewWishInput,
  type WishFieldErrors,
  type WishItem,
  type WishPatch,
  type WishPatchRaw,
} from '../logic/wishlist'
import { Button } from '../ui/Button'
import { TextAreaField, TextField } from '../ui/Field'
import { useFocusFirstError } from '../ui/useFocusFirstError'

// PRD F01 상품 등록·관리, F02 고민 기간과 결정, F07 연장, F08 결정 메모
type Decision = 'purchased' | 'skipped'

type Props = {
  items: WishItem[]
  now: Date
  onAdd: (input: NewWishInput) => void
  onEdit: (id: string, patch: WishPatch) => void
  onDecide: (id: string, decision: Decision, note?: string) => void
  onExtend: (id: string, days: number) => void
  onRemove: (id: string) => void
  /** 시연용 예시 데이터 넣기. 목록이 비어 있을 때만 보여준다 */
  onAddDemo?: () => void
}

export function WishlistScreen({ items, now, onAdd, onEdit, onDecide, onExtend, onRemove, onAddDemo }: Props) {
  const considering = sortConsidering(items, now)
  // 결정·삭제로 카드가 사라지면 포커스를 화면 제목으로 옮긴다 (키보드 사용자가 위치를 잃지 않게)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const decide = (id: string, decision: Decision, note?: string) => {
    onDecide(id, decision, note)
    headingRef.current?.focus()
  }
  const remove = (id: string) => {
    onRemove(id)
    headingRef.current?.focus()
  }
  return (
    <div className="stack">
      <h2 className="screen-title" tabIndex={-1} ref={headingRef}>
        고민 중인 물건
      </h2>
      <AddForm onAdd={onAdd} items={items} now={now} />
      {considering.length === 0 ? (
        <div className="empty card stack">
          <p>아직 담아 둔 물건이 없어요.</p>
          <p className="note">사고 싶은 물건을 담아 두면 고민 기간이 지난 뒤 다시 물어봐요.</p>
          {onAddDemo ? <Button onClick={onAddDemo}>예시 물건 넣기</Button> : null}
        </div>
      ) : (
        <section className="stack" aria-label="고민 중인 물건 목록">
          {considering.map((item) => (
            <WishCard
              key={item.id}
              item={item}
              now={now}
              onEdit={onEdit}
              onDecide={decide}
              onExtend={onExtend}
              onRemove={remove}
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
type AnswersRaw = { haveOne?: Answers['haveOne']; problem: string; useInMonth?: Answers['useInMonth'] }
const EMPTY_ANSWERS: AnswersRaw = { problem: '' }

function AddForm({ onAdd, items, now }: { onAdd: (input: NewWishInput) => void; items: WishItem[]; now: Date }) {
  const [raw, setRaw] = useState<AddRaw>(EMPTY_ADD)
  const [answers, setAnswers] = useState<AnswersRaw>(EMPTY_ANSWERS)
  const [attempted, setAttempted] = useState(false)
  const problemCheck = validateNote(answers.problem)
  const questionsRef = useRef<HTMLDetailsElement>(null)
  const { ref: formRef, focusFirstError } = useFocusFirstError<HTMLFormElement>()
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
    onAdd({ ...value, answers: { haveOne: answers.haveOne, problem: problemCheck.value, useInMonth: answers.useInMonth } })
    setRaw(EMPTY_ADD)
    setAnswers(EMPTY_ANSWERS)
    setAttempted(false)
  }

  return (
    <form className="card stack" aria-label="물건 담기" onSubmit={submit} noValidate ref={formRef}>
      <p className="card-title">물건 담기</p>
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
          <p className="note">기간이 지나 다시 볼 때 이 답을 함께 보여줘요.</p>
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
  now: Date
  onEdit: (id: string, patch: WishPatch) => void
  onDecide: (id: string, decision: Decision, note?: string) => void
  onExtend: (id: string, days: number) => void
  onRemove: (id: string) => void
}

type CardMode = 'view' | 'edit' | 'confirm-delete' | 'extend' | 'decide-purchased' | 'decide-skipped'

type Trigger = 'purchased' | 'skipped' | 'extend' | 'edit' | 'delete'

function WishCard({ item, now, onEdit, onDecide, onExtend, onRemove }: CardProps) {
  const [mode, setMode] = useState<CardMode>('view')
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
      {state.phase === 'ready' && describeAnswers(item.answers).length > 0 ? (
        <ul className="plain-list answers" aria-label="담을 때 답한 것">
          {describeAnswers(item.answers).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
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
          onConfirm={(note) => onDecide(item.id, mode === 'decide-purchased' ? 'purchased' : 'skipped', note)}
          onCancel={() => setMode('view')}
        />
      ) : (
        <>
          <p className="field-label">{state.phase === 'ready' ? '아직 필요한가요?' : '지금 결정해도 돼요'}</p>
          <div className="btn-row">
            <Button variant="primary" ref={bind('purchased')} onClick={() => open('decide-purchased', 'purchased')}>
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
function DecisionForm({ decision, onConfirm, onCancel }: { decision: Decision; onConfirm: (note?: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | undefined>()
  const label = decision === 'purchased' ? '구매함' : '구매 포기'

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
      <TextAreaField
        label="결정 메모 (선택)"
        autoFocus
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
