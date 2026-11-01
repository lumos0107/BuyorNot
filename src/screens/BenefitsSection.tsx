import { useState, type FormEvent } from 'react'
import { PROGRAMS, PROGRAM_STATUSES, PROGRAM_STATUS_LABEL, programListStale, validateProgramInput, type ProgramCheck, type ProgramId, type ProgramStatus } from '../logic/benefits'
import { toDayIso } from '../logic/subscriptions'
import type { useBenefits } from '../store/useBenefits'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { ResetConfirm } from '../ui/ResetConfirm'

type Benefits = ReturnType<typeof useBenefits>

export function BenefitsSection({ benefits, today }: { benefits: Benefits; today: Date }) {
  const saveProgram = (value: ProgramCheck) => benefits.change((current) => ({
    ...current,
    programs: [...current.programs.filter((row) => row.id !== value.id), value],
  }))
  return <details className="card guide">
    <summary className="card-title">받을 수 있는 돈</summary>
    <div className="stack">
      <p className="note">조건은 자주 바뀌어요. 받을 수 있는지는 공식 사이트에서 확인해 주세요.</p>
      {programListStale(today) ? <p className="note">이 목록은 2026년 11월에 확인했어요. 바뀌었을 수 있어요.</p> : null}
      {benefits.status.kind !== 'ok' ? <div className="banner stack" role="status" aria-label="받을 수 있는 돈 저장 상태">
        <p>{benefits.status.kind === 'replaced' ? '다른 탭에서 저장한 받을 수 있는 돈 기록을 불러왔어요.' : benefits.status.kind === 'corrupt' ? '저장된 받을 수 있는 돈 기록을 읽을 수 없어요.' : benefits.status.kind === 'unavailable' ? '이 브라우저에서는 받을 수 있는 돈 기록을 저장할 수 없어요.' : '받을 수 있는 돈 기록을 저장하지 못했어요.'}</p>
        {benefits.status.kind === 'save-failed' ? <Button onClick={benefits.retrySave}>다시 저장</Button> : null}
        {benefits.status.kind === 'corrupt' ? <ResetConfirm label="받을 수 있는 돈 기록 초기화" note="초기화하면 읽을 수 없는 기록은 사라지고, 지금 화면의 기록만 저장돼요." onReset={benefits.resetStorage} /> : null}
        {benefits.status.kind === 'replaced' ? <Button onClick={benefits.dismissNotice}>확인</Button> : null}
      </div> : null}
      {PROGRAMS.map((program) => <ProgramRow key={program.id} program={program} saved={benefits.store.programs.find((row) => row.id === program.id)} today={today} onSave={saveProgram} />)}
    </div>
  </details>
}

function ProgramRow({ program, saved, today, onSave }: {
  program: (typeof PROGRAMS)[number]
  saved?: ProgramCheck
  today: Date
  onSave: (value: ProgramCheck) => boolean
}) {
  const [day, setDay] = useState(saved?.checkedOn ?? toDayIso(today))
  const [status, setStatus] = useState<ProgramStatus>(saved?.status ?? 'checked')
  const [amount, setAmount] = useState(saved?.receivedKrw === undefined ? '' : String(saved.receivedKrw))
  const [error, setError] = useState(false)
  const [notice, setNotice] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = validateProgramInput(program.id as ProgramId, day, status, status === 'receiving' ? amount : '', today)
    if (!value) { setError(true); return }
    if (onSave(value)) { setError(false); setNotice(true) }
  }
  return <details className="benefit-item">
    <summary className="field-label">{program.name}</summary>
    <div className="stack benefit-item-content">
      <p className="note">{program.description}</p>
      <a href={program.url} target="_blank" rel="noopener noreferrer" aria-label={`${program.name} 공식 안내`}>공식 안내 열기</a>
      {saved ? <p className="note">{`${PROGRAM_STATUS_LABEL[saved.status]} · ${saved.checkedOn}에 확인`}</p> : null}
      <form className="stack" aria-label={`${program.name} 확인`} onSubmit={submit} noValidate>
        <TextField label="내가 확인한 날" type="date" max={toDayIso(today)} value={day} onChange={(event) => setDay(event.target.value)} />
        <SelectField label="상태" value={status} onChange={(event) => { setStatus(event.target.value as ProgramStatus); setAmount('') }}>
          {PROGRAM_STATUSES.map((option) => <option key={option} value={option}>{PROGRAM_STATUS_LABEL[option]}</option>)}
        </SelectField>
        {status === 'receiving' ? <TextField label="받은 금액 (선택)" inputMode="numeric" placeholder="원" value={amount} onChange={(event) => setAmount(event.target.value)} /> : null}
        {error ? <p className="field-error" role="alert">확인한 날과 금액을 다시 확인해 주세요.</p> : null}
        <Button variant="primary" type="submit">저장</Button>
      </form>
      {notice && saved ? <p className="note" role="status">확인한 내용을 저장했어요.</p> : null}
    </div>
  </details>
}
