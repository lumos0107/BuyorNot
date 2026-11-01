import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  BILL_DELETE_CONFIRM, BILL_KINDS, BILL_KIND_LABEL, BILLS_CORRUPT, BILLS_FULL, BILLS_INTRO,
  BILLS_REPLACED, BILLS_RESET_LABEL, BILLS_RESET_NOTE, BILLS_SAVE_FAILED, BILLS_SEASON_NOTE,
  BILLS_STORAGE_LABEL, BILLS_TITLE, BILLS_UNAVAILABLE, billCompareLines, billDeleteName,
  billLogLine, billReplacedMessage, billSavedMessage, billYearOptions, createBill, findSameMonth,
  sameMonthConfirm, sortBillsForLog, validateBillInput, type BillRawInput, type BillValue,
} from '../logic/bills'
import { newId } from '../logic/wishlist'
import { useBills } from '../store/useBills'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { ResetConfirm } from '../ui/ResetConfirm'
import { useFocusFirstError } from '../ui/useFocusFirstError'

type Props = { bills: ReturnType<typeof useBills>; today: Date }

export function BillsSection({ bills, today }: Props) {
  const [raw, setRaw] = useState<BillRawInput>({ kind: 'electric', year: String(today.getFullYear()), month: String(today.getMonth() + 1), amount: '', twoMonths: false })
  const [attempted, setAttempted] = useState(false)
  const [pending, setPending] = useState<{ id: string; value: BillValue } | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [full, setFull] = useState(false)
  const headingRef = useRef<HTMLParagraphElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const deleteRefs = useRef(new Map<string, HTMLButtonElement>())
  const returnDeleteId = useRef<string | null>(null)
  useEffect(() => {
    if (deleteId !== null || returnDeleteId.current === null) return
    const id = returnDeleteId.current
    returnDeleteId.current = null
    ;(deleteRefs.current.get(id) ?? headingRef.current)?.focus()
  }, [deleteId, bills.store.items])
  const { ref: formRef, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const { value, errors } = validateBillInput(raw, today)
  const set = <K extends keyof BillRawInput>(key: K, input: BillRawInput[K]) => setRaw((prev) => ({ ...prev, [key]: input }))
  const clearAfterSave = () => {
    setRaw((prev) => ({ ...prev, amount: '', twoMonths: false }))
    setAttempted(false)
    setFull(false)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    if (!value) { setAttempted(true); focusFirstError(); return }
    const existing = findSameMonth(bills.store.items, value.kind, value.month)
    if (existing) { setPending({ id: existing.id, value }); return }
    const outcome = bills.add(createBill(value, new Date(), newId()))
    if (outcome === 'full') { setFull(true); return }
    if (outcome === 'replaced') return
    setMessage(billSavedMessage(value))
    clearAfterSave()
  }
  const replace = () => {
    if (!pending) return
    const { id, value: next } = pending
    const applied = bills.update(id, next)
    setPending(null)
    addRef.current?.focus()
    if (!applied) { setMessage(''); return }
    setMessage(billReplacedMessage(next))
    clearAfterSave()
  }
  const cancelPending = () => { setPending(null); addRef.current?.focus() }
  const sorted = sortBillsForLog(bills.store.items)

  return (
    <section className="card stack" aria-label={BILLS_TITLE}>
      <p className="card-title" tabIndex={-1} ref={headingRef}>{BILLS_TITLE}</p>
      {bills.status.kind !== 'ok' ? (
        <div className="banner stack" role="status" aria-label={BILLS_STORAGE_LABEL}>
          {bills.status.kind === 'unavailable' ? <p>{BILLS_UNAVAILABLE}</p> : null}
          {bills.status.kind === 'save-failed' ? <><p>{BILLS_SAVE_FAILED}</p><div className="btn-row"><Button onClick={bills.retrySave}>다시 저장</Button></div></> : null}
          {bills.status.kind === 'replaced' ? <><p>{BILLS_REPLACED}</p><div className="btn-row"><Button onClick={bills.dismissNotice}>확인</Button></div></> : null}
          {bills.status.kind === 'corrupt' ? <><p>{BILLS_CORRUPT}</p><ResetConfirm label={BILLS_RESET_LABEL} note={BILLS_RESET_NOTE} onReset={() => { bills.resetStorage(); headingRef.current?.focus() }} /></> : null}
        </div>
      ) : null}
      <p className="note">{BILLS_INTRO}</p>
      {billCompareLines(bills.store.items).map((line) => <p key={line}>{line}</p>)}
      {bills.store.items.length > 0 ? <p className="note">{BILLS_SEASON_NOTE}</p> : null}
      <form className="stack" aria-label="공과금 적기" ref={formRef} onSubmit={submit} noValidate>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">공과금 종류</legend>
          <div className="radio-group">
            {BILL_KINDS.map((kind) => <label key={kind}><input type="radio" name="billKind" checked={raw.kind === kind} onChange={() => set('kind', kind)} />{BILL_KIND_LABEL[kind]}</label>)}
          </div>
        </fieldset>
        <SelectField label="청구 연도" value={raw.year} onChange={(e) => set('year', e.target.value)}>
          {billYearOptions(today).map((year) => <option key={year} value={year}>{year}년</option>)}
        </SelectField>
        <SelectField label="청구 월" value={raw.month} error={attempted ? errors.month : undefined} onChange={(e) => set('month', e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => <option key={month} value={month}>{month}월</option>)}
        </SelectField>
        <TextField label="금액" inputMode="numeric" placeholder="원" value={raw.amount} error={attempted ? errors.amount : undefined} onChange={(e) => set('amount', e.target.value)} />
        <label className="field-label"><input type="checkbox" checked={raw.twoMonths} onChange={(e) => set('twoMonths', e.target.checked)} /> 두 달 치 고지서예요</label>
        <div className="btn-row"><Button variant="primary" type="submit" ref={addRef}>적기</Button></div>
      </form>
      {pending ? (
        <div className="stack" role="group" aria-label="공과금 바꾸기 확인">
          <p className="field-label">{sameMonthConfirm(bills.store.items.find((item) => item.id === pending.id) ?? { ...pending.value, id: pending.id, createdAt: '', updatedAt: '' })}</p>
          <div className="btn-row"><Button autoFocus onClick={replace}>바꾸기</Button><Button onClick={cancelPending}>취소</Button></div>
        </div>
      ) : null}
      <p role="status" aria-label="공과금 알림" className="note">{message}</p>
      {full ? <p role="alert" className="field-error">{BILLS_FULL}</p> : null}
      {sorted.length > 0 ? (
        <details>
          <summary>공과금 기록 ({sorted.length}건)</summary>
          <div className="stack">
            {sorted.map((item) => <div className="stack" key={item.id}>
              <p>{billLogLine(item)}</p>
              {deleteId === item.id ? (
                <div className="stack" role="group" aria-label="공과금 기록 지우기 확인">
                  <p>{BILL_DELETE_CONFIRM}</p>
                  <div className="btn-row">
                    <Button variant="danger" autoFocus onClick={() => {
                      const applied = bills.remove(item.id)
                      if (!applied) returnDeleteId.current = item.id
                      setDeleteId(null)
                      if (applied) headingRef.current?.focus()
                    }}>지우기</Button>
                    <Button onClick={() => { returnDeleteId.current = item.id; setDeleteId(null) }}>취소</Button>
                  </div>
                </div>
              ) : <Button ref={(node) => { if (node) deleteRefs.current.set(item.id, node); else deleteRefs.current.delete(item.id) }} aria-label={billDeleteName(item)} onClick={() => setDeleteId(item.id)}>지우기</Button>}
            </div>)}
          </div>
        </details>
      ) : null}
    </section>
  )
}
