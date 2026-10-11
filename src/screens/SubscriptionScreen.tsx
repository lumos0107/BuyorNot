import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatWon } from '../logic/number'
import { sameRecord } from '../logic/records'
import { usageText } from '../logic/usage'
import {
  daysUntil,
  isCancelCandidate,
  monthlyEquivalent,
  nextBillingDate,
  sortSubscriptions,
  subscriptionSummary,
  toDayIso,
  validateSubscriptionInput,
  type Cycle,
  type Subscription,
  type SubscriptionFieldErrors,
  type SubscriptionInput,
  type SubscriptionRawInput,
} from '../logic/subscriptions'
import type { StorageStatus } from '../store/useWishlist'
import { Button } from '../ui/Button'
import { TextAreaField, TextField } from '../ui/Field'
import { ResetConfirm } from '../ui/ResetConfirm'
import { useFocusFirstError } from '../ui/useFocusFirstError'
import { isExample } from '../logic/wishlist'
import { ExampleBar } from '../ui/ExampleBar'
import { DeleteConfirm } from './WishlistScreen'

// PRD F14 구독 정리함: 등록·목록(D-n 순)·해지 후보·요약·수정·삭제. 알림은 없고 화면의 D-n만 보여준다.
type Props = {
  items: Subscription[]
  today: Date
  status: StorageStatus
  onAdd: (input: SubscriptionInput) => void
  onEdit: (id: string, input: SubscriptionInput) => void
  onRemove: (id: string) => void
  onAddDemo: () => void
  onRemoveExamples: () => void
  onRetry: () => void
  onReset: () => void
  onDismiss: () => void
}

export function SubscriptionScreen({ items, today, status, onAdd, onEdit, onRemove, onAddDemo, onRemoveExamples, onRetry, onReset, onDismiss }: Props) {
  const sorted = sortSubscriptions(items, today)
  const s = subscriptionSummary(items, today)
  const exampleCount = items.filter((sub) => isExample(sub.name)).length
  // 삭제로 카드가 사라지면 포커스를 화면 제목으로 옮긴다
  const headingRef = useRef<HTMLHeadingElement>(null)
  const remove = (id: string) => {
    onRemove(id)
    headingRef.current?.focus()
  }
  return (
    <div className="stack">
      <h2 className="screen-title" tabIndex={-1} ref={headingRef}>
        구독
      </h2>
      <SubsBanner
        status={status}
        onRetry={onRetry}
        onReset={() => {
          onReset()
          headingRef.current?.focus()
        }}
        onDismiss={() => {
          onDismiss()
          headingRef.current?.focus()
        }}
      />
      {exampleCount > 0 ? (
        <ExampleBar
          label="예시 구독만 지우기"
          message={`예시 구독 ${exampleCount}개를 지울까요? 직접 넣은 구독은 그대로예요.`}
          onConfirm={() => {
            onRemoveExamples()
            headingRef.current?.focus()
          }}
        />
      ) : null}
      {items.length > 0 ? (
        <section className="card stack" aria-label="구독 요약">
          <p className="card-title">요약</p>
          <ul className="result-list">
            <li>
              <span>매달 나가는 돈</span>
              <span className="price">월 {formatWon(s.monthlyTotal)}</span>
            </li>
            <li>
              <span>1년이면</span>
              <span className="price">연 {formatWon(s.yearlyTotal)}</span>
            </li>
          </ul>
          {s.candidateCount > 0 ? (
            <p className="field-label">
              해지 후보 {s.candidateCount}개 · 월 {formatWon(s.candidateMonthly)}
            </p>
          ) : null}
          <p className="note">연 구독은 12로 나눈 값을 월에 더해 보여줘요. 연 합계는 실제 요금으로 계산해요.</p>
          {items.some((sub) => usageText(sub) !== null) ? (
            <p className="note">사용량은 아직 예시 구독에만 예시 숫자로 보여줘요. 실제 사용량은 휴대폰 앱으로 만들 때 연결할 계획이에요.</p>
          ) : null}
        </section>
      ) : null}
      <SubscriptionForm label="구독 담기" submitLabel="구독 추가" today={today} onSubmit={onAdd} resetAfterSubmit />
      {items.length === 0 ? (
        <div className="empty card stack">
          <p>아직 등록한 구독이 없어요.</p>
          <p className="note">OTT·음악·배달·쇼핑 멤버십처럼 매달 나가는 구독을 적어 두면 다음 결제일과 안 쓰는 구독을 보여줘요.</p>
          <Button onClick={onAddDemo}>예시 구독 넣기</Button>
        </div>
      ) : (
        <section className="stack" aria-label="구독 목록">
          {sorted.map((sub) => (
            <SubscriptionCard key={sub.id} sub={sub} today={today} onEdit={onEdit} onRemove={remove} />
          ))}
        </section>
      )}
    </div>
  )
}

