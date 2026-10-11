import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatDate } from '../logic/dates'
import { formatWon } from '../logic/number'
import {
  COOLING_PRESETS,
  EXTEND_DAYS,
  coolingDays,
  formatRemaining,
  reviewState,
  sortConsidering,
  validateNote,
  validateWishInput,
  validateWishPatch,
  type NewWishInput,
  type WishFieldErrors,
  type WishItem,
  type WishPatch,
  type WishPatchRaw,
} from '../logic/wishlist'
import { Button } from '../ui/Button'
import { TextAreaField, TextField } from '../ui/Field'

// PRD F01 상품 등록·관리, F02 숙려와 결정, F07 연장, F08 결정 메모
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
  return (
    <div className="stack">
      <h2 className="screen-title">고민 중인 물건</h2>
      <AddForm onAdd={onAdd} />
      {considering.length === 0 ? (
        <div className="empty card stack">
          <p>아직 담아 둔 물건이 없어요.</p>
          <p className="note">사고 싶은 물건을 담아 두면 숙려 기간이 지난 뒤 다시 물어봐요.</p>
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
              onDecide={onDecide}
              onExtend={onExtend}
              onRemove={onRemove}
            />
          ))}
        </section>
      )}
    </div>
  )
}

// ---------- 등록 폼 ----------

type Preset = (typeof COOLING_PRESETS)[number] | 'custom'
type AddRaw = { name: string; price: string; reason: string; url: string; preset: Preset; customDays: string }
const EMPTY_ADD: AddRaw = { name: '', price: '', reason: '', url: '', preset: 3, customDays: '' }

function AddForm({ onAdd }: { onAdd: (input: NewWishInput) => void }) {
  const [raw, setRaw] = useState<AddRaw>(EMPTY_ADD)
  const [attempted, setAttempted] = useState(false)
  const days = raw.preset === 'custom' ? raw.customDays : String(raw.preset)
  const { value, errors } = validateWishInput({ name: raw.name, price: raw.price, reason: raw.reason, days, url: raw.url })
  const shown: WishFieldErrors = attempted ? errors : {}
  const set = <K extends keyof AddRaw>(key: K, v: AddRaw[K]) => setRaw((r) => ({ ...r, [key]: v }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setAttempted(true)
      return
    }
    onAdd(value)
    setRaw(EMPTY_ADD)
    setAttempted(false)
  }

  return (
    <form className="card stack" aria-label="물건 담기" onSubmit={submit} noValidate>
      <p className="card-title">물건 담기</p>
      <TextField
        label="상품명"
        placeholder="예: 무선 헤드폰"
        maxLength={80}
        value={raw.name}
        error={shown.name}
        onChange={(e) => set('name', e.target.value)}
      />
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
        <legend className="field-label">숙려 기간</legend>
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
          label="숙려 일수"
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
          <span className="status status-muted">숙려 중 · {formatRemaining(state.remainingMs)}</span>
        )}
      </div>
      <p className="price">{formatWon(item.priceKrw)}</p>
      <p className="card-meta">
        담은 날 {formatDate(item.createdAt)} · {coolingDays(item)}일 숙려
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

// 더 고민하기: 1·3·7일 중 고른다. 새 종료 시각은 로직(extendItem)이 정한다 (F07)
function ExtendPicker({ onPick, onCancel }: { onPick: (days: number) => void; onCancel: () => void }) {
  return (
    <div className="stack" role="group" aria-label="더 고민하기">
      <p className="field-label">얼마나 더 고민할까요? 지금부터 세어요.</p>
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
      <p className="field-label">‘{name}’을 지울까요?</p>
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
  const { value, errors } = validateWishPatch(raw)
  const shown: WishFieldErrors = attempted ? errors : {}
  const set = <K extends keyof WishPatchRaw>(key: K, v: string) => setRaw((r) => ({ ...r, [key]: v }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!value) {
      setAttempted(true)
      return
    }
    onSave(value)
  }

  return (
    <form className="stack" aria-label="물건 수정" onSubmit={submit} noValidate>
      <p className="card-title">물건 수정</p>
      <TextField label="상품명" maxLength={80} value={raw.name} error={shown.name} onChange={(e) => set('name', e.target.value)} />
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
      <p className="note">숙려 기간은 바뀌지 않아요. 다시 볼 날 {formatDate(item.reviewAt)}</p>
      <div className="btn-row">
        <Button variant="primary" type="submit">
          저장
        </Button>
        <Button onClick={onCancel}>취소</Button>
      </div>
    </form>
  )
}
