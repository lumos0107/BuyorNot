import { useRef, useState, type FormEvent } from 'react'
import { formatWon } from '../logic/number'
import {
  PANTRY_CORRUPT, PANTRY_KIND_LABEL, PANTRY_LEVEL_LABEL, PANTRY_REPLACED, PANTRY_RESET_NOTE,
  PANTRY_SAVE_FAILED, PANTRY_STORAGE_LABEL, PANTRY_UNAVAILABLE, nextPantryLevel,
  normalizePantryName, pantryAdded, pantryDeleteConfirm, pantryLevelChanged, type PantryItem, type PantryKind,
} from '../logic/pantry'
import { kindOf, type Subscription } from '../logic/subscriptions'
import { newId } from '../logic/wishlist'
import { usePantry } from '../store/usePantry'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { ResetConfirm } from '../ui/ResetConfirm'

type Props = { pantry: ReturnType<typeof usePantry>; subscriptions: readonly Subscription[]; today: Date }
const LEVEL_ORDER = { out: 0, low: 1, plenty: 2 }

export function PantrySection({ pantry, subscriptions }: Props) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PantryKind>('essential')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const items = [...pantry.store.items].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.name.localeCompare(b.name, 'ko'))
  const needed = items.filter((item) => item.level !== 'plenty')
  const other = items.filter((item) => item.level === 'plenty')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName || cleanName.length > 40) { setError('이름은 1~40자로 적어 주세요.'); formRef.current?.querySelector('input')?.focus(); return }
    const at = new Date().toISOString()
    const item: PantryItem = { id: newId(), name: cleanName, kind, level: 'plenty', purchases: [], createdAt: at, updatedAt: at }
    const result = pantry.addItem(item)
    if (result === 'duplicate') { setError('같은 이름이 이미 있어요.'); formRef.current?.querySelector('input')?.focus(); return }
    if (result === 'full') { setError('집에 있는 것은 200개까지 적을 수 있어요.'); formRef.current?.querySelector('input')?.focus(); return }
    if (result === 'replaced') { setMessage(''); return }
    setError('')
    setName('')
    setMessage(pantryAdded(cleanName))
  }

  const changeLevel = (item: PantryItem) => {
    const level = nextPantryLevel(item.level)
    if (pantry.updateItem(item.id, (current) => ({ ...current, level, updatedAt: new Date().toISOString() }))) setMessage(pantryLevelChanged(item.name, level))
    else setMessage('')
  }

  const row = (item: PantryItem) => {
    const delivery = subscriptions.some((sub) => !sub.cancelledOn && kindOf(sub) === 'delivery' && normalizePantryName(sub.name) === normalizePantryName(item.name))
    const latest = [...item.purchases].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt))[0]
    return <div className="card stack" role="group" aria-label={item.name} key={item.id}>
      <p className="card-title">{item.name}</p>
      <p className="card-meta">{PANTRY_KIND_LABEL[item.kind]}</p>
      {latest ? <p className="note">{`마지막으로 산 값: ${latest.place} · ${formatWon(latest.amountKrw)}`}</p> : null}
      {delivery ? <p className="note">정기배송으로 와요.</p> : null}
      <div className="btn-row">
        <Button aria-label={`${item.name} 남은 정도: ${PANTRY_LEVEL_LABEL[item.level]}`} onClick={() => changeLevel(item)}>남은 정도: {PANTRY_LEVEL_LABEL[item.level]}</Button>
        <Button onClick={() => setDeleteId(item.id)}>지우기</Button>
      </div>
      {deleteId === item.id ? <div role="group" aria-label="집에 있는 것 지우기 확인" className="stack">
        <p>{pantryDeleteConfirm(item.name)}</p>
        <div className="btn-row">
          <Button variant="danger" autoFocus onClick={() => { if (pantry.removeItem(item.id)) { setDeleteId(null); summaryRef.current?.focus() } else setDeleteId(null) }}>지우기</Button>
          <Button onClick={() => setDeleteId(null)}>취소</Button>
        </div>
      </div> : null}
    </div>
  }

  return <details className="card guide">
    <summary className="card-title" ref={summaryRef}>집에 있는 것</summary>
    <div className="stack">
      {pantry.status.kind !== 'ok' ? <div className="banner stack" role="status" aria-label={PANTRY_STORAGE_LABEL}>
        {pantry.status.kind === 'unavailable' ? <p>{PANTRY_UNAVAILABLE}</p> : null}
        {pantry.status.kind === 'save-failed' ? <><p>{PANTRY_SAVE_FAILED}</p><Button onClick={pantry.retrySave}>다시 저장</Button></> : null}
        {pantry.status.kind === 'replaced' ? <><p>{PANTRY_REPLACED}</p><Button onClick={pantry.dismissNotice}>확인</Button></> : null}
        {pantry.status.kind === 'corrupt' ? <><p>{PANTRY_CORRUPT}</p><ResetConfirm label="집에 있는 것 기록 초기화" note={PANTRY_RESET_NOTE} onReset={pantry.resetStorage} /></> : null}
      </div> : null}
      <form className="stack" aria-label="집에 있는 것 적기" ref={formRef} onSubmit={submit} noValidate>
        <TextField label="이름" value={name} error={error || undefined} onChange={(event) => { setName(event.target.value); setError('') }} />
        <SelectField label="종류" value={kind} onChange={(event) => setKind(event.target.value as PantryKind)}>
          <option value="essential">생필품</option><option value="ingredient">식재료</option>
        </SelectField>
        <div className="btn-row"><Button variant="primary" type="submit">적기</Button></div>
      </form>
      <p role="status" aria-label="집에 있는 것 알림" className="note">{message}</p>
      {items.length === 0 ? <p className="note">아직 적은 것이 없어요.</p> : null}
      {needed.length > 0 ? <section className="stack" aria-label="살 때가 된 것"><p className="card-title">살 때가 된 것</p>{needed.map(row)}</section> : null}
      {other.length > 0 ? <details><summary>{`집에 있는 것 (${other.length}개)`}</summary><div className="stack">{other.map(row)}</div></details> : null}
    </div>
  </details>
}
