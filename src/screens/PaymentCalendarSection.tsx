import { useRef } from 'react'
import { paymentOccurrences, paymentTotal, shortWon } from '../logic/paymentCalendar'
import { formatWon } from '../logic/number'
import { toDayIso, type Subscription } from '../logic/subscriptions'
import type { LedgerEntry } from '../logic/ledger'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const
const dateLabel = (iso: string) => {
  const [, month, day] = iso.split('-')
  return `${Number(month)}월 ${Number(day)}일`
}

// 결제·지출 달력 (F74 보강, 2026-11-02 제작자 "나갈 돈은 놔두고 지출 내역을 달력에 추가", "금액으로 표시").
// 이번 달 1일부터 오늘+29일까지 그린다. 결제 예정(고정비, 오늘부터)과 가계부에 적은 지출을 다른 색 금액으로 보인다
// 가계부 지출 중 오늘까지는 '가계부 지출'(주황), 오늘 뒤 날짜는 '예상 지출'(보라)로 나눈다 (2026-11-02 제작자 "예상 지출 몇 가지 추가해 주고 쓴 금액도")
export function PaymentCalendarSection({ subscriptions, expenses = [], expenseDemo = false, today }: { subscriptions: readonly Subscription[]; expenses?: readonly LedgerEntry[]; expenseDemo?: boolean; today: Date }) {
  const demo = subscriptions.length === 0
  const examples = [
    { offset: 3, name: '(예시) 와우 멤버십', priceKrw: 7890 },
    { offset: 11, name: '(예시) 넷플릭스', priceKrw: 13500 },
    { offset: 18, name: '(예시) 배민클럽', priceKrw: 3990 },
    { offset: 25, name: '(예시) 음악 스트리밍', priceKrw: 10900 },
  ]
  const rows = demo ? examples.map(({ offset, name, priceKrw }, index) => ({
    subscriptionId: `demo-${index}`,
    name,
    priceKrw,
    day: toDayIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12)),
  })) : paymentOccurrences(subscriptions, today)
  const grouped = new Map<string, typeof rows>()
  for (const row of rows) grouped.set(row.day, [...(grouped.get(row.day) ?? []), row])
  // 이번 달 1일부터: 지난 날짜의 지출 기록도 보인다
  const startOffset = 1 - today.getDate()
  const days = Array.from({ length: 30 - startOffset }, (_, index) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + startOffset + index, 12))
  const todayIso = toDayIso(today)
  const firstIso = toDayIso(days[0])
  const lastIso = toDayIso(days[days.length - 1])
  const spent = expenses.filter((entry) => entry.kind === 'expense' && entry.day >= firstIso && entry.day <= lastIso)
  const spentByDay = new Map<string, LedgerEntry[]>()
  for (const entry of spent) spentByDay.set(entry.day, [...(spentByDay.get(entry.day) ?? []), entry])
  const done = spent.filter((entry) => entry.day <= todayIso)
  const planned = spent.filter((entry) => entry.day > todayIso)
  const doneTotal = done.reduce((total, entry) => total + entry.amountKrw, 0)
  const plannedTotal = planned.reduce((total, entry) => total + entry.amountKrw, 0)
  const listDays = [...new Set([...grouped.keys(), ...spentByDay.keys()])].sort()
  const firstWeekday = days[0].getDay()
  const rootRef = useRef<HTMLDetailsElement>(null)
  // 달력 아래 날짜별 목록은 접어 두고, 날짜 칸을 누르면 펼친 뒤 그날로 포커스를 옮긴다 (F86)
  const listRef = useRef<HTMLDetailsElement>(null)
  const openDay = (iso: string) => {
    if (listRef.current) listRef.current.open = true
    document.getElementById(`payment-day-${iso}`)?.focus()
  }

  return <details className="card guide payment-calendar" role="region" aria-label="결제·지출 달력" ref={rootRef} open>
    <summary className="card-title">
      <span className="payment-calendar-summary">
        <span>결제·지출 달력</span>
        <span className="note">{demo ? `예시 결제 ${rows.length}건 · ${formatWon(paymentTotal(rows))}` : `결제 예정 ${rows.length}건 · 적어 둔 요금 합계 ${formatWon(paymentTotal(rows))}`}</span>
        {done.length > 0 ? <span className="note">{`${expenseDemo ? '예시 ' : ''}가계부 지출 ${done.length}건 · ${formatWon(doneTotal)}`}</span> : null}
        {planned.length > 0 ? <span className="note">{`${expenseDemo ? '예시 ' : ''}예상 지출 ${planned.length}건 · ${formatWon(plannedTotal)}`}</span> : null}
      </span>
    </summary>
    <div className="stack payment-calendar-body">
      <p className="note">실제 청구일과 금액은 서비스에서 확인해 주세요.</p>
      {demo ? <p className="note">달력의 예시 결제는 저장되지 않아요. 고정비를 등록하면 실제 입력한 요금으로 바뀝니다.</p> : null}
      {expenseDemo && spent.length > 0 ? <p className="note">가계부의 예시 지출은 저장되지 않아요. 가계부에 첫 내역을 적으면 사라져요. 오늘 뒤 날짜로 적은 지출은 예상 지출로 보여요.</p> : null}
      <p className="payment-calendar-legend" aria-hidden="true"><span className="legend-pay">결제 예정</span><span className="legend-spent">가계부 지출</span><span className="legend-planned">예상 지출</span></p>
      {rows.length === 0 ? <p className="note">앞으로 30일에 적어 둔 결제 예정이 없어요.</p> : null}
      {rows.length === 0 && spent.length === 0 ? null : <>
        <div className="payment-calendar-grid" role="group" aria-label="30일 날짜">
          {WEEKDAYS.map((weekday) => <span className="payment-calendar-weekday" key={weekday}>{weekday}</span>)}
          {Array.from({ length: firstWeekday }, (_, index) => <span className="payment-calendar-blank" key={`blank-${index}`} />)}
          {days.map((date, index) => {
            const iso = toDayIso(date)
            const pays = grouped.get(iso) ?? []
            const spends = spentByDay.get(iso) ?? []
            const payTotal = pays.reduce((total, row) => total + row.priceKrw, 0)
            const spendTotal = spends.reduce((total, entry) => total + entry.amountKrw, 0)
            const future = iso > todayIso
            const classes = ['payment-calendar-day', iso < todayIso ? 'is-past' : '', iso === todayIso ? 'is-today' : '', pays.length ? 'payment-calendar-has-event' : '', spends.length ? 'has-spent' : ''].filter(Boolean).join(' ')
            // 날짜 숫자를 위에, 금액(결제 예정·지출)을 그 아래에
            const content = <><span className="payment-calendar-month">{index === 0 || date.getDate() === 1 ? `${date.getMonth() + 1}월` : ''}</span><span className="payment-calendar-date">{date.getDate()}</span>
              {pays.length ? <span className="payment-calendar-amount pay" aria-hidden="true">{shortWon(payTotal)}</span> : null}
              {spends.length ? <span className={future ? 'payment-calendar-amount planned' : 'payment-calendar-amount spent'} aria-hidden="true">{shortWon(spendTotal)}</span> : null}</>
            const label = [pays.length ? `결제 예정 ${pays.length}건` : '', spends.length ? `${future ? '예상 지출' : '지출'} ${spends.length}건` : ''].filter(Boolean).join(', ')
            return pays.length || spends.length
              ? <button className={classes} type="button" key={iso} aria-label={`${iso} ${label}`} onClick={() => openDay(iso)}>{content}</button>
              : <span className={classes} key={iso}>{content}</span>
          })}
        </div>
        <details className="payment-calendar-list" ref={listRef}>
        <summary>날짜별 목록</summary>
        {listDays.map((day) => {
          const pays = grouped.get(day) ?? []
          const spends = spentByDay.get(day) ?? []
          const spendWord = day > todayIso ? '예상 지출' : '지출'
          const name = pays.length && spends.length ? `${day} 결제 예정·${spendWord}` : pays.length ? `${day} 결제 예정` : `${day} ${spendWord}`
          return <section className="payment-calendar-list-day" role="region" aria-label={name} tabIndex={-1} id={`payment-day-${day}`} key={day}>
            {pays.map((entry) => <p key={entry.subscriptionId} className="list-pay">{`${dateLabel(day)} · ${entry.name} · ${formatWon(entry.priceKrw)}`}</p>)}
            {spends.map((entry) => <p key={entry.id} className={day > todayIso ? 'list-planned' : 'list-spent'}>{`${dateLabel(day)} · ${spendWord} · ${entry.name} · ${formatWon(entry.amountKrw)}`}</p>)}
          </section>
        })}
        </details>
      </>}
    </div>
  </details>
}
