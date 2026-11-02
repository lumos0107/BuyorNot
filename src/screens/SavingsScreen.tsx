import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  GOAL_EMPTY_NOTE,
  GOAL_STALE,
  NOTE_MOVED,
  NOTE_REDUCED,
  NOTE_LOWERED,
  NOTE_SEPARATE,
  NOTE_SKIPPED,
  SAVINGS_EMPTY,
  TRANSFER_DELETE_CONFIRM,
  TRANSFER_FULL,
  TRANSFER_INTRO,
  TRANSFER_MAX,
  createTransfer,
  editGoal,
  goalDeleteConfirm,
  goalLines,
  goalProgress,
  isSavingsEmpty,
  movedLabel,
  newGoal,
  reducedLabel,
  savingsNumbers,
  skippedLabel,
  sortTransfers,
  transferDeleteName,
  transferLine,
  transferSavedMessage,
  validateGoalInput,
  validateTransferInput,
  type Goal,
  type GoalFieldErrors,
  type GoalRawInput,
  type GoalValue,
  type Transfer,
  type TransferFieldErrors,
  type TransferRawInput,
} from '../logic/savings'
import { formatWon } from '../logic/number'
import { pantryAvoidedTotals, type PantryStore } from '../logic/pantry'
import { resaleTotal, returnedAmount } from '../logic/afterBuy'
import { programIncome, type BenefitsStore } from '../logic/benefits'
import { skippedSpendingTotal } from '../logic/spending'
import type { useSpending } from '../store/useSpending'
import { sameRecord } from '../logic/records'
import { toDayIso, yearsLater, type Subscription } from '../logic/subscriptions'
import { newId, type WishItem } from '../logic/wishlist'
import type { useSavings } from '../store/useSavings'
import type { StorageStatus } from '../store/useWishlist'
import { Button } from '../ui/Button'
import { TextField } from '../ui/Field'
import { ResetConfirm } from '../ui/ResetConfirm'
import { useFocusFirstError } from '../ui/useFocusFirstError'

// PRD F48 모으기: 줄어든 고정비·참은 구매·옮긴 돈을 따로 보이고 더하지 않는다. 저축 목표는 옮긴 돈으로만 채운다.
// 성공 안내와 폼 비우기는 저장이 화면에 반영됐을 때만 한다(다른 탭 기록을 불러왔으면 입력을 그대로 두고 저장 안내만 보인다)
type Props = {
  items: readonly WishItem[]
  subscriptions: readonly Subscription[]
  savings: ReturnType<typeof useSavings>
  pantry: PantryStore
  spending: ReturnType<typeof useSpending>
  benefits?: BenefitsStore
  benefitsPanel?: ReactNode
  today: Date
}