function SubsBanner({
  status,
  onRetry,
  onReset,
  onDismiss,
}: {
  status: StorageStatus
  onRetry: () => void
  onReset: () => void
  onDismiss: () => void
}) {
  if (status.kind === 'ok') return null
  return (
    <div className="banner stack" role="status" aria-label="구독 저장 상태">
      {status.kind === 'unavailable' ? <p>이 브라우저에서는 구독을 저장할 수 없어요. 새로고침하면 사라져요.</p> : null}
      {status.kind === 'save-failed' ? (
        <>
          <p>구독을 저장하지 못했어요. 브라우저 저장 공간이나 설정을 확인한 뒤 다시 저장해 주세요.</p>
          <div className="btn-row">
            <Button onClick={onRetry}>다시 저장</Button>
          </div>
        </>
      ) : null}
      {status.kind === 'replaced' ? (
        <>
          <p>다른 탭에서 저장한 구독을 불러왔어요. 이 탭에서 저장하지 않은 변경은 반영되지 않았어요.</p>
          <div className="btn-row">
            <Button onClick={onDismiss}>확인</Button>
          </div>
        </>
      ) : null}
      {status.kind === 'corrupt' ? (
        <>
          <p>저장된 구독을 읽을 수 없어요. 초기화하기 전까지는 새로 넣은 구독이 저장되지 않아요.</p>
          <ResetConfirm
            label="구독 기록 초기화"
            note="초기화하면 읽을 수 없는 구독은 사라지고, 지금 화면의 구독만 저장돼요."
            onReset={onReset}
          />
        </>
      ) : null}
    </div>
  )
}

const EMPTY: SubscriptionRawInput = { name: '', price: '', cycle: 'monthly', billingDay: '', renewalDate: '', lastUsedDate: '', memo: '' }

// 연 구독은 저장한 기준일이 지났을 수 있으므로, 수정 폼에는 카드에 보이는 다음 갱신일을 채운다
function toRaw(sub: Subscription, nextRenewal: string): SubscriptionRawInput {
  return {
    name: sub.name,
    price: String(sub.priceKrw),
    cycle: sub.cycle,
    billingDay: sub.billingDay ? String(sub.billingDay) : '',
    renewalDate: sub.cycle === 'yearly' ? nextRenewal : '',
    lastUsedDate: sub.lastUsedDate ?? '',
    memo: sub.memo ?? '',
  }
}

