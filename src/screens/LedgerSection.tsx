import { useState, type FormEvent } from 'react'
import { isDay } from '../logic/guards'
import { LEDGER_CATEGORY_LABEL, ledgerByCategory, ledgerDashboard, ledgerDayGroups, ledgerDayLabel, ledgerMonth, ledgerMonthChange, parseSaveTarget, shiftMonth, type LedgerCategory, type LedgerEntry, type LedgerKind } from '../logic/ledger'
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
  const showDemo = ledger.store.entries.length === 0 && month === todayIso.slice(0, 7)
  const demoEntries: LedgerEntry[] = showDemo ? [
    { id: 'demo-income', kind: 'income', category: 'salary', name: '(예시) 이번 달 용돈', amountKrw: 500000, day: todayIso, createdAt: today.toISOString() },
    { id: 'demo-food', kind: 'expense', category: 'food', name: '(예시) 점심 식사', amountKrw: 12000, day: todayIso, createdAt: today.toISOString() },
    { id: 'demo-transport', kind: 'expense', category: 'transport', name: '(예시) 교통비', amountKrw: 3500, day: todayIso, createdAt: today.toISOString() },
  ] : []
  const shown = showDemo ? demoEntries : ledger.store.entries
  const summary = ledgerMonth(shown, month)
  const byCategory = ledgerByCategory(shown, month)
  const dayGroups = ledgerDayGroups(summary.entries)
  const monthChange = showDemo ? null : ledgerMonthChange(ledger.store.entries, month)
  const saveTarget = ledger.store.saveTargets?.[month] ?? null
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
    <p className="note">실제로 들어오거나 나간 돈을 날짜별로 적어요. 계좌 사이에 옮긴 돈은 모으기에서 따로 기록해요.</p>
    {ledger.status.kind !== 'ok' ? <div className="banner stack" role="status" aria-label="가계부 저장 상태">
      <p>{ledger.status.kind === 'corrupt' ? '저장된 가계부를 읽을 수 없어요.' : ledger.status.kind === 'replaced' ? '다른 탭에서 저장한 가계부를 불러왔어요.' : ledger.status.kind === 'save-failed' ? '가계부를 저장하지 못했어요. 브라우저 저장 공간과 설정을 확인해 주세요.' : '이 브라우저에서는 가계부를 저장할 수 없어요.'}</p>
      {ledger.status.kind === 'save-failed' ? <Button onClick={ledger.retrySave}>다시 저장</Button> : null}
      {ledger.status.kind === 'corrupt' ? <ResetConfirm label="가계부 초기화" note="읽을 수 없는 가계부 기록을 빈 기록으로 바꿔요." onReset={ledger.resetStorage} /> : null}
      {ledger.status.kind === 'replaced' ? <Button onClick={ledger.dismissNotice}>확인</Button> : null}
    </div> : null}
    <section className="card stack" aria-label="이달 가계부 요약">
      <div className="month-nav">
        <button type="button" className="month-step" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <TextField label="볼 달" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        <button type="button" className="month-step" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      {showDemo ? <p className="note">시연용 예시 금액입니다. 저장되지 않으며 첫 내역을 적으면 사라져요.</p> : null}
      <div className="ledger-stats">
        <p className="card-row ledger-stat ledger-stat-income"><span>{showDemo ? '수입 (예시)' : '직접 적은 수입'}</span><strong>{formatWon(summary.income)}</strong></p>
        <p className="card-row ledger-stat ledger-stat-expense"><span>{showDemo ? '지출 (예시)' : '직접 적은 지출'}</span><strong>{formatWon(summary.expense)}</strong></p>
        <p className="card-row ledger-stat ledger-stat-diff"><span>차이</span><strong>{formatWon(summary.income - summary.expense)}</strong></p>
      </div>
      {monthChange ? <p className="ledger-change">{monthChange}</p> : null}
      <p className="note">아래의 자잘한 지출 {formatWon(smallSpent)}·공과금 {formatWon(billsAmount)}은 중복 계산을 막기 위해 위 합계에 넣지 않았어요.</p>
    </section>
    <DashboardCard key={month} income={summary.income} expense={summary.expense} target={saveTarget} onSave={(value) => ledger.setSaveTarget(month, value)} />
    {byCategory.length > 0 ? <section className="card stack" aria-label="분류별 지출">
      <p className="card-title">분류별 지출</p>
      <ul className="category-list">
        {byCategory.map((row) => <li key={row.category}>
          <span className={`ledger-icon ledger-icon-${row.category}`} aria-hidden="true">{LEDGER_CATEGORY_LABEL[row.category].slice(0, 1)}</span>
          <span className="category-body">
            <span className="category-line"><span>{LEDGER_CATEGORY_LABEL[row.category]}</span><strong>{formatWon(row.amountKrw)}</strong></span>
            <span className="category-bar" aria-hidden="true"><span style={{ width: `${row.percent}%` }} /></span>
          </span>
          <span className="category-percent">{row.percent}%</span>
        </li>)}
      </ul>
    </section> : null}
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
      {summary.entries.length === 0 ? <p className="note">이달에 직접 적은 내역이 없어요.</p> : dayGroups.map((group) => <div className="ledger-day" key={group.day}>
        <p className="ledger-day-head"><span>{ledgerDayLabel(group.day)}</span><span>{[group.income > 0 ? `수입 ${formatWon(group.income)}` : null, group.expense > 0 ? `지출 ${formatWon(group.expense)}` : null].filter(Boolean).join(' · ')}</span></p>
        <ul className="result-list ledger-entries">
        {group.entries.map((entry) => <li key={entry.id}>
          <span className={`ledger-icon ledger-icon-${entry.category}`} aria-hidden="true">{LEDGER_CATEGORY_LABEL[entry.category].slice(0, 1)}</span>
          <div className="stack ledger-entry-body"><strong>{entry.name}</strong><span className="note">{entry.day} · {entry.kind === 'income' ? '수입' : '지출'} · {LEDGER_CATEGORY_LABEL[entry.category]}</span></div>
          <div className="stack ledger-entry-side"><span className={`price amount-${entry.kind}`}>{entry.kind === 'income' ? '+' : '−'}{formatWon(entry.amountKrw)}</span>
            {showDemo ? null : deleteId === entry.id ? <span className="btn-row"><Button variant="danger" onClick={() => { ledger.remove(entry.id); setDeleteId(null) }}>지우기 확인</Button><Button onClick={() => setDeleteId(null)}>취소</Button></span> : <Button onClick={() => setDeleteId(entry.id)}>지우기</Button>}
          </div>
        </li>)}
        </ul>
      </div>)}
    </section>
  </section>
}