export function SavingsScreen({ items, subscriptions, savings, pantry, spending, benefits, benefitsPanel, today }: Props) {
  // 저장 안내가 사라지면 포커스를 화면 제목으로 옮긴다
  const headingRef = useRef<HTMLHeadingElement>(null)
  const n = savingsNumbers(items, subscriptions, savings.store)
  const avoided = pantryAvoidedTotals(pantry.events)
  const smallSkipped = skippedSpendingTotal(spending.store.entries)
  const returned = returnedAmount(items)
  const resale = resaleTotal(items)
  const receivedSupport = programIncome(benefits?.programs ?? [])
  const hasOriginalNumbers = !isSavingsEmpty(n)
  // 기록을 지우면 화면 제목으로 포커스를 옮긴다. 다른 탭 기록을 불러와 반영되지 않았으면 옮기지 않는다
  const removeTransfer = (id: string): boolean => {
    const reflected = savings.removeTransfer(id)
    if (reflected) headingRef.current?.focus()
    return reflected
  }

  return (
    <div className="stack">
      <h2 className="screen-title" tabIndex={-1} ref={headingRef}>
        모으기
      </h2>
      <SavingsBanner
        status={savings.status}
        onRetry={savings.retrySave}
        onReset={() => {
          savings.resetStorage()
          headingRef.current?.focus()
        }}
        onDismiss={() => {
          savings.dismissNotice()
          headingRef.current?.focus()
        }}
      />
      {!hasOriginalNumbers && avoided.cookedCount + avoided.stockCount + smallSkipped.count + returned.count + resale.count + receivedSupport === 0 ? (
        <p>{SAVINGS_EMPTY}</p>
      ) : hasOriginalNumbers ? (
        <section className="card stack" aria-label="모으기 요약">
          <div className="card-row">
            <p className="card-title">지금까지</p>
            <span className="note">전체 기록 기준{n.includesExample ? ' · 예시 포함' : ''}</span>
          </div>
          <ul className="result-list">
            <li>
              <span>{reducedLabel(n)}</span>
              <span className="price">{`월 ${formatWon(n.reducedMonthly)}`}</span>
            </li>
            <li>
              <span>{skippedLabel(n)}</span>
              <span className="price">{formatWon(n.skippedTotal)}</span>
            </li>
            <li>
              <span>{movedLabel(n)}</span>
              <span className="price">{formatWon(n.movedTotal)}</span>
            </li>
          </ul>
          <p className="note">{NOTE_REDUCED}</p>
          {n.loweredCount > 0 ? <p className="note">{NOTE_LOWERED}</p> : null}
          <p className="note">{NOTE_SKIPPED}</p>
          <p className="note">{NOTE_MOVED}</p>
          <p className="note">{NOTE_SEPARATE}</p>
        </section>
      ) : null}
      {avoided.cookedCount > 0 || avoided.stockCount > 0 ? <section className="card stack" aria-label="직접 적은 대체 금액">
        <p className="card-title">직접 적은 대체 금액</p>
        {avoided.cookedCount > 0 ? <p className="card-row"><span>해 먹었다고 적은 금액</span><span className="price">{formatWon(avoided.cookedKrw)}</span></p> : null}
        {avoided.stockCount > 0 ? <p className="card-row"><span>있어서 안 샀다고 적은 금액</span><span className="price">{formatWon(avoided.stockKrw)}</span></p> : null}
        {avoided.cookedCount > 0 ? <p className="note">해 먹었다고 적은 금액은 배달 대신 썼을 금액을 직접 적은 값이에요. 실제로 모은 돈은 아니에요.</p> : null}
        {avoided.stockCount > 0 ? <p className="note">있어서 안 샀다고 적은 금액은 마지막으로 산 값이에요. 실제로 모은 돈은 아니에요.</p> : null}
      </section> : null}
      {smallSkipped.count > 0 ? <section className="card stack" aria-label="참았다고 적은 작은 지출">
        <p className="card-row"><span>참았다고 적은 작은 지출</span><span className="price">{formatWon(smallSkipped.amountKrw)}</span></p>
        <p className="note">참았다고 적은 금액은 실제로 옮긴 돈이 아니에요.</p>
      </section> : null}
      {returned.count > 0 ? <section className="card stack" aria-label="반품했다고 적은 금액">
        <p className="card-row"><span>반품했다고 적은 금액</span><span className="price">{formatWon(returned.amountKrw)}</span></p>
        <p className="note">반품했다고 적은 금액은 실제 환불을 확인한 금액이 아니에요.</p>
      </section> : null}
      {resale.count > 0 || receivedSupport > 0 ? <section className="card stack" aria-label="생긴 돈">
        <p className="card-row"><span>생긴 돈</span><span className="price">{formatWon(resale.amountKrw + receivedSupport)}</span></p>
        {resale.count > 0 ? <p className="note">판 금액은 실제 입금을 확인한 금액이 아니에요.</p> : null}
        {receivedSupport > 0 ? <p className="note">직접 적은 받은 지원금 {formatWon(receivedSupport)} · 옮긴 돈과는 따로 보여요.</p> : null}
      </section> : null}
      {benefitsPanel}
      <GoalCard goal={savings.store.goal} transfers={savings.store.transfers} today={today} onSet={savings.setGoal} onClear={savings.clearGoal} />
      <TransferForm today={today} transfers={savings.store.transfers} onAdd={savings.addTransfer} />
      <TransferLog transfers={savings.store.transfers} onRemove={removeTransfer} onLostFocus={() => headingRef.current?.focus()} />
    </div>
  )
}

