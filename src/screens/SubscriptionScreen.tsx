import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatWon } from '../logic/number'
import { sameRecord } from '../logic/records'
import { netflixRecord, parseNetflixCsv, type DayOrder } from '../logic/netflixCsv'
import { usageInfo, validateUsageInput } from '../logic/usage'
import { describeRecord, type UsageRecord } from '../logic/usageRecords'
import {
  type UsageEntry,
  daysUntil,
  isCancelCandidate,
  lastUsedOf,
  needsUsageCheck,
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
  /** "오늘 썼어요" (F19) */
  onToggleUse: (id: string) => void
  /** 사용량 적기·지우기 (F25) */
  onSetUsage: (id: string, input: Pick<UsageEntry, 'kind' | 'value'> | null) => void
  /** 이용 기록 가져오기 (F26) */
  onImportUsage: (id: string, record: UsageRecord) => void
  onRetry: () => void
  onReset: () => void
  onDismiss: () => void
}

export function SubscriptionScreen({ items, today, status, onAdd, onEdit, onRemove, onAddDemo, onRemoveExamples, onToggleUse, onSetUsage, onImportUsage, onRetry, onReset, onDismiss }: Props) {
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
          message={`이름이 '(예시)'로 시작하는 구독 ${exampleCount}개를 지울까요?`}
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
          {/* 사용 기록이 없으면 안 쓰는지 알 수 없어 해지 후보로 세지 않는다 (F23) */}
          {s.unknownCount > 0 ? (
            <p className="note">{`사용 기록이 없는 구독 ${s.unknownCount}개는 마지막으로 쓴 날을 적거나 '오늘 썼어요'를 누르면 해지 후보인지 알려 줘요.`}</p>
          ) : null}
          <p className="note">연 구독은 12로 나눈 값을 월에 더해 보여줘요. 연 합계는 실제 요금으로 계산해요.</p>
          {items.some((sub) => usageInfo(sub, today)?.source === 'example') ? (
            <p className="note">(예시)는 시연용 숫자예요. '오늘 썼어요'를 누르면 직접 기록한 횟수로 바뀌어요. 자동 연동은 휴대폰 앱으로 만들 때 할 계획이에요.</p>
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
            <SubscriptionCard key={sub.id} sub={sub} today={today} onEdit={onEdit} onRemove={remove} onToggleUse={onToggleUse} onSetUsage={onSetUsage} onImportUsage={onImportUsage} />
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
        hint="31일 이상 안 쓰면 해지 후보로 표시해요. 비워 두고 '오늘 썼어요' 기록도 없으면 '확인 필요'로 보여요"
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
  onToggleUse,
  onSetUsage,
  onImportUsage,
}: {
  sub: Subscription
  today: Date
  onEdit: (id: string, input: SubscriptionInput) => void
  onRemove: (id: string) => void
  onToggleUse: (id: string) => void
  onSetUsage: (id: string, input: Pick<UsageEntry, 'kind' | 'value'> | null) => void
  onImportUsage: (id: string, record: UsageRecord) => void
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view')
  // 사용량 적기 폼 (F25). 닫으면 연 버튼으로 포커스를 돌려보낸다
  const [usageOpen, setUsageOpen] = useState(false)
  // 이용 기록 가져오기 (F26). 닫으면 연 버튼으로 포커스를 돌려보낸다
  const [importOpen, setImportOpen] = useState(false)
  const importRef = useRef<HTMLButtonElement>(null)
  const closeImport = () => {
    setImportOpen(false)
    queueMicrotask(() => importRef.current?.focus())
  }
  const usageRef = useRef<HTMLButtonElement>(null)
  const closeUsage = () => {
    setUsageOpen(false)
    // 폼이 사라진 뒤 버튼으로 (같은 버튼의 이름이 '사용량 다시 적기'로 바뀔 수 있다)
    queueMicrotask(() => usageRef.current?.focus())
  }
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
  const usage = usageInfo(sub, today)
  const lastUsed = lastUsedOf(sub)
  const usedToday = sub.useDates?.includes(toDayIso(today)) ?? false
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
        {candidate ? (
          <span className="status status-warn">해지 후보</span>
        ) : needsUsageCheck(sub) ? (
          <span className="status status-muted">확인 필요</span>
        ) : null}
      </div>
      <p className="price">{priceText}</p>
      <p className="card-meta">
        다음 결제 {next} · D-{dday}
      </p>
      <p className="card-meta">{lastUsed ? `마지막 사용 ${lastUsed}` : '사용 기록 없음'}</p>
      {usage ? <p className="card-meta">{`사용량(${usageLabel(usage)}): ${usage.text}`}</p> : null}
      {(sub.usageRecords ?? []).map((record) => (
        <p key={record.source} className="card-meta">
          {describeRecord(record, today)}
        </p>
      ))}
      {sub.memo ? <p>{sub.memo}</p> : null}
      <div className="btn-row">
        <Button aria-pressed={usedToday} onClick={() => onToggleUse(sub.id)}>
          오늘 썼어요
        </Button>
        <Button ref={usageRef} aria-expanded={usageOpen} onClick={() => setUsageOpen(true)}>
          {sub.usageEntry ? '사용량 다시 적기' : '사용량 적기'}
        </Button>
      </div>
      {usageOpen ? (
        <UsageEntryForm
          sub={sub}
          onSave={(input) => {
            onSetUsage(sub.id, input)
            closeUsage()
          }}
          onCancel={closeUsage}
        />
      ) : null}
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
          <button type="button" className="link-btn" ref={importRef} aria-expanded={importOpen} onClick={() => setImportOpen(true)}>
            이용 기록 가져오기
          </button>
        </div>
      )}
      {importOpen ? (
        <UsageImport
          sub={sub}
          onImport={(record) => {
            onImportUsage(sub.id, record)
            closeImport()
          }}
          onCancel={closeImport}
        />
      ) : null}
    </article>
  )
}