// 이달 현황판 (F84, AC206·AC207): 수입을 막대 전체로 두고 지출·모을 금액·남는 돈을 나눠 칠한다.
// 막대는 장식이고 같은 내용을 아래 글로 보인다. 모을 금액은 목표일 뿐 모으기의 옮긴 돈과 합치지 않는다
function DashboardCard({ income, expense, target, onSave }: { income: number; expense: number; target: number | null; onSave: (value: number | null) => boolean }) {
  const [text, setText] = useState(target === null ? '' : String(target))
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const view = ledgerDashboard(income, expense, target)
  const save = (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    const parsed = parseSaveTarget(text)
    if (!parsed.ok) { setError('모을 금액은 0원~10억 원 사이의 정수로 적어 주세요.'); return }
    setError('')
    if (!onSave(parsed.value)) { setError('다른 탭의 기록을 불러왔어요. 내용을 확인하고 다시 저장해 주세요.'); return }
    setMessage(parsed.value === null ? '이번 달 모을 금액을 지웠어요.' : '이번 달 모을 금액을 저장했어요.')
  }
  const width = (value: number) => (view.kind === 'ok' ? `${Math.min(100, (value / Math.max(view.income, view.expense + view.target)) * 100)}%` : '0%')
  return <section className="card stack dashboard" aria-label="이달 현황판">
    <p className="card-title">이달 현황판</p>
    {view.kind === 'no-income' ? <p className="note">이 달 수입을 적으면 현황판이 채워져요.</p> : <>
      <div className="dashboard-bar" aria-hidden="true">
        <span className="seg seg-expense" style={{ width: width(view.expense) }} />
        <span className="seg seg-target" style={{ width: width(view.target) }} />
        <span className="seg seg-left" style={{ width: width(view.left) }} />
      </div>
      {/* 막대 색 안내. 글자는 CSS가 그리고(중복 낭독 방지) 같은 내용은 아래 문장에 있다 */}
      <div className="dashboard-legend" aria-hidden="true"><span className="lg lg-expense" /><span className="lg lg-target" /><span className="lg lg-left" /></div>
      <p className="dashboard-text">{[`수입 ${formatWon(view.income)} 중 지출 ${formatWon(view.expense)}(${view.percent.expense}%)`, view.target > 0 ? `모을 금액 ${formatWon(view.target)}(${view.percent.target}%)` : null, view.over > 0 ? null : `남는 돈 ${formatWon(view.left)}(${view.percent.left}%)`].filter(Boolean).join(' · ')}</p>
      {view.over > 0 ? <p className="dashboard-over">수입보다 {formatWon(view.over)} 많아요</p> : null}
    </>}
    <form className="dashboard-form" onSubmit={save} noValidate>
      <TextField label="이번 달 모을 금액" inputMode="numeric" placeholder="원" value={text} onChange={(event) => setText(event.target.value)} error={error || undefined} />
      <Button type="submit">저장</Button>
    </form>
    {message ? <p role="status" className="note">{message}</p> : null}
  </section>
}