type GoalMode = 'view' | 'create' | 'edit' | 'confirm-delete'

// 저축 목표 카드: 없으면 안내와 "목표 정하기", 있으면 진행과 고치기·지우기
function GoalCard({
  goal,
  transfers,
  today,
  onSet,
  onClear,
}: {
  goal: Goal | null
  transfers: readonly Transfer[]
  today: Date
  /** 둘 다 화면에 반영됐는지 돌려준다 */
  onSet: (goal: Goal) => boolean
  onClear: () => boolean
}) {
  const [mode, setMode] = useState<GoalMode>('view')
  // 고치기 폼을 열 때의 목표. 저장할 때 내용이 바뀌었으면 다른 탭에서 고친 것이다
  const [opened, setOpened] = useState<Goal | null>(null)
  const [stale, setStale] = useState(false)
  const titleRef = useRef<HTMLParagraphElement>(null)
  const createRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  // 폼·확인을 취소하면 연 버튼으로 포커스를 돌려보낸다
  const returnTo = useRef<'create' | 'edit' | 'delete' | null>(null)
  useEffect(() => {
    if (mode !== 'view' || !returnTo.current) return
    ;(returnTo.current === 'create' ? createRef : returnTo.current === 'edit' ? editRef : deleteRef).current?.focus()
    returnTo.current = null
  }, [mode])
  const close = (from: 'create' | 'edit' | 'delete') => {
    returnTo.current = from
    setMode('view')
  }
  // 저장·지우기가 반영되면 카드 제목으로 포커스를 옮긴다
  const done = () => {
    setMode('view')
    titleRef.current?.focus()
  }
  // 다른 탭이 목표를 정하거나 지워 폼이 어긋나면 폼 대신 지금 상태를 보인다(그 위에 덮어쓰지 않게)
  const shown: GoalMode = mode === 'create' && goal ? 'view' : (mode === 'edit' || mode === 'confirm-delete') && !goal ? 'view' : mode
  // 폼·확인이 그렇게 사라졌으면 모드도 보기로 되돌린다(나중에 다른 탭이 목표를 또 바꿔도 폼이 저절로 다시 열리지 않게)
  if (shown !== mode) setMode('view')
  // 폼·확인이 닫힌 뒤 포커스가 갈 곳을 잃고 body로 빠졌으면 카드 제목으로 옮긴다
  const prevMode = useRef<GoalMode>('view')
  useEffect(() => {
    const was = prevMode.current
    prevMode.current = mode
    if (mode === 'view' && was !== 'view' && (document.activeElement === document.body || document.activeElement === null)) titleRef.current?.focus()
  }, [mode])

  return (
    <section className="card stack" aria-label="저축 목표">
      <p className="card-title" tabIndex={-1} ref={titleRef}>
        저축 목표
      </p>
      {shown === 'create' ? (
        <GoalForm
          label="저축 목표 정하기"
          initial={{ name: '', target: '', targetDate: '' }}
          today={today}
          onSubmit={(value) => {
            if (onSet(newGoal(value, today, new Date()))) done()
          }}
          onCancel={() => close('create')}
        />
      ) : shown === 'edit' && goal && opened ? (
        <GoalForm
          label="저축 목표 고치기"
          initial={{ name: opened.name, target: String(opened.targetKrw), targetDate: opened.targetDate ?? '' }}
          keepDate={opened.targetDate}
          stale={stale}
          today={today}
          onSubmit={(value) => {
            if (!sameRecord(goal, opened)) {
              setStale(true)
              return
            }
            if (onSet(editGoal(goal, value, new Date()))) {
              setOpened(null)
              done()
            }
          }}
          onCancel={() => close('edit')}
        />
      ) : goal ? (
        <GoalView goal={goal} transfers={transfers} today={today}>
          {shown === 'confirm-delete' ? (
            <div className="stack" role="group" aria-label="목표 지우기 확인">
              <p className="field-label">{goalDeleteConfirm(goal)}</p>
              <div className="btn-row">
                <Button
                  variant="danger"
                  autoFocus
                  onClick={() => {
                    if (onClear()) done()
                    else close('delete')
                  }}
                >
                  지우기
                </Button>
                <Button onClick={() => close('delete')}>취소</Button>
              </div>
            </div>
          ) : (
            <div className="btn-row">
              <Button
                ref={editRef}
                onClick={() => {
                  setOpened(goal)
                  setStale(false)
                  setMode('edit')
                }}
              >
                목표 고치기
              </Button>
              <Button ref={deleteRef} onClick={() => setMode('confirm-delete')}>
                목표 지우기
              </Button>
            </div>
          )}
        </GoalView>
      ) : (
        <>
          <p className="note">{GOAL_EMPTY_NOTE}</p>
          <div className="btn-row">
            <Button ref={createRef} onClick={() => setMode('create')}>
              목표 정하기
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function GoalView({ goal, transfers, today, children }: { goal: Goal; transfers: readonly Transfer[]; today: Date; children: ReactNode }) {
  const lines = goalLines(goal, transfers, today)
  return (
    <>
      <p>{lines.head}</p>
      <progress className="goal-progress" aria-label="저축 목표 진행" max={100} value={goalProgress(goal, transfers).percent} />
      <p className="note">{lines.note}</p>
      {lines.plan ? <p>{lines.plan}</p> : null}
      {children}
    </>
  )
}

// 목표 정하기·고치기 폼. 실패하면 첫 오류 칸으로 포커스한다 (F06)
function GoalForm({
  label,
  initial,
  keepDate,
  stale,
  today,
  onSubmit,
  onCancel,
}: {
  label: string
  initial: GoalRawInput
  /** 고치기 폼에 채워 둔 목표 날짜. 그대로 두면 범위를 다시 따지지 않는다 */
  keepDate?: string
  stale?: boolean
  today: Date
  onSubmit: (value: GoalValue) => void
  onCancel: () => void
}) {
  const [raw, setRaw] = useState<GoalRawInput>(initial)
  const [attempted, setAttempted] = useState(false)
  const { ref, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const { value, errors } = validateGoalInput(raw, today, keepDate)
  const shown: GoalFieldErrors = attempted ? errors : {}
  const set = (key: keyof GoalRawInput, v: string) => setRaw((r) => ({ ...r, [key]: v }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setAttempted(true)
      focusFirstError()
      return
    }
    onSubmit(value)
  }
  return (
    <form className="stack" aria-label={label} onSubmit={submit} noValidate ref={ref}>
      <TextField label="목표 이름" autoFocus placeholder="예: 비상금" value={raw.name} error={shown.name} onChange={(e) => set('name', e.target.value)} />
      <TextField label="목표 금액" inputMode="numeric" placeholder="원" value={raw.target} error={shown.target} onChange={(e) => set('target', e.target.value)} />
      <TextField label="목표 날짜 (선택)" type="date" value={raw.targetDate} error={shown.targetDate} onChange={(e) => set('targetDate', e.target.value)} />
      {stale ? (
        <p className="field-error" role="alert">
          {GOAL_STALE}
        </p>
      ) : null}
      <div className="btn-row">
        <Button variant="primary" type="submit">
          목표 저장
        </Button>
        <Button onClick={onCancel}>취소</Button>
      </div>
    </form>
  )
}

// 옮긴 돈 적기: 앱은 돈을 옮기지 않고, 은행 앱에서 옮긴 뒤의 금액을 적는다
function TransferForm({
  today,
  transfers,
  onAdd,
}: {
  today: Date
  transfers: readonly Transfer[]
  onAdd: (transfer: Transfer) => 'ok' | 'full' | 'replaced'
}) {
  const fresh = (): TransferRawInput => ({ direction: 'in', amount: '', day: toDayIso(today), memo: '' })
  const [raw, setRaw] = useState<TransferRawInput>(fresh)
  const [attempted, setAttempted] = useState(false)
  const [full, setFull] = useState(false)
  // 적었다는 알림: 그 기록이 지금 기록에 있을 때만 보인다. 저장하지 않는다
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null)
  const noticeActive = saved !== null && transfers.some((t) => t.id === saved.id)
  const { ref, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const { value, errors } = validateTransferInput(raw, today)
  const shown: TransferFieldErrors = attempted ? errors : {}
  const set = <K extends keyof TransferRawInput>(key: K, v: TransferRawInput[K]) => setRaw((r) => ({ ...r, [key]: v }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setAttempted(true)
      setFull(false)
      focusFirstError()
      return
    }
    const transfer = createTransfer(value, new Date(), newId())
    const result = onAdd(transfer)
    setFull(result === 'full')
    // 가득 찼거나 다른 탭 기록을 불러와 반영되지 않았으면 적던 입력을 그대로 둔다
    if (result !== 'ok') return
    setSaved({ id: transfer.id, text: transferSavedMessage(transfer) })
    setRaw(fresh())
    setAttempted(false)
  }

  return (
    <details className="card guide">
      <summary className="card-title">옮긴 돈 적기</summary>
      <div className="stack">
      <form className="stack" aria-label="옮긴 돈 적기" onSubmit={submit} noValidate ref={ref}>
        <p className="note">{TRANSFER_INTRO}</p>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">옮긴 방향</legend>
          <div className="radio-group">
            {(
              [
                ['in', '넣었어요'],
                ['out', '꺼냈어요'],
              ] as const
            ).map(([direction, text]) => (
              <label key={direction}>
                <input type="radio" name="옮긴 돈 적기-direction" checked={raw.direction === direction} onChange={() => set('direction', direction)} /> {text}
              </label>
            ))}
          </div>
        </fieldset>
        <TextField label="금액" inputMode="numeric" placeholder="원" value={raw.amount} error={shown.amount} onChange={(e) => set('amount', e.target.value)} />
        <TextField
          label="날짜"
          type="date"
          min={toDayIso(yearsLater(today, -1))}
          max={toDayIso(today)}
          value={raw.day}
          error={shown.day}
          onChange={(e) => set('day', e.target.value)}
        />
        <TextField label="메모 (선택)" placeholder="예: 적금 통장" value={raw.memo} error={shown.memo} onChange={(e) => set('memo', e.target.value)} />
        {full && transfers.length >= TRANSFER_MAX ? (
          <p className="field-error" role="alert">
            {TRANSFER_FULL}
          </p>
        ) : null}
        <div className="btn-row">
          <Button variant="primary" type="submit">
            적기
          </Button>
        </div>
      </form>
      <div role="status" aria-label="옮긴 돈 알림" className={saved && noticeActive ? undefined : 'similar-empty'}>
        {saved && noticeActive ? <p className="note">{saved.text}</p> : null}
      </div>
      </div>
    </details>
  )
}

// 옮긴 돈 기록: 접힌 목록, 날짜 최신순
function TransferLog({ transfers, onRemove, onLostFocus }: { transfers: readonly Transfer[]; onRemove: (id: string) => boolean; onLostFocus: () => void }) {
  if (transfers.length === 0) return null
  return (
    <details>
      <summary>{`옮긴 돈 기록 (${transfers.length}건)`}</summary>
      <ul className="result-list">
        {sortTransfers(transfers).map((t) => (
          <TransferRow key={t.id} transfer={t} onRemove={onRemove} onLostFocus={onLostFocus} />
        ))}
      </ul>
    </details>
  )
}

function TransferRow({ transfer, onRemove, onLostFocus }: { transfer: Transfer; onRemove: (id: string) => boolean; onLostFocus: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  // 지우기 확인을 연 채로 다른 탭이 그 기록을 없애 줄이 사라지면 포커스를 화면 제목으로 옮긴다.
  // 이 탭에서 지우면 화면 제목으로 먼저 옮겨 두므로(removeTransfer) 여기 걸리지 않는다
  const lostFocus = useRef(onLostFocus)
  useEffect(() => {
    lostFocus.current = onLostFocus
  })
  useLayoutEffect(() => {
    const row = rowRef.current
    return () => {
      if (row?.querySelector('[role="group"]')?.contains(document.activeElement)) lostFocus.current()
    }
  }, [])
  // 확인을 닫으면 그 줄의 "지우기"로 포커스를 돌려보낸다
  const backToButton = useRef(false)
  useEffect(() => {
    if (confirming || !backToButton.current) return
    deleteRef.current?.focus()
    backToButton.current = false
  }, [confirming])
  const closeConfirm = () => {
    backToButton.current = true
    setConfirming(false)
  }
  return (
    <li>
      <div className="record-row stack" ref={rowRef}>
        <div className="card-row">
          <span>{transferLine(transfer)}</span>
          {confirming ? null : (
            <button type="button" className="link-btn" ref={deleteRef} aria-label={transferDeleteName(transfer)} onClick={() => setConfirming(true)}>
              지우기
            </button>
          )}
        </div>
        {confirming ? (
          <div className="stack" role="group" aria-label="기록 지우기 확인">
            <p className="field-label">{TRANSFER_DELETE_CONFIRM}</p>
            <div className="btn-row">
              <Button
                variant="danger"
                autoFocus
                onClick={() => {
                  // 다른 탭 기록을 불러와 지워지지 않았으면 확인만 닫는다
                  if (!onRemove(transfer.id)) closeConfirm()
                }}
              >
                지우기
              </Button>
              <Button onClick={closeConfirm}>취소</Button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  )
}

// 저장 안내: 고정비 화면의 SubsBanner와 같은 모양, 문장은 PRD F48 '저장'
function SavingsBanner({
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
    <div className="banner stack" role="status" aria-label="모으기 저장 상태">
      {status.kind === 'unavailable' ? <p>이 브라우저에서는 모으기 기록을 저장할 수 없어요. 새로고침하면 사라져요.</p> : null}
      {status.kind === 'save-failed' ? (
        <>
          <p>모으기 기록을 저장하지 못했어요. 브라우저 저장 공간이나 설정을 확인한 뒤 다시 저장해 주세요.</p>
          <div className="btn-row">
            <Button onClick={onRetry}>다시 저장</Button>
          </div>
        </>
      ) : null}
      {status.kind === 'replaced' ? (
        <>
          <p>다른 탭에서 저장한 모으기 기록을 불러왔어요. 이 탭에서 저장하지 않은 변경은 반영되지 않았어요.</p>
          <div className="btn-row">
            <Button onClick={onDismiss}>확인</Button>
          </div>
        </>
      ) : null}
      {status.kind === 'corrupt' ? (
        <>
          <p>저장된 모으기 기록을 읽을 수 없어요. 초기화하기 전까지는 새로 적은 기록이 저장되지 않아요.</p>
          <ResetConfirm
            label="모으기 기록 초기화"
            note="초기화하면 읽을 수 없는 모으기 기록은 사라지고, 지금 화면의 기록만 저장돼요."
            onReset={onReset}
          />
        </>
      ) : null}
    </div>
  )
}
