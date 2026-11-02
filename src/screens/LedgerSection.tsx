import { useState, type FormEvent } from 'react'
import { isDay } from '../logic/guards'
import { LEDGER_CATEGORY_LABEL, ledgerMonth, type LedgerCategory, type LedgerKind } from '../logic/ledger'
import { formatWon } from '../logic/number'
import { toDayIso } from '../logic/subscriptions'
import { newId } from '../logic/wishlist'
import type { BillsStore } from '../logic/bills'
import type { SpendingStore } from '../logic/spending'
import type { useLedger } from '../store/useLedger'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { ResetConfirm } from '../ui/ResetConfirm'

type Props = {
  ledger: ReturnType<typeof useLedger>
  bills: BillsStore
  spending: SpendingStore
  today: Date
}

const expenseCategories: LedgerCategory[] = ['food', 'daily', 'transport', 'housing', 'health', 'other']
const incomeCategories: LedgerCategory[] = ['salary', 'other']

export function LedgerSection({ ledger, bills, spending, today }: Props) {
  const todayIso = toDayIso(today)
  const [month, setMonth] = useState(todayIso.slice(0, 7))
  const [kind, setKind] = useState<LedgerKind>('expense')
  const [category, setCategory] = useState<LedgerCategory>('food')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState(todayIso)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const summary = ledgerMonth(ledger.store.entries, month)
  const smallSpent = spending.entries.filter((entry) => entry.day.slice(0, 7) === month && entry.action === 'spent').reduce((sum, entry) => sum + entry.amountKrw, 0)
  const billsAmount = bills.items.filter((bill) => bill.month === month).reduce((sum, bill) => sum + bill.amountKrw, 0)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const parsed = Number(amount)
    if (!name.trim() || name.trim().length > 60) { setError('내용은 1~60자로 적어 주세요.'); return }
    if (!/^\d+$/.test(amount) || !Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000_000) { setError('금액은 1원~10억 원 사이의 정수로 적어 주세요.'); return }
    if (!isDay(day)) { setError('날짜를 확인해 주세요.'); return }
    const result = ledger.add({ id: newId(), kind, category, name: name.trim(), amountKrw: parsed, day, createdAt: new Date().toISOString() })
    if (result === 'full') { setError('가계부 기록은 최대 3,000건까지 저장할 수 있어요.'); return }
    if (result === 'replaced') { setError('다른 탭의 기록을 불러왔어요. 내용을 확인하고 다시 저장해 주세요.'); return }
    setName(''); setAmount(''); setMonth(day.slice(0, 7))
    setMessage(`${kind === 'income' ? '수입' : '지출'}을 적었어요.`)
  }

  return <section className="stack" aria-label="가계부">
    <h2 className="screen-title">가계부</h2>
    <p className="note">실제로 들어오거나 나간 돈을 날짜별로 적어요. 계좌 사이에 옮긴 돈은 모으기에서 따로 기록해요.</p>
    {ledger.status.kind !== 'ok' ? <div className="banner stack" role="status" aria-label="가계부 저장 상태">
      <p>{ledger.status.kind === 'corrupt' ? '저장된 가계부를 읽을 수 없어요.' : ledger.status.kind === 'replaced' ? '다른 탭에서 저장한 가계부를 불러왔어요.' : ledger.status.kind === 'save-failed' ? '가계부를 저장하지 못했어요. 브라우저 저장 공간과 설정을 확인해 주세요.' : '이 브라우저에서는 가계부를 저장할 수 없어요.'}</p>
      {ledger.status.kind === 'save-failed' ? <Button onClick={ledger.retrySave}>다시 저장</Button> : null}
      {ledger.status.kind === 'corrupt' ? <ResetConfirm label="가계부 초기화" note="읽을 수 없는 가계부 기록을 빈 기록으로 바꿔요." onReset={ledger.resetStorage} /> : null}
      {ledger.status.kind === 'replaced' ? <Button onClick={ledger.dismissNotice}>확인</Button> : null}
    </div> : null}
    <section className="card stack" aria-label="이달 가계부 요약">
      <TextField label="볼 달" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      <p className="card-row"><span>직접 적은 수입</span><strong>{formatWon(summary.income)}</strong></p>
      <p className="card-row"><span>직접 적은 지출</span><strong>{formatWon(summary.expense)}</strong></p>
      <p className="card-row"><span>차이</span><strong>{formatWon(summary.income - summary.expense)}</strong></p>
      <p className="note">아래의 자잘한 지출 {formatWon(smallSpent)}·공과금 {formatWon(billsAmount)}은 중복 계산을 막기 위해 위 합계에 넣지 않았어요.</p>
    </section>
    <section className="card stack" aria-label="가계부 내역 적기">
      <p className="card-title">수입·지출 적기</p>
      <form className="stack" onSubmit={submit}>
        <SelectField label="종류" value={kind} onChange={(event) => {
          const next = event.target.value as LedgerKind
          setKind(next)
          setCategory(next === 'income' ? 'salary' : 'food')
        }}><option value="expense">지출</option><option value="income">수입</option></SelectField>
        <SelectField label="분류" value={category} onChange={(event) => setCategory(event.target.value as LedgerCategory)}>
          {(kind === 'income' ? incomeCategories : expenseCategories).map((value) => <option key={value} value={value}>{LEDGER_CATEGORY_LABEL[value]}</option>)}
        </SelectField>
        <TextField label="내용" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="예: 점심 식사" />
        <TextField label="금액" type="number" min="1" max="1000000000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="원" />
        <TextField label="날짜" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <Button type="submit" variant="primary">기록하기</Button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
    <section className="card stack" aria-label="가계부 내역">
      <p className="card-title">{month} 내역</p>
      {summary.entries.length === 0 ? <p className="note">이달에 직접 적은 내역이 없어요.</p> : <ul className="result-list">
        {summary.entries.map((entry) => <li key={entry.id}>
          <div className="stack"><strong>{entry.name}</strong><span className="note">{entry.day} · {entry.kind === 'income' ? '수입' : '지출'} · {LEDGER_CATEGORY_LABEL[entry.category]}</span></div>
          <div className="stack"><span className="price">{entry.kind === 'income' ? '+' : '−'}{formatWon(entry.amountKrw)}</span>
            {deleteId === entry.id ? <span className="btn-row"><Button variant="danger" onClick={() => { ledger.remove(entry.id); setDeleteId(null) }}>지우기 확인</Button><Button onClick={() => setDeleteId(null)}>취소</Button></span> : <Button onClick={() => setDeleteId(entry.id)}>지우기</Button>}
          </div>
        </li>)}
      </ul>}
    </section>
  </section>
}
