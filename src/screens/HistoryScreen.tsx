import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatDate } from '../logic/dates'
import { formatWon } from '../logic/number'
import { validateWage } from '../logic/settings'
import { historySummary, reviewDue } from '../logic/summary'
import { sortHistory, validateNote, type Satisfaction, type WishItem } from '../logic/wishlist'
import { Button } from '../ui/Button'
import { TextAreaField, TextField } from '../ui/Field'
import { DeleteConfirm } from './WishlistScreen'

// PRD F03 결정 기록 + F08 메모, F12 필터·요약·구매 후 회고
type Props = {
  items: WishItem[]
  now: Date
  hourlyWage: number | null
  onWageChange: (wage: number | null) => void
  onReview: (id: string, satisfaction: Satisfaction, note?: string) => void
  onRemove: (id: string) => void
}
type Filter = 'all' | 'purchased' | 'skipped'

const SATISFACTION_TEXT: Record<Satisfaction, string> = {
  good: '잘 샀어요',
  meh: '그저 그래요',
  regret: '후회해요',
}

export function HistoryScreen({ items, now, hourlyWage, onWageChange, onReview, onRemove }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const remove = (id: string) => {
    onRemove(id)
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
                <HistoryCard key={item.id} item={item} now={now} onReview={onReview} onRemove={remove} />
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
  onRemove,
}: {
  item: WishItem
  now: Date
  onReview: (id: string, satisfaction: Satisfaction, note?: string) => void
  onRemove: (id: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [editingRetro, setEditingRetro] = useState(false)
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
  const askRetro = reviewDue(item, now) && (!answered || editingRetro)

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
      {item.decisionNote ? (
        <>
          <p className="card-meta">결정 메모</p>
          <p>{item.decisionNote}</p>
        </>
      ) : null}

      {answered && !editingRetro && item.satisfaction ? (
        <div className="card-row">
          <p>
            회고: {SATISFACTION_TEXT[item.satisfaction]}
            {item.reviewNote ? ` · ${item.reviewNote}` : ''}
          </p>
          <button type="button" className="link-btn" onClick={() => setEditingRetro(true)}>
            회고 고치기
          </button>
        </div>
      ) : null}
      {askRetro ? (
        <RetroForm
          item={item}
          onSave={(satisfaction, note) => {
            onReview(item.id, satisfaction, note)
            setEditingRetro(false)
          }}
          onCancel={answered ? () => setEditingRetro(false) : undefined}
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
      ) : (
        <div className="card-actions">
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
  onSave,
  onCancel,
}: {
  item: WishItem
  onSave: (satisfaction: Satisfaction, note?: string) => void
  onCancel?: () => void
}) {
  const [satisfaction, setSatisfaction] = useState<Satisfaction | undefined>(item.satisfaction)
  const [note, setNote] = useState(item.reviewNote ?? '')
  const [errors, setErrors] = useState<{ choice?: string; note?: string }>({})

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateNote(note)
    const next = { choice: satisfaction ? undefined : '잘 샀는지 하나를 골라 주세요', note: checked.error }
    setErrors(next)
    if (!satisfaction || checked.error) return
    onSave(satisfaction, checked.value)
  }

  return (
    <form className="stack retro" aria-label="구매 후 회고" onSubmit={submit} noValidate>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">잘 샀나요?</legend>
        <div className="radio-group">
          {(Object.keys(SATISFACTION_TEXT) as Satisfaction[]).map((key) => (
            <label key={key}>
              <input
                type="radio"
                name={`retro-${item.id}`}
                checked={satisfaction === key}
                onChange={() => {
                  setSatisfaction(key)
                  setErrors((e) => ({ ...e, choice: undefined }))
                }}
              />{' '}
              {SATISFACTION_TEXT[key]}
            </label>
          ))}
        </div>
        {errors.choice ? <p className="field-error">{errors.choice}</p> : null}
      </fieldset>
      <TextAreaField
        label="한 줄 회고 (선택)"
        placeholder="예: 매일 써요 / 생각보다 안 써요"
        value={note}
        error={errors.note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="btn-row">
        <Button variant="primary" type="submit">
          회고 저장
        </Button>
        {onCancel ? <Button onClick={onCancel}>취소</Button> : null}
      </div>
    </form>
  )
}