// 사용량 표시 이름 (F16·F19·F25)
function usageLabel(usage: NonNullable<ReturnType<typeof usageInfo>>): string {
  if (usage.source === 'entered') {
    const [, month, day] = usage.day.split('-').map(Number)
    return `${month}/${day}에 적음${usage.stale ? ' · 다시 적어 주세요' : ''}`
  }
  return usage.source === 'manual' ? '직접 기록' : '예시'
}

// 사용량 적기 (F25): 스크린 타임·주문 내역에서 본 최근 30일 사용 시간(시간) 또는 횟수(번)를 적는다
function UsageEntryForm({
  sub,
  onSave,
  onCancel,
}: {
  sub: Subscription
  /** null이면 적은 사용량을 지운다 */
  onSave: (input: Pick<UsageEntry, 'kind' | 'value'> | null) => void
  onCancel: () => void
}) {
  const entry = sub.usageEntry
  const [kind, setKind] = useState<UsageEntry['kind']>(entry?.kind ?? (sub.exampleUseCount !== undefined ? 'count' : 'minutes'))
  const [raw, setRaw] = useState(entry ? String(entry.kind === 'minutes' ? Math.round((entry.value / 60) * 10) / 10 : entry.value) : '')
  const [error, setError] = useState<string | undefined>()
  const { ref, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateUsageInput(kind, raw)
    if (checked.error || checked.value === undefined) {
      setError(checked.error)
      focusFirstError()
      return
    }
    onSave({ kind, value: checked.value })
  }
  return (
    <form className="stack" aria-label="사용량 적기" onSubmit={submit} noValidate ref={ref}>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">무엇으로 적을까요?</legend>
        <div className="radio-group">
          {(
            [
              ['minutes', '사용 시간'],
              ['count', '사용 횟수'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name={`usage-kind-${sub.id}`}
                checked={kind === value}
                onChange={() => {
                  setKind(value)
                  setError(undefined)
                }}
              />{' '}
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <TextField
        label={kind === 'minutes' ? '최근 30일 사용 시간 (시간)' : '최근 30일 사용 횟수 (번)'}
        inputMode={kind === 'minutes' ? 'decimal' : 'numeric'}
        hint="스크린 타임(디지털 웰빙)에서 본 최근 30일 사용 시간이나, 배달·쇼핑 앱 주문 내역에서 센 횟수를 적어 주세요."
        autoFocus
        value={raw}
        error={error}
        onChange={(e) => {
          setRaw(e.target.value)
          setError(undefined)
        }}
      />
      <div className="btn-row">
        <Button variant="primary" type="submit">
          저장
        </Button>
        {entry ? <Button onClick={() => onSave(null)}>지우기</Button> : null}
        <Button onClick={onCancel}>취소</Button>
      </div>
    </form>
  )
}

// 이용 기록 가져오기 (F26 13-3): 파일 선택 → 브라우저 안에서 읽기 → 미리보기 → 확인 → 저장.
// 지금은 넷플릭스 시청 기록 CSV만. 파일과 제목은 저장하지 않고 날짜별 기록 수만 남긴다
const MAX_USAGE_FILE_BYTES = 5 * 1024 * 1024
const IMPORT_ERROR = {
  format: '넷플릭스 시청 기록 파일이 아니에요. 첫 줄이 Title,Date(또는 제목,날짜)인 CSV인지 확인해 주세요.',
  empty: '파일에 시청 기록이 없어요.',
  'no-dates': '날짜를 하나도 읽지 못했어요. 넷플릭스에서 받은 파일 그대로인지 확인해 주세요.',
  size: '파일이 너무 커요. 5MB 이하의 시청 기록 파일을 골라 주세요.',
  read: '파일을 읽지 못했어요. 다시 골라 주세요.',
} as const

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function UsageImport({ sub, onImport, onCancel }: { sub: Subscription; onImport: (record: UsageRecord) => void; onCancel: () => void }) {
  const inputId = `usage-file-${sub.id}`
  const errorId = `usage-file-error-${sub.id}`
  const [text, setText] = useState<string | null>(null)
  const [order, setOrder] = useState<DayOrder | undefined>()
  const [error, setError] = useState<string | null>(null)
  // 파일을 연달아 고르면 마지막 선택만 반영한다
  const readSeq = useRef(0)
  const parsed = text === null ? null : parseNetflixCsv(text, order)
  const shownError = error ?? (parsed && !parsed.ok ? IMPORT_ERROR[parsed.reason] : null)
  const replacing = (sub.usageRecords ?? []).some((record) => record.source === 'netflix-csv')

  const choose = async (file: File | undefined) => {
    const seq = ++readSeq.current
    setText(null)
    setOrder(undefined)
    setError(null)
    if (!file) return
    if (file.size > MAX_USAGE_FILE_BYTES) {
      setError(IMPORT_ERROR.size)
      return
    }
    const content = await readFileText(file).catch(() => null)
    if (seq !== readSeq.current) return
    if (content === null) setError(IMPORT_ERROR.read)
    else setText(content)
  }

  // 미리보기는 행에서 바로 센다. 가져온 시각은 가져오기를 누를 때 정한다
  const days = parsed && parsed.ok ? [...new Set(parsed.rows.map((row) => row.day))].sort() : []

  return (
    <section className="stack import-panel" aria-label="이용 기록 가져오기">
      <p className="note">
        지금은 넷플릭스 시청 기록 파일(CSV)만 가져올 수 있어요. PC 브라우저에서 넷플릭스 계정 → 프로필 → 시청 기록 → 모두 다운로드로 받은 파일이에요. 파일은 이 기기 안에서만 읽고, 제목은 저장하지 않아요.
      </p>
      <div className="field">
        <label className="field-label" htmlFor={inputId}>
          시청 기록 파일 (CSV)
        </label>
        <input
          id={inputId}
          className="file-input"
          type="file"
          accept=".csv,text/csv"
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? errorId : undefined}
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        {shownError ? (
          <p id={errorId} className="field-error" role="alert">
            {shownError}
          </p>
        ) : null}
      </div>
      {parsed && parsed.ok && days.length > 0 ? (
        <div className="stack" role="group" aria-label="가져오기 미리보기">
          <p>{`넷플릭스 시청 기록 · 기록 ${parsed.rows.length}개${parsed.merged > 0 ? ` (같은 날 같은 제목 ${parsed.merged}개 합침)` : ''}`}</p>
          <p>{`기간 ${days[0]} ~ ${days[days.length - 1]} · 이용 일수 ${days.length}일`}</p>
          {parsed.skipped > 0 ? <p className="note">{`날짜를 읽지 못한 줄 ${parsed.skipped}개는 빼요.`}</p> : null}
          {parsed.ambiguous ? (
            <div className="example-bar">
              <span className="note">{`날짜를 ${parsed.order === 'md' ? '월/일' : '일/월'} 순서로 읽었어요.`}</span>
              <button type="button" className="link-btn" onClick={() => setOrder(parsed.order === 'md' ? 'dm' : 'md')}>
                {parsed.order === 'md' ? '일/월로 다시 읽기' : '월/일로 다시 읽기'}
              </button>
            </div>
          ) : null}
          <p className="field-label">{replacing ? '이 구독의 넷플릭스 시청 기록을 이 파일로 바꿀까요?' : '이 구독에 이 기록을 저장할까요?'}</p>
          <div className="btn-row">
            <Button variant="primary" onClick={() => onImport(netflixRecord(parsed.rows, new Date()))}>
              가져오기
            </Button>
            <Button onClick={onCancel}>취소</Button>
          </div>
        </div>
      ) : (
        <div className="btn-row">
          <Button onClick={onCancel}>취소</Button>
        </div>
      )}
    </section>
  )
}
