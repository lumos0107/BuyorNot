import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { formatDate } from '../logic/dates'
import { desirePointCount, desireTrend } from '../logic/desire'
import { formatWon, josa } from '../logic/number'
import { validateWage } from '../logic/settings'
import { sameRecord } from '../logic/records'
import { historySummary, reviewDue } from '../logic/summary'
import { SATISFACTION_TEXT, sortHistory, validateNote, type Satisfaction, type WishItem } from '../logic/wishlist'
import { Button } from '../ui/Button'
import { TextAreaField, TextField } from '../ui/Field'
import { useFocusFirstError } from '../ui/useFocusFirstError'
import { DeleteConfirm } from './WishlistScreen'

// PRD F03 결정 기록 + F08 메모, F12 필터·요약·구매 후 회고, F22 고민 효과
type Props = {
  items: WishItem[]
  now: Date
  hourlyWage: number | null
  onWageChange: (wage: number | null) => void
  onReview: (id: string, satisfaction: Satisfaction, note?: string) => void
  /** 다시 고민하기 (F18) */
  onReconsider: (id: string) => void
  onRemove: (id: string) => void
}
type Filter = 'all' | 'purchased' | 'skipped'

export function HistoryScreen({ items, now, hourlyWage, onWageChange, onReview, onReconsider, onRemove }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const remove = (id: string) => {
    onRemove(id)
    headingRef.current?.focus()
  }
  // 다시 고민하기로 카드가 결정 기록에서 사라지면 포커스를 화면 제목으로 옮긴다
  const reconsider = (id: string) => {
    onReconsider(id)
    headingRef.current?.focus()
  }
  const history = sortHistory(items)
  const purchased = history.filter((item) => item.status === 'purchased')
  const skipped = history.filter((item) => item.status === 'skipped')
  const shown = filter === 'all' ? history : filter === 'purchased' ? purchased : skipped
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: history.length },
    { key: 'purchased', label: '구매함', count: purchased.length },
    { key: 'skipped', label: '구매 포기', count: skipped.length },
  ]

  return (
    <div className="stack">
      <h2 className="screen-title" tabIndex={-1} ref={headingRef}>
        결정 기록
      </h2>
      {history.length === 0 ? (
        <div className="empty card">
          <p>아직 결정한 물건이 없어요.</p>
          <p className="note">고민 중인 물건에서 구매함·구매 포기를 고르면 여기에 쌓여요.</p>
        </div>
      ) : (
        <>
          <SummaryCard items={items} hourlyWage={hourlyWage} onWageChange={onWageChange} />
          <div className="btn-row filter-row" role="group" aria-label="결정 기록 필터">
            {filters.map(({ key, label, count }) => (
              <Button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label} ({count})
              </Button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="empty card">
              <p>이 조건의 기록이 없어요.</p>
            </div>
          ) : (
            <section className="stack" aria-label="결정 기록 목록">
              {shown.map((item) => (
                <HistoryCard key={item.id} item={item} now={now} onReview={onReview} onReconsider={reconsider} onRemove={remove} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

// 요약: 필터와 상관없이 전체 기록 기준. 구매 포기 금액은 등록 가격의 합이며 절약액이 아니다 (F12)
function SummaryCard({
  items,
  hourlyWage,
  onWageChange,
}: {
  items: WishItem[]
  hourlyWage: number | null
  onWageChange: (wage: number | null) => void
}) {
  const [wageRaw, setWageRaw] = useState(hourlyWage === null ? '' : String(hourlyWage))
  // 다른 탭에서 시급이 바뀌면 입력칸도 맞춘다. 지금 입력과 같은 값이면 그대로 둔다(입력 중 서식 유지)
  const [syncedWage, setSyncedWage] = useState(hourlyWage)
  if (hourlyWage !== syncedWage) {
    setSyncedWage(hourlyWage)
    const typed = validateWage(wageRaw)
    if (typed.error || (typed.value ?? null) !== hourlyWage) setWageRaw(hourlyWage === null ? '' : String(hourlyWage))
  }
  const checked = validateWage(wageRaw)
  const wage = checked.error ? null : (checked.value ?? null)
  const s = historySummary(items, wage)

  return (
    <section className="card stack" aria-label="결정 기록 요약">
      <div className="card-row">
        <p className="card-title">요약</p>
        <span className="note">전체 기록 기준{s.includesExample ? ' · 예시 포함' : ''}</span>
      </div>
      <ul className="result-list">
        <li>
          <span>구매 포기 {s.skippedCount}건</span>
          <span className="price">{formatWon(s.skippedTotal)}</span>
        </li>
      </ul>
      <p className="note">구매 포기 금액은 담을 때 적은 가격의 합이에요. 실제로 아낀 돈과는 다를 수 있어요.</p>
      {/* 고민 효과 (F22): 결정한 기록 중 고민하는 동안 갖고 싶은 정도가 줄어든 것이 있을 때만 */}
      {s.desireDropped > 0 ? (
        <p>{`고민하는 동안 갖고 싶은 정도가 줄어든 물건 ${s.desireDropped}개 중 ${s.desireDroppedSkipped}개를 안 샀어요`}</p>
      ) : null}
      <TextField
        label="시급 (선택)"
        inputMode="numeric"
        placeholder="원"
        value={wageRaw}
        error={checked.error}
        onChange={(e) => {
          const raw = e.target.value
          setWageRaw(raw)
          const next = validateWage(raw)
          if (!next.error) onWageChange(next.value ?? null)
        }}
      />
      {s.hoursLabel ? <p>입력한 시급으로 환산하면 약 {s.hoursLabel}시간</p> : null}
      {s.reviewedCount > 0 ? (
        <p>
          회고 {s.reviewedCount}건 중 후회 {s.regretCount}건
        </p>
      ) : null}
    </section>
  )
}

function HistoryCard({
  item,
  now,
  onReview,
  onReconsider,
  onRemove,
}: {
  item: WishItem
  now: Date
  onReview: (id: string, satisfaction: Satisfaction, note?: string) => void
  onReconsider: (id: string) => void
  onRemove: (id: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  // 다시 고민하기 확인 (F18): 취소하면 누른 버튼으로 포커스를 돌려보낸다
  const [reconsidering, setReconsidering] = useState(false)
  const reconsiderRef = useRef<HTMLButtonElement>(null)
  const returnToReconsider = useRef(false)
  useEffect(() => {
    if (!reconsidering && returnToReconsider.current) {
      reconsiderRef.current?.focus()
      returnToReconsider.current = false
    }
  }, [reconsidering])
  const [editingRetro, setEditingRetro] = useState(false)
  // 회고를 저장하거나 고치기를 취소하면 "회고 고치기" 버튼으로 포커스를 옮긴다 (누른 버튼·폼이 사라지므로)
  const retroRef = useRef<HTMLButtonElement>(null)
  const focusRetro = useRef(false)
  // 처음 회고를 고르거나 쓰기 시작했으면, 다른 탭이 먼저 회고를 저장해도 폼을 닫지 않는다(쓰던 내용을 말없이 버리지 않게)
  const [retroDirty, setRetroDirty] = useState(false)
  // 삭제 확인을 취소하면 삭제 버튼으로 포커스를 돌려보낸다
  const deleteRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (!confirming && returnFocus.current) {
      deleteRef.current?.focus()
      returnFocus.current = false
    }
  }, [confirming])
  const purchased = item.status === 'purchased'
  const answered = Boolean(item.satisfaction)
  const askRetro = reviewDue(item, now) && (!answered || editingRetro || retroDirty)
  useEffect(() => {
    if (focusRetro.current && retroRef.current) {
      retroRef.current.focus()
      focusRetro.current = false
    }
  }, [editingRetro, answered])

  return (
    <article className="card stack" aria-label={item.name}>
      <div className="card-row">
        <p className="card-title">{item.name}</p>
        <span className={purchased ? 'status' : 'status status-muted'}>{purchased ? '구매함' : '구매 포기'}</span>
      </div>
      <p className="price">{formatWon(item.priceKrw)}</p>
      <p className="card-meta">
        결정 {item.decidedAt ? formatDate(item.decidedAt) : '-'} · 담은 날 {formatDate(item.createdAt)}
        {item.url ? (
          <>
            {' · '}
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              상품 링크
            </a>
          </>
        ) : null}
      </p>
      <p>{item.reason}</p>
      {desirePointCount(item) >= 2 ? <p className="card-meta">{`갖고 싶은 정도: ${desireTrend(item)}`}</p> : null}
      {item.decisionNote ? (
        <>
          <p className="card-meta">결정 메모</p>
          <p>{item.decisionNote}</p>
        </>
      ) : null}

      {answered && !editingRetro && !retroDirty && item.satisfaction ? (
        <div className="card-row">
          <p>
            회고: {SATISFACTION_TEXT[item.satisfaction]}
            {item.reviewNote ? ` · ${item.reviewNote}` : ''}
          </p>
          <button type="button" className="link-btn" ref={retroRef} onClick={() => setEditingRetro(true)}>
            회고 고치기
          </button>
        </div>
      ) : null}
      {askRetro ? (
        <RetroForm
          item={item}
          autoFocus={editingRetro}
          onDirty={() => setRetroDirty(true)}
          onSave={(satisfaction, note) => {
            focusRetro.current = true
            onReview(item.id, satisfaction, note)
            setEditingRetro(false)
            setRetroDirty(false)
          }}
          onCancel={
            answered
              ? () => {
                  focusRetro.current = true
                  setEditingRetro(false)
                  setRetroDirty(false)
                }
              : undefined
          }
        />
      ) : null}

      {confirming ? (
        <DeleteConfirm
          name={item.name}
          onConfirm={() => onRemove(item.id)}
          onCancel={() => {
            returnFocus.current = true
            setConfirming(false)
          }}
        />
      ) : reconsidering ? (
        <div className="stack" role="group" aria-label="다시 고민하기 확인">
          <p className="field-label">
            {`‘${item.name}’${josa(item.name, '을/를')} 다시 고민 중으로 옮길까요?${item.decisionNote || item.satisfaction ? ' 결정 메모와 회고는 지워져요.' : ''}`}
          </p>
          <div className="btn-row">
            <Button variant="primary" autoFocus onClick={() => onReconsider(item.id)}>
              옮기기
            </Button>
            <Button
              onClick={() => {
                returnToReconsider.current = true
                setReconsidering(false)
              }}
            >
              취소
            </Button>
          </div>
        </div>
      ) : (
        <div className="card-actions">
          <button type="button" className="link-btn" ref={reconsiderRef} onClick={() => setReconsidering(true)}>
            다시 고민하기
          </button>
          <button type="button" className="link-btn" ref={deleteRef} onClick={() => setConfirming(true)}>
            삭제
          </button>
        </div>
      )}
    </article>
  )
}

// 구매 후 회고 (F12): 잘 샀다·그저 그렇다·후회한다 + 한 줄(선택, 200자)
function RetroForm({
  item,
  autoFocus,
  onDirty,
  onSave,
  onCancel,
}: {
  item: WishItem
  /** 사용자가 "회고 고치기"로 열었을 때만 고른 답(없으면 첫 선택지)으로 포커스를 옮긴다 */
  autoFocus?: boolean
  /** 답을 고르거나 한 줄 회고를 쓰기 시작했을 때 */
  onDirty?: () => void
  onSave: (satisfaction: Satisfaction, note?: string) => void
  onCancel?: () => void
}) {
  const [satisfaction, setSatisfaction] = useState<Satisfaction | undefined>(item.satisfaction)
  const [note, setNote] = useState(item.reviewNote ?? '')
  const [errors, setErrors] = useState<{ choice?: string; note?: string }>({})
  const choiceErrorId = useId()
  const groupRef = useRef<HTMLDivElement>(null)
  // 폼을 열 때의 기록. 저장할 때 내용이 바뀌었으면 다른 탭에서 고친 것이라 덮어쓰지 않는다
  const [opened] = useState(item)
  const [stale, setStale] = useState(false)
  const { ref: formRef, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  useEffect(() => {
    if (!autoFocus) return
    const group = groupRef.current
    ;(group?.querySelector<HTMLInputElement>('input:checked') ?? group?.querySelector<HTMLInputElement>('input'))?.focus()
  }, [autoFocus])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateNote(note)
    const next = { choice: satisfaction ? undefined : '잘 샀는지 하나를 골라 주세요', note: checked.error }
    setErrors(next)
    if (!satisfaction || checked.error) {
      focusFirstError()
      return
    }
    if (!sameRecord(item, opened)) {
      setStale(true)
      return
    }
    onSave(satisfaction, checked.value)
  }

  return (
    <form className="stack retro" aria-label="구매 후 회고" onSubmit={submit} noValidate ref={formRef}>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">잘 샀나요?</legend>
        <div className="radio-group" ref={groupRef}>
          {(Object.keys(SATISFACTION_TEXT) as Satisfaction[]).map((key) => (
            <label key={key}>
              <input
                type="radio"
                name={`retro-${item.id}`}
                checked={satisfaction === key}
                aria-invalid={errors.choice ? true : undefined}
                aria-describedby={errors.choice ? choiceErrorId : undefined}
                onChange={() => {
                  setSatisfaction(key)
                  setErrors((e) => ({ ...e, choice: undefined }))
                  onDirty?.()
                }}
              />{' '}
              {SATISFACTION_TEXT[key]}
            </label>
          ))}
        </div>
        {errors.choice ? (
          <p className="field-error" id={choiceErrorId}>
            {errors.choice}
          </p>
        ) : null}
      </fieldset>
      <TextAreaField
        label="한 줄 회고 (선택)"
        placeholder="예: 매일 써요 / 생각보다 안 써요"
        value={note}
        error={errors.note}
        onChange={(e) => {
          setNote(e.target.value)
          onDirty?.()
        }}
      />
      {stale ? (
        <p className="field-error" role="alert">
          다른 탭에서 이 기록이 바뀌었어요. 취소한 뒤 다시 열어 고쳐 주세요.
        </p>
      ) : null}
      <div className="btn-row">
        <Button variant="primary" type="submit">
          회고 저장
        </Button>
        {onCancel ? <Button onClick={onCancel}>취소</Button> : null}
      </div>
    </form>
  )
}
