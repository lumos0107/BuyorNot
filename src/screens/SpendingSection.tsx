import { useRef, useState, type FormEvent } from 'react'
import { formatWon, parseInteger } from '../logic/number'
import {
  SPENDING_CORRUPT, SPENDING_KIND_LABEL, SPENDING_KINDS, SPENDING_REPLACED, SPENDING_SAVE_FAILED,
  SPENDING_STORAGE_LABEL, SPENDING_UNAVAILABLE, spendingMonthSummary, spendingSavedMessage, weeklyExperimentProgress, weeklyExperimentProgressLine, weeklySpendingExperiment, weeklySpendingLine,
  type SpendingEntry, type SpendingKind, type SpendingTemplate,
} from '../logic/spending'
import { toDayIso } from '../logic/subscriptions'
import { newId } from '../logic/wishlist'
import { useSpending } from '../store/useSpending'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { ResetConfirm } from '../ui/ResetConfirm'
import { useFocusFirstError } from '../ui/useFocusFirstError'

export function SpendingSection({ spending, today }: { spending: ReturnType<typeof useSpending>; today: Date }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SpendingKind>('convenience')
  const [amount, setAmount] = useState('')
  const [limit, setLimit] = useState('')
  const [errors, setErrors] = useState<Partial<Record<'name' | 'amount' | 'limit', string>>>({})
  const [message, setMessage] = useState('')
  const [full, setFull] = useState(false)
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null)
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null)
  const titleRef = useRef<HTMLElement>(null)
  const { ref, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const summary = spendingMonthSummary(spending.store.entries, today)
  const weekly = new Map(spending.store.templates.map((template) => [template.id, weeklySpendingExperiment(spending.store.entries, template.id, today)]))
  const activeProgress = spending.store.experiment ? weeklyExperimentProgress(spending.store.experiment, spending.store.entries, today) : null

  const addTemplate = (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    const parsedAmount = parseInteger(amount)
    const parsedLimit = limit.trim() ? parseInteger(limit) : null
    const nextErrors: typeof errors = {}
    if (!cleanName || cleanName.length > 30) nextErrors.name = '이름은 1~30자로 적어 주세요.'
    if (parsedAmount === null || parsedAmount < 1 || parsedAmount > 100000) nextErrors.amount = '금액은 1원~10만 원 사이여야 해요.'
    if (limit.trim() && (parsedLimit === null || parsedLimit < 1 || parsedLimit > 100)) nextErrors.limit = '이번 달 횟수는 1~100번 사이여야 해요.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); focusFirstError(); return }
    const at = new Date().toISOString()
    const template: SpendingTemplate = { id: newId(), name: cleanName, kind, amountKrw: parsedAmount!, ...(parsedLimit !== null ? { limitPerMonth: parsedLimit } : {}), createdAt: at, updatedAt: at }
    const result = spending.addTemplate(template)
    if (result === 'full') { setFull(true); return }
    if (result === 'replaced') return
    setName(''); setAmount(''); setLimit(''); setErrors({}); setFull(false)
  }

  const addEntry = (template: SpendingTemplate, action: SpendingEntry['action'], now: Date) => {
    const entry: SpendingEntry = { id: newId(), templateId: template.id, name: template.name, kind: template.kind, amountKrw: template.amountKrw, day: toDayIso(today), action, createdAt: now.toISOString() }
    const result = spending.addEntry(entry)
    if (result === 'full') { setFull(true); return }
    if (result === 'ok') setMessage(spendingSavedMessage(template.name, action))
    else setMessage('')
  }

  return <details className="card guide" aria-label="자잘한 지출">
    <summary className="card-title" tabIndex={-1} ref={titleRef}>자잘한 지출</summary>
    <div className="stack">
    {spending.status.kind !== 'ok' ? <div className="banner stack" role="status" aria-label={SPENDING_STORAGE_LABEL}>
      {spending.status.kind === 'unavailable' ? <p>{SPENDING_UNAVAILABLE}</p> : null}
      {spending.status.kind === 'save-failed' ? <><p>{SPENDING_SAVE_FAILED}</p><Button onClick={spending.retrySave}>다시 저장</Button></> : null}
      {spending.status.kind === 'replaced' ? <><p>{SPENDING_REPLACED}</p><Button onClick={spending.dismissNotice}>확인</Button></> : null}
      {spending.status.kind === 'corrupt' ? <><p>{SPENDING_CORRUPT}</p><ResetConfirm label="자잘한 지출 기록 초기화" note="초기화하면 읽을 수 없는 자잘한 지출 기록은 사라지고, 지금 화면의 기록만 저장돼요." onReset={spending.resetStorage} /></> : null}
    </div> : null}
    <form className="stack" aria-label="자잘한 지출 버튼 만들기" ref={ref} onSubmit={addTemplate} noValidate>
      <TextField label="이름" value={name} error={errors.name} onChange={(e) => { setName(e.target.value); setErrors({}) }} />
      <SelectField label="곳 종류" value={kind} onChange={(e) => setKind(e.target.value as SpendingKind)}>
        {SPENDING_KINDS.map((entry) => <option key={entry} value={entry}>{SPENDING_KIND_LABEL[entry]}</option>)}
      </SelectField>
      <TextField label="금액" inputMode="numeric" value={amount} error={errors.amount} onChange={(e) => { setAmount(e.target.value); setErrors({}) }} />
      <TextField label="이번 달 n번까지 (선택)" inputMode="numeric" value={limit} error={errors.limit} onChange={(e) => { setLimit(e.target.value); setErrors({}) }} />
      <div className="btn-row"><Button type="submit">만들기</Button></div>
    </form>
    <p role="status" aria-label="자잘한 지출 알림" className="note">{message}</p>
    {full ? <p role="alert" className="field-error">기록이 너무 많아 더 적을 수 없어요.</p> : null}
    {SPENDING_KINDS.filter((entry) => summary[entry].current.count + summary[entry].previous.count > 0 || spending.store.templates.some((template) => template.kind === entry)).map((entry) => <div key={entry} className="stack">
      <p>{`이번 달 ${SPENDING_KIND_LABEL[entry]} ${summary[entry].current.count}번 · ${formatWon(summary[entry].current.amountKrw)}`}</p>
      <p className="note">{`지난달 같은 날까지 ${SPENDING_KIND_LABEL[entry]} ${summary[entry].previous.count}번 · ${formatWon(summary[entry].previous.amountKrw)}`}</p>
    </div>)}
    {spending.store.templates.map((template) => <div key={template.id} className="card stack" role="group" aria-label={template.name}>
      <p className="card-title">{template.name}</p>
      <p>{`${SPENDING_KIND_LABEL[template.kind]} · ${formatWon(template.amountKrw)}`}</p>
      {template.limitPerMonth ? <p className="note">{`이번 달 ${spending.store.entries.filter((entry) => entry.templateId === template.id && entry.action === 'spent' && entry.day.slice(0, 7) === toDayIso(today).slice(0, 7)).length}번 / 정한 ${template.limitPerMonth}번`}</p> : null}
      {spending.store.experiment?.templateId === template.id && activeProgress
        ? <p className="note">{weeklyExperimentProgressLine(activeProgress)}</p>
        : weekly.get(template.id) ? <p className="note">{weeklySpendingLine(weekly.get(template.id)!)}</p> : null}
      <div className="btn-row"><Button aria-label={`${template.name} 썼어요`} onClick={() => addEntry(template, 'spent', new Date())}>썼어요</Button><Button aria-label={`${template.name} 참았어요`} onClick={() => addEntry(template, 'skipped', new Date())}>참았어요</Button><Button aria-label={`${template.name} ${spending.store.experiment?.templateId === template.id && activeProgress?.kind === 'active' ? '시도 중단' : '한 주 시도 시작'}`} onClick={() => {
        if (spending.store.experiment?.templateId === template.id && activeProgress?.kind === 'active') { if (spending.stopExperiment()) setMessage(''); return }
        const result = spending.startExperiment(template.id, today)
        setMessage(result === 'no-baseline' ? '이전 7일에 쓴 기록이 있어야 시작할 수 있어요.' : '')
      }}>{spending.store.experiment?.templateId === template.id && activeProgress?.kind === 'active' ? '시도 중단' : activeProgress?.kind === 'complete' && spending.store.experiment?.templateId === template.id ? '다시 시도하기' : '한 주 시도 시작'}</Button><Button onClick={() => setDeleteTemplateId(template.id)}>지우기</Button></div>
      {deleteTemplateId === template.id ? <div role="group" aria-label="자잘한 지출 버튼 지우기 확인" className="stack"><p>이 버튼을 지울까요? 적은 기록은 그대로 남아요.</p><div className="btn-row"><Button variant="danger" autoFocus onClick={() => { if (spending.removeTemplate(template.id)) titleRef.current?.focus(); setDeleteTemplateId(null) }}>지우기</Button><Button onClick={() => setDeleteTemplateId(null)}>취소</Button></div></div> : null}
    </div>)}
    {spending.store.entries.length > 0 ? <details><summary>{`자잘한 지출 기록 (${spending.store.entries.length}건)`}</summary><div className="stack">
      {[...spending.store.entries].reverse().map((entry) => <div key={entry.id} className="stack">
        <p>{`${entry.day} · ${entry.name} · ${entry.action === 'spent' ? '썼어요' : '참았어요'} · ${formatWon(entry.amountKrw)}`}</p>
        {deleteEntryId === entry.id ? <div role="group" aria-label="자잘한 지출 기록 지우기 확인"><p>이 기록을 지울까요?</p><div className="btn-row"><Button variant="danger" autoFocus onClick={() => { if (spending.removeEntry(entry.id)) titleRef.current?.focus(); setDeleteEntryId(null) }}>지우기</Button><Button onClick={() => setDeleteEntryId(null)}>취소</Button></div></div>
          : <Button aria-label={`${entry.day} ${entry.name} 기록 지우기`} onClick={() => setDeleteEntryId(entry.id)}>지우기</Button>}
      </div>)}
    </div></details> : null}
    </div>
  </details>
}