function SubscriptionForm({
  label,
  submitLabel,
  today,
  initial = EMPTY,
  onSubmit,
  onCancel,
  resetAfterSubmit,
  autoFocus,
  keepRenewal,
  notice,
}: {
  label: string
  submitLabel: string
  today: Date
  initial?: SubscriptionRawInput
  onSubmit: (input: SubscriptionInput) => void
  onCancel?: () => void
  resetAfterSubmit?: boolean
  autoFocus?: boolean
  /** 수정 폼에 채워 둔 다음 갱신일. 그대로 두면 범위를 다시 따지지 않는다 */
  keepRenewal?: string
  /** 저장하지 못한 이유(다른 탭에서 바뀜 등) */
  notice?: string
}) {
  const [raw, setRaw] = useState<SubscriptionRawInput>(initial)
  const [attempted, setAttempted] = useState(false)
  const { ref: formRef, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const { value, errors } = validateSubscriptionInput(raw, today, keepRenewal)
  const shown: SubscriptionFieldErrors = attempted ? errors : {}
  const set = <K extends keyof SubscriptionRawInput>(key: K, v: SubscriptionRawInput[K]) => setRaw((r) => ({ ...r, [key]: v }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setAttempted(true)
      focusFirstError()
      return
    }
    onSubmit(value)
    if (resetAfterSubmit) {
      setRaw(EMPTY)
      setAttempted(false)
    }
  }

  return (
    <form className="card stack" aria-label={label} onSubmit={submit} noValidate ref={formRef}>
      <p className="card-title">{label}</p>
      <TextField label="구독 이름" autoFocus={autoFocus} placeholder="예: 넷플릭스, 배민클럽" maxLength={40} value={raw.name} error={shown.name} onChange={(e) => set('name', e.target.value)} />
      <TextField label="요금" inputMode="numeric" placeholder="원" value={raw.price} error={shown.price} onChange={(e) => set('price', e.target.value)} />
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">결제 주기</legend>
        <div className="radio-group">
          {([
            ['monthly', '매월'],
            ['yearly', '매년'],
          ] as [Cycle, string][]).map(([cycle, text]) => (
            <label key={cycle}>
              <input type="radio" name={`${label}-cycle`} checked={raw.cycle === cycle} onChange={() => set('cycle', cycle)} /> {text}
            </label>
          ))}
        </div>
      </fieldset>
      {raw.cycle === 'monthly' ? (
        <TextField
          label="결제일 (매월)"
          inputMode="numeric"
          placeholder="1~31"
          hint="31일처럼 없는 날은 그 달 말일로 계산해요"
          value={raw.billingDay}
          error={shown.billingDay}
          onChange={(e) => set('billingDay', e.target.value)}
        />
      ) : (
        <TextField
          label="다음 갱신일"
          type="date"
          min={toDayIso(today)}
          value={raw.renewalDate}
          error={shown.renewalDate}
          onChange={(e) => set('renewalDate', e.target.value)}
        />
      )}
      <TextField
        label="마지막 사용일 (선택)"
        type="date"
        max={toDayIso(today)}
        hint="비워 두거나 31일 이상 안 쓰면 해지 후보로 표시해요"
        value={raw.lastUsedDate}
        error={shown.lastUsedDate}
        onChange={(e) => set('lastUsedDate', e.target.value)}
      />
      <TextAreaField label="메모 (선택)" value={raw.memo} error={shown.memo} onChange={(e) => set('memo', e.target.value)} />
      {notice ? (
        <p className="field-error" role="alert">
          {notice}
        </p>
      ) : null}
      <div className="btn-row">
        <Button variant="primary" type="submit">
          {submitLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>취소</Button> : null}
      </div>
    </form>
  )
}

function SubscriptionCard({
  sub,
  today,
  onEdit,
  onRemove,
}: {
  sub: Subscription
  today: Date
  onEdit: (id: string, input: SubscriptionInput) => void
  onRemove: (id: string) => void
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view')
  // 수정·삭제 확인을 닫으면 연 버튼으로 포커스를 돌려보낸다
  const editRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<'edit' | 'delete' | null>(null)
  // 수정을 열 때의 기록과 채워 둔 다음 갱신일. 저장할 때 내용이 바뀌었으면 다른 탭에서 고친 것이다
  const [editBase, setEditBase] = useState<{ sub: Subscription; renewal: string } | null>(null)
  const [stale, setStale] = useState(false)
  useEffect(() => {
    if (mode !== 'view' || !returnTo.current) return
    ;(returnTo.current === 'edit' ? editRef : deleteRef).current?.focus()
    returnTo.current = null
  }, [mode])
  const close = (from: 'edit' | 'delete') => {
    returnTo.current = from
    setMode('view')
  }
  const next = nextBillingDate(sub, today)
  const dday = daysUntil(next, today)
  const candidate = isCancelCandidate(sub, today)
  const usage = usageText(sub)
  const priceText =
    sub.cycle === 'monthly' ? `월 ${formatWon(sub.priceKrw)}` : `연 ${formatWon(sub.priceKrw)} · 월 ${formatWon(monthlyEquivalent(sub))}`

  if (mode === 'edit') {
    const base = editBase ?? { sub, renewal: next }
    return (
      <article className="card stack" aria-label={sub.name}>
        <SubscriptionForm
          label="구독 수정"
          submitLabel="저장"
          today={today}
          initial={toRaw(sub, base.renewal)}
          keepRenewal={sub.cycle === 'yearly' ? base.renewal : undefined}
          notice={stale ? '다른 탭에서 이 구독이 바뀌었어요. 취소한 뒤 다시 열어 고쳐 주세요.' : undefined}
          autoFocus
          onSubmit={(input) => {
            if (!sameRecord(sub, base.sub)) {
              setStale(true)
              return
            }
            // 다음 갱신일을 바꾸지 않았으면 원래 기준일을 유지한다 (2월 29일 같은 기준을 잃지 않게)
            const keepBase = sub.cycle === 'yearly' && input.cycle === 'yearly' && input.renewalDate === base.renewal
            onEdit(sub.id, keepBase ? { ...input, renewalDate: sub.renewalDate } : input)
            close('edit')
          }}
          onCancel={() => close('edit')}
        />
      </article>
    )
  }

  return (
    <article className="card stack" aria-label={sub.name}>
      <div className="card-row">
        <p className="card-title">{sub.name}</p>
        {candidate ? <span className="status status-warn">해지 후보</span> : null}
      </div>
      <p className="price">{priceText}</p>
      <p className="card-meta">
        다음 결제 {next} · D-{dday}
      </p>
      <p className="card-meta">{sub.lastUsedDate ? `마지막 사용 ${sub.lastUsedDate}` : '사용 기록 없음'}</p>
      {usage ? <p className="card-meta">사용량(예시): {usage}</p> : null}
      {sub.memo ? <p>{sub.memo}</p> : null}
      {mode === 'confirm-delete' ? (
        <DeleteConfirm name={sub.name} onConfirm={() => onRemove(sub.id)} onCancel={() => close('delete')} />
      ) : (
        <div className="card-actions">
          <button
            type="button"
            className="link-btn"
            ref={editRef}
            onClick={() => {
              setEditBase({ sub, renewal: next })
              setStale(false)
              setMode('edit')
            }}
          >
            수정
          </button>
          <button type="button" className="link-btn" ref={deleteRef} onClick={() => setMode('confirm-delete')}>
            삭제
          </button>
        </div>
      )}
    </article>
  )
}
